/**
 * Native Google OAuth via ASWebAuthenticationSession + Supabase PKCE.
 *
 * Flow:
 *   1. supabase.auth.signInWithOAuth({ skipBrowserRedirect: true })
 *      → generates PKCE code_verifier, stores it in @supabase/ssr cookie storage,
 *        returns the full OAuth URL (code_challenge embedded)
 *   2. NativeAuth.startWebAuthSession({ url, callbackScheme })
 *      → opens Google's auth UI in ASWebAuthenticationSession (Apple-secure OAuth browser,
 *        not WKWebView — Google permits this); intercepts the app.garageflo:// redirect
 *        and returns the callback URL directly (not via appUrlOpen)
 *   3. Validate callback URL: scheme, host, path, absence of OAuth error, presence of code
 *   4. supabase.auth.exchangeCodeForSession(code)
 *      → reads code_verifier from the same WKWebView cookie jar (unchanged during step 2),
 *        exchanges with Supabase Auth, stores session tokens back into cookies
 *
 * Token safety: the callback URL (which contains the authorization code) is never logged.
 * The code is single-use and worthless without the PKCE code_verifier.
 *
 * This module is imported only by 'use client' components. registerPlugin() is safe
 * to call in SSR context — Capacitor returns a no-op bridge on the server.
 */
import { registerPlugin, Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'

// ── Plugin interface ──────────────────────────────────────────────────────────

export interface NativeAuthPlugin {
  startWebAuthSession(options: {
    url: string
    callbackScheme: string
  }): Promise<{ url: string }>
}

// registerPlugin defers native calls until the bridge is ready; safe at module scope.
export const NativeAuth = registerPlugin<NativeAuthPlugin>('NativeAuth')

// ── OAuth callback constants ──────────────────────────────────────────────────

export const NATIVE_CALLBACK_SCHEME = 'app.garageflo'
export const NATIVE_CALLBACK_HOST = 'auth'
export const NATIVE_CALLBACK_PATH = '/callback'
export const NATIVE_REDIRECT_URL =
  `${NATIVE_CALLBACK_SCHEME}://${NATIVE_CALLBACK_HOST}${NATIVE_CALLBACK_PATH}`

// ── Capability detection ──────────────────────────────────────────────────────

/**
 * Returns true when the NativeAuth plugin is registered in the current build.
 * Protects against old native builds that lack the Swift plugin: the Google button
 * is hidden when this returns false, so the user can't tap a non-functional flow.
 */
export function isNativeGoogleAuthAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NativeAuth')
}

// ── Callback URL validation ───────────────────────────────────────────────────

function extractCode(callbackUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(callbackUrl)
  } catch {
    throw new Error('Malformed callback URL')
  }

  // Exact match on scheme, host, and path — reject anything unexpected
  if (parsed.protocol !== `${NATIVE_CALLBACK_SCHEME}:`) {
    throw new Error(`Unexpected callback scheme: ${parsed.protocol}`)
  }
  if (parsed.hostname !== NATIVE_CALLBACK_HOST) {
    throw new Error(`Unexpected callback host: ${parsed.hostname}`)
  }
  if (parsed.pathname !== NATIVE_CALLBACK_PATH) {
    throw new Error(`Unexpected callback path: ${parsed.pathname}`)
  }

  // Surface any OAuth-level error from Google/Supabase
  const oauthError = parsed.searchParams.get('error')
  if (oauthError) {
    const desc = parsed.searchParams.get('error_description') ?? oauthError
    throw new Error(`OAuth error: ${desc}`)
  }

  const code = parsed.searchParams.get('code')
  if (!code || code.trim() === '') {
    throw new Error('Authorization code missing from callback URL')
  }

  return code
}

// ── Main auth function ────────────────────────────────────────────────────────

export type NativeGoogleAuthResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

export async function nativeGoogleAuth(): Promise<NativeGoogleAuthResult> {
  const supabase = createClient()

  // Step 1: generate PKCE pair; store code_verifier in @supabase/ssr cookie storage.
  // skipBrowserRedirect: true returns the OAuth URL without opening a browser here.
  const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      skipBrowserRedirect: true,
      redirectTo: NATIVE_REDIRECT_URL,
    },
  })
  if (oauthError || !data.url) {
    return {
      status: 'error',
      message: oauthError?.message ?? 'Failed to generate OAuth URL',
    }
  }

  // Step 2: open Google's consent UI in ASWebAuthenticationSession.
  // ASWebAuthenticationSession intercepts the app.garageflo:// redirect itself —
  // the callback URL is returned directly here, not via appUrlOpen.
  let callbackUrl: string
  try {
    const { url } = await NativeAuth.startWebAuthSession({
      url: data.url,
      callbackScheme: NATIVE_CALLBACK_SCHEME,
    })
    callbackUrl = url
  } catch (err: unknown) {
    const msg = typeof err === 'string' ? err : (err as { message?: string })?.message ?? ''
    if (msg === 'USER_CANCELLED') return { status: 'cancelled' }
    // Do not log data.url — it contains the PKCE state parameter
    return { status: 'error', message: 'Authentication session failed' }
  }

  // Step 3: validate the callback URL and extract the authorization code.
  let code: string
  try {
    code = extractCode(callbackUrl)
  } catch (err: unknown) {
    return { status: 'error', message: (err as Error).message }
  }

  // Step 4: exchange code for session. @supabase/ssr reads the code_verifier from
  // the same WKWebView cookie jar it wrote in step 1 — ASWebAuthenticationSession
  // runs in a separate OS process and does not modify the app's cookie storage.
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return { status: 'error', message: exchangeError.message }
  }

  return { status: 'success' }
}

/**
 * Capacitor configuration for GarageFlo iOS shell.
 *
 * ARCHITECTURE NOTE — INTERNAL TESTING ONLY:
 * This config uses server.url to load the hosted Next.js app from garageflo.app
 * inside a WKWebView. This is a remote-URL shell, NOT a static Capacitor export.
 * It is acceptable for internal TestFlight builds but is NOT the recommended
 * architecture for a production App Store submission (which would require a
 * static export or a full SSR-to-native solution).
 *
 * Before changing to production: deploy all web changes in this PR to garageflo.app
 * and switch server.url to the production domain.
 */
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.garageflo',
  appName: 'GarageFlo',

  // The webDir is used by `cap sync` to copy static assets into the iOS bundle.
  // With server.url set, the WebView loads from the remote URL — this directory
  // only provides the offline fallback page and static assets.
  webDir: 'public',

  server: {
    url: 'https://www.garageflo.app',
    cleartext: false,
    // Loads this local page when server.url is unreachable (no network).
    errorPath: 'offline.html',
  },

  ios: {
    // 'automatic' defers safe-area handling to the viewport meta tag.
    // Combined with viewport-fit=cover and CSS env(safe-area-inset-*), this is
    // the correct pairing. Using 'always' here with the CSS env() values would
    // double-count the insets (native scroll inset + CSS padding both apply).
    contentInset: 'automatic' as const,
    preferredContentMode: 'mobile' as const,
    backgroundColor: '#191E2D',
    // Enable Safari Web Inspector for internal TestFlight debugging.
    webContentsDebuggingEnabled: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#191E2D',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#191E2D',
      overlaysWebView: false,
    },
  },
}

export default config

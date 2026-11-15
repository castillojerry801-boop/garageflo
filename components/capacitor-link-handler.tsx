'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

/**
 * Intercepts external link clicks when running in the native iOS shell and
 * opens them in Safari instead of inside the WKWebView.
 *
 * This matters for NHTSA/CPSC recall links and any other off-domain URLs —
 * Google blocks full OAuth flows in WKWebView, and deep-linking into external
 * sites inside the WebView traps users with no way back.
 *
 * Place this once inside the root layout. It renders nothing.
 */
export function CapacitorLinkHandler() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    async function handleLinkClick(e: MouseEvent) {
      const link = (e.target as Element).closest('a')
      if (!link) return

      const href = link.href
      if (!href || !href.startsWith('http')) return

      // Allow same-origin navigation to pass through normally.
      try {
        const url = new URL(href)
        if (url.hostname === window.location.hostname) return
      } catch {
        return
      }

      e.preventDefault()
      e.stopPropagation()

      // Open external URLs in the system browser (Safari).
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: href })
    }

    document.addEventListener('click', handleLinkClick, true)
    return () => document.removeEventListener('click', handleLinkClick, true)
  }, [])

  return null
}

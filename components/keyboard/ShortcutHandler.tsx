'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useUnifiedSettings } from '@/lib/unified-settings-context'

type SitePage = 'dashboard' | 'journeys' | 'funnels' | 'behavior' | 'search' | 'cdn' | 'uptime' | 'pagespeed'

const SITE_KEY_MAP: Record<string, SitePage> = {
  d: 'dashboard',
  j: 'journeys',
  f: 'funnels',
  b: 'behavior',
  s: 'search',
  c: 'cdn',
  u: 'uptime',
  p: 'pagespeed',
}

/**
 * Global keyboard shortcut handler for logged-in app surfaces.
 * Mounted inside DashboardShell so it's active everywhere under
 * a site layout + home dashboard, but NOT on marketing or /auth pages.
 *
 * Shortcut grammar:
 * - `g X` (g-prefix within 1.5s): navigate. Requires siteId for site-scoped keys.
 *   - g h = /sites (home)
 *   - g i = /integrations
 *   - g d/j/f/b/s/c/u/p = site pages (no-op when no siteId in scope)
 * - `?` = open shortcuts overlay
 * - `,` = open unified settings
 *
 * Excluded when focus is inside inputs/textareas/contenteditable. Modifier-key
 * combos (⌘/Ctrl/Alt) are reserved for future use (e.g., ⌘K command palette).
 */
export function ShortcutHandler({
  onShowOverlay,
  onOpenPalette,
}: {
  onShowOverlay: () => void
  onOpenPalette: () => void
}) {
  const router = useRouter()
  const params = useParams()
  const { openUnifiedSettings } = useUnifiedSettings()
  const gPressedAt = useRef<number | null>(null)
  const siteId = params?.id as string | undefined

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement

      // ⌘K / Ctrl+K — open command palette (works even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenPalette()
        return
      }

      // Ignore other shortcuts while user is typing
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) return
      // Reserve remaining modifier combos
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // ? — open shortcuts overlay
      if (e.key === '?') {
        e.preventDefault()
        onShowOverlay()
        return
      }

      // , — open settings
      if (e.key === ',') {
        e.preventDefault()
        openUnifiedSettings({ context: siteId ? 'site' : 'account', tab: siteId ? 'general' : 'profile' })
        return
      }

      // g-prefix buffer
      const now = Date.now()
      if (e.key === 'g') {
        gPressedAt.current = now
        return
      }

      if (gPressedAt.current && now - gPressedAt.current < 1500) {
        const key = e.key.toLowerCase()
        gPressedAt.current = null

        if (key === 'h') {
          e.preventDefault()
          router.push('/sites')
          return
        }
        if (key === 'i') {
          e.preventDefault()
          router.push('/integrations')
          return
        }
        if (siteId && SITE_KEY_MAP[key]) {
          e.preventDefault()
          const page = SITE_KEY_MAP[key]
          router.push(page === 'dashboard' ? `/sites/${siteId}` : `/sites/${siteId}/${page}`)
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [router, siteId, openUnifiedSettings, onShowOverlay, onOpenPalette])

  return null
}

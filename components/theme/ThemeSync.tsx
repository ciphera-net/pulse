'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { usePreferences } from '@/lib/hooks/usePreferences'
import {
  DEFAULT_THEME,
  applyThemeClass,
  isThemedRoute,
  readThemeCookie,
  writeThemeCookie,
  type Theme,
} from '@/lib/theme'

/**
 * Keeps <html>'s theme class right after first paint. The boot script in the root
 * layout handles first paint itself. This handles everything that happens once
 * React is running:
 *
 *  - client-side navigation between a themed app route and a dark marketing route
 *    (the boot script never re-runs on a soft navigation);
 *  - the signed-in dashboard-shell routes (/pricing, /integrations), which the
 *    boot script cannot recognise because the session cookie is httpOnly;
 *  - reconciling this device's cookie to the ACCOUNT's value once preferences
 *    load (a new device, or a change made on another device), and applying a
 *    change made in Settings or the user menu, which arrives here as the
 *    optimistic preferences value.
 *
 * Renders nothing. There is exactly one writer of the class after boot, so two
 * components can never fight over it.
 */
export default function ThemeSync() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { theme: accountTheme } = usePreferences()

  useEffect(() => {
    // Account truth when known. Before it loads (or when signed out), the
    // device's cache, which is what the boot script already painted with.
    const cached = readThemeCookie(document.cookie)
    const theme: Theme = accountTheme ?? cached ?? DEFAULT_THEME
    if (accountTheme && accountTheme !== cached) writeThemeCookie(accountTheme)
    applyThemeClass(document.documentElement, isThemedRoute(pathname, !!user) ? theme : 'dark')
  }, [pathname, user, accountTheme])

  return null
}

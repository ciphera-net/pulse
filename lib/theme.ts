/**
 * The colour theme (PULSE-31, design Pulse/docs/plans/23-09-2026-light-theme-design.md).
 *
 * 🔴 THE ACCOUNT IS THE SOURCE OF TRUTH. The choice lives in pulse-backend's
 * `user_preferences.theme` (migration 190) so it follows the person to every
 * device (owner ruling D3). The `pulse_theme` cookie below is a per-device CACHE
 * of that value, not a second preference: it exists only so the page can take
 * the right palette before first paint, and `ThemeSync` rewrites it to the
 * account's value whenever preferences load.
 *
 * Dark is the default for everyone (D2). No cookie, an unreadable cookie, or a
 * route outside the app all mean dark.
 *
 * The palette itself is CSS: Facet's `facet.css` and `styles/globals.css` define
 * `:root` (dark), `:root.light`, and `:root.theme-system` inside a
 * `prefers-color-scheme: light` query. This module only chooses the class.
 *
 * Leaf module on purpose: imported by the server root layout (to build the boot
 * script) and by client components, so it must stay free of React and browser
 * globals at import time.
 */
import { isAuthedAppRoute } from '@/lib/auth/appRoutes'

export type Theme = 'dark' | 'light' | 'system'
export const THEMES: readonly Theme[] = ['dark', 'light', 'system'] as const
export const DEFAULT_THEME: Theme = 'dark'
export const THEME_COOKIE = 'pulse_theme'

export function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v)
}

/** The class each theme puts on <html>. `system` is resolved by CSS, per device. */
export const THEME_CLASS: Record<Theme, string> = {
  dark: 'dark',
  light: 'light',
  system: 'theme-system',
}
const ALL_THEME_CLASSES = Object.values(THEME_CLASS)

/**
 * Routes the theme applies to. The authenticated app always; the public
 * dashboard-shell routes (/pricing, /integrations/*, /installation) only when
 * signed in, because anonymous visitors see their marketing variant there.
 * Everything else is marketing and stays dark (design D1: dashboard first; the
 * marketing pages are built around dark product mocks).
 */
export function isThemedRoute(pathname: string, signedIn: boolean): boolean {
  if (isAuthedAppRoute(pathname)) return true
  if (!signedIn) return false
  return pathname === '/pricing' || pathname === '/installation' || pathname.startsWith('/integrations')
}

/** Swap the theme class on <html>. Removes the other two so exactly one is set. */
export function applyThemeClass(root: HTMLElement, theme: Theme): void {
  const want = THEME_CLASS[theme]
  for (const c of ALL_THEME_CLASSES) if (c !== want) root.classList.remove(c)
  root.classList.add(want)
}

/** Read the per-device cache. Anything but a known value is "no cache". */
export function readThemeCookie(cookie: string): Theme | null {
  const m = cookie.match(/(?:^|;\s*)pulse_theme=([^;]*)/)
  return m && isTheme(m[1]) ? m[1] : null
}

/**
 * Write the per-device cache. It holds a colour, not an identifier, so it is
 * kept on sign-out; the next account to sign in on this device reconciles it.
 * Not HttpOnly: the boot script has to read it before React exists.
 */
export function writeThemeCookie(theme: Theme): void {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
}

/**
 * The inline <head> script that picks the palette before first paint.
 *
 * It runs before React, so it cannot import anything: it carries
 * `isAuthedAppRoute`'s own compiled source rather than a hand-copied route list,
 * and `lib/__tests__/theme.test.ts` checks the two agree on every route the app
 * has. It can only see app routes (an httpOnly session is invisible to it);
 * `ThemeSync` applies the theme to the signed-in dashboard-shell routes after
 * auth resolves.
 *
 * Allowed by the CSP: script-src carries 'unsafe-inline' (next.config.ts).
 */
export function themeBootScript(): string {
  const classes = JSON.stringify(THEME_CLASS)
  return `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/);if(!m)return;var map=${classes};var c=map[m[1]];if(!c)return;if(!(${isAuthedAppRoute.toString()})(location.pathname))return;var h=document.documentElement;h.classList.remove('dark','light','theme-system');h.classList.add(c);}catch(e){}})();`
}

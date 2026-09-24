/**
 * The theme's first-paint path (PULSE-31).
 *
 * The boot script runs before React and cannot import anything, so it carries a
 * compiled copy of isAuthedAppRoute. What these pin, most damaging first:
 *
 *  1. The boot script and ThemeSync agree on which routes are themed. If they
 *     disagreed, a light user would see the page switch palettes a moment after
 *     load — the flash the script exists to prevent.
 *  2. Nothing but a known value in the cookie changes the page: dark is the
 *     default for everyone (D2), so garbage, an absent cookie, or a marketing
 *     route all leave `dark` in place.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { isAuthedAppRoute } from '@/lib/auth/appRoutes'
import {
  THEME_CLASS,
  applyThemeClass,
  isThemedRoute,
  readThemeCookie,
  themeBootScript,
  type Theme,
} from '@/lib/theme'

const ROUTES = [
  '/', '/pricing', '/features', '/login', '/signup', '/demo', '/integrations', '/integrations/nextjs',
  '/installation', '/vs/plausible', '/share/abc', '/auth/callback', '/setup/install', '/checkout',
  '/sites', '/sites/new', '/sites/3dcf0448-ef33-407a-b1a9-92503d11f083',
  '/sites/3dcf0448-ef33-407a-b1a9-92503d11f083/journeys', '/notifications',
  '/settings', '/settings/account/profile',
]

function clearCookie() {
  document.cookie = 'pulse_theme=; Path=/; Max-Age=0'
}

function runBoot(path: string, cookie: string | null): string {
  window.history.replaceState(null, '', path)
  clearCookie()
  if (cookie !== null) document.cookie = `pulse_theme=${cookie}; Path=/`
  const html = document.documentElement
  html.className = 'font-a font-b dark'
  new Function(themeBootScript())()
  return html.className
}

afterEach(() => {
  clearCookie()
  document.documentElement.className = ''
  window.history.replaceState(null, '', '/')
})

describe('themeBootScript', () => {
  for (const path of ROUTES) {
    for (const theme of ['light', 'system', 'dark'] as Theme[]) {
      const want = isAuthedAppRoute(path) ? THEME_CLASS[theme] : 'dark'
      it(`${path} with cookie ${theme} → ${want}`, () => {
        const cls = runBoot(path, theme).split(' ')
        expect(cls).toContain(want)
        // Exactly one theme class, and the font classes survive.
        expect(cls.filter((c) => ['dark', 'light', 'theme-system'].includes(c))).toEqual([want])
        expect(cls).toContain('font-a')
      })
    }
  }

  it('leaves dark in place with no cookie, an unknown value, or a crafted value', () => {
    for (const cookie of [null, '', 'auto', 'LIGHT', 'lightx', '%3Cscript%3E']) {
      expect(runBoot('/sites', cookie).split(' ')).toContain('dark')
    }
  })

  it('agrees with ThemeSync for a signed-out visitor on every route', () => {
    // ThemeSync's signed-out answer is the only one the boot script can know.
    for (const path of ROUTES) {
      const boot = runBoot(path, 'light').includes('light')
      expect(boot, path).toBe(isThemedRoute(path, false))
    }
  })
})

describe('isThemedRoute', () => {
  it('themes the dashboard-shell pages only when signed in', () => {
    for (const path of ['/pricing', '/installation', '/integrations/nextjs']) {
      expect(isThemedRoute(path, false), path).toBe(false)
      expect(isThemedRoute(path, true), path).toBe(true)
    }
  })

  it('never themes marketing, even when signed in', () => {
    for (const path of ['/', '/features', '/demo', '/vs/plausible', '/share/abc']) {
      expect(isThemedRoute(path, true), path).toBe(false)
    }
  })
})

describe('readThemeCookie / applyThemeClass', () => {
  it('reads only a known value, wherever the cookie sits', () => {
    expect(readThemeCookie('a=1; pulse_theme=light; b=2')).toBe('light')
    expect(readThemeCookie('pulse_theme=system')).toBe('system')
    expect(readThemeCookie('pulse_theme=auto')).toBeNull()
    expect(readThemeCookie('xpulse_theme=light')).toBeNull()
    expect(readThemeCookie('')).toBeNull()
  })

  it('sets exactly one theme class and keeps the others', () => {
    const el = document.createElement('html')
    el.className = 'font-a dark light'
    applyThemeClass(el, 'system')
    expect(el.className.split(' ').sort()).toEqual(['font-a', 'theme-system'])
  })
})

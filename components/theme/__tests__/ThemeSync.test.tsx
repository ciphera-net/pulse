/**
 * ThemeSync is the only writer of <html>'s theme class after boot (PULSE-31).
 *
 * What these pin:
 *  1. The ACCOUNT wins over the device cookie once preferences load, and the
 *     cookie is rewritten to match (a change made on another device arrives).
 *  2. Before preferences load, the cookie holds: a cold load must not flash a
 *     light user back to dark while the fetch is in flight.
 *  3. Marketing routes are always dark, even for a light user.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { Theme } from '@/lib/theme'

const state: { pathname: string; user: { id: string } | null; theme: Theme | null } = {
  pathname: '/sites',
  user: { id: 'u1' },
  theme: null,
}

vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('@/lib/hooks/usePreferences', () => ({ usePreferences: () => ({ theme: state.theme }) }))

import ThemeSync from '../ThemeSync'

const html = () => document.documentElement
const cookie = () => document.cookie.match(/pulse_theme=([^;]*)/)?.[1] ?? null

beforeEach(() => {
  html().className = 'font-a dark'
  document.cookie = 'pulse_theme=; Path=/; Max-Age=0'
  Object.assign(state, { pathname: '/sites', user: { id: 'u1' }, theme: null })
})
afterEach(() => {
  html().className = ''
  document.cookie = 'pulse_theme=; Path=/; Max-Age=0'
})

describe('ThemeSync', () => {
  it("applies the account's theme on an app route and caches it on the device", () => {
    state.theme = 'light'
    render(<ThemeSync />)
    expect(html().classList.contains('light')).toBe(true)
    expect(html().classList.contains('dark')).toBe(false)
    expect(html().classList.contains('font-a')).toBe(true)
    expect(cookie()).toBe('light')
  })

  it('the account overrides a stale device cookie', () => {
    document.cookie = 'pulse_theme=light; Path=/'
    state.theme = 'system'
    render(<ThemeSync />)
    expect(html().classList.contains('theme-system')).toBe(true)
    expect(cookie()).toBe('system')
  })

  it('keeps the cached theme while preferences are still loading', () => {
    document.cookie = 'pulse_theme=light; Path=/'
    state.theme = null
    render(<ThemeSync />)
    expect(html().classList.contains('light')).toBe(true)
    expect(cookie()).toBe('light') // not overwritten with the default
  })

  it('an explicit account dark replaces a cached light', () => {
    document.cookie = 'pulse_theme=light; Path=/'
    state.theme = 'dark'
    render(<ThemeSync />)
    expect(html().classList.contains('dark')).toBe(true)
    expect(cookie()).toBe('dark')
  })

  it('keeps marketing routes dark for a light user', () => {
    state.theme = 'light'
    state.pathname = '/features'
    render(<ThemeSync />)
    expect(html().classList.contains('dark')).toBe(true)
    expect(html().classList.contains('light')).toBe(false)
  })

  it('switches when navigating from marketing into the app', () => {
    state.theme = 'light'
    state.pathname = '/features'
    const { rerender } = render(<ThemeSync />)
    expect(html().classList.contains('dark')).toBe(true)
    state.pathname = '/sites/abc'
    rerender(<ThemeSync />)
    expect(html().classList.contains('light')).toBe(true)
  })

  it('themes /pricing only for a signed-in user', () => {
    state.theme = 'light'
    state.pathname = '/pricing'
    state.user = null
    const { rerender } = render(<ThemeSync />)
    expect(html().classList.contains('dark')).toBe(true)
    state.user = { id: 'u1' }
    rerender(<ThemeSync />)
    expect(html().classList.contains('light')).toBe(true)
  })
})

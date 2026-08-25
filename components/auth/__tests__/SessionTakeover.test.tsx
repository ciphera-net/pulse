import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SessionTakeover from '../SessionTakeover'
import { isAuthedAppRoute } from '@/lib/auth/appRoutes'

// The D takeover (approved 26-08-2026): a dead session on an app route renders
// exactly ONE thing — this room. These pin its three states and the sign-in
// promise (return-to stored in the slot the auth callback already consumes).

const logout = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/sites/abc-123',
}))
vi.mock('@/lib/utils/clientEvents', () => ({ reportClientEvent: vi.fn() }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ logout }) }))

function setHadSessionCookie(on: boolean) {
  document.cookie = on
    ? 'pulse_had_session=1; Path=/'
    : 'pulse_had_session=; Max-Age=0; Path=/'
}

describe('SessionTakeover', () => {
  beforeEach(() => {
    logout.mockClear()
    localStorage.clear()
    setHadSessionCookie(false)
  })
  afterEach(() => setHadSessionCookie(false))

  it('signed-out with history: names the site and promises the return', () => {
    setHadSessionCookie(true)
    localStorage.setItem('pulse_last_site_label', 'themodestyhouse.com')
    render(<SessionTakeover state="signed-out" />)

    expect(screen.getByText('Sign back in')).toBeInTheDocument()
    expect(screen.getByText('themodestyhouse.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in — back to your dashboard/i })).toBeInTheDocument()
    // The one orange line of the brand statement.
    expect(screen.getByText('Nothing lost.')).toBeInTheDocument()
  })

  it('signed-out without history: sign-in-to-continue copy, no false "signed out" claim', () => {
    render(<SessionTakeover state="signed-out" />)

    expect(screen.getByText('Sign in to continue')).toBeInTheDocument()
    expect(screen.queryByText('Nothing lost.')).not.toBeInTheDocument()
    expect(screen.queryByText(/signed out on another device/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
  })

  it('restoring: no orange primary, a progressbar, and a quiet sign-in escape', () => {
    setHadSessionCookie(true)
    render(<SessionTakeover state="restoring" />)

    expect(screen.getByText(/restoring your session/i)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /reconnecting/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in instead/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /back to your dashboard/i })).not.toBeInTheDocument()
  })

  it('sign in stores the return path, then goes through logout() — never a bare /login push', () => {
    setHadSessionCookie(true)
    render(<SessionTakeover state="signed-out" />)

    fireEvent.click(screen.getByRole('button', { name: /sign in — back to your dashboard/i }))

    // 🔴 The room's promise ("returns you to it") is this line — the callback
    // consumes pulse_auth_return_to and navigates there after the exchange.
    expect(localStorage.getItem('pulse_auth_return_to')).toBe('/sites/abc-123')
    // 🔴 Through logout(): the dead session's cookies still exist, and
    // middleware bounces /login back to /sites while an access_token cookie is
    // present — a client-side push loops back to this room (measured on
    // staging). logout() clears the cookies server-side, then navigates.
    expect(logout).toHaveBeenCalledOnce()
  })
})

describe('isAuthedAppRoute', () => {
  it('covers app routes and excludes public/marketing surfaces', () => {
    for (const p of ['/sites', '/sites/new', '/sites/abc/uptime', '/notifications', '/settings/account', '/admin']) {
      expect(isAuthedAppRoute(p), p).toBe(true)
    }
    // Public dashboard-shell routes server-render marketing for crawlers by
    // design; marketing pages are obviously out.
    for (const p of ['/', '/pricing', '/integrations/gsc', '/installation', '/faq', '/login', '/setup/site', '/join', '/checkout']) {
      expect(isAuthedAppRoute(p), p).toBe(false)
    }
  })
})

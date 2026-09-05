import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// * ═══ EVERY FAILED EXCHANGE GETS A SCREEN AND A TRACE ═══
// *
// * Until 05-09-2026 the 'server' branch sent the browser to `/` — the marketing
// * homepage — with no word and no log, on the theory that the exchange had
// * succeeded and only the response was lost. Since S3 the exchange response IS
// * the session, so nothing had been written and the person saw a homepage,
// * apparently signed out, for no reason. And 'server' was the DEFAULT outcome:
// * id-backend answers 400 for every OAuth-protocol failure.
// * Design: Infra/Auth/docs/plans/03-09-2026-per-app-sessions-design.md §10.11.12

let search = new URLSearchParams()
vi.mock('next/navigation', () => ({ useSearchParams: () => search }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ login: vi.fn() }) }))

const exchangeAuthCode = vi.fn()
const getSessionAction = vi.fn()
vi.mock('@/app/actions/auth', () => ({
  exchangeAuthCode: (...a: unknown[]) => exchangeAuthCode(...a),
  getSessionAction: (...a: unknown[]) => getSessionAction(...a),
}))
const claimPendingAuth = vi.fn()
vi.mock('@/lib/api/oauth-store', () => ({
  claimPendingAuth: (...a: unknown[]) => claimPendingAuth(...a),
  forgetAllPendingAuth: vi.fn(),
}))
vi.mock('@/lib/api/oauth', () => ({ initiateOAuthFlow: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ default: vi.fn().mockRejectedValue(new Error('no profile')), setAccessToken: vi.fn() }))
vi.mock('@/lib/cdn', () => ({ cdnUrl: (p: string) => p }))

const reportClientEvent = vi.fn()
vi.mock('@/lib/utils/clientEvents', () => ({ reportClientEvent: (...a: unknown[]) => reportClientEvent(...a) }))

import AuthCallback from '../page'

const assign = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  search = new URLSearchParams('code=CODE&state=STATE')
  claimPendingAuth.mockReturnValue({ verifier: 'v', createdAt: Date.now() })
  Object.defineProperty(window, 'location', { value: { origin: 'https://pulse.ciphera.net', assign, href: '' }, writable: true })
  localStorage.clear()
})
afterEach(() => vi.clearAllMocks())

describe('auth callback — a failed exchange', () => {
  it('🔴 a spent code renders the existing "expired" card and does NOT bounce to the homepage', async () => {
    exchangeAuthCode.mockResolvedValue({ success: false, error: 'stale_attempt', upstream: 'invalid_grant' })
    render(<AuthCallback />)
    await waitFor(() => expect(screen.getByText(/this sign-in link has expired/i)).toBeInTheDocument())
    expect(window.location.href, 'the silent bounce to / must be gone').toBe('')
    expect(assign).not.toHaveBeenCalled()
    // Restart only — a retry would re-send the same spent code.
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
    expect(screen.getByRole('button', { name: /start sign-in again/i })).toBeInTheDocument()
  })

  it('🔴 reports the RAW upstream code, so a misconfigured redirect_uri stays distinguishable from a spent code', async () => {
    exchangeAuthCode.mockResolvedValue({ success: false, error: 'stale_attempt', upstream: 'invalid_grant' })
    render(<AuthCallback />)
    await waitFor(() => expect(reportClientEvent).toHaveBeenCalledWith('oauth_exchange_failed', 'invalid_grant'))
  })

  it('a genuine server fault renders "Something went wrong", restart only, with its status in the trace', async () => {
    exchangeAuthCode.mockResolvedValue({ success: false, error: 'server', upstream: 'http_502' })
    render(<AuthCallback />)
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument())
    expect(window.location.href).toBe('')
    expect(screen.queryByRole('button', { name: /try again/i }), 'a retry re-sends a code that may already be spent').toBeNull()
    expect(reportClientEvent).toHaveBeenCalledWith('oauth_exchange_failed', 'http_502')
  })

  it('a network failure keeps Try again — the request never reached id-backend, so the code is unspent', async () => {
    exchangeAuthCode.mockRejectedValue(new TypeError('fetch failed'))
    render(<AuthCallback />)
    await waitFor(() => expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('a missing pending attempt is reported, not just logged to a silenced browser logger', async () => {
    claimPendingAuth.mockReturnValue(null)
    getSessionAction.mockResolvedValue(null)
    render(<AuthCallback />)
    await waitFor(() => expect(reportClientEvent).toHaveBeenCalledWith('oauth_callback_no_pending_attempt'))
    expect(exchangeAuthCode, 'an unvalidated code is never exchanged').not.toHaveBeenCalled()
  })

  it('a callback with no code is reported', async () => {
    search = new URLSearchParams('')
    getSessionAction.mockResolvedValue(null)
    render(<AuthCallback />)
    await waitFor(() => expect(reportClientEvent).toHaveBeenCalledWith('oauth_callback_no_code'))
  })
})

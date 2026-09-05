import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// * Regression cover for 04-09-2026: a genuinely signed-in new user was shown
// * "This sign-in link has expired" because the callback could not find its
// * pending attempt, and the only working escape was a link labelled "Back to
// * the homepage". ID sets its cookies on .ciphera.net before redirecting here,
// * so "cannot complete the handshake" and "is not signed in" are different
// * questions — these tests pin that they stay different.

let search = new URLSearchParams()
vi.mock('next/navigation', () => ({ useSearchParams: () => search }))

const login = vi.fn()
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ login }) }))

const exchangeAuthCode = vi.fn()
const getSessionAction = vi.fn()
vi.mock('@/app/actions/auth', () => ({
  exchangeAuthCode: (...a: unknown[]) => exchangeAuthCode(...a),
  getSessionAction: (...a: unknown[]) => getSessionAction(...a),
}))

const claimPendingAuth = vi.fn()
const forgetAllPendingAuth = vi.fn()
vi.mock('@/lib/api/oauth-store', () => ({
  claimPendingAuth: (...a: unknown[]) => claimPendingAuth(...a),
  forgetAllPendingAuth: () => forgetAllPendingAuth(),
}))

vi.mock('@/lib/api/oauth', () => ({ initiateOAuthFlow: vi.fn() }))
const setAccessToken = vi.fn()
vi.mock('@/lib/api/client', () => ({
  default: vi.fn().mockRejectedValue(new Error('no profile')),
  // S3: the callback primes the in-memory Bearer with the exchange's token.
  setAccessToken: (t: string | null) => setAccessToken(t),
  // The build-time constant the PREVIOUS release sent at authorize. The callback
  // uses it only to recover the value for an attempt stored before the
  // redirect_uri travelled with it.
  APP_URL: 'https://app-url-from-the-build.example',
}))
vi.mock('@/lib/cdn', () => ({ cdnUrl: (p: string) => p }))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import AuthCallback from '../page'

const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  search = new URLSearchParams('code=CODE&state=STATE')
  Object.defineProperty(window, 'location', {
    value: { origin: 'https://pulse.ciphera.net', assign, href: '' },
    writable: true,
  })
  localStorage.clear()
})
afterEach(() => vi.clearAllMocks())

describe('auth callback — pending attempt missing', () => {
  it('lands an ALREADY-SIGNED-IN person in the app instead of an error', async () => {
    claimPendingAuth.mockReturnValue(null)                       // the Safari case
    getSessionAction.mockResolvedValue({ id: 'u1', email: 'a@b.c' })

    render(<AuthCallback />)

    await waitFor(() => expect(assign).toHaveBeenCalled())
    expect(screen.queryByText(/sign-in link has expired/i)).toBeNull()
    // * The refusal itself must be unchanged: no unvalidated code is exchanged.
    expect(exchangeAuthCode).not.toHaveBeenCalled()
    expect(forgetAllPendingAuth).toHaveBeenCalled()
  })

  it('still shows the error when there is NO session to rescue', async () => {
    claimPendingAuth.mockReturnValue(null)
    getSessionAction.mockResolvedValue(null)

    render(<AuthCallback />)

    await waitFor(() =>
      expect(screen.getByText(/sign-in link has expired/i)).toBeInTheDocument()
    )
    expect(assign).not.toHaveBeenCalled()
    expect(exchangeAuthCode).not.toHaveBeenCalled()
  })

  it('does not rescue on a session lookup failure — it never infers a session', async () => {
    claimPendingAuth.mockReturnValue(null)
    getSessionAction.mockRejectedValue(new Error('stale build'))

    render(<AuthCallback />)

    await waitFor(() =>
      expect(screen.getByText(/sign-in link has expired/i)).toBeInTheDocument()
    )
    expect(assign).not.toHaveBeenCalled()
  })

  it('a valid attempt still exchanges normally', async () => {
    // A modern attempt carries the redirect_uri it sent at authorize.
    claimPendingAuth.mockReturnValue({
      verifier: 'V',
      createdAt: Date.now(),
      redirectUri: 'https://pulse.ciphera.net/auth/callback',
    })
    exchangeAuthCode.mockResolvedValue({ success: true, user: { id: 'u1', org_id: 'o1', role: 'owner' }, access_token: 'tok-from-exchange' })

    render(<AuthCallback />)

    await waitFor(() => expect(exchangeAuthCode).toHaveBeenCalledWith('CODE', 'V', 'https://pulse.ciphera.net/auth/callback'))
    expect(getSessionAction).not.toHaveBeenCalled()
    // S3: the token the exchange returned becomes the in-memory Bearer BEFORE
    // the profile call, or /auth/user/me would go out with no credential.
    await waitFor(() => expect(setAccessToken).toHaveBeenCalledWith('tok-from-exchange'))
  })
})

// ---------------------------------------------------------------------------
// The redirect_uri the exchange sends is RESOLVED, never recomputed.
//
// 🔴 id-backend compares it byte-for-byte with the one recorded at authorize and
// answers 400 `invalid_grant` on any difference — which this page renders as
// "This sign-in link has expired", indistinguishable from a spent code. Until
// 05-09-2026 authorize sent a build-time APP_URL while this page sent
// window.location.origin, so the two agreed only by coincidence.
//
// Each test below makes the stored value DIFFERENT from window.location.origin,
// so a page that recomputes cannot pass by accident.
// ---------------------------------------------------------------------------
describe('auth callback — the redirect_uri comes from the attempt', () => {
  beforeEach(() => {
    exchangeAuthCode.mockResolvedValue({
      success: true,
      user: { id: 'u1', org_id: 'o1', role: 'owner' },
      access_token: 'tok',
    })
  })

  it('sends the redirect_uri the attempt was started with, not this origin', async () => {
    // The attempt began on staging; the test window claims to be production.
    claimPendingAuth.mockReturnValue({
      verifier: 'V',
      createdAt: Date.now(),
      redirectUri: 'https://pulse-staging.ciphera.net/auth/callback',
    })
    render(<AuthCallback />)
    await waitFor(() =>
      expect(exchangeAuthCode).toHaveBeenCalledWith(
        'CODE',
        'V',
        'https://pulse-staging.ciphera.net/auth/callback',
      ),
    )
  })

  it('recovers APP_URL for an attempt stored before the redirect_uri travelled with it', async () => {
    // The previous release wrote no redirectUri and sent APP_URL at authorize,
    // so APP_URL is what id-backend recorded. This is the original value
    // recovered, not a guess — and it is deliberately not this origin.
    claimPendingAuth.mockReturnValue({ verifier: 'V', createdAt: Date.now() })
    render(<AuthCallback />)
    await waitFor(() =>
      expect(exchangeAuthCode).toHaveBeenCalledWith(
        'CODE',
        'V',
        'https://app-url-from-the-build.example/auth/callback',
      ),
    )
  })

  it('uses this origin for the session flow, which has no attempt to read', async () => {
    // A code with no state: started at the ID auth hub, which registers this
    // origin's callback. There is no pending entry, and none is claimed.
    search = new URLSearchParams('code=CODE')
    render(<AuthCallback />)
    await waitFor(() =>
      expect(exchangeAuthCode).toHaveBeenCalledWith(
        'CODE',
        null,
        'https://pulse.ciphera.net/auth/callback',
      ),
    )
    expect(claimPendingAuth).not.toHaveBeenCalled()
  })
})


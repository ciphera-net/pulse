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
vi.mock('@/lib/api/client', () => ({ default: vi.fn().mockRejectedValue(new Error('no profile')) }))
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
    claimPendingAuth.mockReturnValue({ verifier: 'V', createdAt: Date.now() })
    exchangeAuthCode.mockResolvedValue({ success: true, user: { id: 'u1', org_id: 'o1', role: 'owner' } })

    render(<AuthCallback />)

    await waitFor(() => expect(exchangeAuthCode).toHaveBeenCalledWith('CODE', 'V', expect.any(String)))
    expect(getSessionAction).not.toHaveBeenCalled()
  })
})

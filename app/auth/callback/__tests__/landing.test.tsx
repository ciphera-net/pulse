import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// * ═══ A FRESH SIGNUP LANDS WHERE IT BELONGS, FIRST TIME ═══
// *
// * Reported by the owner walking their own signup, 08-09-2026:
// * "it first shows pulse /sites page with the empty placeholder with no sites
// * & then it goes to /setup/site — this happens really fast but shouldn't
// * happen."
// *
// * Four hops, each correct alone: this page had no destination, so it fell
// * through to `/`; the edge redirects an authenticated `/` to `/sites`;
// * `/sites` RENDERS its empty-fleet placeholder; and only then does the
// * onboarding wall — a client effect, one render later — push the wizard.
// *
// * These tests assert the URL, which is what nothing did before: the existing
// * suite only ever checked that `assign` had been CALLED. A page that lands on
// * `/` passes every one of those and still shows the flash.

let search = new URLSearchParams()
vi.mock('next/navigation', () => ({ useSearchParams: () => search }))

const login = vi.fn()
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ login }) }))

const exchangeAuthCode = vi.fn()
const getSessionAction = vi.fn()
const setSessionAction = vi.fn()
vi.mock('@/app/actions/auth', () => ({
  exchangeAuthCode: (...a: unknown[]) => exchangeAuthCode(...a),
  getSessionAction: (...a: unknown[]) => getSessionAction(...a),
  setSessionAction: (...a: unknown[]) => setSessionAction(...a),
}))

const claimPendingAuth = vi.fn()
vi.mock('@/lib/api/oauth-store', () => ({
  claimPendingAuth: (...a: unknown[]) => claimPendingAuth(...a),
  forgetAllPendingAuth: vi.fn(),
}))
vi.mock('@/lib/api/oauth', () => ({ initiateOAuthFlow: vi.fn() }))
vi.mock('@/lib/api/client', () => ({
  default: vi.fn().mockRejectedValue(new Error('no profile')),
  setAccessToken: vi.fn(),
  APP_URL: 'https://pulse.ciphera.net',
}))
vi.mock('@/lib/cdn', () => ({ cdnUrl: (p: string) => p }))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

// * The API layer is mocked; the RESOLUTION is not. resolveLandingTarget runs
// * for real here, so these pin the whole chain rather than a stubbed answer.
const ensureDefaultOrganization = vi.fn()
const switchContext = vi.fn()
const getOrganization = vi.fn()
vi.mock('@/lib/api/organization', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/organization')>()
  return {
    // shouldProvisionWorkspace is pure and load-bearing — keep the real one.
    shouldProvisionWorkspace: actual.shouldProvisionWorkspace,
    ensureDefaultOrganization: (...a: unknown[]) => ensureDefaultOrganization(...a),
    switchContext: (...a: unknown[]) => switchContext(...a),
    getOrganization: (...a: unknown[]) => getOrganization(...a),
  }
})

const listSites = vi.fn()
vi.mock('@/lib/api/sites', () => ({ listSites: (...a: unknown[]) => listSites(...a) }))

import AuthCallback from '../page'

const assign = vi.fn()

/** A completed exchange for an account whose session reports `role`. */
function exchangeSucceedsAs(role: string) {
  claimPendingAuth.mockReturnValue({
    verifier: 'V',
    createdAt: Date.now(),
    redirectUri: 'https://pulse.ciphera.net/auth/callback',
  })
  exchangeAuthCode.mockResolvedValue({
    success: true,
    user: { id: 'u1', email: 'a@b.c', role },
    access_token: 'tok',
  })
  switchContext.mockResolvedValue({ access_token: 'tok-scoped' })
  setSessionAction.mockResolvedValue({ success: true, user: { id: 'u1', role } })
}

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

describe('auth callback — where a completed sign-in lands', () => {
  it('sends a BRAND-NEW account straight to the first wizard step, never to /', async () => {
    exchangeSucceedsAs('owner')
    ensureDefaultOrganization.mockResolvedValue({
      created: true,
      organization: { id: 'o1', name: 'Midnight Conservatory', slug: 'midnight-conservatory-xnxv' },
    })

    render(<AuthCallback />)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/setup/site'))
    // 🔴 The regression this file exists for. '/' is what produced the flash.
    expect(assign).not.toHaveBeenCalledWith('/')
    // * A workspace that did not exist a moment ago cannot have sites or a
    // * completion flag, so it must cost no extra round trip.
    expect(getOrganization).not.toHaveBeenCalled()
    expect(listSites).not.toHaveBeenCalled()
  })

  it('sends a RETURNING owner whose setup is finished to the app, skipping the edge hop', async () => {
    exchangeSucceedsAs('owner')
    ensureDefaultOrganization.mockResolvedValue({
      created: false,
      organization: { id: 'o1', name: 'Quiet Forge', slug: 'quiet-forge-ab12' },
    })
    getOrganization.mockResolvedValue({ onboarding_completed_at: '2026-09-01T00:00:00Z' })

    render(<AuthCallback />)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/sites'))
  })

  it('resumes a half-finished workspace at the step its sites imply', async () => {
    exchangeSucceedsAs('owner')
    ensureDefaultOrganization.mockResolvedValue({
      created: false,
      organization: { id: 'o1', name: 'Quiet Forge', slug: 'quiet-forge-ab12' },
    })
    getOrganization.mockResolvedValue({ onboarding_completed_at: null })
    listSites.mockResolvedValue([{ install_status: 'never_installed' }])

    render(<AuthCallback />)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/setup/install'))
  })

  it('never sends a NON-OWNER into the wizard, even with onboarding unfinished', async () => {
    // 🔴 Only the owner can write the completion flag, and the wizard's last
    // step is a BILLING step a member is refused. The wall does not bind them.
    exchangeSucceedsAs('member')
    ensureDefaultOrganization.mockResolvedValue({
      created: false,
      organization: { id: 'o1', name: 'Quiet Forge', slug: 'quiet-forge-ab12' },
    })

    render(<AuthCallback />)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/sites'))
    expect(getOrganization).not.toHaveBeenCalled()
  })

  it('a stored return target still wins over the resolved destination', async () => {
    // The pricing page stores one before sending an anonymous visitor to sign
    // in. It is an explicit request; this page does not know better than it.
    exchangeSucceedsAs('owner')
    ensureDefaultOrganization.mockResolvedValue({
      created: true,
      organization: { id: 'o1', name: 'Quiet Forge', slug: 'quiet-forge-ab12' },
    })
    localStorage.setItem('pulse_auth_return_to', '/setup/org?plan=pro')

    render(<AuthCallback />)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/setup/org?plan=pro'))
    expect(localStorage.getItem('pulse_auth_return_to')).toBeNull()
  })

  it('an invite still skips provisioning AND lands on the invite', async () => {
    exchangeSucceedsAs('owner')
    localStorage.setItem('pulse_auth_return_to', '/join/ABC123')

    render(<AuthCallback />)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/join/ABC123'))
    // 🔴 Somebody accepting an invite must not be handed a stray workspace.
    expect(ensureDefaultOrganization).not.toHaveBeenCalled()
  })

  it('still completes the sign-in when the destination cannot be resolved', async () => {
    // * Resolution is an improvement on a guess, never a precondition. The org
    // * wall picks the person up on the destination route.
    exchangeSucceedsAs('owner')
    ensureDefaultOrganization.mockRejectedValue(new Error('502'))

    render(<AuthCallback />)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'))
  })

  it('resolves for the RESCUE path too, from the session it just proved', async () => {
    // The Safari case: ID authenticated them, this page has nothing to
    // exchange. It used to land on '/' and flash exactly the same way.
    search = new URLSearchParams('code=CODE&state=STATE')
    claimPendingAuth.mockReturnValue(null)
    getSessionAction.mockResolvedValue({ id: 'u1', email: 'a@b.c', org_id: 'o1', role: 'owner' })
    getOrganization.mockResolvedValue({ onboarding_completed_at: null })
    listSites.mockResolvedValue([])

    render(<AuthCallback />)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/setup/site'))
    expect(exchangeAuthCode).not.toHaveBeenCalled()
  })
})

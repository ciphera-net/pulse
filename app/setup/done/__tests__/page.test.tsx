import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { org_id: 'org_1' } }),
}))

const completeStep = vi.fn()
// best-way-B: onboarding cannot complete without a site, so the site the wizard
// holds is now the pivot these tests turn on. Mutable, reset to null each test.
let mockSite: { id: string; domain: string } | null = null
vi.mock('@/lib/setup/context', () => ({
  useSetup: () => ({ site: mockSite, completeStep: (...args: unknown[]) => completeStep(...args) }),
}))
const A_SITE = { id: 'site_1', domain: 'example.com' }
// The done page now reads the sites fetch's own loading flag to decide the
// one-way onboarding write. Controllable so the load→settle race is testable.
let mockSitesLoading = false
vi.mock('@/lib/swr/sites', () => ({
  useSites: () => ({ isLoading: mockSitesLoading }),
}))

const completeOnboarding = vi.fn().mockResolvedValue({})
vi.mock('@/lib/api/organization', () => ({
  completeOnboarding: (...args: unknown[]) => completeOnboarding(...args),
}))

const trackWelcomeCompleted = vi.fn()
vi.mock('@/lib/welcomeAnalytics', () => ({
  trackWelcomeCompleted: (...args: unknown[]) => trackWelcomeCompleted(...args),
}))

// The page no longer polls /realtime — it reads the server's install status
// through InstallStateBlock. Mock the hook rather than the whole SWR module's
// import chain.
vi.mock('@/lib/swr/dashboard', () => ({
  useInstallStatus: () => ({ data: undefined, mutate: vi.fn() }),
}))

const getSubscription = vi.fn()
vi.mock('@/lib/api/billing', () => ({
  getSubscription: (...args: unknown[]) => getSubscription(...args),
}))

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => ({ children, ...rest }: any) => <div className={rest.className}>{children}</div> }),
}))

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Spinner: (props: any) => <div data-testid="spinner" {...props} />,
  CheckCircleIcon: () => <span />,
  UsersIcon: () => <span />,
  BookOpenIcon: () => <span />,
  FunnelIcon: () => <span />,
}))

import { ApiError } from '@/lib/api/client'
import SetupDonePage from '../page'

function setSearch(search: string) {
  window.history.replaceState({}, '', '/setup/done' + search)
}

beforeEach(() => {
  mockSite = null
  mockSitesLoading = false
  getSubscription.mockReset()
  mockPush.mockClear()
  completeStep.mockClear()
  completeOnboarding.mockReset()
  completeOnboarding.mockResolvedValue({})
  trackWelcomeCompleted.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  setSearch('')
})

describe('SetupDonePage payment confirmation', () => {
  it('renders the success content directly for Hobby skippers (no from=checkout)', () => {
    setSearch('')
    render(<SetupDonePage />)
    expect(screen.getByText(/You're all set!/)).toBeTruthy()
    expect(getSubscription).not.toHaveBeenCalled()
  })

  it('confirms an active subscription before showing success', async () => {
    setSearch('?from=checkout')
    getSubscription.mockResolvedValue({ subscription_status: 'active' })
    render(<SetupDonePage />)
    // The success claim must be earned — confirming state first…
    expect(screen.getByText(/Confirming your payment/)).toBeTruthy()
    // …then flips once the subscription reads active.
    expect(await screen.findByText(/You're all set!/)).toBeTruthy()
  })

  it('shows the unconfirmed state when the subscription never activates', async () => {
    vi.useFakeTimers()
    setSearch('?from=checkout')
    getSubscription.mockResolvedValue({ subscription_status: '' })
    render(<SetupDonePage />)
    expect(screen.getByText(/Confirming your payment/)).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000)
    })
    expect(screen.getByText(/couldn't confirm your payment/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View billing' })).toBeTruthy()
    expect(screen.queryByText(/You're all set!/)).toBeNull()
  })

  it('resolves a TERMINAL status immediately — no 75s burn on a definitively failed payment', async () => {
    setSearch('?from=checkout')
    getSubscription.mockResolvedValue({ subscription_status: 'past_due' })
    render(<SetupDonePage />)
    // First poll answers past_due — the failed state appears without any timer advance.
    expect(await screen.findByText(/Your payment didn't go through/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText(/You're all set!/)).toBeNull()
  })

  it('gives persistent POLL failures their own state — never "couldn\'t confirm your payment"', async () => {
    vi.useFakeTimers()
    setSearch('?from=checkout')
    getSubscription.mockRejectedValue(new Error('500'))
    render(<SetupDonePage />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(screen.getByText(/We can't check your payment right now/)).toBeTruthy()
    // The old page rendered a 401/500 as "couldn't confirm your payment" —
    // a statement about the PAYMENT it had no basis for.
    expect(screen.queryByText(/couldn't confirm your payment/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy()
  })
})

describe('SetupDonePage completion gating (ruled B1 — F-B14)', () => {
  it('fires completion exactly once for a settled non-checkout arrival WITH a site', async () => {
    mockSite = A_SITE
    setSearch('')
    render(<SetupDonePage />)
    expect(screen.getByText(/You're all set!/)).toBeTruthy()
    expect(completeStep).toHaveBeenCalledWith('done')
    expect(trackWelcomeCompleted).toHaveBeenCalledTimes(1)
    expect(completeOnboarding).toHaveBeenCalledWith('org_1')
  })

  // 🔴 best-way-B: the one write of onboarding_completed_at must NOT fire for a
  // site-less workspace — that is the one-way door that stranded the two internal
  // orgs. The step and analytics still fire; only the server completion is gated.
  it('does NOT complete onboarding without a site, even when settled', async () => {
    mockSite = null
    setSearch('')
    render(<SetupDonePage />)
    expect(completeStep).toHaveBeenCalledWith('done')
    expect(trackWelcomeCompleted).toHaveBeenCalledTimes(1)
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('does NOT write completion while the sites fetch is still loading', () => {
    mockSitesLoading = true
    mockSite = null
    setSearch('')
    render(<SetupDonePage />)
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  // 🔴 The race the review caught: a shared one-shot ref would fire (and lock)
  // during the null-site load window, permanently missing the one-way write for
  // a user who DOES have a site. With a separate latch, the write survives the
  // load→settle transition and fires once the site resolves. This FAILS on the
  // shared-ref version.
  it('writes completion once a site resolves after the fetch settles', () => {
    mockSitesLoading = true
    mockSite = null
    setSearch('')
    const { rerender } = render(<SetupDonePage />)
    expect(completeOnboarding).not.toHaveBeenCalled()
    // fetch settles and the setup context resolves the site
    mockSitesLoading = false
    mockSite = A_SITE
    rerender(<SetupDonePage />)
    expect(completeOnboarding).toHaveBeenCalledWith('org_1')
    expect(completeOnboarding).toHaveBeenCalledTimes(1)
  })

  it('fires NOTHING while the confirming spinner is up', async () => {
    vi.useFakeTimers()
    setSearch('?from=checkout')
    getSubscription.mockResolvedValue({ subscription_status: '' })
    render(<SetupDonePage />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(screen.getByText(/Confirming your payment/)).toBeTruthy()
    // The abandoned-checkout funnel pollution: these all used to fire on mount.
    expect(completeStep).not.toHaveBeenCalled()
    expect(trackWelcomeCompleted).not.toHaveBeenCalled()
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('fires NOTHING for an unconfirmed or failed outcome', async () => {
    vi.useFakeTimers()
    setSearch('?from=checkout')
    getSubscription.mockResolvedValue({ subscription_status: '' })
    render(<SetupDonePage />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000)
    })
    expect(screen.getByText(/couldn't confirm your payment/)).toBeTruthy()
    expect(completeStep).not.toHaveBeenCalled()
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('fires completion once the payment is CONFIRMED (with a site)', async () => {
    mockSite = A_SITE
    setSearch('?from=checkout')
    getSubscription.mockResolvedValue({ subscription_status: 'active' })
    render(<SetupDonePage />)
    expect(await screen.findByText(/You're all set!/)).toBeTruthy()
    expect(screen.getByText(/Payment confirmed/)).toBeTruthy()
    expect(completeStep).toHaveBeenCalledWith('done')
    expect(completeOnboarding).toHaveBeenCalledWith('org_1')
    expect(trackWelcomeCompleted).toHaveBeenCalledTimes(1)
  })
})


// ---------------------------------------------------------------------------
// 🔴 Permanent vs transient completion failure.
//
// The write used to latch BEFORE the call resolved and swallow the outcome with
// `.catch(() => {})`, so a non-owner's permanent 403 and an owner's transient
// 5xx were handled identically — and neither was ever shown. These four tests
// pin the two apart; each fails against that version.
// ---------------------------------------------------------------------------
describe('SetupDonePage completion failure handling', () => {
  // * Same-mount rerender, NO key: a key change remounts and resets the refs in
  // * every version, which made the first draft of these tests vacuous — they
  // * passed against the very code they were written to condemn. The effect
  // * re-runs when a dep changes, so `sitesLoading` is flipped to drive it.
  function forceEffectRerun(rerender: (ui: React.ReactElement) => void) {
    mockSitesLoading = true
    rerender(<SetupDonePage />)
    mockSitesLoading = false
    mockSite = A_SITE
    rerender(<SetupDonePage />)
  }

  it('does NOT latch on a transient failure — it retries when the effect re-runs', async () => {
    mockSite = A_SITE
    completeOnboarding.mockReset()
    completeOnboarding.mockRejectedValueOnce(new ApiError('upstream blew up', 500))
    completeOnboarding.mockResolvedValue({})

    const { rerender } = render(<SetupDonePage />)
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(1))

    // The old code latched BEFORE awaiting, so a legitimate owner's transient
    // 5xx permanently skipped the estate's ONE write of onboarding_completed_at
    // and the org wall bounced them.
    forceEffectRerun(rerender)
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(2))
  })

  it('does NOT retry after a 403 — a permission answer cannot change', async () => {
    mockSite = A_SITE
    completeOnboarding.mockReset()
    completeOnboarding.mockRejectedValue(new ApiError('Only the owner can complete onboarding', 403))

    const { rerender } = render(<SetupDonePage />)
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(1))

    // Guards the OTHER regression the retry above invites: with the terminal
    // 403 state removed, every dep change would fire another doomed request.
    forceEffectRerun(rerender)
    await new Promise((r) => setTimeout(r, 20))
    expect(completeOnboarding).toHaveBeenCalledTimes(1)
  })

  it('never claims the workspace is ready when completion was forbidden', async () => {
    mockSite = A_SITE
    completeOnboarding.mockReset()
    completeOnboarding.mockRejectedValue(new ApiError('Only the owner can complete onboarding', 403))

    render(<SetupDonePage />)
    await waitFor(() => expect(screen.queryByText(/You're all set!/)).toBeNull())
    expect(screen.getByText(/workspace owner still has a step left/i)).toBeTruthy()
  })

  it('still says "all set" on the happy path', async () => {
    mockSite = A_SITE
    render(<SetupDonePage />)
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/You're all set!/)).toBeTruthy()
  })
})

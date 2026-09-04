import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

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

import SetupDonePage from '../page'

function setSearch(search: string) {
  window.history.replaceState({}, '', '/setup/done' + search)
}

beforeEach(() => {
  mockSite = null
  getSubscription.mockReset()
  mockPush.mockClear()
  completeStep.mockClear()
  completeOnboarding.mockClear()
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

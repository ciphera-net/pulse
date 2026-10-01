// /start/plan (D43): the dashboard address a future marketing /pricing
// button will link to with ?plan=&interval=&limit=. These pin the page's own
// job — wait for auth (and, signed in, the subscription read) to resolve,
// then hand off to the shared decision — not the decision itself, which
// lib/auth/__tests__/plan-destination.test.ts already covers.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  user: null as { id: string } | null,
  authLoading: false,
  subscription: undefined as { subscription_status?: string } | undefined,
  subscriptionLoading: false,
  resolvePlanDestination: vi.fn(),
  rememberReturnTarget: vi.fn(),
  initiateSignupFlow: vi.fn(),
}))

let mockSearch = 'plan=business&interval=month&limit=10000'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: h.user, loading: h.authLoading }),
}))
vi.mock('@/lib/swr/dashboard', () => ({
  useSubscription: () => ({ data: h.subscription, isLoading: h.subscriptionLoading }),
}))
vi.mock('@/lib/cdn', () => ({ cdnUrl: (p: string) => p }))
vi.mock('@ciphera-net/facet', () => ({
  LoadingOverlay: () => <div data-testid="overlay" />,
}))
// parsePlanQuery is the REAL validator (lib/auth/plan-destination.ts isn't
// mocked at all) — only getUserOrganizations needs a double, and this page
// never imports it directly. resolvePlanDestination is the one seam this
// page's own tests replace, so they pin hand-off, not the decision.
vi.mock('@/lib/auth/plan-destination', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/plan-destination')>('@/lib/auth/plan-destination')
  return {
    parsePlanQuery: actual.parsePlanQuery,
    planQueryString: actual.planQueryString,
    resolvePlanDestination: (...a: unknown[]) => h.resolvePlanDestination(...a),
  }
})
vi.mock('@/lib/auth/return-target', () => ({
  rememberReturnTarget: (...a: unknown[]) => h.rememberReturnTarget(...a),
}))
vi.mock('@/lib/api/oauth', () => ({
  initiateSignupFlow: (...a: unknown[]) => h.initiateSignupFlow(...a),
}))

import StartPlanPage from '../page'

beforeEach(() => {
  vi.clearAllMocks()
  mockSearch = 'plan=business&interval=month&limit=10000'
  h.user = null
  h.authLoading = false
  h.subscription = undefined
  h.subscriptionLoading = false
})

describe('/start/plan', () => {
  it('holds on a neutral loading state while auth is still resolving — no decision yet', async () => {
    h.authLoading = true
    render(<StartPlanPage />)
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
    await Promise.resolve()
    expect(h.resolvePlanDestination).not.toHaveBeenCalled()
    expect(h.push).not.toHaveBeenCalled()
    expect(h.replace).not.toHaveBeenCalled()
  })

  it('an unknown query sends the visitor to /pricing without ever asking for a destination', async () => {
    mockSearch = 'plan=not-a-real-plan'
    render(<StartPlanPage />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/pricing'))
    expect(h.resolvePlanDestination).not.toHaveBeenCalled()
  })

  it('anonymous: remembers the return target and starts a signup, once auth settles', async () => {
    h.resolvePlanDestination.mockResolvedValue({ kind: 'signup', returnTarget: '/setup/org?plan=business' })
    render(<StartPlanPage />)
    await waitFor(() => expect(h.rememberReturnTarget).toHaveBeenCalledWith('/setup/org?plan=business'))
    expect(h.initiateSignupFlow).toHaveBeenCalledTimes(1)
    expect(h.push).not.toHaveBeenCalled()
    expect(h.replace).not.toHaveBeenCalledWith(expect.stringContaining('/setup'))
  })

  it('signed in, subscription still loading: waits rather than deciding on an unknown status', async () => {
    h.user = { id: 'u1' }
    h.subscriptionLoading = true
    render(<StartPlanPage />)
    await Promise.resolve()
    expect(h.resolvePlanDestination).not.toHaveBeenCalled()
  })

  it('signed in, subscription resolved: navigates to whatever the shared decision returns', async () => {
    h.user = { id: 'u1' }
    h.subscriptionLoading = false
    h.subscription = { subscription_status: 'active' }
    h.resolvePlanDestination.mockResolvedValue({ kind: 'navigate', path: '/switch?plan=business' })
    render(<StartPlanPage />)
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/switch?plan=business'))
    expect(h.resolvePlanDestination).toHaveBeenCalledWith({
      isSignedIn: true,
      subscriptionStatus: 'active',
      query: { plan: 'business', interval: 'month', limit: 10000 },
    })
  })
})

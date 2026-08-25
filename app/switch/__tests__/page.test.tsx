import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { SubscriptionDetails } from '@/lib/api/billing'

// /switch had ZERO tests of any kind while carrying live proration estimates
// and plan changes (F-F1) — a defect density the recon correlated exactly with
// the coverage hole. These pin the E1 rebuild's contracts.

// --- Mocks ---------------------------------------------------------------

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockBack = vi.fn()
let mockSearch = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { org_id: 'org_1' }, loading: false }),
}))

let mockSubscription: SubscriptionDetails | undefined
let mockSubscriptionError: Error | undefined
const mutateSubscription = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSubscription: () => ({
    data: mockSubscription,
    error: mockSubscriptionError,
    isLoading: false,
    mutate: mutateSubscription,
  }),
}))

const estimatePlanChange = vi.fn()
const changePlan = vi.fn()
const getSubscription = vi.fn()
vi.mock('@/lib/api/billing', () => ({
  // Every plan needs a price at the tier the tests select (10000 — the solo
  // subscription's own tier): an unpriced card is DISABLED by design (F-B12),
  // which is a nice accidental proof the guard works, but not what these
  // tests are for.
  getPrices: vi.fn().mockResolvedValue({ solo: { 10000: 700 }, team: { 10000: 1600 }, business: { 10000: 3100 } }),
  getSubscription: (...a: unknown[]) => getSubscription(...a),
  changePlan: (...a: unknown[]) => changePlan(...a),
  estimatePlanChange: (...a: unknown[]) => estimatePlanChange(...a),
  // PlanSummary/PaymentForm imports:
  calculateVAT: vi.fn().mockResolvedValue({ base_amount: '7.00', vat_rate: 21, vat_amount: '1.47', total_amount: '8.47', vat_exempt: false, vat_reason: '' }),
  createCheckoutSession: vi.fn().mockResolvedValue({ url: 'https://checkout.example/x' }),
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => <>{children}</>,
  motion: new Proxy({}, { get: () => ({ children, ...rest }: any) => <div className={rest.className}>{children}</div> }),
}))

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Spinner: () => <div data-testid="spinner" />,
  LoadingOverlay: () => <div data-testid="overlay" />,
  Input: (props: any) => <input {...props} />,
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  getAuthErrorMessage: () => 'error',
  cn: (...args: any[]) => args.filter((a) => typeof a === 'string').join(' '),
}))

vi.mock('@/lib/cdn', () => ({ cdnUrl: (p: string) => p }))

// The heavy checkout composition is not under test here — the wizard's own
// tests cover it. Stubs keep the checkout-mode render observable.
vi.mock('@/components/checkout/PlanSummary', () => ({
  default: () => <div data-testid="plan-summary" />,
}))
vi.mock('@/components/checkout/PaymentForm', () => ({
  default: (props: any) => <div data-testid="payment-form" data-return-to={props.returnTo} />,
}))
vi.mock('@/components/billing/TierSlider', () => ({
  default: () => <div data-testid="tier-slider" />,
}))

import SwitchPage from '../page'

const activeSolo: SubscriptionDetails = {
  plan_id: 'solo',
  subscription_status: 'active',
  next_charge_on: '2026-09-15',
  billing_interval: 'month',
  pageview_limit: 10000,
  has_payment_method: true,
}

function setSearch(search: string) {
  mockSearch = search
  window.history.replaceState({}, '', '/switch' + search)
}

beforeEach(() => {
  mockSubscription = { ...activeSolo }
  mockSubscriptionError = undefined
  mockPush.mockClear()
  mockReplace.mockClear()
  estimatePlanChange.mockReset()
  changePlan.mockReset()
  getSubscription.mockReset()
  setSearch('')
})

describe('/switch guard (ruled F-B2: fetch error ≠ bounce to onboarding)', () => {
  it('renders the error card with retry when the subscription fetch failed — never a redirect', async () => {
    mockSubscription = undefined
    mockSubscriptionError = new Error('blip')
    render(<SwitchPage />)
    expect(await screen.findByText(/Couldn.t load your subscription/)).toBeTruthy()
    // The old guard sent an active subscriber into onboarding — where a second
    // checkout was live.
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('past_due goes to billing recovery, not a plan picker', async () => {
    mockSubscription = { ...activeSolo, subscription_status: 'past_due' }
    render(<SwitchPage />)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/settings/organization/billing'))
  })

  it('a free (never-subscribed) org is ADMITTED — /switch owns every plan change (ruled E1)', async () => {
    mockSubscription = {
      ...activeSolo,
      plan_id: 'free',
      subscription_status: '',
      billing_interval: '',
      pageview_limit: 5000,
      has_payment_method: false,
      next_charge_on: null,
    }
    render(<SwitchPage />)
    expect(await screen.findByText('Switch your plan')).toBeTruthy()
    expect(screen.getByText(/you.ll enter payment details on the next step/i)).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})

describe('/switch checkout mode (no mandate on file)', () => {
  it('selecting a plan renders the checkout composition with returnTo="switch" — never an estimate call', async () => {
    mockSubscription = {
      ...activeSolo,
      plan_id: 'free',
      subscription_status: '',
      billing_interval: '',
      pageview_limit: 5000,
      has_payment_method: false,
      next_charge_on: null,
    }
    render(<SwitchPage />)
    const teamCard = await screen.findByText('Team')
    fireEvent.click(teamCard.closest('button')!)

    expect(await screen.findByTestId('payment-form')).toBeTruthy()
    // The whole point of E1's backend half: the Mollie return lands back on
    // /switch, never on the onboarding done page.
    expect(screen.getByTestId('payment-form').getAttribute('data-return-to')).toBe('switch')
    expect(estimatePlanChange).not.toHaveBeenCalled()
  })

  it('a granted org (active but no mandate) also gets the checkout path, not an in-place charge', async () => {
    mockSubscription = {
      ...activeSolo,
      plan_id: 'pioneer',
      has_payment_method: false,
      next_charge_on: null,
      grant_expires_on: '2027-04-27',
    }
    render(<SwitchPage />)
    const teamCard = await screen.findByText('Team')
    fireEvent.click(teamCard.closest('button')!)
    expect(await screen.findByTestId('payment-form')).toBeTruthy()
    expect(estimatePlanChange).not.toHaveBeenCalled()
  })
})

describe('/switch in-place review (mandate on file)', () => {
  it('renders calendar dates VERBATIM from the estimate — no timezone can shift the day (F-B3)', async () => {
    estimatePlanChange.mockResolvedValue({
      direction: 'downgrade',
      currency: 'EUR',
      current_plan_end: '2026-09-15',
      new_plan_start: '2026-09-16',
      new_plan_cost: 700,
      refund_amount: 0,
    })
    render(<SwitchPage />)
    const teamCard = await screen.findByText('Team')
    fireEvent.click(teamCard.closest('button')!)

    // 2026-09-15 is a Tuesday; the weekday comes from the calendar date itself.
    expect(await screen.findByText('Tue, 15/09/2026')).toBeTruthy()
    expect(screen.getByText('Wed, 16/09/2026')).toBeTruthy()
  })

  it('an upgrade review shows the on-file payment method and the no-redirect promise', async () => {
    estimatePlanChange.mockResolvedValue({
      direction: 'upgrade',
      currency: 'EUR',
      charge_amount: 1600,
      next_renewal: '2026-09-15',
    })
    render(<SwitchPage />)
    const teamCard = await screen.findByText('Team')
    fireEvent.click(teamCard.closest('button')!)

    expect(await screen.findByText('On file')).toBeTruthy()
    expect(screen.getByText(/You stay on this page — no checkout redirect, no onboarding screens\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Pay €16\.00 & switch/ })).toBeTruthy()
  })
})

describe('/switch done step honesty (F-B17)', () => {
  it('a scheduled downgrade says SCHEDULED — never "You\'re now on"', async () => {
    estimatePlanChange.mockResolvedValue({
      direction: 'downgrade',
      currency: 'EUR',
      current_plan_end: '2026-09-15',
      new_plan_start: '2026-09-16',
      new_plan_cost: 700,
    })
    changePlan.mockResolvedValue({ ok: true })
    render(<SwitchPage />)
    const teamCard = await screen.findByText('Team')
    fireEvent.click(teamCard.closest('button')!)
    // The Confirm button exists (disabled) before the estimate lands — wait
    // for the estimate panel so the click actually fires.
    await screen.findByText('Change summary')
    const confirm = screen.getByRole('button', { name: 'Confirm switch' })
    await act(async () => { fireEvent.click(confirm) })

    expect(await screen.findByText('Plan change scheduled')).toBeTruthy()
    expect(screen.getByText(/You stay on Solo until/)).toBeTruthy()
    expect(screen.queryByText(/You're now on/)).toBeNull()
    // Ruled E1: Done returns to billing.
    expect(screen.getByRole('button', { name: 'Back to billing' })).toBeTruthy()
  })

  it('an immediate upgrade may honestly say "You\'re now on"', async () => {
    estimatePlanChange.mockResolvedValue({
      direction: 'upgrade',
      currency: 'EUR',
      charge_amount: 1600,
    })
    changePlan.mockResolvedValue({ ok: true })
    render(<SwitchPage />)
    const teamCard = await screen.findByText('Team')
    fireEvent.click(teamCard.closest('button')!)
    const pay = await screen.findByRole('button', { name: /Pay .* & switch/ })
    await act(async () => { fireEvent.click(pay) })

    expect(await screen.findByText(/You're now on Team/)).toBeTruthy()
  })
})

describe('/switch return from Mollie (?from=checkout)', () => {
  it('confirms before celebrating, then lands on "Plan updated → Back to billing"', async () => {
    setSearch('?from=checkout')
    getSubscription.mockResolvedValue({ subscription_status: 'active', plan_id: 'team' })
    render(<SwitchPage />)
    expect(screen.getByText(/Confirming your payment/)).toBeTruthy()
    expect(await screen.findByText('Plan updated')).toBeTruthy()
    expect(screen.getByText(/Payment confirmed/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to billing' })).toBeTruthy()
  })

  it('a terminal status resolves immediately to the failed state', async () => {
    setSearch('?from=checkout')
    getSubscription.mockResolvedValue({ subscription_status: 'canceled' })
    render(<SwitchPage />)
    expect(await screen.findByText(/Your payment didn't go through/)).toBeTruthy()
  })
})

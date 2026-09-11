import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

const mockReplace = vi.fn()
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))

const mockCompleteStep = vi.fn()
// Mutable: the cancel URL now carries the plan choice home, so pendingPlan is
// how the page knows which plan to re-show — and the billing form only renders
// once a plan is selected. The two halves of #18 depend on each other.
let pendingPlan: { planId: string; interval: string; limit: number } | null = null
vi.mock('@/lib/setup/context', () => ({
  useSetup: () => ({ pendingPlan, completeStep: mockCompleteStep }),
}))

// Mutable so a test can hand the page the billing details the server already
// holds — which is how a cancelled payment refills the form (#18).
let subscriptionData: Record<string, unknown> | undefined
vi.mock('@/lib/swr/dashboard', () => ({
  useSubscription: () => ({ data: subscriptionData }),
}))

// Control the prices-fetch state per test.
let swrState: { data?: unknown; error?: unknown; isValidating: boolean }
const mockRetryPrices = vi.fn()
vi.mock('swr', () => ({
  default: () => ({ ...swrState, mutate: mockRetryPrices }),
}))

vi.mock('@/lib/api/billing', () => ({ getPrices: vi.fn() }))

// framer-motion: render children directly, drop animation props.
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => ({ children }: any) => <div>{children}</div> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Spinner: () => <div>loading</div>,
  // Minimal stand-in that keeps the real radiogroup-of-radios contract, so
  // queries by role/name behave the same as against the real Switcher.
  Switcher: ({ options, value, onChange, 'aria-label': ariaLabel }: any) => (
    <div role="radiogroup" aria-label={ariaLabel}>
      {options.map((o: any) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  ),
  // lib/utils re-exports cn from the facet package — keep it callable for the
  // real Slider/PlanChoiceCard rendered under this page.
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}))

// Child components are exercised elsewhere — stub to keep the plan-page test focused.
// The billing values ARE state on the page, handed down from here, so the stub
// also exposes them: "did the page refill itself?" is the direct question, and
// asking it this way does not depend on how the summary lays out its inputs.
vi.mock('@/components/checkout/PlanSummary', () => ({
  default: (p: any) => (
    <div
      data-testid="plan-summary"
      data-business={String(p.businessName ?? '')}
      data-email={String(p.billingEmail ?? '')}
      data-address={String(p.address ?? '')}
      data-city={String(p.city ?? '')}
      data-postal={String(p.postalCode ?? '')}
      data-country={String(p.country ?? '')}
    >
      summary:{p.plan}
    </div>
  ),
}))
vi.mock('@/components/checkout/PaymentForm', () => ({
  default: ({ plan }: any) => <div data-testid="payment-form">payment:{plan}</div>,
}))
vi.mock('@/components/ui/select', () => ({
  default: () => <div data-testid="select" />,
}))
// Radix Slider requires ResizeObserver, which jsdom lacks — the slider itself
// is not what this page test exercises.
vi.mock('@/components/ui/slider', () => ({
  Slider: () => <div data-testid="slider" />,
}))

import SetupPlanPage from '../page'

// One purchasable plan since 11-09-2026 — the backend's GET /api/billing/prices
// returns only a `business` key.
const PRICES = {
  business: { 10000: 2900 },
}

beforeEach(() => {
  subscriptionData = undefined
  pendingPlan = null
  swrState = { data: PRICES, error: undefined, isValidating: false }
  mockReplace.mockClear()
  mockPush.mockClear()
  mockCompleteStep.mockClear()
  mockRetryPrices.mockClear()
})

describe('SetupPlanPage plan-tier keyboard nav', () => {
  // PLAN_CATALOG has exactly one entry (business) since 11-09-2026 — Solo and
  // Team were retired as purchasable. The modulo wrap in onPlanKeyDown
  // ((index ± 1 + length) % length) always lands back on index 0 when
  // length === 1, so every arrow key keeps the single plan selected rather
  // than moving to a different one. This still exercises all four key
  // branches; it just can no longer prove a MOVE between two distinct plans.
  it.each(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const)(
    'keeps the single plan (business) selected on %s',
    (key) => {
      render(<SetupPlanPage />)
      // Scoped to the plan radiogroup — the billing-interval Switcher is also a
      // radiogroup of radios and would otherwise be picked up by the query.
      const radios = within(screen.getByRole('radiogroup', { name: 'Choose a paid plan' })).getAllByRole('radio')
      expect(radios.length).toBe(1)
      fireEvent.keyDown(radios[0], { key })
      // Selecting a plan transitions to the checkout view for that plan.
      expect(screen.getByTestId('payment-form').textContent).toBe('payment:business')
    },
  )
})

describe('SetupPlanPage prices-fetch retry state', () => {
  it('shows Retry (enabled) when the fetch has errored but is not revalidating', () => {
    swrState = { data: undefined, error: new Error('boom'), isValidating: false }
    render(<SetupPlanPage />)
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect((retry as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows Retrying... (disabled) while revalidating an errored key', () => {
    // isLoading stays false during revalidation of an errored key — the label
    // must key off isValidating so the busy state actually shows.
    swrState = { data: undefined, error: new Error('boom'), isValidating: true }
    render(<SetupPlanPage />)
    const retry = screen.getByRole('button', { name: 'Retrying...' })
    expect((retry as HTMLButtonElement).disabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// #18 — cancelling at Mollie must not cost you the form.
//
// Going to Mollie is a full document navigation, so the app unmounts and every
// answer dies with it. Nothing is stored in the browser to fix this: the
// checkout handler persists these six fields BEFORE it redirects, so they are
// already server-side and simply were not read back.
// ---------------------------------------------------------------------------
describe('coming back from a cancelled payment', () => {
  const billing = {
    business_name: 'Guard BV',
    billing_email: 'guard@example.com',
    billing_address: 'Teststraat 1',
    billing_city: 'Brussel',
    billing_postal_code: '1000',
    billing_country: 'BE',
  }

  it('refills every billing field from what the server already stored', () => {
    pendingPlan = { planId: 'business', interval: 'month', limit: 10000 }
    subscriptionData = { ...billing, subscription_status: 'canceled' }
    render(<SetupPlanPage />)
    const s = screen.getByTestId('plan-summary')
    expect(s.getAttribute('data-business')).toBe('Guard BV')
    expect(s.getAttribute('data-email')).toBe('guard@example.com')
    expect(s.getAttribute('data-address')).toBe('Teststraat 1')
    expect(s.getAttribute('data-city')).toBe('Brussel')
    expect(s.getAttribute('data-postal')).toBe('1000')
    expect(s.getAttribute('data-country')).toBe('BE')
  })

  it('refills the country, which used to be invisible without a VAT number', () => {
    // 🔴 The regression this half exists for: the backend only exposed country
    // inside `tax_id`, which is null for an org with no VAT id — so for most
    // customers the one field at the TOP of the form was the one that could
    // not come back.
    pendingPlan = { planId: 'business', interval: 'month', limit: 10000 }
    subscriptionData = { ...billing, tax_id: null }
    render(<SetupPlanPage />)
    expect(screen.getByTestId('plan-summary').getAttribute('data-country')).toBe('BE')
  })

  it('does not refill anything when the server holds nothing', () => {
    pendingPlan = { planId: 'business', interval: 'month', limit: 10000 }
    subscriptionData = { subscription_status: 'canceled' }
    render(<SetupPlanPage />)
    expect(screen.getByTestId('plan-summary').getAttribute('data-business')).toBe('')
  })
})


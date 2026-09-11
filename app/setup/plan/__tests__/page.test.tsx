import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

const mockReplace = vi.fn()
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))

const mockCompleteStep = vi.fn()
vi.mock('@/lib/setup/context', () => ({
  useSetup: () => ({ pendingPlan: null, completeStep: mockCompleteStep }),
}))

vi.mock('@/lib/swr/dashboard', () => ({
  useSubscription: () => ({ data: undefined }),
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
vi.mock('@/components/checkout/PlanSummary', () => ({
  default: ({ plan }: any) => <div data-testid="plan-summary">summary:{plan}</div>,
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

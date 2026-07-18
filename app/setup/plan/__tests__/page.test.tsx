import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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

const PRICES = {
  solo: { 10000: 900 },
  team: { 10000: 1900 },
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
  it('selects the next plan as ArrowDown moves focus', () => {
    render(<SetupPlanPage />)
    const radios = screen.getAllByRole('radio')
    // Order matches PLANS: solo, team, business.
    fireEvent.keyDown(radios[0], { key: 'ArrowDown' })
    // Selecting a plan transitions to the checkout view for that plan.
    expect(screen.getByTestId('payment-form').textContent).toBe('payment:team')
  })

  it('wraps to the last plan as ArrowUp moves focus from the first', () => {
    render(<SetupPlanPage />)
    const radios = screen.getAllByRole('radio')
    fireEvent.keyDown(radios[0], { key: 'ArrowUp' })
    expect(screen.getByTestId('payment-form').textContent).toBe('payment:business')
  })

  it('selects on ArrowRight/ArrowLeft too', () => {
    render(<SetupPlanPage />)
    const radios = screen.getAllByRole('radio')
    fireEvent.keyDown(radios[1], { key: 'ArrowRight' })
    expect(screen.getByTestId('payment-form').textContent).toBe('payment:business')
  })
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

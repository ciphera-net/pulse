import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { SubscriptionDetails } from '@/lib/api/billing'

// --- Mocks ---------------------------------------------------------------

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

let mockSubscription: SubscriptionDetails | undefined
vi.mock('@/lib/swr/dashboard', () => ({
  useSubscription: () => ({ data: mockSubscription, isLoading: false, mutate: vi.fn() }),
}))

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanManage,
}))

vi.mock('@/lib/api/billing', () => ({
  updatePaymentMethod: vi.fn(),
  cancelSubscription: vi.fn(),
  resumeSubscription: vi.fn(),
  getInvoices: vi.fn().mockResolvedValue([]),
  downloadInvoicePDF: vi.fn(),
  updateBillingSettings: vi.fn(),
}))

vi.mock('@/lib/cdn', () => ({ cdnUrl: (p: string) => p }))

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Spinner: () => <div>loading</div>,
  Modal: ({ isOpen, children, title }: any) =>
    isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <>{children}</>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
}))

import WorkspaceBillingTab from '../WorkspaceBillingTab'

const base: SubscriptionDetails = {
  plan_id: 'team',
  subscription_status: 'active',
  current_period_end: '2026-08-15T00:00:00Z',
  billing_interval: 'month',
  pageview_limit: 10000,
  has_payment_method: true,
  pageview_usage: 4000,
}

beforeEach(() => {
  mockCanManage = true
  mockSubscription = { ...base }
  mockPush.mockClear()
})

describe('WorkspaceBillingTab banners & states', () => {
  it('renders a distinct past-due banner for subscription_status past_due', async () => {
    mockSubscription = { ...base, subscription_status: 'past_due' }
    render(<WorkspaceBillingTab />)
    await waitFor(() =>
      expect(screen.getByText(/Payment past due — update your payment method to keep your plan/i)).toBeTruthy(),
    )
    // Past-due badge is shown; the generic payment-failed banner is suppressed.
    expect(screen.getByText('Past due')).toBeTruthy()
  })

  it('shows the over-limit warning with an upgrade CTA when usage exceeds the limit', async () => {
    mockSubscription = { ...base, pageview_usage: 15000, pageview_limit: 10000 }
    render(<WorkspaceBillingTab />)
    await waitFor(() =>
      expect(screen.getByText(/exceeded your monthly pageview limit/i)).toBeTruthy(),
    )
    expect(screen.getByRole('button', { name: /Upgrade your plan/i })).toBeTruthy()
  })

  it('cancel modal uses fallback copy when current_period_end is missing', async () => {
    mockSubscription = { ...base, current_period_end: '' }
    render(<WorkspaceBillingTab />)
    const cancelBtn = await screen.findByRole('button', { name: 'Cancel subscription' })
    fireEvent.click(cancelBtn)
    await waitFor(() =>
      expect(
        screen.getByText(/keep access until the end of your current billing period, then move to the free plan/i),
      ).toBeTruthy(),
    )
  })

  it('renders a direction-neutral pending plan-change banner via formatPlanName', async () => {
    mockSubscription = { ...base, pending_plan_id: 'business', pending_limit: 50000, pending_interval: 'month' }
    render(<WorkspaceBillingTab />)
    await waitFor(() => expect(screen.getByText(/Plan change to/i)).toBeTruthy())
    expect(screen.getByText('Business')).toBeTruthy()
    expect(screen.getByText(/pending/i)).toBeTruthy()
  })

  it('payment-method modal exposes a radiogroup with radio options', async () => {
    render(<WorkspaceBillingTab />)
    const updateBtn = await screen.findByRole('button', { name: /Update payment method/i })
    fireEvent.click(updateBtn)
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Payment method' })).toBeTruthy())
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { SubscriptionDetails, Invoice } from '@/lib/api/billing'
import * as billingApi from '@/lib/api/billing'

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

  it('shows Change Plan for an active subscription', async () => {
    mockSubscription = { ...base, subscription_status: 'active' }
    render(<WorkspaceBillingTab />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Change Plan' })).toBeTruthy())
  })

  it('hides Change Plan in past_due (the Update-payment-method CTA is the correct action)', async () => {
    // /switch bounces in past_due (its guard requires active/trialing), so the
    // Change Plan button must not be offered here.
    mockSubscription = { ...base, subscription_status: 'past_due' }
    render(<WorkspaceBillingTab />)
    await waitFor(() =>
      expect(screen.getByText(/Payment past due — update your payment method to keep your plan/i)).toBeTruthy(),
    )
    expect(screen.queryByRole('button', { name: 'Change Plan' })).toBeNull()
    // The Update-payment-method CTA remains available (banner + actions row).
    expect(screen.getAllByRole('button', { name: /Update payment method/i }).length).toBeGreaterThan(0)
  })
})

describe('WorkspaceBillingTab invoice amount formatting', () => {
  // The component formats invoice amounts with Intl.NumberFormat(undefined, …),
  // i.e. against the runtime's default locale. Runners disagree on that default,
  // so we pin it: any `undefined` locale is coerced to a fixed one, and the
  // expected string is derived from the SAME Intl call — the assertion tracks
  // real Intl output for a known locale rather than a hard-coded glyph.
  const FIXED_LOCALE = 'en-US'
  const OriginalNumberFormat = Intl.NumberFormat

  function fmt(currency: string, amount: number): string {
    return new OriginalNumberFormat(FIXED_LOCALE, { style: 'currency', currency }).format(amount)
  }

  beforeEach(() => {
    // Coerce the component's `undefined` locale to FIXED_LOCALE; leave explicit
    // locales untouched. Subclass so `new Intl.NumberFormat(...)` stays a valid
    // constructor and `supportedLocalesOf`/instanceof continue to work.
    class PinnedNumberFormat extends OriginalNumberFormat {
      constructor(locales?: string | string[], options?: Intl.NumberFormatOptions) {
        super(locales ?? FIXED_LOCALE, options)
      }
    }
    // eslint-disable-next-line no-global-assign
    Intl.NumberFormat = PinnedNumberFormat as unknown as typeof Intl.NumberFormat
  })

  afterEach(() => {
    Intl.NumberFormat = OriginalNumberFormat
    vi.restoreAllMocks()
  })

  it('renders invoice total and VAT via locale currency formatting', async () => {
    const invoice: Invoice = {
      id: 'inv_1',
      invoice_number: 'INV-2026-0001',
      amount_cents: 100000,
      vat_cents: 21000,
      total_cents: 121000,
      currency: 'EUR',
      description: 'Team plan',
      status: 'sent',
      created_at: '2026-07-01T00:00:00Z',
    }
    vi.spyOn(billingApi, 'getInvoices').mockResolvedValue([invoice])

    render(<WorkspaceBillingTab />)

    // €1,210.00 total, €210.00 VAT — exactly what Intl produces for en-US/EUR.
    await waitFor(() => expect(screen.getByText(fmt('EUR', 1210))).toBeTruthy())
    expect(screen.getByText(new RegExp(escapeRegExp(fmt('EUR', 210))))).toBeTruthy()
    // A hard-coded, locale-correct glyph check so a regression in locale wiring
    // (e.g. dropping the grouping separator) is caught, not just self-consistent.
    expect(screen.getByText('€1,210.00')).toBeTruthy()
  })

  it('formats a credit note as a negative amount with the invoice currency', async () => {
    const creditNote: Invoice = {
      id: 'inv_cn',
      invoice_number: 'CN-2026-0007',
      amount_cents: -5000,
      vat_cents: -1050,
      total_cents: -6050,
      currency: 'EUR',
      description: 'Proration credit',
      status: 'sent',
      document_type: 'credit_note',
      created_at: '2026-07-02T00:00:00Z',
    }
    vi.spyOn(billingApi, 'getInvoices').mockResolvedValue([creditNote])

    render(<WorkspaceBillingTab />)

    // Amount is rendered as the absolute value with a leading minus glyph.
    await waitFor(() => expect(screen.getByText(`−${fmt('EUR', 60.5)}`)).toBeTruthy())
    expect(screen.getByText('Credit Note')).toBeTruthy()
  })
})

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

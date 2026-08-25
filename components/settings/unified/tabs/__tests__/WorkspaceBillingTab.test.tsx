import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { SubscriptionDetails, Invoice } from '@/lib/api/billing'
import * as billingApi from '@/lib/api/billing'

// --- Mocks ---------------------------------------------------------------

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

let mockSubscription: SubscriptionDetails | undefined
let mockSubscriptionError: Error | undefined
vi.mock('@/lib/swr/dashboard', () => ({
  useSubscription: () => ({
    data: mockSubscription,
    error: mockSubscriptionError,
    isLoading: false,
    mutate: vi.fn(),
  }),
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
  getPrices: vi.fn().mockResolvedValue({ team: { 10000: 2300 } }),
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
  // Facet 0.4.0 primitives the rebuilt tab composes with. Rendered as their
  // semantic DOM equivalents so text/role queries resolve exactly as they do
  // against the real components (the styling contract is out of scope here).
  Banner: ({ title, children, action }: any) => (
    <div role="status">
      <div>{title}</div>
      {children}
      {action}
    </div>
  ),
  Table: ({ children, containerClassName: _c, ...props }: any) => <table {...props}>{children}</table>,
  THead: ({ children, ...props }: any) => <thead {...props}>{children}</thead>,
  TBody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
  TR: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  TH: ({ children, numeric: _n, ...props }: any) => <th {...props}>{children}</th>,
  TD: ({ children, numeric: _n, ...props }: any) => <td {...props}>{children}</td>,
  RailGrid: ({ children, minTileWidth: _m, columns: _col, ...props }: any) => <div {...props}>{children}</div>,
  RailGridTile: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  getAuthErrorMessage: () => 'error',
  // `@/lib/utils` re-exports `cn` from facet; the local panels/StatusChip the
  // rebuilt tab composes with call it, so the mock must supply a real join.
  cn: (...args: any[]) => args.filter((a) => typeof a === 'string').join(' '),
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <>{children}</>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
}))

import { MastheadSlotProvider } from '@/components/settings/shell-slots'
import WorkspaceBillingTab from '../WorkspaceBillingTab'

// Fresh SWR cache per render — the component fetches invoices/prices via SWR
// now, and a shared cache would leak one test's invoice list into the next.
// The tab portals its primary CTA into the shell masthead slot; provide a real
// slot node (the document body) so the portaled button is queryable, exactly
// as it would be when the tab renders inside SettingsShell.
function renderTab() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MastheadSlotProvider value={document.body}>
        <WorkspaceBillingTab />
      </MastheadSlotProvider>
    </SWRConfig>,
  )
}

const base: SubscriptionDetails = {
  plan_id: 'team',
  subscription_status: 'active',
  next_charge_on: '2026-08-15',
  billing_interval: 'month',
  pageview_limit: 10000,
  has_payment_method: true,
  pageview_usage: 4000,
}

beforeEach(() => {
  mockCanManage = true
  mockSubscription = { ...base }
  mockSubscriptionError = undefined
  mockPush.mockClear()
})

describe('WorkspaceBillingTab structured-panels composition (smoke)', () => {
  it('renders the plan status band: plan label, StatusChip, and usage stat tiles', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Team Plan')).toBeTruthy())
    // StatusChip (migrated from the inline pill) reads the active subscription.
    expect(screen.getByText('Active')).toBeTruthy()
    // Usage RailGrid stat tiles carry micro-label captions.
    expect(screen.getByText('Pageviews')).toBeTruthy()
    expect(screen.getByText('Renews')).toBeTruthy()
  })

  it('portals the plan CTA into the masthead slot as the single primary action', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Change Plan' })).toBeTruthy())
  })
})

describe('WorkspaceBillingTab banners & states', () => {
  it('renders a distinct past-due banner for subscription_status past_due', async () => {
    mockSubscription = { ...base, subscription_status: 'past_due' }
    renderTab()
    await waitFor(() =>
      expect(screen.getByText(/Payment past due — update your payment method to keep your plan/i)).toBeTruthy(),
    )
    // Past-due badge is shown; the generic payment-failed banner is suppressed.
    expect(screen.getByText('Past due')).toBeTruthy()
  })

  // Over the PLAN limit is a billing event, not a cut-off: every pageview above it
  // is still stored and served, up to the hard ceiling. The banner said "Upgrade to
  // keep collecting data" until 15-08-2026, which told the customer their data was
  // being lost when it was not — the mirror image of the bug that actually did lose
  // it, and just as untrue.
  it('over the plan limit but under the ceiling: says collection CONTINUES, and names the ceiling', async () => {
    mockSubscription = {
      ...base,
      pageview_usage: 15000,
      pageview_limit: 10000,
      pageview_hard_ceiling: 20000,
    }
    renderTab()
    await waitFor(() =>
      expect(screen.getByText(/You're over your plan's pageview limit \(15,000 of 10,000\)/i)).toBeTruthy(),
    )
    expect(screen.getByText(/still collecting your data — up to 20,000 pageviews/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Upgrade your plan/i })).toBeTruthy()
    // The stop-collecting banner must NOT be showing at the same time.
    expect(screen.queryByText(/Collection has stopped/i)).toBeNull()
  })

  it('at the hard ceiling: says collection has STOPPED', async () => {
    mockSubscription = {
      ...base,
      pageview_usage: 20000,
      pageview_limit: 10000,
      pageview_hard_ceiling: 20000,
    }
    renderTab()
    await waitFor(() =>
      expect(screen.getByText(/Collection has stopped: you've reached the 20,000 pageview ceiling/i)).toBeTruthy(),
    )
    expect(screen.getByText(/no longer being recorded/i)).toBeTruthy()
    // The softer "still collecting" banner must not contradict it.
    expect(screen.queryByText(/still collecting your data/i)).toBeNull()
  })

  // A backend older than 15-08-2026 sends no ceiling. Absence must read as
  // "unknown", never as 0 — a 0 ceiling would render every org as blocked.
  it('a missing hard ceiling never renders as a stopped-collection state', async () => {
    mockSubscription = { ...base, pageview_usage: 15000, pageview_limit: 10000 }
    renderTab()
    await waitFor(() =>
      expect(screen.getByText(/You're over your plan's pageview limit/i)).toBeTruthy(),
    )
    expect(screen.queryByText(/Collection has stopped/i)).toBeNull()
    expect(screen.queryByText(/up to 0 pageviews/i)).toBeNull()
  })

  // The free tier's usage used to be hardcoded to 0 by the API, so this banner was
  // literally unreachable for the population most likely to hit a cap.
  it('a free-tier org over its cap sees the banner too', async () => {
    mockSubscription = {
      plan_id: 'free',
      subscription_status: '',
      next_charge_on: null,
      billing_interval: '',
      pageview_limit: 5000,
      has_payment_method: false,
      pageview_usage: 6200,
      pageview_hard_ceiling: 10000,
    }
    renderTab()
    await waitFor(() =>
      expect(screen.getByText(/You're over your plan's pageview limit \(6,200 of 5,000\)/i)).toBeTruthy(),
    )
    expect(screen.getByText(/still collecting your data — up to 10,000 pageviews/i)).toBeTruthy()
  })

  it('cancel modal uses fallback copy when there is no scheduled charge', async () => {
    mockSubscription = { ...base, next_charge_on: null }
    renderTab()
    const cancelBtn = await screen.findByRole('button', { name: 'Cancel subscription' })
    fireEvent.click(cancelBtn)
    await waitFor(() =>
      expect(
        screen.getByText(/keep access until the end of your current billing period and won.t be charged again/i),
      ).toBeTruthy(),
    )
    // The consequences line is always present.
    expect(screen.getByText(/moves to the free Hobby plan/i)).toBeTruthy()
  })

  it('renders a direction-neutral pending plan-change banner via formatPlanName', async () => {
    mockSubscription = { ...base, pending_plan_id: 'business', pending_limit: 50000, pending_interval: 'month' }
    renderTab()
    await waitFor(() => expect(screen.getByText(/Plan change to/i)).toBeTruthy())
    expect(screen.getByText('Business')).toBeTruthy()
    expect(screen.getByText(/pending/i)).toBeTruthy()
  })

  it('payment-method modal exposes a radiogroup with radio options', async () => {
    renderTab()
    const updateBtn = await screen.findByRole('button', { name: /Update payment method/i })
    fireEvent.click(updateBtn)
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Payment method' })).toBeTruthy())
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0)
  })

  it('shows Change Plan for an active subscription', async () => {
    mockSubscription = { ...base, subscription_status: 'active' }
    renderTab()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Change Plan' })).toBeTruthy())
  })

  it('hides Change Plan in past_due (the Update-payment-method CTA is the correct action)', async () => {
    // /switch bounces in past_due (its guard requires active/trialing), so the
    // Change Plan button must not be offered here.
    mockSubscription = { ...base, subscription_status: 'past_due' }
    renderTab()
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

    renderTab()

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

    renderTab()

    // Amount is rendered as the absolute value with a leading minus glyph.
    await waitFor(() => expect(screen.getByText(`−${fmt('EUR', 60.5)}`)).toBeTruthy())
    expect(screen.getByText('Credit Note')).toBeTruthy()
  })
})

describe('WorkspaceBillingTab grant expiry', () => {
  // A grant and a subscription are different facts and now travel in different
  // fields (backend migration 142). Until then the admin grant path wrote a grant's
  // end date into next_charge_on, so a granted org's page announced a RENEWAL for a
  // date on which no money would move. These tests hold the two apart in the UI.

  it('labels a grant "Grant ends", never "Renews"', async () => {
    mockSubscription = {
      ...base,
      plan_id: 'pioneer',
      next_charge_on: null,
      grant_expires_on: '2027-04-27',
    }
    renderTab()

    await waitFor(() => expect(screen.getByText('Grant ends')).toBeTruthy())
    // The weekday is computed from the calendar date itself; 27-04-2027 is a Tuesday.
    expect(screen.getByText('Tue, 27/04/2027')).toBeTruthy()
    // The paired negative: without it, a tile labelled BOTH would still pass above.
    expect(screen.queryByText('Renews')).toBeNull()
  })

  it('shows a renewal and no grant tile for a paying subscription', async () => {
    mockSubscription = { ...base, grant_expires_on: null }
    renderTab()

    await waitFor(() => expect(screen.getByText('Renews')).toBeTruthy())
    expect(screen.queryByText('Grant ends')).toBeNull()
  })

  it('shows both when a granted org also carries a live subscription schedule', async () => {
    // AdminGrantPlan deliberately does NOT clear next_charge_on: an org with a live
    // Mollie subscription still gets charged, and blanking our record of when would
    // misstate the provider. So both tiles can legitimately be present, and the page
    // has to say which date means what rather than picking one.
    mockSubscription = {
      ...base,
      plan_id: 'pioneer',
      next_charge_on: '2026-09-15',
      grant_expires_on: '2027-04-27',
    }
    renderTab()

    await waitFor(() => expect(screen.getByText('Grant ends')).toBeTruthy())
    expect(screen.getByText('Renews')).toBeTruthy()
    expect(screen.getByText('Tue, 15/09/2026')).toBeTruthy()
    expect(screen.getByText('Tue, 27/04/2027')).toBeTruthy()
  })

  it('renders no grant tile when the grant is perpetual', async () => {
    mockSubscription = { ...base, plan_id: 'pioneer', next_charge_on: null, grant_expires_on: null }
    renderTab()

    await waitFor(() => expect(screen.getByText('Pioneer Plan')).toBeTruthy())
    // A perpetual grant has no end date. An absent tile is honest; a fabricated
    // "never" or an epoch would not be.
    expect(screen.queryByText('Grant ends')).toBeNull()
  })
})

describe('WorkspaceBillingTab grant presentation (ruled D2, 25-08-2026)', () => {
  it('a grant gets the quiet sentence and NO payment actions', async () => {
    mockSubscription = {
      ...base,
      plan_id: 'pioneer',
      next_charge_on: null,
      grant_expires_on: '2027-04-27',
    }
    renderTab()

    await waitFor(() =>
      expect(
        screen.getByText(/runs on a granted Pioneer plan until 27\/04\/2027 — nothing is billed/i),
      ).toBeTruthy(),
    )
    // No Mollie objects exist behind a grant — both actions could only error.
    expect(screen.queryByRole('button', { name: /Update payment method/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel subscription' })).toBeNull()
  })

  it('a granted org that ALSO carries a live charge schedule keeps its payment actions', async () => {
    // AdminGrantPlan does not clear next_charge_on: a grant on top of a live
    // Mollie subscription is still billing. "Nothing is billed" would be false
    // and hiding the actions would strand the real subscription.
    mockSubscription = {
      ...base,
      plan_id: 'pioneer',
      next_charge_on: '2026-09-15',
      grant_expires_on: '2027-04-27',
    }
    renderTab()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Update payment method/i })).toBeTruthy(),
    )
    expect(screen.queryByText(/nothing is billed/i)).toBeNull()
  })

  it('no duplicate Limit tile for a plan id without a prices entry', async () => {
    // 'pioneer' has no entry in the prices map. The old fallback rendered a
    // "Limit" tile repeating the Pageviews tile's denominator one track over.
    mockSubscription = {
      ...base,
      plan_id: 'pioneer',
      next_charge_on: null,
      grant_expires_on: '2027-04-27',
      pageview_limit: 100000,
      pageview_usage: 3635,
    }
    renderTab()

    await waitFor(() => expect(screen.getByText('Pageviews')).toBeTruthy())
    expect(screen.queryByText('Limit')).toBeNull()
    expect(screen.queryByText('100,000 / mo')).toBeNull()
  })
})

describe('WorkspaceBillingTab subscription fetch error (ruled F1)', () => {
  it('a failed fetch renders the error card, never the Hobby empty state', async () => {
    mockSubscription = undefined
    mockSubscriptionError = new Error('network')
    renderTab()

    await waitFor(() =>
      expect(screen.getByText(/Couldn.t load your subscription/i)).toBeTruthy(),
    )
    expect(
      screen.getByText(/temporarily unavailable\. Your subscription itself is unaffected/i),
    ).toBeTruthy()
    // The old fall-through told a paying customer they were on the free plan.
    expect(screen.queryByText(/free Hobby plan/i)).toBeNull()
    expect(screen.queryByText('No subscription')).toBeNull()
  })
})

describe('WorkspaceBillingTab invoice status vocabulary (ruled F2)', () => {
  function invoiceWithStatus(status: string): Invoice {
    return {
      id: `inv_${status}`,
      invoice_number: '2026-0001',
      amount_cents: 4700,
      vat_cents: 0,
      total_cents: 4700,
      currency: 'EUR',
      description: 'Solo plan',
      status,
      created_at: '2026-07-01T00:00:00Z',
    }
  }

  it("maps the backend's `paid` to a Paid chip", async () => {
    vi.spyOn(billingApi, 'getInvoices').mockResolvedValue([invoiceWithStatus('paid')])
    renderTab()
    await waitFor(() => expect(screen.getByText('Paid')).toBeTruthy())
    // The raw lowercase status must not leak into the chip.
    expect(screen.queryByText('paid')).toBeNull()
  })

  it('maps `refunded` to a Refunded chip and `failed` to Failed', async () => {
    vi.spyOn(billingApi, 'getInvoices').mockResolvedValue([
      invoiceWithStatus('refunded'),
      { ...invoiceWithStatus('failed'), id: 'inv_f2' },
    ])
    renderTab()
    await waitFor(() => expect(screen.getByText('Refunded')).toBeTruthy())
    expect(screen.getByText('Failed')).toBeTruthy()
  })
})

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

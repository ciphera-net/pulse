// The Billing page (settings overhaul P8): copy deck §10, rulings R24, R26, R35, R36, and the carried findings (one
// state per plan, no SEPA, past due says what the card change does). Real-shaped answers, every write checked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import type { Invoice, SubscriptionDetails } from '@/lib/api/billing'
import * as billingApi from '@/lib/api/billing'
import { ApiError } from '@/lib/api/client'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

let mockSubscription: SubscriptionDetails | undefined
let mockSubscriptionError: Error | undefined
const mockMutate = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSubscription: () => ({ data: mockSubscription, error: mockSubscriptionError, isLoading: false, mutate: mockMutate }),
}))

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: (perm: string) => (perm === 'billing.manage' ? mockCanManage : true),
}))

let mockTeamState: 'alone' | 'team' | null = 'team'
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => mockTeamState }))

vi.mock('@/lib/api/billing', () => ({
  updatePaymentMethod: vi.fn(),
  getPaymentMethodUpdate: vi.fn(),
  cancelSubscription: vi.fn(),
  resumeSubscription: vi.fn(),
  getInvoices: vi.fn(),
  getPrices: vi.fn(),
  downloadInvoicePDF: vi.fn(),
  updateBillingSettings: vi.fn(),
}))

// The return from Mollie asks for real, on a short clock: "not confirmed yet" after 30 ms instead of 4 s.
vi.mock('../paymentMethodReturn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../paymentMethodReturn')>()),
  CHECK_TIMING: { intervalMs: 5, slowAfterMs: 30, giveUpAfterMs: 5_000 },
}))

vi.mock('@ciphera-net/facet-hold', async () =>
  (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

vi.mock('@/lib/cdn', () => ({ cdnUrl: (p: string) => p }))

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => <button {...props}>{children}</button>,
  Input: (props: Record<string, unknown>) => <input {...props} />,
  // Facet 0.25.3 draws any title in the dialog's h3 and names the dialog by it.
  Modal: ({ isOpen, children, title }: { isOpen: boolean; children: ReactNode; title: ReactNode }) =>
    isOpen ? <div role="dialog"><h3>{title}</h3>{children}</div> : null,
  Switcher: ({ options, value, onChange, ...props }: {
    options: { value: string; label: ReactNode }[]; value: string; onChange: (v: string) => void
  } & Record<string, unknown>) => (
    <div role="radiogroup" {...props}>
      {options.map((opt) => (
        <button key={opt.value} type="button" role="radio" aria-checked={opt.value === value} onClick={() => onChange(opt.value)}>
          {opt.label}
        </button>
      ))}
    </div>
  ),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  cn: (...args: unknown[]) => args.filter((a) => typeof a === 'string').join(' '),
}))

let lastOnSave: (() => Promise<void>) | undefined
vi.mock('@/components/settings/SettingsSaveBar', async (importOriginal) => {
  const Real = (await importOriginal<typeof import('@/components/settings/SettingsSaveBar')>()).default
  return {
    default: (props: React.ComponentProps<typeof Real>) => {
      lastOnSave = props.onSave
      return <Real {...props} />
    },
  }
})

import { MastheadSlotProvider, SaveSlotProvider } from '@/components/settings/shell-slots'
import { toast } from '@ciphera-net/facet'
import { deferred, resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'
import BillingPage from '../BillingPage'

const FREE = '5,000 pageviews a month, 1 site, and data kept for 6 months'

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MastheadSlotProvider value={document.body}>
        <SaveSlotProvider value={document.body}>
          <BillingPage />
        </SaveSlotProvider>
      </MastheadSlotProvider>
    </SWRConfig>,
  )
}

const business: SubscriptionDetails = {
  plan_id: 'business',
  subscription_status: 'active',
  billing_interval: 'month',
  next_charge_on: '2026-12-03',
  pageview_limit: 10000,
  pageview_hard_ceiling: 20000,
  pageview_usage: 4000,
  sites_count: 2,
  has_payment_method: true,
  billing_email: 'billing@example.com',
  business_name: 'Example BV',
}

const invoice: Invoice = {
  id: 'inv_1',
  invoice_number: 'VF/2026/00027',
  amount_cents: 2300,
  vat_cents: 483,
  total_cents: 2783,
  currency: 'EUR',
  description: '',
  status: 'paid',
  document_type: 'invoice',
  created_at: '2026-10-03T08:00:00Z',
}

const section = (title: string) => document.querySelector(`[data-kit-section="${title}"]`) as HTMLElement | null
const planSection = async (title = 'Business plan') => {
  await waitFor(() => expect(section(title)).not.toBeNull())
  return section(title)!
}
const line = () => (document.querySelector('[data-billing-line]') as HTMLElement).textContent
const row = (kind: string) => document.querySelector(`[data-billing-row="${kind}"]`) as HTMLElement | null

beforeEach(() => {
  // Only Date is faked: "3 Dec" carries no year because the test's today is in 2026, whenever the suite runs.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-06T12:00:00Z'))
  mockSubscription = { ...business }
  mockSubscriptionError = undefined
  mockCanManage = true
  mockTeamState = 'team'
  lastOnSave = undefined
  mockPush.mockClear()
  mockMutate.mockReset().mockResolvedValue(undefined)
  vi.mocked(billingApi.getInvoices).mockReset().mockResolvedValue([invoice])
  vi.mocked(billingApi.getPrices).mockReset().mockResolvedValue({ business: { 10000: 2300, 50000: 3900, 100000: 4900 } })
  vi.mocked(billingApi.cancelSubscription).mockReset()
  vi.mocked(billingApi.resumeSubscription).mockReset()
  vi.mocked(billingApi.updatePaymentMethod).mockReset()
  vi.mocked(billingApi.getPaymentMethodUpdate).mockReset()
  vi.mocked(billingApi.updateBillingSettings).mockReset()
  vi.mocked(billingApi.downloadInvoicePDF).mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.warning).mockClear()
  vi.mocked(toast.info).mockClear()
  resetDeferred()
})

afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState({}, '', '/')
})

describe('the plan: one state, its numbers, what needs doing', () => {
  it('an active plan: the state leads its line, the figures (R35), the payment method, and the main button', async () => {
    renderPage()
    const plan = await planSection()
    expect(line()).toBe('Active · Renews on 3 Dec.')
    expect(plan.querySelector('[data-kit-status="live"]')?.textContent).toBe('Active')
    await waitFor(() => expect(within(plan).getByText('Price')).toBeInTheDocument())
    const figures = plan.querySelector('[data-billing-facts="figures"]') as HTMLElement
    expect([...figures.querySelectorAll('p.text-xs')].map((p) => p.textContent)).toEqual(['Pageviews this month', 'Sites', 'Price'])
    expect(figures.textContent).toContain('4,000 of 10,000')
    expect(figures.textContent).toContain('€23.00 a monthplus VAT')
    expect((figures.querySelector('[data-billing-bar] > span') as HTMLElement).style.width).toBe('40%')
    // Renews is said once, in the line.
    expect(within(plan).queryByText('Renews')).toBeNull()
    expect(row('payment')!.textContent).toContain('Future charges use the method you add.')
    expect(row('resume')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Change plan' }))
    expect(mockPush).toHaveBeenCalledWith('/switch')
  })

  it('a yearly plan prices a year, with what a month comes to', async () => {
    mockSubscription = { ...business, billing_interval: 'year' }
    renderPage()
    const plan = await planSection()
    await waitFor(() => expect(plan.textContent).toContain('€253.00 a yearplus VAT, €21.08 a month'))
  })

  it('a cancelled plan never shows payment trouble, whatever payment_failed_at still holds (carried finding)', async () => {
    mockSubscription = {
      ...business, plan_id: 'free', subscription_status: 'canceled', next_charge_on: null, pageview_limit: 5000,
      pageview_hard_ceiling: 10000, pageview_usage: 100, payment_failed_at: '2026-10-20T06:00:00Z',
    }
    renderPage()
    const plan = await planSection('Personal plan')
    expect(line()).toBe(`Cancelled · The team is on the free Personal plan: ${FREE}.`)
    expect(plan.textContent).not.toMatch(/failed|past due|payment/i)
    expect(screen.queryByRole('button', { name: 'Update payment method' })).toBeNull()
    expect(row('payment')).toBeNull()
    expect(section('Danger zone')).toBeNull()
    expect(screen.getByRole('button', { name: 'Subscribe again' })).toBeInTheDocument()
  })

  it('past due: the line says the card change pays the open amount; no Cancel plan and no main button (R36)', async () => {
    mockSubscription = { ...business, subscription_status: 'past_due', payment_failed_at: '2026-11-03T06:10:00Z' }
    renderPage()
    await planSection()
    expect(line()).toBe('Past due · Your payment on 3 Nov failed. Update your payment method to pay the open amount and keep your plan.')
    expect(document.querySelector('[data-billing-line] [data-kit-status="broken"]')).not.toBeNull()
    expect(section('Danger zone')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change plan' })).toBeNull()

    fireEvent.click(within(row('payment')!).getByRole('button', { name: 'Update payment method' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Mollie charges the open amount to it, then sends you back here.')
  })

  it('past due, for the admin and members: ask the owner, and no second owner-only line', async () => {
    mockCanManage = false
    mockSubscription = { ...business, subscription_status: 'past_due', payment_failed_at: '2026-11-03T06:10:00Z' }
    renderPage()
    await planSection()
    expect(line()).toBe('Past due · Your payment on 3 Nov failed. Ask the owner to update the payment method.')
    expect(document.querySelector('[data-billing-owner-only]')).toBeNull()
    expect(row('payment')).toBeNull()
  })

  it('a plan Ciphera gave: Active, nothing is billed, and nothing to pay or cancel', async () => {
    mockSubscription = { ...business, plan_id: 'pioneer', next_charge_on: null, grant_expires_on: '2027-04-27' }
    renderPage()
    const plan = await planSection('Pioneer plan')
    expect(line()).toBe('Active · Ciphera gave this team the Pioneer plan, so nothing is billed.')
    expect(row('payment')).toBeNull()
    expect(section('Danger zone')).toBeNull()
    await waitFor(() => expect(within(plan).getByText('Sites')).toBeInTheDocument())
    expect(within(plan).queryByText('Price')).toBeNull()
    // "Grant ends" promised an end that does not come (copy deck §10.8.5).
    expect(document.body.textContent).not.toMatch(/Grant ends|27 Apr/)
  })

  it('alone, the grant is yours', async () => {
    mockTeamState = 'alone'
    mockSubscription = { ...business, plan_id: 'pioneer', next_charge_on: null, grant_expires_on: '2027-04-27' }
    renderPage()
    await planSection('Pioneer plan')
    expect(line()).toBe('Active · Ciphera gave you the Pioneer plan, so nothing is billed.')
  })

  it('the free plan: its facts, and Upgrade', async () => {
    mockSubscription = {
      plan_id: 'free', subscription_status: '', billing_interval: '', next_charge_on: null, pageview_limit: 5000,
      pageview_hard_ceiling: 10000, pageview_usage: 3210, sites_count: 1, has_payment_method: false,
    }
    renderPage()
    await planSection('Personal plan')
    expect(line()).toBe(`Free · ${FREE.charAt(0).toUpperCase()}${FREE.slice(1)}.`)
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeInTheDocument()
    // A free team has no billing row to keep details in, so the owner is not offered the form.
    expect(section('Billing details')).toBeNull()
  })

  it('the admin and members read the plan with the owner-only line, and get no buttons', async () => {
    mockCanManage = false
    renderPage()
    await planSection()
    expect(document.querySelector('[data-billing-owner-only]')?.textContent).toBe('Only the owner can change billing.')
    expect(screen.queryByRole('button', { name: 'Change plan' })).toBeNull()
    expect(row('payment')).toBeNull()
    expect(section('Danger zone')).toBeNull()
  })

  it('a failed read is an error with the deck\'s words, never the free plan', async () => {
    mockSubscription = undefined
    mockSubscriptionError = new Error('network')
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain("Couldn't load your plan")
    expect(alert.textContent).toContain('Your plan itself is fine. Try again.')
    expect(document.body.textContent).not.toMatch(/Personal plan/)
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(mockMutate).toHaveBeenCalled()
  })

  it('no answer yet is loading, never a plan', async () => {
    mockSubscription = undefined
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(document.querySelector('[data-kit-section]')).toBeNull()
  })
})

describe('usage rows, and a waiting change', () => {
  it('over the limit: still counting up to the ceiling, change plan to raise it', async () => {
    mockSubscription = { ...business, pageview_usage: 12345 }
    renderPage()
    await planSection()
    expect(row('over')!.textContent).toBe(
      "You've used 12,345 of your plan's 10,000 pageviews.Pulse keeps counting up to 20,000, then stops. Change plan to raise the limit.",
    )
    expect(row('over')!.querySelector('[data-kit-icon="state"]')!.className).toContain('text-primary')
    expect(row('ceiling')).toBeNull()
  })

  it('over the limit with no ceiling known never says it stops', async () => {
    mockSubscription = { ...business, pageview_usage: 12345, pageview_hard_ceiling: undefined }
    renderPage()
    await planSection()
    expect(row('over')!.textContent).toBe("You've used 12,345 of your plan's 10,000 pageviews.Change plan to raise the limit.")
  })

  it('at the ceiling: Pulse stopped counting, in coral, and the bar turns coral', async () => {
    mockSubscription = { ...business, pageview_usage: 20000 }
    renderPage()
    const plan = await planSection()
    expect(row('ceiling')!.textContent).toBe(
      "Pulse stopped counting: you reached 20,000 pageviews, twice your plan.New visits aren't counted until the plan changes or the count starts over. A bigger plan starts counting again once its payment goes through.",
    )
    expect(row('ceiling')!.querySelector('[data-kit-icon="state"]')!.className).toContain('text-destructive')
    expect(row('over')).toBeNull()
    expect(plan.querySelector('[data-billing-bar] > span')!.className).toContain('bg-destructive')
  })

  it('at the ceiling, for the admin and members: ask the owner', async () => {
    mockCanManage = false
    mockSubscription = { ...business, pageview_usage: 20000 }
    renderPage()
    await planSection()
    expect(row('ceiling')!.textContent).toContain("New visits aren't counted until the plan changes. Ask the owner to change it.")
  })

  it('a cancelled team at its ceiling is told so (copy deck §10.8.7)', async () => {
    mockSubscription = {
      ...business, plan_id: 'free', subscription_status: 'canceled', next_charge_on: null, pageview_limit: 5000,
      pageview_hard_ceiling: 10000, pageview_usage: 10000,
    }
    renderPage()
    await planSection('Personal plan')
    expect(row('ceiling')).not.toBeNull()
  })

  it('a smaller tier waits for the renewal; a bigger one for its payment', async () => {
    mockSubscription = { ...business, pageview_limit: 50000, pending_plan_id: 'business', pending_limit: 10000, pending_interval: 'month' }
    const { unmount } = renderPage()
    await planSection()
    await waitFor(() => expect(row('change')!.textContent).toBe('Moving to Business (10,000 pageviews a month) on 3 Dec.'))
    unmount()

    mockSubscription = { ...business, pending_plan_id: 'business', pending_limit: 100000, pending_interval: 'month' }
    renderPage()
    await planSection()
    await waitFor(() =>
      expect(row('change')!.textContent).toBe('Moving to Business (100,000 pageviews a month) once the payment goes through.'),
    )
  })

  it('R26: a change to a plan that keeps less says what is deleted', async () => {
    mockSubscription = { ...business, plan_id: 'team', pending_plan_id: 'solo', pending_limit: 10000, pending_interval: 'month' }
    renderPage()
    await planSection('Team plan')
    expect(row('change')!.textContent).toContain(
      'Solo keeps data for 1 year. Visits and events older than that are deleted within a day of the change.',
    )
  })
})

describe('Update payment method', () => {
  it('Cards, Bancontact, iDEAL and Apple Pay (no SEPA); Continue waits for a pick, then sends it', async () => {
    // Never answers: the redirect to Mollie is not followed in jsdom.
    vi.mocked(billingApi.updatePaymentMethod).mockReturnValue(new Promise(() => {}))
    renderPage()
    await planSection()
    fireEvent.click(within(row('payment')!).getByRole('button', { name: 'Update payment method' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Pick a payment method' })).toBeInTheDocument()
    expect(dialog.querySelector('h3 [data-kit-icon="heading"]')!.className).toContain('text-primary')
    expect(dialog.textContent).toContain('Mollie checks it with a €0 payment, then sends you back here.')
    expect(within(dialog).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Cards', 'Bancontact', 'iDEAL', 'Apple Pay'])
    const go = within(dialog).getByRole('button', { name: 'Continue' }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Bancontact' }))
    expect(go.disabled).toBe(false)
    fireEvent.click(go)
    expect(billingApi.updatePaymentMethod).toHaveBeenCalledWith('bancontact')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a refused start says so in the deck\'s words', async () => {
    vi.mocked(billingApi.updatePaymentMethod).mockRejectedValue(new ApiError('Invalid credentials', 500))
    renderPage()
    await planSection()
    fireEvent.click(within(row('payment')!).getByRole('button', { name: 'Update payment method' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Cards' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't start changing the payment method. Try again."))
  })

  const backFromMollie = async (flag = 'payment_updated=true') => {
    window.history.replaceState({}, '', `/settings/organization/billing?${flag}`)
    const view = renderPage()
    await planSection()
    return view
  }

  it('back from Mollie: "Payment method updated" once the server confirms it, and the plan read again', async () => {
    vi.mocked(billingApi.getPaymentMethodUpdate).mockResolvedValue({ state: 'updated' })
    await backFromMollie()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Payment method updated'))
    expect(mockMutate).toHaveBeenCalled()
    expect(window.location.search).toBe('')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('back from Mollie after a payment that did not go through: not changed, and what to do', async () => {
    vi.mocked(billingApi.getPaymentMethodUpdate).mockResolvedValue({ state: 'failed' })
    await backFromMollie()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Payment method not changed: the payment didn't go through at Mollie. Try again."),
    )
    expect(toast.success).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })

  it('back from Mollie while it is pending: never "updated" early; says it is not confirmed yet, then updated once it is', async () => {
    vi.mocked(billingApi.getPaymentMethodUpdate).mockResolvedValue({ state: 'pending' })
    await backFromMollie()
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith("The new payment method isn't confirmed yet. Reload this page in a minute to check again."),
    )
    expect(toast.success).not.toHaveBeenCalled()
    // The words promise a reload asks again: the flag stays until there is an answer.
    expect(window.location.search).toBe('?payment_updated=true')

    vi.mocked(billingApi.getPaymentMethodUpdate).mockResolvedValue({ state: 'updated' })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Payment method updated'))
    expect(window.location.search).toBe('')
    expect(toast.info).toHaveBeenCalledTimes(1)
  })

  it('back from Mollie when the server cannot be asked: says it could not check, keeps the flag, and stops when the page goes', async () => {
    vi.mocked(billingApi.getPaymentMethodUpdate).mockRejectedValue(new ApiError('Bad gateway', 502))
    const { unmount } = await backFromMollie()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't check the new payment method. Reload this page to check again."),
    )
    expect(toast.success).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?payment_updated=true')
    unmount()
    const asked = vi.mocked(billingApi.getPaymentMethodUpdate).mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(vi.mocked(billingApi.getPaymentMethodUpdate).mock.calls.length).toBe(asked)
  })

  it('back from Mollie with no update on record: no claim either way', async () => {
    vi.mocked(billingApi.getPaymentMethodUpdate).mockResolvedValue({ state: 'none' })
    await backFromMollie()
    await waitFor(() => expect(window.location.search).toBe(''))
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('back from Mollie after cancelling there: not changed, without asking', async () => {
    await backFromMollie('payment_update_canceled=true')
    expect(toast.info).toHaveBeenCalledWith('Payment method not changed.')
    expect(billingApi.getPaymentMethodUpdate).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })
})

describe('Cancel plan, in the Danger zone (R36)', () => {
  const openCancel = async () => {
    await planSection()
    const zone = section('Danger zone')!
    expect(zone.querySelector('header p')!.textContent).toBe('You have 6 seconds to undo it.')
    fireEvent.click(within(zone).getByRole('button', { name: 'Cancel plan' }))
    const heading = screen.getByRole('heading', { name: 'Cancel the Business plan?' })
    return heading.closest('[role="dialog"]') as HTMLElement
  }

  it('sits after the invoices, and its dialog says what happens, what follows (R26) and the undo', async () => {
    renderPage()
    await planSection()
    const titles = [...document.querySelectorAll('[data-kit-section]')].map((s) => s.getAttribute('data-kit-section'))
    expect(titles).toEqual(['Business plan', 'Billing details', 'Invoices', 'Danger zone'])
    expect(row('cancel')!.textContent).toContain('The plan runs until 3 Dec, and nothing more is charged.')

    const dialog = await openCancel()
    expect(dialog.querySelector('h3 [data-kit-icon="heading"]')!.className).toContain('text-destructive')
    expect(dialog.textContent).toContain('The plan runs until 3 Dec, and nothing more is charged.')
    expect(dialog.querySelector('[data-billing-dialog="cancel"] [data-kit-row]')!.textContent).toBe(
      `From 3 DecThe team is on the free Personal plan: ${FREE}.`,
    )
    expect(dialog.querySelector('[data-kit-warning]')!.textContent).toBe(
      'Your sites stay. Visits and events older than 6 months are deleted within a day.',
    )
    expect(dialog.textContent).toContain('You have 6 seconds to undo.')
    expect(within(dialog).getByRole('button', { name: 'Hold to cancel' })).toBeInTheDocument()
  })

  it('alone: you are on the free plan after it', async () => {
    mockTeamState = 'alone'
    renderPage()
    const dialog = await openCancel()
    expect(dialog.textContent).toContain(`You're on the free Personal plan: ${FREE}.`)
  })

  it('the hold sends nothing; the Undo window running out sends it and reads the plan back', async () => {
    vi.mocked(billingApi.cancelSubscription).mockResolvedValue({ ok: true, at_period_end: true })
    renderPage()
    const dialog = await openCancel()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to cancel' }))
    expect(billingApi.cancelSubscription).not.toHaveBeenCalled()
    expect(deferred[0]!.message).toBe('Plan cancelled')
    // Waiting behind the Undo bar, Cancel plan is off: a second confirm would send the first.
    await waitFor(() => expect((within(row('cancel')!).getByRole('button', { name: 'Cancel plan' }) as HTMLButtonElement).disabled).toBe(true))

    await act(async () => { await commitLast() })
    expect(billingApi.cancelSubscription).toHaveBeenCalledWith(undefined, { keepalive: false })
    const [updater, opts] = mockMutate.mock.calls.at(-1)!
    expect(opts).toEqual({ revalidate: true })
    expect((updater as (s: SubscriptionDetails) => SubscriptionDetails)(business).cancel_at_period_end).toBe(true)
  })

  it('Undo sends nothing and turns Cancel plan back on', async () => {
    renderPage()
    const dialog = await openCancel()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to cancel' }))
    act(() => undoLast())
    expect(billingApi.cancelSubscription).not.toHaveBeenCalled()
    expect(mockMutate).not.toHaveBeenCalled()
    await waitFor(() => expect((within(row('cancel')!).getByRole('button', { name: 'Cancel plan' }) as HTMLButtonElement).disabled).toBe(false))
  })

  it('a failed cancellation says so in the deck\'s words, never Facet\'s', async () => {
    vi.mocked(billingApi.cancelSubscription).mockRejectedValue(new ApiError('Invalid credentials', 403))
    renderPage()
    fireEvent.click(within(await openCancel()).getByRole('button', { name: 'Hold to cancel' }))
    await act(async () => { await commitLast() })
    expect(toast.error).toHaveBeenCalledWith("Couldn't cancel the plan. Try again.")
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('an ok:false answer is a failure too', async () => {
    vi.mocked(billingApi.cancelSubscription).mockResolvedValue({ ok: false, at_period_end: true })
    renderPage()
    fireEvent.click(within(await openCancel()).getByRole('button', { name: 'Hold to cancel' }))
    await act(async () => { await commitLast() })
    expect(toast.error).toHaveBeenCalledWith("Couldn't cancel the plan. Try again.")
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('no date: the period words', async () => {
    mockSubscription = { ...business, next_charge_on: null }
    renderPage()
    const dialog = await openCancel()
    expect(dialog.textContent).toContain('The plan runs until the end of this billing period, and nothing more is charged.')
    expect(dialog.textContent).toContain('After that')
  })
})

describe('while the plan is cancelling (R36)', () => {
  beforeEach(() => {
    mockSubscription = { ...business, cancel_at_period_end: true, cancel_effective_at: '2026-12-03T00:00:00Z' }
  })

  it('the line says when it ends; Cancel plan is dimmed, saying so; Resume plan sits in the plan', async () => {
    renderPage()
    await planSection()
    expect(line()).toBe(`Cancelling · The plan ends on 3 Dec. Then the team moves to the free Personal plan: ${FREE}.`)
    expect(row('cancel')!.textContent).toContain('The plan already ends on 3 Dec.')
    expect((within(row('cancel')!).getByRole('button', { name: 'Cancel plan' }) as HTMLButtonElement).disabled).toBe(true)
    const resume = row('resume')!
    expect(resume.closest('[data-kit-section]')!.getAttribute('data-kit-section')).toBe('Business plan')
    expect(resume.textContent).toContain('The plan carries on and renews on 3 Dec.')
    // Beside Payment method, under it.
    expect(row('payment')!.nextElementSibling).toBe(resume)
  })

  it('Resume plan resumes, reads the plan back and says so', async () => {
    vi.mocked(billingApi.resumeSubscription).mockResolvedValue({ ok: true })
    renderPage()
    await planSection()
    fireEvent.click(within(row('resume')!).getByRole('button', { name: 'Resume plan' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Plan resumed'))
    const [updater, opts] = mockMutate.mock.calls.at(-1)!
    expect(opts).toEqual({ revalidate: true })
    expect((updater as (s: SubscriptionDetails) => SubscriptionDetails)({ ...business, cancel_at_period_end: true }).cancel_at_period_end).toBe(false)
  })

  it('a plan that already ended goes to the plans', async () => {
    vi.mocked(billingApi.resumeSubscription).mockResolvedValue({ ok: true, requires_checkout: true })
    renderPage()
    await planSection()
    fireEvent.click(within(row('resume')!).getByRole('button', { name: 'Resume plan' }))
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('This plan has already ended. Pick a plan to subscribe again.'))
    expect(mockPush).toHaveBeenCalledWith('/switch')
  })

  it('a plan no longer sold says so', async () => {
    vi.mocked(billingApi.resumeSubscription).mockRejectedValue(new ApiError('Invalid credentials', 400, { error: 'no price found for the current plan' }))
    renderPage()
    await planSection()
    fireEvent.click(within(row('resume')!).getByRole('button', { name: 'Resume plan' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This plan is no longer sold. Pick a plan to subscribe again.'))
  })

  it('any other failure: the deck\'s words', async () => {
    vi.mocked(billingApi.resumeSubscription).mockRejectedValue(new ApiError('Invalid credentials', 500))
    renderPage()
    await planSection()
    fireEvent.click(within(row('resume')!).getByRole('button', { name: 'Resume plan' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't resume the plan. Try again."))
    expect((within(row('resume')!).getByRole('button', { name: 'Resume plan' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('Billing details', () => {
  it('the owner edits them with the save bar; a save sends only what changed', async () => {
    vi.mocked(billingApi.updateBillingSettings).mockResolvedValue({ ok: true })
    renderPage()
    const name = (await screen.findByLabelText('Business name')) as HTMLInputElement
    expect(name.value).toBe('Example BV')
    const email = screen.getByLabelText('Billing email')
    expect(email.closest('[data-kit-row]')!.textContent).toContain('Invoices and failed-payment emails go here.')
    expect(screen.queryByRole('button', { name: 'Save billing details' })).toBeNull()

    fireEvent.change(name, { target: { value: 'Example Group BV' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Brussels' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Save billing details' }))
    await waitFor(() => expect(billingApi.updateBillingSettings).toHaveBeenCalledWith({ business_name: 'Example Group BV', city: 'Brussels' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Billing details saved'))
    expect(mockMutate).toHaveBeenCalled()
  })

  it('a failed save shows the deck\'s words, rejects (no "Saved") and keeps the draft', async () => {
    vi.mocked(billingApi.updateBillingSettings).mockRejectedValueOnce(new ApiError('Invalid credentials', 403))
    renderPage()
    const name = (await screen.findByLabelText('Business name')) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Example Group BV' } })
    await waitFor(() => expect(lastOnSave).toBeDefined())
    await act(async () => { await expect(lastOnSave!()).rejects.toBeTruthy() })
    expect(toast.error).toHaveBeenCalledWith("Couldn't save your billing details. Try again.")
    expect(name.value).toBe('Example Group BV')
    expect(screen.getByRole('button', { name: 'Save billing details' })).toBeInTheDocument()
  })

  it('an ok:false answer is a failure too', async () => {
    vi.mocked(billingApi.updateBillingSettings).mockResolvedValueOnce({ ok: false })
    renderPage()
    fireEvent.change(await screen.findByLabelText('Address'), { target: { value: 'Rue de la Loi 16' } })
    await waitFor(() => expect(lastOnSave).toBeDefined())
    await act(async () => { await expect(lastOnSave!()).rejects.toBeTruthy() })
    expect(toast.error).toHaveBeenCalledWith("Couldn't save your billing details. Try again.")
  })

  it('no billing email yet: the line asks for the details', async () => {
    mockSubscription = { ...business, billing_email: null, business_name: undefined }
    renderPage()
    await planSection()
    expect(section('Billing details')!.querySelector('header p')!.textContent).toBe(
      'Add your business name and address to put them on your invoices.',
    )
  })

  it('the admin and members read them, labelled as the owner sees them', async () => {
    mockCanManage = false
    mockSubscription = { ...business, billing_address: 'Rue de la Loi 16', billing_city: 'Brussels', billing_postal_code: '1000' }
    renderPage()
    await planSection()
    const details = section('Billing details')!
    expect(details.querySelector('input')).toBeNull()
    expect(details.textContent).toBe('Billing detailsBusiness nameExample BVBilling emailbilling@example.comAddressRue de la Loi 16, 1000 Brussels')
  })
})

describe('Invoices (R24 rows)', () => {
  it('a row per invoice, named by its date, the status leading the line, newest first', async () => {
    vi.mocked(billingApi.getInvoices).mockResolvedValue([
      { ...invoice, id: 'old', invoice_number: null, created_at: '2026-04-25T08:00:00Z' },
      invoice,
      { ...invoice, id: 'cn', invoice_number: 'VF/2026/00030', document_type: 'credit_note', status: 'refunded', amount_cents: -2300, vat_cents: -483, total_cents: -2783, created_at: '2026-10-05T08:00:00Z' },
    ])
    renderPage()
    await waitFor(() => expect(document.querySelectorAll('[data-billing-invoice]').length).toBe(3))
    const rows = [...document.querySelectorAll('[data-billing-invoice]')].map((r) => r.textContent)
    expect(rows).toEqual([
      '5 Oct 2026Credit note · −€27.83 · refund €4.83 VAT · VF/2026/00030',
      '3 Oct 2026Paid · €27.83 · incl. €4.83 VAT · VF/2026/00027',
      '25 Apr 2026Paid · €27.83 · incl. €4.83 VAT',
    ])
    const tones = [...document.querySelectorAll('[data-billing-invoice] [data-kit-status]')].map((s) => s.getAttribute('data-kit-status'))
    expect(tones).toEqual(['off', 'live', 'live'])
    // The number is an id (mono); nothing else on the row is.
    const mono = [...document.querySelectorAll('[data-kit-section="Invoices"] .font-mono')].map((m) => m.textContent)
    expect(mono).toEqual(['VF/2026/00030', 'VF/2026/00027'])
  })

  it('no invoices yet', async () => {
    vi.mocked(billingApi.getInvoices).mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(section('Invoices')!.textContent).toBe('InvoicesNo invoices yetYour first one shows here after your first payment.'))
  })

  it('a failed list is an error, never an empty list', async () => {
    vi.mocked(billingApi.getInvoices).mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() => expect(within(section('Invoices')!).getByRole('alert').textContent).toContain("Couldn't load your invoices. Try again."))
    expect(section('Invoices')!.textContent).not.toContain('No invoices yet')
  })

  it('download: an icon button; not ready yet and failed say different things', async () => {
    vi.mocked(billingApi.downloadInvoicePDF).mockRejectedValueOnce(new ApiError('nope', 404))
    renderPage()
    const button = await screen.findByRole('button', { name: 'Download invoice' })
    fireEvent.click(button)
    expect(billingApi.downloadInvoicePDF).toHaveBeenCalledWith('inv_1')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This invoice isn't ready yet. Try again in a few minutes."))
    vi.mocked(billingApi.downloadInvoicePDF).mockRejectedValueOnce(new ApiError('nope', 500))
    fireEvent.click(button)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't download the invoice. Try again."))
  })
})

describe('the words in the source', () => {
  it('carry no em or en dash and no three-dot ellipsis outside comments', () => {
    for (const file of ['BillingPage.tsx', 'BillingDetailsSection.tsx', 'InvoicesSection.tsx', 'PaymentMethodDialog.tsx', 'CancelPlanDialog.tsx', 'planState.ts']) {
      const stripped = readFileSync(join(__dirname, '..', file), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(stripped, file).not.toMatch(/[—–]/)
      expect(stripped.replace(/\.\.\.(?=[A-Za-z_$[(])/g, ''), file).not.toMatch(/\.\.\./)
      expect(stripped, file).not.toMatch(/\b(please|simply|just)\b/i)
    }
  })
})

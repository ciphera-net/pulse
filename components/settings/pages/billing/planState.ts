import type { Invoice, PriceCatalog, SubscriptionDetails } from '@/lib/api/billing'
import { ApiError } from '@/lib/api/client'
import {
  FREE_EVENT_LIMIT,
  eventMeter,
  formatPlanName,
  formatRetentionMonths,
  getMaxRetentionMonthsForPlan,
  getPeriodPriceCents,
} from '@/lib/plans'

/**
 * The Billing page's facts and words, kept apart from the drawing so each rule is tested on its own (copy deck §10,
 * rulings R26, R35, R36). Everything here is pure: the page passes `now` in, so a date never depends on the clock of
 * whoever runs the tests.
 */

// "3 Dec", the copy deck's short date (§2), from a fixed table: Intl's en-GB writes September as "Sept".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortDay(year: number, monthIndex: number, day: number, now: Date, withYear: boolean): string {
  const base = `${day} ${MONTHS[monthIndex]}`
  // A yearly plan renews next year: "25 Apr" alone would read as this April, already gone.
  return withYear || year !== now.getUTCFullYear() ? `${base} ${year}` : base
}

/** A calendar date the server sends ("YYYY-MM-DD"). Never passed to `new Date`: it has no time of day to shift. */
export function calendarDay(date: string | null | undefined, now: Date): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '')
  return m ? shortDay(Number(m[1]), Number(m[2]) - 1, Number(m[3]), now, false) : null
}

/** An instant the server records, as its UTC day (billing runs in UTC). */
export function utcDay(iso: string | null | undefined, now: Date, withYear = false): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return shortDay(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), now, withYear)
}

export const formatCount = (n: number) => n.toLocaleString('en-GB')

/** How long the free plan keeps data ("6 months"): what a cancelled plan falls back to (R26). */
export const FREE_RETENTION = formatRetentionMonths(getMaxRetentionMonthsForPlan('free'))

/** The free plan's facts, in every line that names it (copy deck §10.9, R26). */
export const FREE_FACTS = `${formatCount(FREE_EVENT_LIMIT)} events a month, 1 site, and data kept for ${FREE_RETENTION}`

/**
 * ONE state for the plan, and one message for it (copy deck §10.2). The order is the rule: a payment that is past due
 * outranks everything, and a cancelled plan reads as cancelled whatever else the row still holds. `payment_failed_at`
 * survives a cancellation and the end of dunning on the server, so it is never read as a state of its own: that is how
 * a cancelled plan used to show the payment-trouble banner.
 */
export type PlanState = 'past_due' | 'cancelled' | 'cancelling' | 'free' | 'granted' | 'trial' | 'active'

export function planStateOf(sub: SubscriptionDetails): PlanState {
  if (sub.subscription_status === 'past_due') return 'past_due'
  if (sub.subscription_status === 'canceled') return 'cancelled'
  if (sub.cancel_at_period_end) return 'cancelling'
  if (sub.plan_id === 'free' && sub.subscription_status === '') return 'free'
  // A plan Ciphera gave has an end date and no charge. A grant on top of a live charge schedule is still billed
  // (AdminGrantPlan keeps next_charge_on), so it reads as a paid plan, with its payment actions.
  if (sub.grant_expires_on && !sub.next_charge_on) return 'granted'
  // Unreachable today (nothing writes `trialing`, copy deck §10.8.4); worded for the state the ruling lists.
  if (sub.subscription_status === 'trialing') return 'trial'
  return 'active'
}

/** A plan somebody pays for: it has a payment method to change and can be cancelled. */
export function isPaid(state: PlanState): boolean {
  return state !== 'granted' && state !== 'cancelled' && state !== 'free'
}

export type StatusTone = 'live' | 'off' | 'broken'

export interface PlanLine {
  tone: StatusTone
  word: string
  line: string | null
}

/** The state as a dot and a word, then the fact behind it (R24, R32; copy deck §10.2 and §10.9). */
export function planLine(
  sub: SubscriptionDetails,
  state: PlanState,
  { manage, alone, now }: { manage: boolean; alone: boolean; now: Date },
): PlanLine {
  const next = calendarDay(sub.next_charge_on, now)
  switch (state) {
    case 'past_due': {
      const failedOn = utcDay(sub.payment_failed_at, now)
      const failed = failedOn ? `Your payment on ${failedOn} failed.` : 'Your last payment failed.'
      return {
        tone: 'broken',
        word: 'Past due',
        // The card change pays the open amount and keeps the plan (pulse-backend #1238).
        line: manage
          ? `${failed} Update your payment method to pay the open amount and keep your plan.`
          : `${failed} Ask the owner to update the payment method.`,
      }
    }
    case 'cancelled':
      return { tone: 'off', word: 'Cancelled', line: `${alone ? "You're" : 'The team is'} on the free Personal plan: ${FREE_FACTS}.` }
    case 'cancelling': {
      const ends = planEndsOn(sub, now)
      const when = ends ? `The plan ends on ${ends}.` : 'The plan ends at the end of this billing period.'
      return {
        tone: 'live',
        word: 'Cancelling',
        line: `${when} Then ${alone ? 'you move' : 'the team moves'} to the free Personal plan: ${FREE_FACTS}.`,
      }
    }
    case 'free':
      return { tone: 'live', word: 'Free', line: `${FREE_FACTS.charAt(0).toUpperCase()}${FREE_FACTS.slice(1)}.` }
    case 'granted':
      return {
        tone: 'live',
        word: 'Active',
        line: `Ciphera gave ${alone ? 'you' : 'this team'} the ${formatPlanName(sub.plan_id)} plan, so nothing is billed.`,
      }
    case 'trial':
      return { tone: 'live', word: 'Trial', line: next ? `Ends on ${next}.` : null }
    case 'active':
      return { tone: 'live', word: 'Active', line: next ? `Renews on ${next}.` : null }
  }
}

/**
 * The day a cancelled plan ends: the renewal day it will not reach. Cancelling stamps `cancel_effective_at` at 00:00
 * UTC of that same day (copy deck §10.7), which stands in when no renewal date was sent.
 */
export function planEndsOn(sub: SubscriptionDetails, now: Date): string | null {
  return calendarDay(sub.next_charge_on, now) ?? utcDay(sub.cancel_effective_at, now)
}

/**
 * When a waiting plan change applies. The server's own rule (ChangePlanHandler): a change that costs the same or less
 * waits for the renewal; one that costs more applies once its prorated payment goes through (copy deck §10.8.9). By
 * price, not by events: yearly 100,000 to monthly 250,000 costs less and waits. Both prices come from the catalog, the
 * yearly one included, so nothing here multiplies. Null when either price is unknown.
 */
export function pendingChangeTiming(sub: SubscriptionDetails, catalog: PriceCatalog | undefined): 'renewal' | 'payment' | null {
  if (!sub.pending_plan_id || typeof sub.pending_limit !== 'number') return null
  const current = getPeriodPriceCents(catalog, sub.plan_id, eventMeter(sub).limit, sub.billing_interval)
  const pending = getPeriodPriceCents(catalog, sub.pending_plan_id, sub.pending_limit, sub.pending_interval || sub.billing_interval)
  if (current === null || pending === null) return null
  return pending <= current ? 'renewal' : 'payment'
}

/** "Moving to Business (10,000 events a month) on 3 Dec." (copy deck §10.5). */
export function pendingChangeLine(
  sub: SubscriptionDetails,
  timing: 'renewal' | 'payment' | null,
  now: Date,
): string {
  const name = formatPlanName(sub.pending_plan_id)
  const size = typeof sub.pending_limit === 'number' && sub.pending_limit > 0
    ? ` (${formatCount(sub.pending_limit)} events a month)`
    : ''
  const next = calendarDay(sub.next_charge_on, now)
  const when = timing === 'payment' ? ' once the payment goes through' : timing === 'renewal' && next ? ` on ${next}` : ''
  return `Moving to ${name}${size}${when}.`
}

/**
 * R26: a plan that keeps data for less deletes the older visits and events at the next daily pass, for good. Said
 * only when the waiting plan keeps less than today's.
 */
export function pendingRetentionLine(sub: SubscriptionDetails): string | null {
  if (!sub.pending_plan_id) return null
  const after = getMaxRetentionMonthsForPlan(sub.pending_plan_id)
  if (after >= getMaxRetentionMonthsForPlan(sub.plan_id)) return null
  return `${formatPlanName(sub.pending_plan_id)} keeps data for ${formatRetentionMonths(after)}. Visits and events older than that are deleted within a day of the change.`
}

/** An invoice's state (copy deck §10.6): the server writes `paid` and `refunded` (`sent` is a legacy `paid`). */
export function invoiceStatus(inv: Invoice): { word: 'Paid' | 'Refunded' | 'Credit note'; tone: StatusTone } {
  if (inv.document_type === 'credit_note') return { word: 'Credit note', tone: 'off' }
  if (inv.status === 'refunded') return { word: 'Refunded', tone: 'off' }
  return { word: 'Paid', tone: 'live' }
}

/**
 * The resume route's refusal for a plan that has no price any more. The server says so only in words
 * (`ResumeSubscriptionHandler`), so the words are the signal.
 */
export function isPlanNoLongerSold(err: unknown): boolean {
  return err instanceof ApiError && err.status === 400 && err.data?.error === 'no price found for the current plan'
}

/**
 * The methods Mollie accepts for a FIRST payment, which both the €0 card check and the past-due payment are. SEPA
 * direct debit is not one (Mollie answers 422, "The payment method does not support sequence type"): a SEPA mandate
 * comes from a first payment by iDEAL or Bancontact.
 */
export const PAYMENT_METHODS = [
  { id: 'creditcard', label: 'Cards', icons: ['/icons/payment/visa.svg', '/icons/payment/mastercard.svg'] },
  { id: 'bancontact', label: 'Bancontact', icons: ['/icons/payment/bancontact.svg'] },
  { id: 'ideal', label: 'iDEAL', icons: ['/icons/payment/ideal.svg'] },
  { id: 'applepay', label: 'Apple Pay', icons: ['/icons/payment/applepay.svg'] },
] as const

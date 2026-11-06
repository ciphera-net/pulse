// The Billing page's rules as pure functions (copy deck §10, R26, R36): one state per plan, its words, the dates,
// and when a waiting plan change applies.
import { describe, it, expect } from 'vitest'
import type { Invoice, SubscriptionDetails } from '@/lib/api/billing'
import { ApiError } from '@/lib/api/client'
import {
  FREE_FACTS,
  PAYMENT_METHODS,
  calendarDay,
  invoiceStatus,
  isPlanNoLongerSold,
  pendingChangeLine,
  pendingChangeTiming,
  pendingRetentionLine,
  planLine,
  planStateOf,
  utcDay,
} from '../planState'

const NOW = new Date('2026-11-06T12:00:00Z')

const paid: SubscriptionDetails = {
  plan_id: 'business',
  subscription_status: 'active',
  billing_interval: 'month',
  pageview_limit: 100000,
  has_payment_method: true,
  next_charge_on: '2026-12-03',
}

// pulse-backend prices: monthly cents per plan and pageview tier.
const PRICES = { business: { 10000: 2300, 100000: 4900, 250000: 9900 } }

describe('dates', () => {
  it('reads a calendar date as written, with the year only when it is not this one', () => {
    expect(calendarDay('2026-12-03', NOW)).toBe('3 Dec')
    expect(calendarDay('2027-04-25', NOW)).toBe('25 Apr 2027')
    expect(calendarDay('2026-09-01', NOW)).toBe('1 Sep')
    expect(calendarDay(null, NOW)).toBeNull()
    expect(calendarDay('03/12/2026', NOW)).toBeNull()
  })

  it('reads an instant as its UTC day, whatever the runner zone', () => {
    // 23:30 UTC on 3 Nov is 4 Nov in Kiritimati and still 3 Nov in New York: billing days are UTC days.
    expect(utcDay('2026-11-03T23:30:00Z', NOW)).toBe('3 Nov')
    expect(utcDay('2026-04-25T08:00:00Z', NOW, true)).toBe('25 Apr 2026')
    expect(utcDay(undefined, NOW)).toBeNull()
    expect(utcDay('not a date', NOW)).toBeNull()
  })
})

describe('planStateOf: one state, in order', () => {
  it('past due outranks a cancellation and everything else', () => {
    expect(planStateOf({ ...paid, subscription_status: 'past_due', cancel_at_period_end: true })).toBe('past_due')
  })

  it('a cancelled plan is cancelled, even with a payment that failed before (carried finding)', () => {
    expect(planStateOf({ ...paid, plan_id: 'free', subscription_status: 'canceled', payment_failed_at: '2026-10-01T06:00:00Z' })).toBe('cancelled')
  })

  it('an active plan with a failed payment on record is still active (a failure makes it past due at once)', () => {
    expect(planStateOf({ ...paid, payment_failed_at: '2026-10-01T06:00:00Z' })).toBe('active')
  })

  it('reads cancelling, free, granted, trial and active', () => {
    expect(planStateOf({ ...paid, cancel_at_period_end: true })).toBe('cancelling')
    expect(planStateOf({ ...paid, plan_id: 'free', subscription_status: '', next_charge_on: null })).toBe('free')
    expect(planStateOf({ ...paid, plan_id: 'pioneer', next_charge_on: null, grant_expires_on: '2027-04-27' })).toBe('granted')
    // A grant on top of a live charge schedule is still billed.
    expect(planStateOf({ ...paid, plan_id: 'pioneer', grant_expires_on: '2027-04-27' })).toBe('active')
    expect(planStateOf({ ...paid, subscription_status: 'trialing' })).toBe('trial')
    expect(planStateOf(paid)).toBe('active')
  })
})

describe('planLine: the deck\'s words for each state', () => {
  const owner = { manage: true, alone: false, now: NOW }

  it('active, cancelling, cancelled, free, granted', () => {
    expect(planLine(paid, 'active', owner)).toEqual({ tone: 'live', word: 'Active', line: 'Renews on 3 Dec.' })
    expect(planLine({ ...paid, cancel_at_period_end: true }, 'cancelling', owner).line).toBe(
      `The plan ends on 3 Dec. Then the team moves to the free Personal plan: ${FREE_FACTS}.`,
    )
    expect(planLine(paid, 'cancelled', owner)).toEqual({ tone: 'off', word: 'Cancelled', line: `The team is on the free Personal plan: ${FREE_FACTS}.` })
    expect(planLine(paid, 'free', owner).line).toBe('5,000 pageviews a month, 1 site, and data kept for 6 months.')
    expect(planLine({ ...paid, plan_id: 'pioneer' }, 'granted', owner).line).toBe('Ciphera gave this team the Pioneer plan, so nothing is billed.')
  })

  it('alone: "you", never "the team"', () => {
    const me = { ...owner, alone: true }
    expect(planLine(paid, 'cancelling', me).line).toMatch(/^The plan ends on 3 Dec\. Then you move to the free Personal plan/)
    expect(planLine(paid, 'cancelled', me).line).toBe(`You're on the free Personal plan: ${FREE_FACTS}.`)
    expect(planLine({ ...paid, plan_id: 'pioneer' }, 'granted', me).line).toBe('Ciphera gave you the Pioneer plan, so nothing is billed.')
  })

  it('past due says what updating the card does, and a member is told to ask the owner', () => {
    const sub = { ...paid, subscription_status: 'past_due' as const, payment_failed_at: '2026-11-03T06:10:00Z' }
    expect(planLine(sub, 'past_due', owner)).toEqual({
      tone: 'broken',
      word: 'Past due',
      line: 'Your payment on 3 Nov failed. Update your payment method to pay the open amount and keep your plan.',
    })
    expect(planLine(sub, 'past_due', { ...owner, manage: false }).line).toBe(
      'Your payment on 3 Nov failed. Ask the owner to update the payment method.',
    )
    // No failure date on the row: no date is made up.
    expect(planLine({ ...sub, payment_failed_at: undefined }, 'past_due', owner).line).toMatch(/^Your last payment failed\./)
  })

  it('a cancelling plan with no renewal date reads its end from cancel_effective_at', () => {
    const sub = { ...paid, next_charge_on: null, cancel_at_period_end: true, cancel_effective_at: '2026-12-03T00:00:00Z' }
    expect(planLine(sub, 'cancelling', owner).line).toMatch(/^The plan ends on 3 Dec\./)
  })
})

describe('a waiting plan change', () => {
  it('a cheaper tier waits for the renewal; a dearer one applies once its payment goes through', () => {
    const down = { ...paid, pending_plan_id: 'business', pending_limit: 10000, pending_interval: 'month' }
    expect(pendingChangeTiming(down, PRICES)).toBe('renewal')
    expect(pendingChangeLine(down, 'renewal', NOW)).toBe('Moving to Business (10,000 pageviews a month) on 3 Dec.')
    const up = { ...paid, pending_plan_id: 'business', pending_limit: 250000, pending_interval: 'month' }
    expect(pendingChangeTiming(up, PRICES)).toBe('payment')
    expect(pendingChangeLine(up, 'payment', NOW)).toBe('Moving to Business (250,000 pageviews a month) once the payment goes through.')
  })

  it('by price, not by pageviews: yearly 100,000 to monthly 250,000 costs less, so it waits', () => {
    const sub = { ...paid, billing_interval: 'year', pending_plan_id: 'business', pending_limit: 250000, pending_interval: 'month' }
    expect(pendingChangeTiming(sub, PRICES)).toBe('renewal')
  })

  it('no prices, no claim about when', () => {
    const sub = { ...paid, pending_plan_id: 'business', pending_limit: 10000, pending_interval: 'month' }
    expect(pendingChangeTiming(sub, undefined)).toBeNull()
    expect(pendingChangeLine(sub, null, NOW)).toBe('Moving to Business (10,000 pageviews a month).')
  })

  it('R26: says what is deleted only when the new plan keeps data for less', () => {
    expect(pendingRetentionLine({ ...paid, pending_plan_id: 'business' })).toBeNull()
    expect(pendingRetentionLine({ ...paid, plan_id: 'team', pending_plan_id: 'solo' })).toBe(
      'Solo keeps data for 1 year. Visits and events older than that are deleted within a day of the change.',
    )
  })
})

describe('invoices, errors and methods', () => {
  const inv: Invoice = {
    id: 'i', invoice_number: null, amount_cents: 2300, vat_cents: 483, total_cents: 2783, currency: 'EUR',
    description: '', status: 'paid', created_at: '2026-10-03T08:00:00Z',
  }

  it('Paid in orange; Refunded and Credit note in grey; no raw status ever prints', () => {
    expect(invoiceStatus(inv)).toEqual({ word: 'Paid', tone: 'live' })
    expect(invoiceStatus({ ...inv, status: 'sent' })).toEqual({ word: 'Paid', tone: 'live' })
    expect(invoiceStatus({ ...inv, status: 'refunded' })).toEqual({ word: 'Refunded', tone: 'off' })
    expect(invoiceStatus({ ...inv, document_type: 'credit_note' })).toEqual({ word: 'Credit note', tone: 'off' })
  })

  it('knows the resume route\'s "no longer sold" refusal, and only that one', () => {
    expect(isPlanNoLongerSold(new ApiError('x', 400, { error: 'no price found for the current plan' }))).toBe(true)
    expect(isPlanNoLongerSold(new ApiError('x', 400, { error: 'subscription is not scheduled to cancel' }))).toBe(false)
    expect(isPlanNoLongerSold(new Error('no price found for the current plan'))).toBe(false)
  })

  it('offers no SEPA: Mollie refuses it as a first payment', () => {
    expect(PAYMENT_METHODS.map((m) => m.label)).toEqual(['Cards', 'Bancontact', 'iDEAL', 'Apple Pay'])
  })
})

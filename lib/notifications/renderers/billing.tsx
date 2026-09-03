import type { Receipt } from '@/lib/notifications/types'
import type { Rendered, Resolvers } from './index'
import { formatDateUTC } from '@/lib/utils/formatDate'
import { formatMoneyCents } from '@/lib/utils/money'

/**
 * Renders an amount that arrives as a PRE-FORMATTED string alongside a separate
 * ISO currency code — the pulse.billing_invoice_sent.v1 shape.
 *
 * 🔴 THE SCHEMA AND THE PRODUCER DISAGREE, AND THE READER PAID FOR IT. The
 * schema documents `amount` as a bare decimal ("49.00"), so this renderer was
 * written to prefix `currency`; the producer (odoosync.go) has always sent
 * `fmt.Sprintf("€%.2f", …)`. The result on a real customer's screen was
 * `EUR €8.47`. Prefixing only when the amount carries no symbol of its own
 * renders both shapes correctly, so neither a legacy stored event nor a
 * corrected producer can print the currency twice.
 *
 * New payloads must not use this shape at all — send minor units and an ISO
 * code (billing_credit_note, billing_payment_failed) and let one formatter own
 * presentation.
 */
function amountWithCurrency(amount: string, currency: string): string {
  const hasSymbol = amount !== '' && !/^[\d.,-]/.test(amount)
  return hasSymbol ? amount : `${currency} ${amount}`.trim()
}

export const billingRenderers = {
  billing_payment_failed: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { invoice_id: string; amount: number; currency: string; error_code: string; retry_at: string }
    const title = p.invoice_id ? `Payment failed — Invoice #${p.invoice_id}` : 'Payment failed'
    // formatMoneyCents falls back to EUR on a missing currency — the backend
    // has shipped payloads without one, and Intl.NumberFormat throws on
    // undefined currency, which blanked the whole notification center.
    const amount = formatMoneyCents(p.amount, p.currency)
    const reason = p.error_code ? ` (${p.error_code})` : ''
    const retryDate = p.retry_at && !p.retry_at.startsWith('0001') ? `. We'll retry on ${formatDateUTC(new Date(p.retry_at))}` : ''
    return {
      title,
      body: `Your payment of ${amount} could not be processed${reason}${retryDate}. Please update your payment method.`,
      linkLabel: 'Update payment method',
    }
  },
  billing_plan_renewed: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { plan_id: string; next_billing_at: string }
    const when = formatDateUTC(new Date(p.next_billing_at))
    return {
      title: 'Your plan renewed',
      body: `Next billing date: ${when}.`,
      linkLabel: null,
    }
  },
  billing_usage_limit: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { limit_type: string; percent_used: number }
    return {
      title: `${p.limit_type} at ${p.percent_used}%`,
      body: `You've used ${p.percent_used}% of your ${p.limit_type} allowance this period.`,
      linkLabel: 'See usage',
    }
  },
  billing_subscription_canceled: (_r: Receipt, _resolvers?: Resolvers): Rendered => {
    return {
      title: 'Subscription canceled',
      body: 'Your plan will end at the current billing period.',
      linkLabel: 'View billing',
    }
  },
  billing_invoice_sent: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { invoice_number: string; amount: string; currency: string; plan_name: string }
    return {
      title: `Invoice #${p.invoice_number} — ${amountWithCurrency(p.amount, p.currency)}`,
      body: `${p.plan_name} subscription`,
      linkLabel: 'View billing',
    }
  },
  // A refund. Its own type since iris migration 024, because until then a
  // credit note was produced as billing_invoice_sent and read as a CHARGE:
  // "Invoice #VF/2026/00029 — EUR €8.47 / Refund subscription", on the day the
  // customer was refunded. The copy leads with the money and the verb, matching
  // the pulse_credit_note email approved on 03-09 — a refund card that opens
  // with a document number and a positive amount reads as a bill whatever noun
  // it uses.
  billing_credit_note: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { credit_note_number: string; amount_cents: number; currency: string }
    // Cents through the one formatter — the payload carries no symbol, so the
    // double-currency class that produced "EUR €8.47" cannot reappear here.
    const amount = formatMoneyCents(p.amount_cents, p.currency)
    return {
      title: `Refund processed — ${amount}`,
      body: `Credit note ${p.credit_note_number}`,
      linkLabel: 'View billing',
    }
  },
  billing_pageview_80: (_r: Receipt, _resolvers?: Resolvers): Rendered => {
    return {
      title: 'Approaching pageview limit',
      body: "You've used 80% of your monthly pageviews.",
      linkLabel: 'View billing',
    }
  },
  billing_pageview_90: (_r: Receipt, _resolvers?: Resolvers): Rendered => {
    return {
      title: 'Nearing pageview limit',
      body: "You've used 90% of your monthly pageviews. Consider upgrading.",
      linkLabel: 'View billing',
    }
  },
  billing_pageview_100: (_r: Receipt, _resolvers?: Resolvers): Rendered => {
    // This fires at 100% of PLAN limit, where collection has NOT stopped — the
    // ruled mechanics (WS1.1): collection continues up to 2x the limit, then
    // pauses until the next period. "No longer being recorded" is true only at
    // the hard ceiling, and that claim belongs to the ceiling banner in
    // WorkspaceBillingTab, not here.
    return {
      title: 'Pageview limit reached',
      body: "You've hit your monthly pageview limit. Collection continues up to 2x your limit, then pauses until your next billing period.",
      linkLabel: 'View billing',
    }
  },
}

import type { Receipt } from '@/lib/notifications/types'
import type { Rendered, Resolvers } from './index'
import { formatDate } from '@/lib/utils/formatDate'

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amountCents / 100)
}

export const billingRenderers = {
  billing_payment_failed: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { invoice_id: string; amount: number; currency: string; error_code: string; retry_at: string }
    const title = p.invoice_id ? `Payment failed — Invoice #${p.invoice_id}` : 'Payment failed'
    const amount = formatMoney(p.amount, p.currency)
    const reason = p.error_code ? ` (${p.error_code})` : ''
    const retryDate = p.retry_at && !p.retry_at.startsWith('0001') ? `. We'll retry on ${formatDate(new Date(p.retry_at))}` : ''
    return {
      title,
      body: `Your payment of ${amount} could not be processed${reason}${retryDate}. Please update your payment method.`,
      linkLabel: 'Update payment method',
    }
  },
  billing_plan_renewed: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { plan_id: string; next_billing_at: string }
    const when = formatDate(new Date(p.next_billing_at))
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
      title: `Invoice #${p.invoice_number} — ${p.currency} ${p.amount}`,
      body: `${p.plan_name} subscription`,
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
    return {
      title: 'Pageview limit reached',
      body: "You've hit your monthly pageview limit. New events are no longer being recorded.",
      linkLabel: 'View billing',
    }
  },
}

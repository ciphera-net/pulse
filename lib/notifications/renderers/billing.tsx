import type { Receipt } from '@/lib/notifications/types'
import type { Rendered, Resolvers } from './index'

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amountCents / 100)
}

export const billingRenderers = {
  billing_payment_failed: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { invoice_id: string; amount: number; currency: string; error_code: string; retry_at: string }
    const when = new Date(p.retry_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    return {
      title: `Payment failed — Invoice #${p.invoice_id}`,
      body: `Your payment of ${formatMoney(p.amount, p.currency)} failed (${p.error_code}). We'll retry on ${when}.`,
      linkLabel: 'View billing',
    }
  },
  billing_plan_renewed: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { plan_id: string; next_billing_at: string }
    const when = new Date(p.next_billing_at).toLocaleDateString('en', { month: 'long', day: 'numeric' })
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
}

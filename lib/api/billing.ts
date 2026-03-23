import apiRequest from './client'

export interface TaxID {
  type: string
  value: string
  country?: string
}

export interface SubscriptionDetails {
  plan_id: string
  subscription_status: string
  current_period_end: string
  billing_interval: string
  pageview_limit: number
  has_payment_method: boolean
  /** True when subscription is set to cancel at the end of the current period. */
  cancel_at_period_end?: boolean
  /** Number of sites for the org (billing usage). Present when backend supports usage API. */
  sites_count?: number
  /** Pageviews in current billing period (when pageview_limit > 0). Present when backend supports usage API. */
  pageview_usage?: number
  /** Business name from billing (optional). */
  business_name?: string
  /** Tax ID collected on the billing customer (VAT, EIN, etc.). */
  tax_id?: TaxID | null
}

export async function getSubscription(): Promise<SubscriptionDetails> {
  return apiRequest<SubscriptionDetails>('/api/billing/subscription')
}

export async function createPortalSession(): Promise<{ url: string }> {
  return apiRequest<{ url: string }>('/api/billing/portal', {
    method: 'POST',
  })
}

export interface CancelSubscriptionParams {
  /** If true (default), cancel at end of billing period; if false, cancel immediately. */
  at_period_end?: boolean
}

export async function cancelSubscription(params?: CancelSubscriptionParams): Promise<{ ok: boolean; at_period_end: boolean }> {
  return apiRequest<{ ok: boolean; at_period_end: boolean }>('/api/billing/cancel', {
    method: 'POST',
    body: JSON.stringify({ at_period_end: params?.at_period_end ?? true }),
  })
}

/** Clears cancel_at_period_end so the subscription continues past the current period. */
export async function resumeSubscription(): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/billing/resume', {
    method: 'POST',
  })
}

export interface ChangePlanParams {
  plan_id: string
  interval: string
  limit: number
}


export async function changePlan(params: ChangePlanParams): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/billing/change-plan', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export interface CreateCheckoutParams {
  plan_id: string
  interval: string
  limit: number
}

export async function createCheckoutSession(params: CreateCheckoutParams): Promise<{ url: string }> {
  return apiRequest<{ url: string }>('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export interface Order {
  id: string
  total_amount: number
  subtotal_amount: number
  tax_amount: number
  currency: string
  status: string
  created_at: string
  paid: boolean
  invoice_number: string
}

export async function getOrders(): Promise<Order[]> {
  return apiRequest<Order[]>('/api/billing/invoices')
}

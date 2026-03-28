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
  country: string
  vat_id?: string
  method?: string
}

export async function createCheckoutSession(params: CreateCheckoutParams): Promise<{ url: string }> {
  return apiRequest<{ url: string }>('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/** Creates a Mollie checkout session to update the payment mandate. */
export async function updatePaymentMethod(): Promise<{ url: string }> {
  return apiRequest<{ url: string }>('/api/billing/update-payment-method', {
    method: 'POST',
  })
}

export interface Order {
  id: string
  amount: string
  currency: string
  status: string
  created_at: string
}

export async function getOrders(): Promise<Order[]> {
  return apiRequest<Order[]>('/api/billing/invoices')
}

export interface VATResult {
  base_amount: string
  vat_rate: number
  vat_amount: string
  total_amount: string
  vat_exempt: boolean
  vat_reason: string
  company_name?: string
  company_address?: string
}

export interface CalculateVATParams {
  plan_id: string
  interval: string
  limit: number
  country: string
  vat_id?: string
}

export async function calculateVAT(params: CalculateVATParams): Promise<VATResult> {
  return apiRequest<VATResult>('/api/billing/calculate-vat', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export interface CreateEmbeddedCheckoutParams {
  plan_id: string
  interval: string
  limit: number
  country: string
  vat_id?: string
  card_token: string
}

export async function createEmbeddedCheckout(params: CreateEmbeddedCheckoutParams): Promise<{ status: 'success' | 'pending'; redirect_url?: string }> {
  return apiRequest<{ status: 'success' | 'pending'; redirect_url?: string }>('/api/billing/checkout-embedded', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

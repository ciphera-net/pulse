import { API_URL } from './client'

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
  /** Business name from Stripe Tax ID collection / business purchase flow (optional). */
  business_name?: string
  /** Tax IDs collected on the Stripe customer (VAT, EIN, etc.) for invoice verification. */
  tax_ids?: TaxID[]
}

async function billingFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_URL}${endpoint}`
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Send cookies
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({
      error: 'Unknown error',
      message: `HTTP ${response.status}: ${response.statusText}`,
    }))
    throw new Error(errorBody.message || errorBody.error || 'Request failed')
  }

  return response.json()
}

export async function getSubscription(): Promise<SubscriptionDetails> {
  return await billingFetch<SubscriptionDetails>('/api/billing/subscription', {
    method: 'GET',
  })
}

export async function createPortalSession(): Promise<{ url: string }> {
  return await billingFetch<{ url: string }>('/api/billing/portal', {
    method: 'POST',
  })
}

export interface CancelSubscriptionParams {
  /** If true (default), cancel at end of billing period; if false, cancel immediately. */
  at_period_end?: boolean
}

export async function cancelSubscription(params?: CancelSubscriptionParams): Promise<{ ok: boolean; at_period_end: boolean }> {
  return await billingFetch<{ ok: boolean; at_period_end: boolean }>('/api/billing/cancel', {
    method: 'POST',
    body: JSON.stringify({ at_period_end: params?.at_period_end ?? true }),
  })
}

export interface ChangePlanParams {
  plan_id: string
  interval: string
  limit: number
}

export async function changePlan(params: ChangePlanParams): Promise<{ ok: boolean }> {
  return await billingFetch<{ ok: boolean }>('/api/billing/change-plan', {
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
  return await billingFetch<{ url: string }>('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export interface Invoice {
  id: string
  amount_paid: number
  amount_due: number
  currency: string
  status: string
  created: number
  hosted_invoice_url: string
  invoice_pdf: string
}

export async function getInvoices(): Promise<Invoice[]> {
  return await billingFetch<Invoice[]>('/api/billing/invoices', {
    method: 'GET',
  })
}

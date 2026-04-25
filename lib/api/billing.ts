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
  /** Account credit balance in cents (from proration credits, etc.). */
  credit_balance?: number
}

export async function getSubscription(): Promise<SubscriptionDetails> {
  return apiRequest<SubscriptionDetails>('/api/billing/subscription')
}

export async function updatePaymentMethod(): Promise<{ url: string }> {
  return apiRequest<{ url: string }>('/api/billing/update-payment-method', {
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

export interface PlanChangeEstimate {
  direction: 'upgrade' | 'downgrade'
  currency: string
  // Downgrade fields
  refund_amount?: number
  current_plan_end?: string
  new_plan_start?: string
  new_plan_cost?: number
  // Upgrade fields
  charge_amount?: number
  effective?: string
  // Legacy fields (kept for compatibility)
  sub_total?: number
  tax?: number
  total?: number
  credits_applied?: number
  amount_due?: number
  next_total?: number
  next_date?: number
  next_interval?: string
}

export async function estimatePlanChange(params: ChangePlanParams): Promise<PlanChangeEstimate> {
  return apiRequest<PlanChangeEstimate>('/api/billing/estimate-change', {
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

export interface Invoice {
  id: string
  invoice_number: string | null
  amount_cents: number
  vat_cents: number
  total_cents: number
  currency: string
  description: string
  status: string
  created_at: string
}

export async function getInvoices(): Promise<Invoice[]> {
  const res = await apiRequest<{ invoices: Invoice[] }>('/api/billing/invoices')
  return res.invoices ?? []
}

export async function downloadInvoicePDF(invoiceId: string): Promise<void> {
  const { API_URL } = await import('./client')
  const res = await fetch(API_URL + '/api/billing/invoices/' + invoiceId + '/pdf', {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to download invoice PDF')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'invoice.pdf'
  a.click()
  URL.revokeObjectURL(url)
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

export async function getPrices(): Promise<Record<string, Record<number, number>>> {
  return apiRequest('/api/billing/prices')
}

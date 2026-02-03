import { API_URL } from './client'

export interface SubscriptionDetails {
  plan_id: string
  subscription_status: string
  current_period_end: string
  billing_interval: string
  pageview_limit: number
  has_payment_method: boolean
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

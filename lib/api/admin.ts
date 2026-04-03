import { authFetch } from './client'
import type { QuarantinedEvent, QuarantineStats, DomainReputation, ReputationStats } from './quarantine'

export interface AdminOrgSummary {
  organization_id: string
  billing_customer_id: string
  billing_subscription_id: string
  plan_id: string
  billing_interval: string
  pageview_limit: number
  subscription_status: string
  current_period_end: string
  business_name: string
  last_payment_at?: string
  created_at: string
  updated_at: string
}

export interface Site {
  id: string
  domain: string
  name: string
  created_at: string
}

export interface AdminOrgDetail extends AdminOrgSummary {
  sites: Site[]
}

export interface GrantPlanParams {
  plan_id: string
  billing_interval: string
  pageview_limit: number
  period_end: string // ISO date string
}

// Check if current user is admin
export async function getAdminMe(): Promise<{ is_admin: boolean }> {
  try {
    return await authFetch<{ is_admin: boolean }>('/api/admin/me')
  } catch (e) {
    return { is_admin: false }
  }
}

// List all organizations (admin view)
export async function listAdminOrgs(): Promise<AdminOrgSummary[]> {
  const data = await authFetch<{ organizations: AdminOrgSummary[] }>('/api/admin/orgs')
  return data.organizations || []
}

// Get details for a specific organization
export async function getAdminOrg(orgId: string): Promise<{ billing: AdminOrgSummary; sites: Site[] }> {
  return await authFetch<{ billing: AdminOrgSummary; sites: Site[] }>(`/api/admin/orgs/${orgId}`)
}

// Grant a plan to an organization manually
export async function grantPlan(orgId: string, params: GrantPlanParams): Promise<void> {
  await authFetch(`/api/admin/orgs/${orgId}/grant-plan`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function getAdminQuarantineStats(): Promise<QuarantineStats> {
  return authFetch('/api/admin/quarantine/stats')
}

export async function getAdminQuarantineEvents(params?: {
  site_id?: string
  reason?: string
  method?: string
  domain?: string
  start_date?: string
  end_date?: string
  limit?: number
  offset?: number
}): Promise<{ events: QuarantinedEvent[]; total: number }> {
  const searchParams = new URLSearchParams()
  if (params?.site_id) searchParams.set('site_id', params.site_id)
  if (params?.reason) searchParams.set('reason', params.reason)
  if (params?.method) searchParams.set('method', params.method)
  if (params?.domain) searchParams.set('domain', params.domain)
  if (params?.start_date) searchParams.set('start_date', params.start_date)
  if (params?.end_date) searchParams.set('end_date', params.end_date)
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.offset) searchParams.set('offset', String(params.offset))
  const qs = searchParams.toString()
  return authFetch(`/api/admin/quarantine/events${qs ? `?${qs}` : ''}`)
}

export async function getAdminReputation(params?: {
  action?: string
  confidence?: string
  source?: string
  sort?: string
  limit?: number
  offset?: number
}): Promise<{ domains: DomainReputation[]; total: number }> {
  const searchParams = new URLSearchParams()
  if (params?.action) searchParams.set('action', params.action)
  if (params?.confidence) searchParams.set('confidence', params.confidence)
  if (params?.source) searchParams.set('source', params.source)
  if (params?.sort) searchParams.set('sort', params.sort)
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.offset) searchParams.set('offset', String(params.offset))
  const qs = searchParams.toString()
  return authFetch(`/api/admin/reputation${qs ? `?${qs}` : ''}`)
}

export async function adminReputationOverride(
  domain: string,
  action: 'allow' | 'quarantine'
): Promise<void> {
  return authFetch(`/api/admin/reputation/${encodeURIComponent(domain)}`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export async function getAdminReputationStats(): Promise<ReputationStats> {
  return authFetch('/api/admin/reputation/stats')
}

import { authFetch } from './client'

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

export interface FilteredReferrer {
  domain: string
  reason: string
  count: number
}

export async function getFilteredReferrers(startDate?: string, endDate?: string): Promise<FilteredReferrer[]> {
  const params = new URLSearchParams()
  if (startDate) params.set('start_date', startDate)
  if (endDate) params.set('end_date', endDate)
  const query = params.toString() ? `?${params.toString()}` : ''
  const data = await authFetch<{ filtered_referrers: FilteredReferrer[] }>(`/api/admin/filtered-referrers${query}`)
  return data.filtered_referrers || []
}

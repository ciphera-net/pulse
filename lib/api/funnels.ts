import apiRequest from './client'

export interface FunnelStep {
  order: number
  name: string
  value: string
  type: string // "exact", "contains", "regex"
}

export interface Funnel {
  id: string
  site_id: string
  name: string
  description: string
  steps: FunnelStep[]
  created_at: string
  updated_at: string
}

export interface FunnelStepStats {
  step: FunnelStep
  visitors: number
  dropoff: number
  conversion: number
}

export interface FunnelStats {
  funnel_id: string
  steps: FunnelStepStats[]
}

export interface CreateFunnelRequest {
  name: string
  description: string
  steps: FunnelStep[]
}

export async function listFunnels(siteId: string): Promise<Funnel[]> {
  const response = await apiRequest<{ funnels: Funnel[] }>(`/sites/${siteId}/funnels`)
  return response?.funnels || []
}

export async function getFunnel(siteId: string, funnelId: string): Promise<Funnel> {
  return apiRequest<Funnel>(`/sites/${siteId}/funnels/${funnelId}`)
}

export async function createFunnel(siteId: string, data: CreateFunnelRequest): Promise<Funnel> {
  return apiRequest<Funnel>(`/sites/${siteId}/funnels`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateFunnel(siteId: string, funnelId: string, data: CreateFunnelRequest): Promise<Funnel> {
  return apiRequest<Funnel>(`/sites/${siteId}/funnels/${funnelId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteFunnel(siteId: string, funnelId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/funnels/${funnelId}`, {
    method: 'DELETE',
  })
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

/** Normalize date-only (YYYY-MM-DD) to RFC3339 for backend funnel stats API. */
function toRFC3339Range(from: string, to: string): { from: string; to: string } {
  return {
    from: DATE_ONLY_REGEX.test(from) ? `${from}T00:00:00.000Z` : from,
    to: DATE_ONLY_REGEX.test(to) ? `${to}T23:59:59.999Z` : to,
  }
}

export async function getFunnelStats(siteId: string, funnelId: string, from?: string, to?: string): Promise<FunnelStats> {
  const params = new URLSearchParams()
  if (from && to) {
    const { from: fromRfc, to: toRfc } = toRFC3339Range(from, to)
    params.append('from', fromRfc)
    params.append('to', toRfc)
  } else if (from) {
    params.append('from', DATE_ONLY_REGEX.test(from) ? `${from}T00:00:00.000Z` : from)
  } else if (to) {
    params.append('to', DATE_ONLY_REGEX.test(to) ? `${to}T23:59:59.999Z` : to)
  }
  const queryString = params.toString() ? `?${params.toString()}` : ''
  return apiRequest<FunnelStats>(`/sites/${siteId}/funnels/${funnelId}/stats${queryString}`)
}

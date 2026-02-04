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

export async function getFunnelStats(siteId: string, funnelId: string, from?: string, to?: string): Promise<FunnelStats> {
  const params = new URLSearchParams()
  if (from) params.append('from', from)
  if (to) params.append('to', to)
  
  const queryString = params.toString() ? `?${params.toString()}` : ''
  return apiRequest<FunnelStats>(`/sites/${siteId}/funnels/${funnelId}/stats${queryString}`)
}

import apiRequest from './client'

export interface StepPropertyFilter {
  key: string
  operator: 'is' | 'is_not' | 'contains' | 'not_contains'
  value: string
}

export interface FunnelStep {
  order: number
  name: string
  value: string
  type: string // "exact", "contains", "regex"
  category?: 'page' | 'event'
  property_filters?: StepPropertyFilter[]
}

export interface Funnel {
  id: string
  site_id: string
  name: string
  description: string
  steps: FunnelStep[]
  conversion_window_value: number
  conversion_window_unit: 'hours' | 'days'
  created_at: string
  updated_at: string
}

export interface ExitPage {
  path: string
  visitors: number
}

export interface FunnelStepStats {
  step: FunnelStep
  visitors: number
  dropoff: number
  conversion: number
  exit_pages: ExitPage[]
}

export interface FunnelStats {
  funnel_id: string
  steps: FunnelStepStats[]
}

export interface CreateFunnelRequest {
  name: string
  description: string
  steps: Omit<FunnelStep, 'order'>[]
  conversion_window_value?: number
  conversion_window_unit?: 'hours' | 'days'
}

export interface FunnelTrends {
  dates: string[]
  overall: number[]
  steps: Record<string, number[]>
}

export interface FunnelBreakdownEntry {
  value: string
  visitors: number
  conversion: number
}

export interface FunnelBreakdown {
  step: number
  dimension: string
  entries: FunnelBreakdownEntry[]
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

export async function getFunnelStats(siteId: string, funnelId: string, startDate?: string, endDate?: string, filters?: string): Promise<FunnelStats> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (filters) params.append('filters', filters)
  const queryString = params.toString() ? `?${params.toString()}` : ''
  return apiRequest<FunnelStats>(`/sites/${siteId}/funnels/${funnelId}/stats${queryString}`)
}

export async function getFunnelTrends(
  siteId: string, funnelId: string,
  startDate?: string, endDate?: string,
  interval: string = 'day', filters?: string
): Promise<FunnelTrends> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('interval', interval)
  if (filters) params.append('filters', filters)
  const queryString = params.toString() ? `?${params.toString()}` : ''
  return apiRequest<FunnelTrends>(`/sites/${siteId}/funnels/${funnelId}/trends${queryString}`)
}

export async function getFunnelBreakdown(
  siteId: string, funnelId: string,
  step: number, dimension: string,
  startDate?: string, endDate?: string,
  filters?: string
): Promise<FunnelBreakdown> {
  const params = new URLSearchParams()
  params.append('step', step.toString())
  params.append('dimension', dimension)
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (filters) params.append('filters', filters)
  const queryString = params.toString() ? `?${params.toString()}` : ''
  return apiRequest<FunnelBreakdown>(`/sites/${siteId}/funnels/${funnelId}/breakdown${queryString}`)
}

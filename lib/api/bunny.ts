import apiRequest from './client'

// ─── Types ──────────────────────────────────────────────────────────

export interface BunnyStatus {
  connected: boolean
  pull_zone_id?: number
  pull_zone_name?: string
  status?: 'active' | 'syncing' | 'error'
  error_message?: string | null
  last_synced_at?: string | null
  created_at?: string
}

export interface BunnyOverview {
  total_bandwidth: number
  total_requests: number
  cache_hit_rate: number
  avg_origin_response: number
  total_errors: number
  prev_total_bandwidth: number
  prev_total_requests: number
  prev_cache_hit_rate: number
  prev_avg_origin_response: number
  prev_total_errors: number
}

export interface BunnyDailyRow {
  date: string
  bandwidth_used: number
  bandwidth_cached: number
  requests_served: number
  requests_cached: number
  error_3xx: number
  error_4xx: number
  error_5xx: number
  origin_response_time_avg: number
}

export interface BunnyPullZone {
  id: number
  name: string
}

export interface BunnyGeoRow {
  country_code: string
  bandwidth: number
  requests: number
}

// ─── API Functions ──────────────────────────────────────────────────

export async function getBunnyPullZones(siteId: string, apiKey: string): Promise<{ pull_zones: BunnyPullZone[], message?: string }> {
  return apiRequest<{ pull_zones: BunnyPullZone[], message?: string }>(
    `/sites/${siteId}/integrations/bunny/pull-zones?api_key=${encodeURIComponent(apiKey)}`
  )
}

export async function connectBunny(siteId: string, apiKey: string, pullZoneId: number, pullZoneName: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/integrations/bunny`, {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey, pull_zone_id: pullZoneId, pull_zone_name: pullZoneName }),
  })
}

export async function getBunnyStatus(siteId: string): Promise<BunnyStatus> {
  return apiRequest<BunnyStatus>(`/sites/${siteId}/integrations/bunny/status`)
}

export async function disconnectBunny(siteId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/integrations/bunny`, { method: 'DELETE' })
}

export async function getBunnyOverview(siteId: string, startDate: string, endDate: string): Promise<BunnyOverview> {
  return apiRequest<BunnyOverview>(`/sites/${siteId}/bunny/overview?start_date=${startDate}&end_date=${endDate}`)
}

export async function getBunnyDailyStats(siteId: string, startDate: string, endDate: string): Promise<{ daily_stats: BunnyDailyRow[] }> {
  return apiRequest<{ daily_stats: BunnyDailyRow[] }>(`/sites/${siteId}/bunny/daily-stats?start_date=${startDate}&end_date=${endDate}`)
}

export async function getBunnyTopCountries(siteId: string, startDate: string, endDate: string, limit = 20): Promise<{ countries: BunnyGeoRow[] }> {
  return apiRequest<{ countries: BunnyGeoRow[] }>(`/sites/${siteId}/bunny/top-countries?start_date=${startDate}&end_date=${endDate}&limit=${limit}`)
}

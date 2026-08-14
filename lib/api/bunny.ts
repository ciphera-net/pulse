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

// * total_errors counts 4xx+5xx ONLY — 3xx are redirects, reported separately
// * (total_3xx) so a redirect-heavy site never reads as an error storm.
export interface BunnyOverview {
  total_bandwidth: number
  total_bandwidth_cached: number
  total_requests: number
  cache_hit_rate: number
  avg_origin_response: number
  total_errors: number
  total_3xx: number
  prev_total_bandwidth: number
  prev_total_bandwidth_cached: number
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

// * A Bunny edge region ("EU: Zurich, CH") with bandwidth served from it over
// * the requested range — fetched LIVE from Bunny by the backend, never stored
// * (the old bunny_geo_data table multiply-counted overlapping sync windows
// * and labeled POPs as countries; migration 137 dropped it).
export interface BunnyRegionEntry {
  region: string
  bandwidth: number
}

export interface BunnyRegionsResponse {
  regions: BunnyRegionEntry[]
  total_bandwidth: number
  range: { start: string; end: string }
}

// * One UTC hour bucket from the live proxy. origin_response_ms is null when
// * the hour had no origin pulls — absence, never a 0ms origin.
export interface BunnyLiveHour {
  hour: string
  bandwidth: number
  bandwidth_cached: number
  requests: number
  requests_cached: number
  error_3xx: number
  error_4xx: number
  error_5xx: number
  origin_response_ms: number | null
}

// * Trailing-window hourly stats, proxied LIVE from Bunny (nothing stored —
// * the daily instrument is the durable record). hours are the COMPLETE UTC
// * hours; the in-progress hour rides separately and is excluded from totals,
// * so a mid-hour read never grades a bucket that is still filling.
export interface BunnyLiveResponse {
  hours: BunnyLiveHour[]
  in_progress: BunnyLiveHour | null
  totals: {
    requests: number
    requests_cached: number
    bandwidth: number
    bandwidth_cached: number
    error_4xx: number
    error_5xx: number
  }
  range: { start: string; end: string }
}

// ─── API Functions ──────────────────────────────────────────────────

export async function getBunnyPullZones(siteId: string, apiKey: string): Promise<{ pull_zones: BunnyPullZone[], message?: string }> {
  return apiRequest<{ pull_zones: BunnyPullZone[], message?: string }>(
    `/sites/${siteId}/integrations/bunny/pull-zones`,
    { method: 'POST', body: JSON.stringify({ api_key: apiKey }) }
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

export async function getBunnyRegions(siteId: string, startDate: string, endDate: string): Promise<BunnyRegionsResponse> {
  return apiRequest<BunnyRegionsResponse>(`/sites/${siteId}/bunny/regions?start_date=${startDate}&end_date=${endDate}`)
}

export async function getBunnyLive(siteId: string): Promise<BunnyLiveResponse> {
  return apiRequest<BunnyLiveResponse>(`/sites/${siteId}/bunny/live`)
}

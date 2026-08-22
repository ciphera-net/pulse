import apiRequest from './client'

// * Types for uptime monitoring — mirrors pulse-backend internal/database/uptime.go
// * (migration 135: TLS observation, p50/p95, incidents, response-time series).

export interface UptimeMonitor {
  id: string
  site_id: string
  name: string
  url: string
  check_interval_seconds: number
  expected_status_code: number
  timeout_seconds: number
  enabled: boolean
  last_checked_at: string | null
  last_status: 'up' | 'down' | 'degraded' | 'unknown'
  last_response_time_ms: number | null
  // * Observed by the checker's own TLS handshake; null until the first HTTPS
  // * check after the 135 deploy (or for plain-HTTP endpoints).
  tls_expires_at: string | null
  tls_issuer: string | null
  tls_checked_at: string | null
  created_at: string
  updated_at: string
}

export interface UptimeCheck {
  id: string
  monitor_id: string
  status: 'up' | 'down' | 'degraded'
  effective_status?: 'up' | 'down' | 'degraded' | null
  response_time_ms: number | null
  status_code: number | null
  error_message: string | null
  checked_at: string
}

export interface UptimeDailyStat {
  monitor_id: string
  date: string
  total_checks: number
  successful_checks: number
  failed_checks: number
  degraded_checks: number
  avg_response_time_ms: number
  min_response_time_ms: number | null
  max_response_time_ms: number | null
  // * null on days whose raw checks were purged before the percentile backfill
  // * — rendered as an em dash, never fabricated.
  p50_response_time_ms: number | null
  p95_response_time_ms: number | null
  uptime_percentage: number
}

export interface MonitorStatus {
  monitor: UptimeMonitor
  daily_stats: UptimeDailyStat[] | null
  overall_uptime: number
}

export interface UptimeStatusResponse {
  monitors: MonitorStatus[] | null
  overall_uptime: number
  status: 'operational' | 'degraded' | 'down'
  total_monitors: number
  /** Newest pre-conversion (UTC-bucketed) rollup date within the requested
   * range, or null when every day in range is a site-timezone day. Days at or
   * before it can never be re-bucketed — their raw checks are purged — so the
   * UI labels the boundary (22-08-2026 site-timezone alignment). */
  utc_days_before: string | null
}

// * A confirmed downtime/degradation episode. ended_at null = ongoing.
export interface UptimeIncident {
  id: string
  monitor_id: string
  started_at: string
  ended_at: string | null
  status: 'down' | 'degraded'
  first_error_message: string | null
  first_status_code: number | null
  failed_checks: number
}

export interface UptimeIncidentsResponse {
  incidents: UptimeIncident[]
  start_date: string
  end_date: string
}

export interface UptimeResponseTimeBucket {
  bucket_start: string
  samples: number
  avg_response_time_ms: number | null
  p50_response_time_ms: number | null
  p95_response_time_ms: number | null
  min_response_time_ms: number | null
  max_response_time_ms: number | null
  failed_checks: number
  degraded_checks: number
}

export interface UptimeResponseTimeSummary {
  samples: number
  avg_response_time_ms: number | null
  // * Exact over raw checks (hour source); null on the daily source — a
  // * range-wide percentile cannot be re-derived from per-day ones.
  p50_response_time_ms: number | null
  p95_response_time_ms: number | null
  failed_checks: number
  degraded_checks: number
}

export interface UptimeResponseTimesResponse {
  // * The SERVER owns this decision and echoes it — hourly from raw checks for
  // * short recent ranges, daily from the rollups beyond. Never re-bucket.
  granularity: 'hour' | 'day'
  buckets: UptimeResponseTimeBucket[]
  summary: UptimeResponseTimeSummary | null
  start_date: string
  end_date: string
}

/**
 * Fetches the uptime status overview for all monitors of a site.
 * Dates are UTC calendar days (the uptime subsystem's deliberate convention).
 */
export async function getUptimeStatus(siteId: string, startDate?: string, endDate?: string): Promise<UptimeStatusResponse> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  const query = params.toString()
  return apiRequest<UptimeStatusResponse>(`/sites/${siteId}/uptime/status${query ? `?${query}` : ''}`)
}

/**
 * Fetches incident episodes overlapping the range, newest first. The default
 * limit is the API's maximum — the ledger states its count as fact, so it
 * fetches as much fact as the API allows and labels the cutoff if it hits it.
 */
export async function getUptimeIncidents(siteId: string, startDate: string, endDate: string, limit = 200): Promise<UptimeIncidentsResponse> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, limit: String(limit) })
  return apiRequest<UptimeIncidentsResponse>(`/sites/${siteId}/uptime/incidents?${params.toString()}`)
}

/**
 * Fetches the server-bucketed latency series + range summary for a monitor.
 */
export async function getUptimeResponseTimes(siteId: string, monitorId: string, startDate: string, endDate: string): Promise<UptimeResponseTimesResponse> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
  return apiRequest<UptimeResponseTimesResponse>(`/sites/${siteId}/uptime/monitors/${monitorId}/response-times?${params.toString()}`)
}

/**
 * Fetches recent checks for a specific monitor.
 */
export async function getMonitorChecks(siteId: string, monitorId: string, limit = 50): Promise<UptimeCheck[]> {
  const res = await apiRequest<{ checks: UptimeCheck[] }>(`/sites/${siteId}/uptime/monitors/${monitorId}/checks?limit=${limit}`)
  return res?.checks ?? []
}

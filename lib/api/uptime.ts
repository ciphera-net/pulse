import apiRequest from './client'
import { rangeQuery } from './rangeQuery'
import { sitePath, type SiteRef } from '@/lib/scope/site-ref'

// * Types for uptime monitoring — mirrors pulse-backend internal/database/uptime.go
// * (migration 135: TLS observation, p50/p95, incidents, response-time series).
// *
// * A check has three results (pulse-backend internal/uptime/classify.go, 23-11-2026): 'up', 'down', and
// * 'inconclusive' when something answered in the site's place or refused the checker (a bot check, a 401, 403,
// * 407 or 429, a redirect to another address). An inconclusive check counts neither for nor against
// * availability, and the page calls it "Couldn't check". 'degraded' is the state of before that rule: no new
// * check carries it, old rows and the demo's slow-response incident still do.

/** What one check found, or what a monitor is confirmed to be. */
export type UptimeResult = 'up' | 'down' | 'inconclusive' | 'degraded'

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
  last_status: UptimeResult | 'unknown'
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
  status: UptimeResult
  effective_status?: UptimeResult | null
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
  /** Checks that could not see the site. Absent from a server older than 23-11-2026. */
  inconclusive_checks?: number
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
  status: 'operational' | 'degraded' | 'down' | 'inconclusive'
  total_monitors: number
  /** Newest pre-conversion (UTC-bucketed) rollup date within the requested
   * range, or null when every day in range is a site-timezone day. Days at or
   * before it can never be re-bucketed — their raw checks are purged — so the
   * UI labels the boundary (22-08-2026 site-timezone alignment). */
  utc_days_before: string | null
}

// * An episode: a run of one confirmed status other than up. 'down' is an outage; 'inconclusive' is a stretch the
// * checker could not see the site, which is never downtime. ended_at null = ongoing.
export interface UptimeIncident {
  id: string
  monitor_id: string
  started_at: string
  ended_at: string | null
  status: 'down' | 'inconclusive' | 'degraded'
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
  /** In `samples`, and on neither side of availability. Absent from a server older than 23-11-2026. */
  inconclusive_checks?: number
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
  inconclusive_checks?: number
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
 * The one period an uptime read hands to the server: All time, which the server resolves to the rollup's own span.
 * Every other view is sent as dates. The uptime routes know no other period, and one they do not know is not an
 * error to them: the dates are simply absent and the answer covers the server's default of 90 days. So the type
 * refuses any other token (the dashboard's "30d" or "today" reached the status read through its tile until
 * 23-11-2026).
 */
export type UptimePeriodToken = 'all'

/**
 * Fetches the uptime status overview for all monitors of a site.
 * Dates are the site's calendar days (the server cuts them in the site's timezone since 22-08-2026).
 */
export async function getUptimeStatus(site: SiteRef, startDate?: string, endDate?: string, period?: UptimePeriodToken): Promise<UptimeStatusResponse> {
  const params = new URLSearchParams()
  if (period === 'all') {
    // All time — the server resolves it to the uptime rollup's own span (PULSE-20).
    params.append('period', period)
  } else {
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
  }
  const query = params.toString()
  return apiRequest<UptimeStatusResponse>(sitePath(site, `/uptime/status${query ? `?${query}` : ''}`))
}

/**
 * Fetches incident episodes overlapping the range, newest first. The default
 * limit is the API's maximum — the ledger states its count as fact, so it
 * fetches as much fact as the API allows and labels the cutoff if it hits it.
 */
export async function getUptimeIncidents(site: SiteRef, startDate: string, endDate: string, limit = 200, period?: UptimePeriodToken): Promise<UptimeIncidentsResponse> {
  return apiRequest<UptimeIncidentsResponse>(sitePath(site, `/uptime/incidents?${rangeQuery(startDate, endDate, period)}&limit=${limit}`))
}

/**
 * Fetches the server-bucketed latency series + range summary for a monitor.
 */
export async function getUptimeResponseTimes(site: SiteRef, monitorId: string, startDate: string, endDate: string, period?: UptimePeriodToken): Promise<UptimeResponseTimesResponse> {
  return apiRequest<UptimeResponseTimesResponse>(sitePath(site, `/uptime/monitors/${monitorId}/response-times?${rangeQuery(startDate, endDate, period)}`))
}

/**
 * Fetches recent checks for a specific monitor.
 */
export async function getMonitorChecks(site: SiteRef, monitorId: string, limit = 50): Promise<UptimeCheck[]> {
  const res = await apiRequest<{ checks: UptimeCheck[] }>(sitePath(site, `/uptime/monitors/${monitorId}/checks?limit=${limit}`))
  return res?.checks ?? []
}

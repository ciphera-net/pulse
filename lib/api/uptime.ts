import apiRequest from './client'

// * Types for uptime monitoring

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
  created_at: string
  updated_at: string
}

export interface UptimeCheck {
  id: string
  monitor_id: string
  status: 'up' | 'down' | 'degraded'
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
}

/**
 * Fetches the uptime status overview for all monitors of a site
 */
export async function getUptimeStatus(siteId: string, startDate?: string, endDate?: string): Promise<UptimeStatusResponse> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  const query = params.toString()
  return apiRequest<UptimeStatusResponse>(`/sites/${siteId}/uptime/status${query ? `?${query}` : ''}`)
}

/**
 * Fetches recent checks for a specific monitor
 */
export async function getMonitorChecks(siteId: string, monitorId: string, limit = 50): Promise<UptimeCheck[]> {
  const res = await apiRequest<{ checks: UptimeCheck[] }>(`/sites/${siteId}/uptime/monitors/${monitorId}/checks?limit=${limit}`)
  return res?.checks ?? []
}

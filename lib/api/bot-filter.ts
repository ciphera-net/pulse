import apiRequest from './client'

export interface SessionSummary {
  session_id: string
  pageviews: number
  duration: number | null
  first_page: string
  referrer: string | null
  country: string | null
  city: string | null
  region: string | null
  browser: string | null
  os: string | null
  screen_resolution: string | null
  first_seen: string
  bot_filtered: boolean
  suspicion_score: number
}

export interface BotFilterStats {
  filtered_sessions: number
  filtered_events: number
  auto_blocked_this_month: number
}

function buildQuery(opts: { startDate?: string; endDate?: string; suspicious?: boolean; limit?: number }): string {
  const params = new URLSearchParams()
  if (opts.startDate) params.append('start_date', opts.startDate)
  if (opts.endDate) params.append('end_date', opts.endDate)
  if (opts.suspicious) params.append('suspicious', 'true')
  if (opts.limit != null) params.append('limit', opts.limit.toString())
  const q = params.toString()
  return q ? `?${q}` : ''
}

export function listSessions(siteId: string, startDate: string, endDate: string, suspiciousOnly?: boolean, limit?: number): Promise<{ sessions: SessionSummary[] }> {
  return apiRequest<{ sessions: SessionSummary[] }>(`/sites/${siteId}/sessions${buildQuery({ startDate, endDate, suspicious: suspiciousOnly, limit })}`)
}

export function botFilterSessions(siteId: string, sessionIds: string[]): Promise<{ updated: number }> {
  return apiRequest<{ updated: number }>(`/sites/${siteId}/bot-filter`, {
    method: 'POST',
    body: JSON.stringify({ session_ids: sessionIds }),
  })
}

export function botUnfilterSessions(siteId: string, sessionIds: string[]): Promise<{ updated: number }> {
  return apiRequest<{ updated: number }>(`/sites/${siteId}/bot-filter`, {
    method: 'DELETE',
    body: JSON.stringify({ session_ids: sessionIds }),
  })
}

export function getBotFilterStats(siteId: string): Promise<BotFilterStats> {
  return apiRequest<BotFilterStats>(`/sites/${siteId}/bot-filter/stats`)
}

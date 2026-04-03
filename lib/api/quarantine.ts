import apiRequest from './client'

// ============================================================================
// Types
// ============================================================================

export interface QuarantinedEvent {
  id: string
  session_id: string
  event_name: string
  path: string
  referrer: string | null
  country: string | null
  city: string | null
  region: string | null
  browser: string | null
  os: string | null
  screen_resolution: string | null
  timestamp: string
  created_at: string
  duration: number | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  detection_reason: string
  detection_method: string
  confidence_score: number
  detection_metadata: Record<string, string>
  quarantined_at: string
}

export interface QuarantineStats {
  total_quarantined: number
  by_reason: Record<string, number>
  by_method: Record<string, number>
  last_24h: number
  last_7d: number
  last_30d: number
}

export interface DomainReputation {
  domain: string
  total_events: number
  bot_events: number
  bot_ratio: number
  confidence: string
  action: string
  source: string
  first_seen: string
  last_seen: string
  updated_at: string
  override: string | null
}

export interface ReputationStats {
  total_domains: number
  auto_quarantined: number
  seed_domains: number
  learned_domains: number
  manual_overrides: number
}

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
  quarantined: boolean
  suspicion_score: number
}

export interface QuarantineFilters {
  reason?: string
  method?: string
  referrer_domain?: string
  start_date?: string
  end_date?: string
  limit?: number
  offset?: number
}

// ============================================================================
// Per-site endpoints
// ============================================================================

export async function getQuarantineStats(siteId: string): Promise<QuarantineStats> {
  return apiRequest(`/sites/${siteId}/quarantine/stats`)
}

export async function getQuarantineEvents(
  siteId: string,
  filters?: QuarantineFilters
): Promise<{ events: QuarantinedEvent[]; total: number }> {
  const params = new URLSearchParams()
  if (filters?.reason) params.set('reason', filters.reason)
  if (filters?.method) params.set('method', filters.method)
  if (filters?.referrer_domain) params.set('referrer_domain', filters.referrer_domain)
  if (filters?.start_date) params.set('start_date', filters.start_date)
  if (filters?.end_date) params.set('end_date', filters.end_date)
  if (filters?.limit) params.set('limit', String(filters.limit))
  if (filters?.offset) params.set('offset', String(filters.offset))
  const qs = params.toString()
  return apiRequest(`/sites/${siteId}/quarantine/events${qs ? `?${qs}` : ''}`)
}

export async function quarantineSessions(
  siteId: string,
  sessionIds: string[]
): Promise<{ updated: number }> {
  return apiRequest(`/sites/${siteId}/quarantine`, {
    method: 'POST',
    body: JSON.stringify({ session_ids: sessionIds }),
  })
}

export async function restoreSessions(
  siteId: string,
  sessionIds: string[]
): Promise<{ updated: number }> {
  return apiRequest(`/sites/${siteId}/quarantine`, {
    method: 'DELETE',
    body: JSON.stringify({ session_ids: sessionIds }),
  })
}

export async function listSessions(
  siteId: string,
  params?: { start_date?: string; end_date?: string; suspicious?: boolean; limit?: number }
): Promise<{ sessions: SessionSummary[] }> {
  const searchParams = new URLSearchParams()
  if (params?.start_date) searchParams.set('start_date', params.start_date)
  if (params?.end_date) searchParams.set('end_date', params.end_date)
  if (params?.suspicious) searchParams.set('suspicious', 'true')
  if (params?.limit) searchParams.set('limit', String(params.limit))
  const qs = searchParams.toString()
  return apiRequest(`/sites/${siteId}/sessions${qs ? `?${qs}` : ''}`)
}

export async function getSiteDomainReputation(
  siteId: string,
  params?: { limit?: number; offset?: number }
): Promise<{ domains: DomainReputation[] }> {
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.offset) searchParams.set('offset', String(params.offset))
  const qs = searchParams.toString()
  return apiRequest(`/sites/${siteId}/quarantine/domains${qs ? `?${qs}` : ''}`)
}

export async function createDomainOverride(
  siteId: string,
  domain: string,
  action: 'allow' | 'quarantine'
): Promise<void> {
  return apiRequest(`/sites/${siteId}/quarantine/domains/${encodeURIComponent(domain)}/override`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export async function deleteDomainOverride(
  siteId: string,
  domain: string
): Promise<void> {
  return apiRequest(`/sites/${siteId}/quarantine/domains/${encodeURIComponent(domain)}/override`, {
    method: 'DELETE',
  })
}

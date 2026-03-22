import apiRequest from './client'

// * Types for PageSpeed Insights monitoring

export interface PageSpeedConfig {
  site_id: string
  enabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly'
  url: string | null
  next_check_at: string | null
  created_at: string
  updated_at: string
}

export interface AuditSummary {
  id: string
  title: string
  description: string
  score: number | null
  display_value?: string
  savings_ms?: number
  category: 'opportunity' | 'diagnostic' | 'passed'
  details?: AuditDetailItem[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuditDetailItem = Record<string, any>

export interface FilmstripFrame {
  timing: number
  data: string
}

export interface PageSpeedCheck {
  id: string
  site_id: string
  strategy: 'mobile' | 'desktop'
  performance_score: number | null
  accessibility_score: number | null
  best_practices_score: number | null
  seo_score: number | null
  lcp_ms: number | null
  cls: number | null
  tbt_ms: number | null
  fcp_ms: number | null
  si_ms: number | null
  tti_ms: number | null
  audits: AuditSummary[] | null
  screenshot?: string | null
  filmstrip?: FilmstripFrame[] | null
  triggered_by: 'scheduled' | 'manual'
  checked_at: string
}

export async function getPageSpeedConfig(siteId: string): Promise<PageSpeedConfig> {
  return apiRequest<PageSpeedConfig>(`/sites/${siteId}/pagespeed/config`)
}

export async function updatePageSpeedConfig(
  siteId: string,
  config: { enabled: boolean; frequency: string; url?: string }
): Promise<PageSpeedConfig> {
  return apiRequest<PageSpeedConfig>(`/sites/${siteId}/pagespeed/config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

export async function getPageSpeedLatest(siteId: string): Promise<PageSpeedCheck[]> {
  const res = await apiRequest<{ checks: PageSpeedCheck[] }>(`/sites/${siteId}/pagespeed/latest`)
  return res?.checks ?? []
}

export async function getPageSpeedHistory(
  siteId: string,
  strategy: 'mobile' | 'desktop' = 'mobile',
  days = 90
): Promise<PageSpeedCheck[]> {
  const res = await apiRequest<{ checks: PageSpeedCheck[] }>(
    `/sites/${siteId}/pagespeed/history?strategy=${strategy}&days=${days}`
  )
  return res?.checks ?? []
}

export async function getPageSpeedCheck(siteId: string, checkId: string): Promise<PageSpeedCheck> {
  return apiRequest<PageSpeedCheck>(`/sites/${siteId}/pagespeed/checks/${checkId}`)
}

// * Triggers an async PageSpeed check. Returns immediately (202).
// * Caller should poll getPageSpeedLatest() for results.
export async function triggerPageSpeedCheck(siteId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/pagespeed/check`, { method: 'POST' })
}

import apiRequest from './client'

// * Types for PageSpeed monitoring.
// *
// * Checks are produced by a self-hosted Lighthouse runner (since 14-08-2026),
// * not the Google PageSpeed Insights API. One stored check is the MEDIAN of
// * three runs, selected as one coherent run — see `runs` / `runs_detail`.

export interface PageSpeedConfig {
  site_id: string
  enabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly'
  next_check_at: string | null
  created_at: string
  updated_at: string
}

// * There is deliberately no `description`. Lighthouse's description prose is a
// * pure function of the Lighthouse version — ~33 KB of identical English that
// * used to be re-stored on every row. It now ships once in the bundle
// * (lib/pagespeed/audit-descriptions.json) and is resolved by audit id.
export interface AuditSummary {
  id: string
  title: string
  score: number | null
  display_value?: string
  savings_ms?: number
  category: 'opportunity' | 'diagnostic' | 'passed' | 'manual'
  group?: string // "performance", "accessibility", "best-practices", "seo"
  sub_group?: string // "a11y-names-labels", "a11y-contrast", etc.
  sub_group_title?: string // "Names and Labels", "Contrast", etc.
  details?: AuditDetailItem[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuditDetailItem = Record<string, any>

export interface FilmstripFrame {
  timing: number
  data: string
}

// * One run's headline numbers. Three of these back every stored check, so the
// * spread behind a median stays inspectable rather than being a number you have
// * to take on trust.
export interface RunSummary {
  run: number
  perf: number | null
  lcp_ms: number | null
  selected: boolean
}

export type PageSpeedStatus = 'ok' | 'error'
export type PageSpeedSource = 'psi' | 'lighthouse'

export interface PageSpeedCheck {
  id: string
  site_id: string
  strategy: 'mobile' | 'desktop'

  // * Provenance. `lighthouse_version` and `runs` are null on every row written
  // * before the cutover — unknown is the honest value there, not a guess, and
  // * the trend chart draws its boundary annotation off exactly these fields.
  source: PageSpeedSource
  status: PageSpeedStatus
  error: string | null
  lighthouse_version: string | null
  runs: number | null
  runs_detail?: RunSummary[] | null

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

// * The most recent check ATTEMPT for a strategy, whatever its outcome.
// *
// * This is not the same thing as the most recent successful check, and the
// * distinction is the whole point: the status line reports what happened last,
// * while the gauges show the last numbers that actually exist. Conflating them
// * is how the page used to present a stale check as current.
export interface PageSpeedAttempt {
  id: string
  strategy: 'mobile' | 'desktop'
  source: PageSpeedSource
  status: PageSpeedStatus
  error: string | null
  lighthouse_version: string | null
  runs: number | null
  triggered_by: 'scheduled' | 'manual'
  checked_at: string
}

export interface PageSpeedLatest {
  /** Most recent SUCCESSFUL check per strategy — the numbers to render. */
  checks: PageSpeedCheck[]
  /** Most recent attempt per strategy, successful or failed. */
  attempts: PageSpeedAttempt[]
}

export async function getPageSpeedConfig(siteId: string): Promise<PageSpeedConfig> {
  return apiRequest<PageSpeedConfig>(`/sites/${siteId}/pagespeed/config`)
}

export async function updatePageSpeedConfig(
  siteId: string,
  config: { enabled: boolean; frequency: string }
): Promise<PageSpeedConfig> {
  return apiRequest<PageSpeedConfig>(`/sites/${siteId}/pagespeed/config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

export async function getPageSpeedLatest(siteId: string): Promise<PageSpeedLatest> {
  const res = await apiRequest<PageSpeedLatest>(`/sites/${siteId}/pagespeed/latest`)
  return { checks: res?.checks ?? [], attempts: res?.attempts ?? [] }
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

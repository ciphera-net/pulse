import apiRequest from './client'

// * Types for Performance monitoring.
// *
// * Checks are produced by a self-hosted Lighthouse runner (since 14-08-2026),
// * not the Google PageSpeed Insights API. One stored check is the MEDIAN of
// * three runs, selected as one coherent run — see `runs` / `runs_detail`.

export interface PerformanceConfig {
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

export type PerformanceStatus = 'ok' | 'error'
export type PerformanceSource = 'psi' | 'lighthouse'

export interface PerformanceCheck {
  id: string
  site_id: string
  strategy: 'mobile' | 'desktop'

  // * Provenance. `lighthouse_version` and `runs` are null on every row written
  // * before the cutover — unknown is the honest value there, not a guess, and
  // * the trend chart draws its boundary annotation off exactly these fields.
  source: PerformanceSource
  status: PerformanceStatus
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
export interface PerformanceAttempt {
  id: string
  strategy: 'mobile' | 'desktop'
  source: PerformanceSource
  status: PerformanceStatus
  error: string | null
  lighthouse_version: string | null
  runs: number | null
  triggered_by: 'scheduled' | 'manual'
  checked_at: string
}

export interface PerformanceLatest {
  /** Most recent SUCCESSFUL check per strategy — the numbers to render. */
  checks: PerformanceCheck[]
  /** Most recent attempt per strategy, successful or failed. */
  attempts: PerformanceAttempt[]
}

export async function getPerformanceConfig(siteId: string): Promise<PerformanceConfig> {
  return apiRequest<PerformanceConfig>(`/sites/${siteId}/performance/config`)
}

export async function updatePerformanceConfig(
  siteId: string,
  config: { enabled: boolean; frequency: string }
): Promise<PerformanceConfig> {
  return apiRequest<PerformanceConfig>(`/sites/${siteId}/performance/config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

export async function getPerformanceLatest(siteId: string): Promise<PerformanceLatest> {
  const res = await apiRequest<PerformanceLatest>(`/sites/${siteId}/performance/latest`)
  return { checks: res?.checks ?? [], attempts: res?.attempts ?? [] }
}

export async function getPerformanceHistory(
  siteId: string,
  strategy: 'mobile' | 'desktop' = 'mobile',
  days = 90
): Promise<PerformanceCheck[]> {
  const res = await apiRequest<{ checks: PerformanceCheck[] }>(
    `/sites/${siteId}/performance/history?strategy=${strategy}&days=${days}`
  )
  return res?.checks ?? []
}

export async function getPerformanceCheck(siteId: string, checkId: string): Promise<PerformanceCheck> {
  return apiRequest<PerformanceCheck>(`/sites/${siteId}/performance/checks/${checkId}`)
}

// * Triggers an async Performance check. Returns immediately (202).
// * Caller should poll getPerformanceLatest() for results.
export async function triggerPerformanceCheck(siteId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/performance/check`, { method: 'POST' })
}

// * The newest full-page capture for a site (the scroll-depth card's
// * backdrop). 404 = no capture yet (Performance disabled, or no check since
// * the backend started keeping them) — the card falls back; callers map it
// * to null rather than treating it as a failure.
export interface PagePreview {
  screenshot: string // webp data URI
  width: number
  height: number
  strategy: string
  checked_at: string
}

export async function getPagePreview(siteId: string): Promise<PagePreview | null> {
  try {
    return await apiRequest<PagePreview>(`/sites/${siteId}/performance/page-preview`)
  } catch (e) {
    if ((e as { status?: number })?.status === 404) return null
    throw e
  }
}

// The anonymous twin (02-09-2026): the share surface's scroll-depth card
// carries the same backdrop as the authed one. Serves only is_public sites —
// the capture is a screenshot of the site's own public page, never visitor
// data. 404 (no capture, or site not public) is the card's fallback state.
export async function getPublicPagePreview(siteId: string): Promise<PagePreview | null> {
  try {
    return await apiRequest<PagePreview>(`/public/sites/${siteId}/page-preview`)
  } catch (e) {
    if ((e as { status?: number })?.status === 404) return null
    throw e
  }
}

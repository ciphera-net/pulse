import apiRequest, { ApiError, apiRequestBlob } from './client'

// ---------------------------------------------------------------------------
// Reports (PULSE-133) and scheduled report emails (PULSE-134), design §5.3,
// §6.1 (D1, D2, D4, D7) and §6.1b (R2, R3, R5).
//
// A report is FROZEN at creation: pulse-backend computes its payload once and
// stores it, so a link sent in March still says what it said in March. This
// module only asks for one, lists them, and reads one back; it never computes
// a number. The payload below is that stored JSON (version 1), rendered as
// slides by components/reports/ReportSlides.
//
// No privacy floor (owner ruling D2): a shared report shows every row exactly
// as the member sees it on the dashboard.
// ---------------------------------------------------------------------------

/** The slides a report can carry, in the order they are shown. */
export const REPORT_SECTIONS = ['headline', 'growth', 'sources', 'content', 'devices', 'goals'] as const
export type ReportSection = typeof REPORT_SECTIONS[number]

export type ReportCompare = 'previous' | 'year' | 'none'
export type ReportPdfTheme = 'light' | 'dark'
export type ReportPreset = 'last_30_days' | 'last_90_days' | 'last_month' | 'last_quarter' | 'year_to_date'
/** A preset the server resolves in the site's calendar, or two site-local days. */
export type ReportPeriod = { preset: ReportPreset } | { from: string; to: string }
/** Days until the link closes; null is never. */
export type ReportExpiry = 7 | 30 | 90 | null
export type ReportEvery = 'month' | 'quarter'

export interface CreateReportRequest {
  name: string
  period: ReportPeriod
  compare: ReportCompare
  sections: readonly ReportSection[]
  pdf_theme: ReportPdfTheme
  /** null is "anyone with the link". */
  password: string | null
  expires_in_days: ReportExpiry
}

/** A report as the member list shows it. `url` is null once the link is closed by a delete. */
export interface Report {
  id: string
  name: string
  from: string
  to: string
  compare: ReportCompare
  pdf_theme: ReportPdfTheme
  expires_at: string | null
  revoked_at: string | null
  created_at: string
  has_password: boolean
  schedule_id: string | null
  url: string | null
}

export interface CreateScheduleRequest {
  name: string
  every: ReportEvery
  compare: ReportCompare
  sections: readonly ReportSection[]
  pdf_theme: ReportPdfTheme
  expires_in_days: 30 | 90 | null
  /** Current members of the site's team only (D7). */
  recipient_user_ids: readonly string[]
}

export interface ReportSchedule {
  id: string
  name: string
  every: ReportEvery
  compare: ReportCompare
  sections: ReportSection[]
  pdf_theme: ReportPdfTheme
  expires_in_days: number | null
  recipient_user_ids: string[]
  next_run_at: string
  last_run_at: string | null
  created_at: string
}

// ─── The frozen payload (version 1) ─────────────────────────────────────────

export interface ReportChange {
  value: number
  unit: '%' | 'pp'
}

/** One headline number: this period, the comparison period, and the change. Null is "not measured", never 0. */
export interface ReportMetric {
  value: number | null
  previous: number | null
  change: ReportChange | null
}

export interface ReportPayload {
  version: 1
  name: string
  site: { domain: string; name: string }
  timezone: string
  frozen_at: string
  period: { from: string; to: string; label: string }
  compare: { mode: ReportCompare; from: string; to: string; label: string } | null
  sections: ReportSection[]
  headline?: {
    visitors: ReportMetric
    visits: ReportMetric
    pageviews: ReportMetric
    bounce_rate: ReportMetric
    visit_duration: ReportMetric
    top_goal: { label: string; value: number | null; previous: number | null; change: ReportChange | null } | null
  }
  growth?: {
    months: { month: string; visitors: number | null; instrument: 'measured' | 'imported'; partial: boolean }[]
    month_change: ReportChange | null
  }
  sources?: {
    channels: { name: string; visitors: number; share: number }[]
    referrers: { name: string; visitors: number; share: number }[]
  }
  content?: {
    pages: { path: string; visitors: number }[]
    countries: { code: string; name: string; visitors: number; share: number }[]
  }
  devices?: { name: string; share: number }[]
  goals?: { name: string; conversions: number; visitors: number; rate: number }[]
  notes: string[]
}

// ─── Member routes ──────────────────────────────────────────────────────────

export async function createReport(siteId: string, request: CreateReportRequest): Promise<{ report: Report; url: string }> {
  return apiRequest<{ report: Report; url: string }>(`/sites/${siteId}/reports`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export async function listReports(siteId: string): Promise<Report[]> {
  const data = await apiRequest<{ reports: Report[] | null }>(`/sites/${siteId}/reports`)
  return data.reports ?? []
}

/** Closes the link and deletes the report's numbers and cached PDFs. */
export async function deleteReport(siteId: string, reportId: string): Promise<void> {
  await apiRequest<void>(`/sites/${siteId}/reports/${reportId}`, { method: 'DELETE' })
}

export async function createSchedule(siteId: string, request: CreateScheduleRequest): Promise<ReportSchedule> {
  const data = await apiRequest<{ schedule: ReportSchedule }>(`/sites/${siteId}/report-schedules`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
  return data.schedule
}

export async function listSchedules(siteId: string): Promise<ReportSchedule[]> {
  const data = await apiRequest<{ schedules: ReportSchedule[] | null }>(`/sites/${siteId}/report-schedules`)
  return data.schedules ?? []
}

/** Stops the emails. Reports already sent keep their own links. */
export async function stopSchedule(siteId: string, scheduleId: string): Promise<void> {
  await apiRequest<void>(`/sites/${siteId}/report-schedules/${scheduleId}`, { method: 'DELETE' })
}

/** A report name as a file name: "Investor update, September 2026" → "investor-update-september-2026.pdf". */
export function reportPdfFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'pulse-report'}.pdf`
}

function saveBlob(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(blobUrl)
}

/** The member's copy of a report's PDF (the invoice PDF's pattern, lib/api/billing.ts). */
export async function downloadReportPdf(siteId: string, report: Pick<Report, 'id' | 'name'>): Promise<void> {
  const { blob, filename } = await apiRequestBlob(`/sites/${siteId}/reports/${report.id}/pdf`)
  saveBlob(blob, filename ?? reportPdfFilename(report.name))
}

// ─── Public routes (anonymous) ──────────────────────────────────────────────

export type PublicReportResult =
  | { status: 'ok'; report: ReportPayload; name: string; pdf_theme: ReportPdfTheme }
  | { status: 'password_required' }
  /** Missing, expired and closed all read the same: the route is no existence oracle. */
  | { status: 'not_found' }

function publicPath(token: string): string {
  return `/public/reports/${encodeURIComponent(token)}`
}

/**
 * Reads a shared report. `printKey` is the 5-minute key pulse-backend hands the
 * PDF runner; it stands in for the password on the print route only.
 * Anything but 200, 401 and 404 is thrown (a network failure or a 5xx is not
 * "this report does not exist").
 */
export async function getPublicReport(token: string, printKey?: string | null): Promise<PublicReportResult> {
  const query = printKey ? `?pk=${encodeURIComponent(printKey)}` : ''
  try {
    const data = await apiRequest<{ report: ReportPayload; name: string; pdf_theme: ReportPdfTheme }>(
      `${publicPath(token)}${query}`,
      { skipAuthRetry: true },
    )
    return { status: 'ok', report: data.report, name: data.name, pdf_theme: data.pdf_theme }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return { status: 'password_required' }
    if (err instanceof ApiError && err.status === 404) return { status: 'not_found' }
    throw err
  }
}

/**
 * Unlocks a password-protected report for this browser: the server answers 204
 * and sets an HttpOnly cookie scoped to this report for an hour. Returns false
 * on a wrong password; anything else is thrown.
 */
export async function unlockPublicReport(token: string, password: string): Promise<boolean> {
  try {
    await apiRequest<void>(`${publicPath(token)}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ password }),
      skipAuthRetry: true,
    })
    return true
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return false
    throw err
  }
}

export async function downloadPublicReportPdf(token: string, name: string): Promise<void> {
  const { blob, filename } = await apiRequestBlob(`${publicPath(token)}/pdf`, { skipAuthRetry: true })
  saveBlob(blob, filename ?? reportPdfFilename(name))
}

/** The server's own words from a failed call, or the fallback. */
export function serverMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const said = err.data?.error ?? err.data?.message
    if (typeof said === 'string' && said.trim()) return said
  }
  return fallback
}

import type { UptimeIncident, UptimeResponseTimeBucket } from '@/lib/api/uptime'
import { zoneDayKey, zoneDayStartMs, zoneParts, shiftDayKey } from '@/lib/utils/siteTime'

// ---------------------------------------------------------------------------
// The uptime page's metric grammar and series shaping. Mirrors
// components/search/searchMetrics.ts: rows are toggled via ?m= (comma list in
// METRIC_ORDER order, default set stays out of the URL, at least one row
// always plotted). The series is the server-bucketed response-times endpoint —
// the server owns hour/day granularity and echoes it; this module never
// re-buckets, it only reshapes wire buckets for the strips.
// ---------------------------------------------------------------------------

export type UptimeMetricKey = 'availability' | 'response' | 'checks'
export const UPTIME_METRIC_ORDER: UptimeMetricKey[] = ['availability', 'response', 'checks']
export const UPTIME_METRIC_LABEL: Record<UptimeMetricKey, string> = {
  availability: 'Availability',
  response: 'Response time',
  checks: 'Checks',
}
export const UPTIME_DEFAULT_ACTIVE: UptimeMetricKey[] = ['availability', 'response']

export function parseUptimeMetrics(raw: string | null): UptimeMetricKey[] {
  if (!raw) return UPTIME_DEFAULT_ACTIVE
  const keys = raw.split(',').filter((k): k is UptimeMetricKey => UPTIME_METRIC_ORDER.includes(k as UptimeMetricKey))
  if (keys.length === 0) return UPTIME_DEFAULT_ACTIVE
  return UPTIME_METRIC_ORDER.filter((k) => keys.includes(k))
}

export function serializeUptimeMetrics(keys: UptimeMetricKey[]): string | null {
  const ordered = UPTIME_METRIC_ORDER.filter((k) => keys.includes(k))
  if (ordered.length === UPTIME_DEFAULT_ACTIVE.length && ordered.every((k, i) => k === UPTIME_DEFAULT_ACTIVE[i])) {
    return null
  }
  return ordered.join(',')
}

// ─── Series ──────────────────────────────────────────────────────

export interface UptimePoint {
  date: Date
  samples: number
  up: number
  failed: number
  degraded: number
  avgMs: number | null
  p95Ms: number | null
}

export function toUptimeSeries(buckets: UptimeResponseTimeBucket[]): UptimePoint[] {
  return buckets.map((b) => ({
    date: new Date(b.bucket_start.endsWith('Z') ? b.bucket_start : b.bucket_start + 'Z'),
    samples: b.samples,
    up: Math.max(0, b.samples - b.failed_checks - b.degraded_checks),
    failed: b.failed_checks,
    degraded: b.degraded_checks,
    avgMs: b.avg_response_time_ms,
    p95Ms: b.p95_response_time_ms,
  }))
}

// * Range availability from the SAME buckets the strips draw — one source of
// * truth for the panel. Semantics match the server's daily aggregation:
// * degraded is not "up", so it counts against availability.
export function seriesUptimePct(series: UptimePoint[]): number | null {
  const total = series.reduce((n, p) => n + p.samples, 0)
  if (total === 0) return null
  const up = series.reduce((n, p) => n + p.up, 0)
  return (up / total) * 100
}

// ─── Range anchoring ─────────────────────────────────────────────

// * presetZoneRange: the uptime API reads start_date/end_date as SITE-timezone
// * calendar days (22-08-2026 alignment, superseding decision D5), while
// * useUrlDateRange builds VIEWER-local date strings. For preset ranges the
// * window's LENGTH is what the preset means — so keep the span and re-anchor
// * its end to the site's CURRENT day, or a viewer west of the site keeps
// * asking for a site-day that already ended and the newest checks fall off.
// * Custom ranges pass through: an explicitly picked calendar day IS the
// * site's day, as labeled.
export function presetZoneRange(
  dateRange: { start: string; end: string },
  tz: string | null | undefined,
  now = new Date(),
): { start: string; end: string } {
  const spanDays = Math.round(
    (Date.parse(dateRange.end + 'T00:00:00Z') - Date.parse(dateRange.start + 'T00:00:00Z')) / 86_400_000,
  )
  if (!Number.isFinite(spanDays)) return dateRange
  const end = zoneDayKey(now, tz)
  return { start: shiftDayKey(end, -spanDays), end }
}

// * presetUtcRange is presetZoneRange's UTC-fixed ancestor. Since the
// * 22-08-2026 alignment ONLY the CDN page uses it (Bunny's stored days are
// * UTC days until the Phase C hourly rebuild) — uptime moved to
// * presetZoneRange above. The mechanism note survives in that function's
// * comment; the review finding it fixed is 13-08-2026's vanishing newest
// * day, west of the anchor zone.
export function presetUtcRange(dateRange: { start: string; end: string }, now = new Date()): { start: string; end: string } {
  const spanDays = Math.max(
    0,
    Math.round((Date.parse(dateRange.end) - Date.parse(dateRange.start)) / 86_400_000),
  )
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end.getTime() - spanDays * 86_400_000)
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return { start: fmt(start), end: fmt(end) }
}

// ─── Incident math ───────────────────────────────────────────────

export function incidentDurationSeconds(i: UptimeIncident, now = Date.now()): number {
  const start = new Date(i.started_at).getTime()
  const end = i.ended_at ? new Date(i.ended_at).getTime() : now
  return Math.max(0, Math.round((end - start) / 1000))
}

// * Downtime ATTRIBUTABLE TO THE RANGE: episode time is clipped to the window
// * before summing, so a 3-day-old outage doesn't report 72 h of downtime
// * under a 7-day view's "in this range" label. Rows still show their full
// * episode durations — the episode is a fact; the clipping is about what the
// * RANGE gets charged.
export function clippedDurationSeconds(i: UptimeIncident, rangeStartMs: number, rangeEndMs: number, now = Date.now()): number {
  const start = Math.max(new Date(i.started_at).getTime(), rangeStartMs)
  const end = Math.min(i.ended_at ? new Date(i.ended_at).getTime() : now, rangeEndMs)
  return Math.max(0, Math.round((end - start) / 1000))
}

export function totalDowntimeSeconds(incidents: UptimeIncident[], rangeStartMs: number, rangeEndMs: number, now = Date.now()): number {
  return incidents.reduce((n, i) => n + clippedDurationSeconds(i, rangeStartMs, rangeEndMs, now), 0)
}

// * The API range strings are SITE-timezone calendar days (22-08-2026): the
// * clipping window is [site midnight of start, site midnight after end),
// * capped at now. DST-aware via zoneDayStartMs — a fixed +24h on the end day
// * would mis-clip an incident by the transition hour twice a year.
export function rangeWindowMs(
  dateRange: { start: string; end: string },
  tz: string | null | undefined,
  now = Date.now(),
): { startMs: number; endMs: number } {
  const startMs = zoneDayStartMs(dateRange.start, tz)
  const endMs = Math.min(zoneDayStartMs(shiftDayKey(dateRange.end, 1), tz), now)
  return { startMs, endMs }
}

// ─── Formatters ──────────────────────────────────────────────────

export function fmtMs(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} s`
  return `${Math.round(v)} ms`
}

// * Floors, never rounds: 99.9996% with real failures must not present as
// * "100%" — that number is a claim the incidents ledger would contradict.
export function fmtUptimePct(v: number): string {
  if (v >= 100) return '100%'
  return `${(Math.floor(v * 100) / 100).toFixed(2)}%`
}

export function fmtDurationSeconds(s: number): string {
  if (s < 90) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 90) return `${m} m`
  const h = Math.floor(m / 60)
  return `${h} h ${String(m % 60).padStart(2, '0')} m`
}

// * Bucket label in the SITE's timezone (22-08-2026, superseding D5's UTC
// * labels); labeling in the VIEWER's local time would shift bars off their
// * days. Hourly buckets carry their DAY when the series spans more than one —
// * the server serves hourly granularity for ranges up to 8 days, and a bare
// * "14:00" axis across a week is eight identical days of labels.
export function bucketLabel(d: Date, granularity: 'hour' | 'day', tz: string | null | undefined, withDay = false): string {
  const p = zoneParts(d, tz)
  const pad = (n: number) => String(n).padStart(2, '0')
  const dayPart = `${pad(p.day)}/${pad(p.month)}`
  if (granularity === 'hour') {
    const hour = `${pad(p.hour)}:00`
    return withDay ? `${dayPart} ${hour}` : hour
  }
  return dayPart
}

export function seriesSpansMultipleDays(series: UptimePoint[], tz: string | null | undefined): boolean {
  if (series.length < 2) return false
  return zoneDayKey(series[0].date, tz) !== zoneDayKey(series[series.length - 1].date, tz)
}

// * Check timestamps in the site's timezone ("dd/MM HH:mm") — the page's one
// * time convention, stated once on the panel's axis row.
export function fmtCheckTime(iso: string, tz: string | null | undefined): string {
  const p = zoneParts(new Date(iso), tz)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(p.day)}/${pad(p.month)} ${pad(p.hour)}:${pad(p.minute)}`
}

// ─── Cause humanization ──────────────────────────────────────────

// * The checker records Go error strings verbatim ("request failed: Get
// * \"https://…\": context deadline exceeded") — debugging gold, terrible UI
// * copy. The ledger shows the handful of real failure modes in words a
// * human recognizes; the verbatim string survives on the row's tooltip.
export function humanizeCause(
  errorMessage: string | null,
  statusCode: number | null,
  timeoutSeconds?: number,
): string | null {
  if (errorMessage) {
    const m = errorMessage
    if (m.includes('context deadline exceeded') || m.includes('Client.Timeout')) {
      return timeoutSeconds ? `Timed out after ${timeoutSeconds} s` : 'Timed out'
    }
    if (m.includes('connection refused')) return 'Connection refused'
    if (m.includes('no such host')) return 'DNS lookup failed'
    if (m.includes('connection reset')) return 'Connection reset'
    if (m.includes('certificate') || m.includes('tls:') || m.includes('x509')) return 'TLS handshake failed'
    const slow = m.match(/slow response: (\d+)ms/)
    if (slow) return `Slow response (${fmtMs(Number(slow[1]))})`
    const code = m.match(/unexpected status code: (\d+) \(expected (\d+)\)/)
    if (code) return `Status ${code[1]} (expected ${code[2]})`
    return m
  }
  if (statusCode != null) return `Status ${statusCode}`
  return null
}

// ─── State colors (one place; semantic, not decoration) ──────────

export const UPTIME_POS = '#3ECF8E'
export const UPTIME_NEG = '#F8836B'
export const UPTIME_DEGRADED = '#fbbf24'

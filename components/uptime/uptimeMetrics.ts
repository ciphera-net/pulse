import type { UptimeIncident, UptimeResponseTimeBucket } from '@/lib/api/uptime'

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

// ─── Incident math ───────────────────────────────────────────────

export function incidentDurationSeconds(i: UptimeIncident, now = Date.now()): number {
  const start = new Date(i.started_at).getTime()
  const end = i.ended_at ? new Date(i.ended_at).getTime() : now
  return Math.max(0, Math.round((end - start) / 1000))
}

export function totalDowntimeSeconds(incidents: UptimeIncident[], now = Date.now()): number {
  return incidents.reduce((n, i) => n + incidentDurationSeconds(i, now), 0)
}

// ─── Formatters ──────────────────────────────────────────────────

export function fmtMs(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} s`
  return `${Math.round(v)} ms`
}

export function fmtUptimePct(v: number): string {
  return v >= 100 ? '100%' : `${v.toFixed(2)}%`
}

export function fmtDurationSeconds(s: number): string {
  if (s < 90) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 90) return `${m} m`
  const h = Math.floor(m / 60)
  return `${h} h ${String(m % 60).padStart(2, '0')} m`
}

// * Bucket label in UTC — the uptime subsystem's deliberate day convention
// * (decision D5); labeling in local time would shift bars off their days.
export function bucketLabelUTC(d: Date, granularity: 'hour' | 'day'): string {
  if (granularity === 'hour') {
    return `${String(d.getUTCHours()).padStart(2, '0')}:00`
  }
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

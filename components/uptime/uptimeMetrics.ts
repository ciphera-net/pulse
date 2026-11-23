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
  /** Checks of before 23-11-2026 that answered slowly or oddly. On neither side of availability. */
  degraded: number
  /** Checks that could not see the site (a bot check, a refusal). On neither side of availability. */
  unseen: number
  avgMs: number | null
  p95Ms: number | null
}

// A bucket_start with ANY zone designator (Z or ±hh:mm — the site-tz hourly
// buckets carry the site's offset since 22-08-2026) parses AS-IS; only a
// truly NAIVE string gets the UTC suffix. Appending 'Z' to an offset string
// mints an Invalid Date whose first Intl format throws RangeError — measured
// on prod taking the whole 7d view to its error boundary.
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/

export function toUptimeSeries(buckets: UptimeResponseTimeBucket[]): UptimePoint[] {
  return buckets.map((b) => ({
    date: new Date(HAS_ZONE.test(b.bucket_start) ? b.bucket_start : b.bucket_start + 'Z'),
    samples: b.samples,
    up: Math.max(0, b.samples - b.failed_checks - b.degraded_checks - (b.inconclusive_checks ?? 0)),
    failed: b.failed_checks,
    degraded: b.degraded_checks,
    unseen: b.inconclusive_checks ?? 0,
    avgMs: b.avg_response_time_ms,
    p95Ms: b.p95_response_time_ms,
  }))
}

// * Range availability from the SAME buckets the strips draw — one source of
// * truth for the panel. Semantics match the server's daily aggregation
// * (23-11-2026): the checks that found the site up over the checks that found
// * it up or down. A check that could not see the site is on neither side, and
// * neither is a 'degraded' one of before the rule. A range in which no check
// * saw the site has nothing to divide: null, never a fabricated 100.
export function seriesUptimePct(series: UptimePoint[]): number | null {
  const up = series.reduce((n, p) => n + p.up, 0)
  const down = series.reduce((n, p) => n + p.failed, 0)
  if (up + down === 0) return null
  return (up / (up + down)) * 100
}

/** What a bucket's bar says: an outage beats everything, then whichever of "seen up" and "couldn't check" is the larger part. */
export type BucketState = 'none' | 'down' | 'unseen' | 'up'
export function bucketState(p: Pick<UptimePoint, 'samples' | 'up' | 'failed' | 'degraded' | 'unseen'>): BucketState {
  if (p.samples === 0) return 'none'
  if (p.failed > 0) return 'down'
  // * A legacy degraded check answered (slowly, or oddly): the site was seen.
  return p.unseen > p.up + p.degraded ? 'unseen' : 'up'
}

// ─── Range anchoring ─────────────────────────────────────────────

// * 19-09-2026: presetZoneRange (the 22-08 re-anchor of a trailing preset to
// * the site's current day) is GONE. useUrlDateRange now resolves every preset
// * against the site's wall clock, so the re-anchor had nothing left to do —
// * and it was no longer harmless: it decided "trailing" by comparing the
// * range's end to the BROWSER's today, and a site-anchored "yesterday" whose
// * date equals the viewer's today (a viewer west of the site) was rewritten
// * into the site's today. Measured on staging 19-09-2026 (verify-presets.mjs).
// * presetUtcRange (the UTC re-anchor the CDN page used) is GONE too, 25-09-2026: the
// * CDN page's view now runs on the UTC wall clock itself (useUrlDateRange timezone
// * 'UTC'), so its ranges are UTC days at the source and there is nothing to re-anchor.

// ─── Incident math ───────────────────────────────────────────────

// * Only a 'down' episode is an outage. An 'inconclusive' one is a stretch the
// * checker could not see the site, and a 'degraded' one predates 23-11-2026:
// * both are listed, neither is downtime.
export function isOutage(i: Pick<UptimeIncident, 'status'>): boolean {
  return i.status === 'down'
}

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

// * Outages only: time the checker could not see the site is not downtime.
export function totalDowntimeSeconds(incidents: UptimeIncident[], rangeStartMs: number, rangeEndMs: number, now = Date.now()): number {
  return incidents.filter(isOutage).reduce((n, i) => n + clippedDurationSeconds(i, rangeStartMs, rangeEndMs, now), 0)
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

// * The checker records what happened in fixed forms (pulse-backend
// * internal/uptime/classify.go and checker.go): Go error strings verbatim
// * ("request failed: Get \"https://…\": context deadline exceeded"), "bot
// * check: cloudflare (status 403)", "redirect not followed: 301 to host",
// * "too many redirects: …", "unexpected status code: N (expected M)" and,
// * before 23-11-2026, "slow response: Nms". Debugging gold, terrible UI
// * copy. The page shows each in words a human recognizes; the verbatim string
// * survives on the row's tooltip.
const BOT_CHECK_VENDOR: Record<string, string> = { cloudflare: 'Cloudflare', 'aws waf': 'AWS WAF' }

/** The statuses that answer our monitor, not the page: a visitor may well get the site (classify.go, refusesTheChecker). */
export function refusesTheMonitor(statusCode: number | null | undefined): boolean {
  return statusCode === 401 || statusCode === 403 || statusCode === 407 || statusCode === 429
}

function statusWords(code: number, expected?: string): string {
  if (code === 429) return 'Rate-limited our monitor (429)'
  if (refusesTheMonitor(code)) return `Refused our monitor (${code})`
  return expected ? `Status ${code} (expected ${expected})` : `Status ${code}`
}

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
    const bot = m.match(/^bot check: ([a-z ]+) \(status \d+\)/)
    if (bot) return `${BOT_CHECK_VENDOR[bot[1]] ?? 'A firewall'}'s bot check answered`
    const elsewhere = m.match(/^redirect not followed: \d+ to (\S+)/)
    if (elsewhere) return `Redirects to ${elsewhere[1]}`
    if (m.startsWith('redirect not followed')) return 'Redirects to another address'
    if (m.startsWith('too many redirects')) return 'Too many redirects'
    const slow = m.match(/slow response: (\d+)ms/)
    if (slow) return `Slow response (${fmtMs(Number(slow[1]))})`
    const code = m.match(/unexpected status code: (\d+) \(expected (\d+)\)/)
    if (code) return statusWords(Number(code[1]), code[2])
    return m
  }
  if (statusCode != null) return statusWords(statusCode)
  return null
}

// ─── State colors (one place; semantic, not decoration) ──────────

export const UPTIME_POS = '#3ECF8E'
export const UPTIME_NEG = '#F8836B'
export const UPTIME_DEGRADED = '#fbbf24'
// * "Couldn't check": neither good nor bad, so a neutral, lighter than the grid's "no check at all". The charts'
// * axis grey, by its variable, so it follows the theme (the same grey as before on dark).
export const UPTIME_UNSEEN = 'var(--chart-axis)'

/** The one fill rule of every availability bar on the page and on the dashboard's tile. */
export function bucketFill(state: BucketState): string {
  switch (state) {
    case 'none':
      return 'var(--chart-grid)'
    case 'down':
      return UPTIME_NEG
    case 'unseen':
      return UPTIME_UNSEEN
    case 'up':
      return UPTIME_POS
  }
}

// ─── The monitor, as a site's firewall sees it ────────────────────

// * What to allow so the monitor gets through a firewall. The address is the one every check leaves from (the
// * cluster's single outbound address, measured 23-11-2026); the user agent is the checker's own
// * (pulse-backend internal/uptime/checker.go). 🔴 Both are printed on the page for people to put in their
// * firewall rules: change either here only together with the thing itself.
export const MONITOR_ADDRESS = '179.237.92.73'
export const MONITOR_USER_AGENT = 'Pulse-Uptime-Monitor/1.0'

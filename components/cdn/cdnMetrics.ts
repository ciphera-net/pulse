import type { BunnyDailyRow } from '@/lib/api/bunny'
import type { PeriodPreset } from '@/lib/constants/periods'

// ---------------------------------------------------------------------------
// CDN instrument helpers. bunny_data rows are BUNNY's chart days, which are
// UTC calendar days (verified live: hourly buckets sum exactly to the daily
// bucket) — the same convention as Uptime, labeled once on each axis row and
// anchored by presetUtcRange on preset ranges.
// ---------------------------------------------------------------------------

export interface CdnPoint {
  date: Date
  /** Total bytes served (edge + origin). */
  bandwidth: number
  /** Bytes served from cache. */
  bandwidthCached: number
  /** Bytes the cache could not absorb — the origin's bill. */
  bandwidthOrigin: number
  requests: number
  requestsCached: number
  /** Request-based hit rate for the day; null when the day had no requests
   *  (a zero-request day has NO hit rate — never a fabricated 0%). */
  hitRate: number | null
  /** Daily average origin response; null when the day had no origin pulls
   *  reported (Bunny sends 0 for idle days — 0ms origin latency is not a
   *  measurement, it is absence). */
  originMs: number | null
  e3xx: number
  e4xx: number
  e5xx: number
}

export function toCdnSeries(rows: BunnyDailyRow[]): CdnPoint[] {
  return rows.map((d) => ({
    // * Parsed as UTC midnight so axis labels can render the UTC day verbatim.
    date: new Date(d.date + 'T00:00:00Z'),
    bandwidth: d.bandwidth_used,
    bandwidthCached: d.bandwidth_cached,
    bandwidthOrigin: Math.max(0, d.bandwidth_used - d.bandwidth_cached),
    requests: d.requests_served,
    requestsCached: d.requests_cached,
    hitRate: d.requests_served > 0 ? (d.requests_cached / d.requests_served) * 100 : null,
    originMs: d.origin_response_time_avg > 0 ? d.origin_response_time_avg : null,
    e3xx: d.error_3xx,
    e4xx: d.error_4xx,
    e5xx: d.error_5xx,
  }))
}

// ─── Status composition (the slim band) ─────────────────────────────

export interface StatusMix {
  total: number
  c2xx: number
  c3xx: number
  c4xx: number
  c5xx: number
}

/** Response-class composition over the loaded range, from the daily rows —
 *  the same source the strips draw, so band and strips can never disagree. */
export function statusMix(series: CdnPoint[]): StatusMix {
  let total = 0
  let c3xx = 0
  let c4xx = 0
  let c5xx = 0
  for (const p of series) {
    total += p.requests
    c3xx += p.e3xx
    c4xx += p.e4xx
    c5xx += p.e5xx
  }
  return { total, c2xx: Math.max(0, total - c3xx - c4xx - c5xx), c3xx, c4xx, c5xx }
}

// ─── Formatters ─────────────────────────────────────────────────────

/** Bytes → "1.5 GB". */
export function fmtBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  return value.toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

export function fmtHitRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(1) + '%'
}

export function fmtOriginMs(v: number | null): string {
  return v == null ? '—' : Math.round(v) + ' ms'
}

/** UTC day label for axes and tooltips — dd/mm, matching the family. */
export function cdnDayLabel(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

/** Full UTC date for tooltips: "Wed, 05 Aug 2026". */
export function cdnDayLabelLong(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// ─── Range vocabulary ───────────────────────────────────────────────

function utcRangeDaysBack(days: number): { start: string; end: string } {
  // * Anchored to the CURRENT UTC day — bunny_data days are UTC days; a
  // * local-calendar anchor west of UTC would silently drop the newest day
  // * (the presetUtcRange lesson from Uptime, applied at the source here).
  const end = new Date()
  const endStr = end.toISOString().slice(0, 10)
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  const startStr = start.toISOString().slice(0, 10)
  return { start: startStr, end: endStr }
}

// * The page's ONE range control. Exclusive: Pulse's global "Today"/"24h"
// * presets are promises a daily-granular source cannot keep. Ranges beyond
// * ~13 months just run out of data (backfill depth) — the chart ends where
// * history ends, no plan-gating UI.
export const CDN_PICKER_PRESETS: { group: string; presets: PeriodPreset[]; exclusive: boolean } = {
  group: 'CDN ranges',
  exclusive: true,
  presets: [
    { key: '7', label: 'Last 7 days', group: 'CDN ranges', resolve: () => utcRangeDaysBack(7) },
    { key: '30', label: 'Last 30 days', group: 'CDN ranges', resolve: () => utcRangeDaysBack(30) },
    { key: '3m', label: 'Last 3 months', group: 'CDN ranges', resolve: () => utcRangeDaysBack(90) },
    { key: '6m', label: 'Last 6 months', group: 'CDN ranges', resolve: () => utcRangeDaysBack(180) },
    { key: '12m', label: 'Last 12 months', group: 'CDN ranges', resolve: () => utcRangeDaysBack(365) },
  ],
}

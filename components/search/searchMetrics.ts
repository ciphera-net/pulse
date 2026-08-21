import type { GSCDailyTotal, GSCOverview } from '@/lib/api/gsc'

// ---------------------------------------------------------------------------
// Shared vocabulary for the Search Console instrument panel: the four metrics,
// the ?m= URL grammar for which are plotted, and the granularity rollup that
// turns the daily series into weekly/monthly buckets. Dates here are plain
// YYYY-MM-DD strings bucketed by Google in the property's own reporting
// timezone — rolling them up is pure date-string math, no timezone resolution.
// ---------------------------------------------------------------------------

export type MetricKey = 'clicks' | 'impressions' | 'ctr' | 'position'

export const METRIC_ORDER: MetricKey[] = ['clicks', 'impressions', 'ctr', 'position']

export const METRIC_LABEL: Record<MetricKey, string> = {
  clicks: 'Clicks',
  impressions: 'Impressions',
  ctr: 'Avg CTR',
  position: 'Avg position',
}

export const DEFAULT_ACTIVE: MetricKey[] = ['clicks', 'impressions']

// * ?m= grammar: comma list in METRIC_ORDER, e.g. ?m=clicks,position.
// * The default set stays out of the URL; unknown keys are dropped; an empty
// * or fully-invalid value falls back to the default (at least one metric is
// * always plotted).
export function parseActiveMetrics(raw: string | null): MetricKey[] {
  if (!raw) return DEFAULT_ACTIVE
  const keys = raw.split(',').filter((k): k is MetricKey => METRIC_ORDER.includes(k as MetricKey))
  if (keys.length === 0) return DEFAULT_ACTIVE
  return METRIC_ORDER.filter((k) => keys.includes(k))
}

export function serializeActiveMetrics(keys: MetricKey[]): string | null {
  const ordered = METRIC_ORDER.filter((k) => keys.includes(k))
  if (ordered.length === DEFAULT_ACTIVE.length && ordered.every((k, i) => k === DEFAULT_ACTIVE[i])) {
    return null
  }
  return ordered.join(',')
}

// * Engine-scoped variants of the same grammar: Bing's panel plots a SUBSET of
// * the metric vocabulary (its API has no position), so its ?bm= param
// * validates against its own order and default. The Google helpers above stay
// * as the canonical instance.
export function parseActiveSubset(raw: string | null, order: MetricKey[], dflt: MetricKey[]): MetricKey[] {
  if (!raw) return dflt
  const keys = raw.split(',').filter((k): k is MetricKey => order.includes(k as MetricKey))
  if (keys.length === 0) return dflt
  return order.filter((k) => keys.includes(k))
}

export function serializeActiveSubset(keys: MetricKey[], order: MetricKey[], dflt: MetricKey[]): string | null {
  const ordered = order.filter((k) => keys.includes(k))
  if (ordered.length === dflt.length && ordered.every((k, i) => k === dflt[i])) {
    return null
  }
  return ordered.join(',')
}

// ─── Granularity rollup ──────────────────────────────────────────

export type Granularity = 'daily' | 'weekly' | 'monthly'

export function parseGranularity(raw: string | null): Granularity {
  return raw === 'weekly' || raw === 'monthly' ? raw : 'daily'
}

export interface SeriesPoint {
  // * Bucket start date — daily: the day; weekly: its Monday; monthly: the 1st.
  date: Date
  clicks: number
  impressions: number
  ctr: number
  // * null when no day in the bucket carries a position (legacy-fallback data
  // * predating the gsc_daily sync) — the strip withholds the series entirely
  // * rather than plotting a fabricated 0.
  position: number | null
}

const dayDate = (isoDate: string) => new Date(isoDate + 'T00:00:00')

function bucketStart(isoDate: string, g: Granularity): string {
  if (g === 'daily') return isoDate
  const d = dayDate(isoDate)
  if (g === 'monthly') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }
  // * Weekly buckets start on Monday (getDay(): Sun=0 … Sat=6).
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// * Sums are exact; CTR is recomputed from the sums (never averaged); position
// * is impression-weighted over the days that have one, falling back to a plain
// * mean when those days carry zero impressions.
export function rollupSeries(daily: GSCDailyTotal[], g: Granularity): SeriesPoint[] {
  const buckets = new Map<string, GSCDailyTotal[]>()
  for (const row of daily) {
    const key = bucketStart(row.date, g)
    const list = buckets.get(key)
    if (list) list.push(row)
    else buckets.set(key, [row])
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, rows]) => {
      const clicks = rows.reduce((s, r) => s + r.clicks, 0)
      const impressions = rows.reduce((s, r) => s + r.impressions, 0)
      const withPos = rows.filter((r) => r.position != null)
      let position: number | null = null
      if (withPos.length > 0) {
        const weight = withPos.reduce((s, r) => s + r.impressions, 0)
        position =
          weight > 0
            ? withPos.reduce((s, r) => s + (r.position as number) * r.impressions, 0) / weight
            : withPos.reduce((s, r) => s + (r.position as number), 0) / withPos.length
      }
      return {
        date: dayDate(key),
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        position,
      }
    })
}

// ─── Display formatting ──────────────────────────────────────────

export function formatMetricValue(key: MetricKey, v: number): string {
  if (key === 'ctr') return `${(v * 100).toFixed(1)}%`
  if (key === 'position') return v.toFixed(1)
  return Intl.NumberFormat('en-US', { notation: v >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(v)
}

export function overviewValue(overview: GSCOverview, key: MetricKey): number {
  switch (key) {
    case 'clicks': return overview.total_clicks
    case 'impressions': return overview.total_impressions
    case 'ctr': return overview.avg_ctr
    case 'position': return overview.avg_position
  }
}

export function overviewPrev(overview: GSCOverview, key: MetricKey): number {
  switch (key) {
    case 'clicks': return overview.prev_clicks
    case 'impressions': return overview.prev_impressions
    case 'ctr': return overview.prev_avg_ctr
    case 'position': return overview.prev_avg_position
  }
}

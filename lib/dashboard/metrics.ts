import { formatNumber, formatDuration } from '@/lib/utils/format'

// ---------------------------------------------------------------------------
// The deck's selected metric, shared page-wide (deck metric propagation,
// design record 22-08-2026). The hero chart can show all six; the dimension
// blocks follow the five that exist per row — engagement is page-scoped, so
// blocks hold the last block-capable metric while it is selected.
// ---------------------------------------------------------------------------

export type MetricType = 'pageviews' | 'visitors' | 'pages_per_visit' | 'bounce_rate' | 'avg_duration' | 'engagement'
export type BlockMetric = Exclude<MetricType, 'engagement'>

export const METRIC_TYPES: MetricType[] = ['visitors', 'pageviews', 'pages_per_visit', 'bounce_rate', 'avg_duration', 'engagement']

export function isMetricType(v: string | null | undefined): v is MetricType {
  return !!v && (METRIC_TYPES as string[]).includes(v)
}

export function isBlockMetric(v: MetricType): v is BlockMetric {
  return v !== 'engagement'
}

/** The unit label a block shows beside its rows for the selected metric. */
export const BLOCK_METRIC_LABEL: Record<BlockMetric, string> = {
  visitors: 'visitors',
  pageviews: 'views',
  pages_per_visit: 'pages/visit',
  bounce_rate: 'bounce',
  avg_duration: 'duration',
}

/**
 * Rates over fewer than this many member sessions render as unmeasured — the
 * deck's "honest deltas, base ≥ 10" grammar extended to dimension rows: a
 * bounce rate over 2 sessions is fabricated precision.
 */
export const RATE_BASE_GUARD = 10

/** The fields a dimension row needs to display any block metric. `visitors`
 * is optional only for wire-compat with mid-deploy payloads — a missing count
 * is treated as 0 for math and renders guarded, never fabricated. */
export interface DimensionRateRow {
  pageviews: number
  visitors?: number
  bounce_rate?: number | null
  avg_duration?: number | null
}

/**
 * How one dimension row renders under the selected metric. `muted` marks the
 * unmeasured/guarded em dash so callers can dim it. Rows are always RANKED by
 * the server's count ordering — the metric changes the displayed number only.
 */
export function blockRowDisplay(metric: BlockMetric, row: DimensionRateRow): { text: string; muted: boolean } {
  switch (metric) {
    case 'visitors':
      return { text: formatNumber(row.visitors ?? 0), muted: false }
    case 'pageviews':
      return { text: formatNumber(row.pageviews), muted: false }
    case 'pages_per_visit':
      return (row.visitors ?? 0) > 0
        ? { text: (row.pageviews / (row.visitors ?? 0)).toFixed(1), muted: false }
        : { text: '—', muted: true }
    case 'bounce_rate':
      return row.bounce_rate == null || (row.visitors ?? 0) < RATE_BASE_GUARD
        ? { text: '—', muted: true }
        : { text: `${Math.round(row.bounce_rate)}%`, muted: false }
    case 'avg_duration':
      return row.avg_duration == null || (row.visitors ?? 0) < RATE_BASE_GUARD
        ? { text: '—', muted: true }
        : { text: formatDuration(Math.round(row.avg_duration)), muted: false }
  }
}

/**
 * Whether the displayed number is a count whose percent-of-total is meaningful.
 * Rate/ratio rows keep their share BAR on the block's ranking count (visual
 * hierarchy stays put) but show no percent.
 */
export function metricHasShare(metric: BlockMetric): boolean {
  return metric === 'visitors' || metric === 'pageviews'
}

/**
 * The count the share bar/percent math uses: the selected count for count
 * metrics, the block's own server-ranking count for rate/ratio metrics.
 */
export function shareValue(metric: BlockMetric, row: DimensionRateRow, rankingField: 'pageviews' | 'visitors'): number {
  if (metric === 'visitors' || metric === 'pageviews') return row[metric] ?? 0
  return row[rankingField] ?? 0
}

// ---------------------------------------------------------------------------
// The deck's selected metric (deck metric propagation, 22-08-2026; DECOUPLED
// 01-09-2026): the hero chart follows the selection; the dimension blocks do
// NOT — they show fixed columns (visitors everywhere, visitors + views on the
// Pages card) and rank by visitors, matching the server's ORDER BY. Selecting
// a KPI affects only the chart, by owner decision (Vemetric comparison audit
// §8, 31-08-2026).
// ---------------------------------------------------------------------------

export type MetricType = 'pageviews' | 'visitors' | 'pages_per_visit' | 'bounce_rate' | 'avg_duration'

export const METRIC_TYPES: MetricType[] = ['visitors', 'pageviews', 'pages_per_visit', 'bounce_rate', 'avg_duration']

export function isMetricType(v: string | null | undefined): v is MetricType {
  return !!v && (METRIC_TYPES as string[]).includes(v)
}

/** The fields a dimension row needs to render. `visitors` is optional only
 * for wire-compat with mid-deploy payloads — a missing count is treated as 0
 * for math, never fabricated into a rate. */
export interface DimensionRateRow {
  pageviews: number
  visitors?: number
  bounce_rate?: number | null
  avg_duration?: number | null
}

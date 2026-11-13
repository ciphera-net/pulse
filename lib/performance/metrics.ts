/**
 * How Pulse rates and prints a lab metric (Core Web Vitals and the other Lighthouse timings): the one definition the
 * Performance page and Analyst's "Figures behind this answer" both read, so a metric is never "poor" in one and fine
 * in the other.
 */

/** Google's Core Web Vitals thresholds: [good, needs-improvement] boundaries. */
export const METRIC_THRESHOLDS: Record<string, [number, number]> = {
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  tbt: [200, 600],
  fcp: [1800, 3000],
  si: [3400, 5800],
  tti: [3800, 7300],
}

export type MetricBand = 'good' | 'warn' | 'poor' | 'unknown'

export function metricBand(metric: string, value: number | null): MetricBand {
  if (value === null) return 'unknown'
  const [good, poor] = METRIC_THRESHOLDS[metric] ?? [0, 0]
  if (value <= good) return 'good'
  if (value <= poor) return 'warn'
  return 'poor'
}

/**
 * An em dash, never a zero. A metric Lighthouse did not produce is not a measurement of zero: that conflation is what
 * made five months of stored history untrustworthy.
 */
export function formatMetricValue(metric: string, value: number | null): string {
  if (value === null) return '—'
  if (metric === 'cls') return value.toFixed(3)
  if (value < 1000) return `${Math.round(value)}ms`
  return `${(value / 1000).toFixed(1)}s`
}

'use client'

import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils/format'
import {
  type BlockMetric,
  type DimensionRateRow,
  blockRowDisplay,
  metricHasShare,
  shareValue,
  BLOCK_METRIC_LABEL,
} from '@/lib/dashboard/metrics'

// ---------------------------------------------------------------------------
// The shared right-hand stat cluster for dimension-card rows (deck metric
// propagation, 22-08-2026): the number follows the page's selected metric,
// the hover % applies only to count metrics (share of the range's F9 total),
// and guarded/unmeasured rates render a muted em dash — never a zero.
// ---------------------------------------------------------------------------

interface MetricRowStatProps {
  metric: BlockMetric
  row: DimensionRateRow
  totals?: { pageviews: number; visitors: number }
}

export function MetricRowStat({ metric, row, totals }: MetricRowStatProps) {
  const d = blockRowDisplay(metric, row)
  const showPct = metricHasShare(metric)
  const denom = showPct && totals ? totals[metric as 'pageviews' | 'visitors'] : 0
  const pct = denom > 0 ? `${Math.round((shareValue(metric, row, 'pageviews') / denom) * 100)}%` : ''
  return (
    <div className="relative flex items-center gap-2 ml-4">
      {pct && (
        <span className="text-xs font-medium text-brand-orange opacity-100 translate-x-0 md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
          {pct}
        </span>
      )}
      <span className={cn('text-sm font-semibold', d.muted ? 'text-neutral-600' : 'text-neutral-400')}>{d.text}</span>
    </div>
  )
}

/** The card-header unit label naming what the row numbers are. */
export function MetricUnitLabel({ metric }: { metric: BlockMetric }) {
  return (
    <span className="shrink-0 text-[11px] text-neutral-500" data-testid="metric-unit">
      {BLOCK_METRIC_LABEL[metric]}
    </span>
  )
}

/** Share-bar width (0..75) — count metrics scale by the selected count, rate
 * metrics keep the block's ranking count so visual hierarchy stays put. */
export function rowBarWidth(
  metric: BlockMetric,
  row: DimensionRateRow,
  rows: DimensionRateRow[],
  rankingField: 'pageviews' | 'visitors' = 'pageviews'
): number {
  const max = rows.reduce((m, r) => Math.max(m, shareValue(metric, r, rankingField)), 0)
  return max > 0 ? (shareValue(metric, row, rankingField) / max) * 75 : 0
}

/** The denominator sentence for "view all" modals, metric-aware. */
export function shareDenominatorNote(metric: BlockMetric, totals?: { pageviews: number; visitors: number }): string | null {
  if (!metricHasShare(metric) || !totals) return null
  const denom = totals[metric as 'pageviews' | 'visitors']
  if (!(denom > 0)) return null
  const unit = metric === 'visitors' ? 'visitors' : 'pageviews'
  return `Shares are of all ${formatNumber(denom)} ${unit} in the range — searching narrows the rows, not the denominator.`
}

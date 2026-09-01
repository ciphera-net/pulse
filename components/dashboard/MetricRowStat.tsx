'use client'

import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils/format'
import { type DimensionRateRow } from '@/lib/dashboard/metrics'

// ---------------------------------------------------------------------------
// The shared right-hand stat cluster for dimension-card rows. DECOUPLED
// (01-09-2026, O3): rows always show VISITORS — the same field the server
// ranks by — and the Pages card adds a views column beside it. The chart's
// selected metric no longer reaches these rows. The hover % is the row's
// share of the range's visitor total (the F9 denominator).
// ---------------------------------------------------------------------------

interface MetricRowStatProps {
  row: DimensionRateRow
  totals?: { pageviews: number; visitors: number }
  /** Twin-column mode (the Pages card): visitors + views, equal weight. */
  views?: boolean
}

export function MetricRowStat({ row, totals, views }: MetricRowStatProps) {
  const visitors = row.visitors ?? 0
  const denom = totals?.visitors ?? 0
  const pct = denom > 0 ? `${Math.round((visitors / denom) * 100)}%` : ''
  return (
    <div className="relative flex items-center gap-2 ml-4">
      {pct && (
        <span className="text-xs font-medium text-brand-orange opacity-100 translate-x-0 md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
          {pct}
        </span>
      )}
      <span className={cn('text-sm font-semibold text-neutral-400', views && 'w-12 text-right tabular-nums')}>
        {formatNumber(visitors)}
      </span>
      {views && (
        <span className="w-12 text-right tabular-nums text-sm font-semibold text-neutral-400">
          {formatNumber(row.pageviews)}
        </span>
      )}
    </div>
  )
}

/**
 * The card-header unit label naming what the row numbers are.
 *
 * It carries NO InfoTip. It did briefly, and the result was six glyphs on one
 * screen all opening the same sentence about the rail's selected metric —
 * noise that explained the card the reader was not asking about. A card's
 * glyph explains the CARD (see DimensionInfoTip); the unit label is just a
 * label again.
 */
export function MetricUnitLabel({ views }: { views?: boolean }) {
  return views ? (
    <span className="shrink-0 text-[11px] text-neutral-500" data-testid="metric-unit">
      <span className="inline-block w-12 text-right">visitors</span>
      <span className="inline-block w-12 text-right">views</span>
    </span>
  ) : (
    <span className="shrink-0 text-[11px] text-neutral-500" data-testid="metric-unit">
      visitors
    </span>
  )
}

/** Share-bar width (0..75) — bars follow visitors, the same field the rows
 * rank by, so visual hierarchy and reading order can never disagree. */
export function rowBarWidth(row: DimensionRateRow, rows: DimensionRateRow[]): number {
  const max = rows.reduce((m, r) => Math.max(m, r.visitors ?? 0), 0)
  return max > 0 ? ((row.visitors ?? 0) / max) * 75 : 0
}

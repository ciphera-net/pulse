'use client'

import { cn } from '@/lib/utils'
import { CompactNumber } from '@/components/ui/compact-number'
import { type DimensionRateRow } from '@/lib/dashboard/metrics'

// ---------------------------------------------------------------------------
// The shared right-hand stat cluster for dimension-card rows. DECOUPLED
// (01-09-2026, O3): rows always show VISITORS — the same field the server
// ranks by — and the Pages card adds a views column beside it. The chart's
// selected metric no longer reaches these rows. The hover % is the row's
// share of the range's visitor total (the F9 denominator).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ONE definition of a dimension row's box and of its number columns, shared by
// the rows and by the unit labels in the card's header (14-11-2026).
//
// The labels and the numbers had drifted 16 and 24 px apart, because nothing
// tied them together:
//   * every row was `w-full ... px-2 -mx-2`. With an explicit width a negative
//     right margin does not widen a box, so the row sat 8 px left of where it
//     was meant to: it overhung the card's content by 8 px on the left,
//     stopped 8 px short on the right, and its padding took 8 more;
//   * the two number columns had a gap between them, the two labels had none.
//
// DIMENSION_ROW is 16 px wider than the card's content, so its 8 px of padding
// ends exactly on the content's edges, which is where the header ends too.
// The hover band and the bar are centred on the content for the same reason.
// A card writes `interactive-row ${DIMENSION_ROW}`: the first word stays in the
// card's own source, where interactive-rows.test.tsx looks for it.
// ---------------------------------------------------------------------------
export const DIMENSION_ROW =
  'w-[calc(100%+1rem)] text-left relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2'
/** One number column, and the label over it. */
const STAT_COLUMN = 'w-12 text-right'
/** A row's number, and the share that slides in beside it under the pointer (see MetricRowStat for its timing). */
export const ROW_NUMBER = 'text-sm font-semibold text-neutral-400'
export const ROW_SHARE =
  'text-xs font-medium text-brand-ink opacity-100 translate-x-0 md:opacity-0 md:translate-x-3 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-fast md:group-hover:duration-slow ease-in-out'
/** The cluster's own box, at a row's right end. */
export const ROW_STAT = 'relative flex items-center ml-4'
/** The space between two number columns, and between their two labels. */
const STAT_GAP = 'gap-2'

interface MetricRowStatProps {
  row: DimensionRateRow
  totals?: { pageviews: number; visitors: number }
  /** Twin-column mode (the Pages card): visitors + views, equal weight. */
  views?: boolean
  /** Appended to the root's classes. */
  className?: string
  /**
   * Set for a row whose click target is an overlay SIBLING and not an ancestor (PULSE-197: a row that holds a
   * link cannot be one button). The cluster then gives the pointer up, so a press anywhere on it reaches the
   * overlay, and each NUMBER takes it back for its own box: under the overlay the exact count behind a rounded
   * number could never open for a pointer (measured on production in the Sources and Pages lists, 15-11-2026;
   * a keyboard could always reach it). `onPress` is the row's own action, so a press on a number does what a
   * press on the row does; a row that cannot filter passes none.
   */
  overlay?: { onPress?: () => void }
}

/** The cluster in a row with an overlay, and a number inside it. */
const UNDER_OVERLAY = 'pointer-events-none'
const NUMBER_OVER_OVERLAY = 'pointer-events-auto'

export function MetricRowStat({ row, totals, views, className, overlay }: MetricRowStatProps) {
  const visitors = row.visitors ?? 0
  const denom = totals?.visitors ?? 0
  const pct = denom > 0 ? `${Math.round((visitors / denom) * 100)}%` : ''
  return (
    <div className={cn(ROW_STAT, STAT_GAP, overlay && UNDER_OVERLAY, className)}>
      {pct && (
        // The hover % SLIDES in where it can be seen (PUL-20, owner pick B,
        // 12-10-2026): 12 px over 400 ms on an even curve. It was 8 px / 250 ms
        // on ease-apple, which front-loads the motion — 93% visible after
        // 100 ms, so it read as appearing, not sliding. It LEAVES in 150 ms
        // (the resting state's duration), so moving down a list leaves no
        // trail of fading numbers.
        <span className={ROW_SHARE}>
          {pct}
        </span>
      )}
      <CompactNumber value={visitors} className={cn(ROW_NUMBER, views && STAT_COLUMN, overlay && NUMBER_OVER_OVERLAY)} onClick={overlay?.onPress} />
      {views && (
        <CompactNumber value={row.pageviews} className={cn(ROW_NUMBER, STAT_COLUMN, overlay && NUMBER_OVER_OVERLAY)} onClick={overlay?.onPress} />
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
export function MetricUnitLabel({ views, unit = 'visitors' }: { views?: boolean; /** What a single column counts, where it is not visitors (an outbound link's clicks). */ unit?: string }) {
  return views ? (
    // The same columns and the same gap as the numbers under them. A plain string, not cn(): the two `text-`
    // utilities here are a size and a colour, and a class merger may take them for one group.
    <span className={`inline-flex shrink-0 ${STAT_GAP} text-[11px] text-neutral-500`} data-testid="metric-unit">
      <span className={STAT_COLUMN}>visitors</span>
      <span className={STAT_COLUMN}>views</span>
    </span>
  ) : (
    <span className="shrink-0 text-[11px] text-neutral-500" data-testid="metric-unit">
      {unit}
    </span>
  )
}

/** Share-bar width (0..75) — bars follow visitors, the same field the rows
 * rank by, so visual hierarchy and reading order can never disagree. */
export function rowBarWidth(row: DimensionRateRow, rows: DimensionRateRow[]): number {
  const max = rows.reduce((m, r) => Math.max(m, r.visitors ?? 0), 0)
  return max > 0 ? ((row.visitors ?? 0) / max) * 75 : 0
}

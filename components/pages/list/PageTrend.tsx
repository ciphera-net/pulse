'use client'

import { curveLinear } from 'd3-shape'
import { AreaChart, Area, Grid, XAxis, YAxis, ChartTooltip } from '@/components/ui/area-chart'
import { guardedPctChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { formatCompactNumber, formatNumber } from '@/lib/utils/format'
import { formatDateFullUTC, formatDateShortUTC, formatTimeUTC } from '@/lib/utils/formatDate'

// ---------------------------------------------------------------------------
// One page's views over the range, as the dashboard's chart draws a site's (components/dashboard/CommandDeck.tsx):
// the same area chart, grid, axes, crosshair and card, with the period before as the dashed line.
//
// The buckets follow the range exactly as the dashboard's do (ruling R81, 17-11-2026: a chart of one day once drew
// a single dot): days over several days, HOURS over one day, and minutes for a day younger than three hours. An
// hour is named by its span ("19:00 – 20:00"), and the period before by its own date and hour.
// ---------------------------------------------------------------------------

/** The period before, in the dashboard's own ink and dash (components/dashboard/CommandDeck.tsx). */
export const PREV_INK = 'var(--chart-line-secondary)'
export const PREV_DASH = '4 4'
const DASH = '—'

export type TrendBucket = 'day' | 'hour' | 'minute'

export interface TrendPoint {
  dateObj: Date
  views: number | null
  /** The bucket at the same place in the period before; null where it has none. */
  prev: number | null
  prevDateObj: Date | null
  /** The bucket still being counted: its card says "(so far)". */
  isPartial: boolean
}

/** A signed whole-number difference, as the deck's card writes it: "+2", "−8", "0". */
export function formatDiff(d: number): string {
  if (d === 0) return '0'
  return `${d > 0 ? '+' : '−'}${formatNumber(Math.abs(Math.round(d)))}`
}
export function formatChange(c: PctChangeResult): string {
  if (!c) return DASH
  if (c.type === 'new') return 'New'
  const sign = c.value > 0 ? '+' : c.value < 0 ? '−' : ''
  return c.type === 'pp' ? `${sign}${Math.abs(c.value)} pp` : `${sign}${Math.abs(c.value)}%`
}

export interface PageTrendProps {
  data: TrendPoint[]
  bucket: TrendBucket
  /** The period before is drawn (and named in the card). */
  drawPrev: boolean
  /** The range ends now: the last stretch of the line is dashed, as on the dashboard. */
  live: boolean
}

export default function PageTrend({ data, bucket, drawPrev, live }: PageTrendProps) {
  const n = data.length
  const asDate = (v: unknown) => (v instanceof Date ? v : new Date(String(v)))
  return (
    <AreaChart data={data as unknown as Record<string, unknown>[]} xDataKey="dateObj" integerYTicks fillParent margin={{ top: 16, right: 16, bottom: 36, left: 46 }} animationDuration={400}>
      <Grid horizontal vertical={false} stroke="var(--chart-grid)" numTicksRows={4} />
      {drawPrev && (
        <Area dataKey="prev" curve={curveLinear} fill={PREV_INK} fillOpacity={0} stroke={PREV_INK} strokeWidth={1.5} strokeDasharray={PREV_DASH} fadeStrokeEdges={false} breakAtMissing />
      )}
      <Area
        dataKey="views"
        curve={curveLinear}
        fill="var(--chart-1)"
        fillOpacity={0.15}
        stroke="var(--chart-1)"
        strokeWidth={2}
        gradientToOpacity={0}
        fadeStrokeEdges={false}
        dashedTailFrom={live && n >= 2 ? n - 2 : undefined}
      />
      <XAxis numTicks={Math.min(n, 8)} formatLabel={bucket === 'day' ? (d) => formatDateShortUTC(d) : (d) => formatTimeUTC(d)} />
      <YAxis numTicks={4} formatValue={(v) => formatCompactNumber(v)} />
      <ChartTooltip
        showDatePill={false}
        title={(point) => {
          const at = asDate(point.dateObj)
          if (bucket === 'minute') return formatTimeUTC(at)
          // Boundary to boundary, as the dashboard's card names an hour.
          if (bucket === 'hour') return `${formatTimeUTC(at)} – ${formatTimeUTC(new Date(at.getTime() + 60 * 60_000))}`
          return point.isPartial ? `${formatDateFullUTC(at)} (so far)` : formatDateFullUTC(at)
        }}
        rows={(point) => {
          const v = (point.views as number | null) ?? 0
          const current = { color: 'var(--chart-1)', label: 'Views', value: formatNumber(v) }
          if (!drawPrev) return [current]
          const pv = (point.prev as number | null | undefined) ?? null
          const pd = point.prevDateObj instanceof Date ? point.prevDateObj : null
          const change = pv != null ? guardedPctChange(v, pv, pv) : null
          const prevLabel = !pd ? 'Previous period' : bucket === 'day' ? formatDateFullUTC(pd) : `${formatDateShortUTC(pd)} ${formatTimeUTC(pd)}`
          return [
            current,
            { color: PREV_INK, label: prevLabel, value: pv == null ? DASH : formatNumber(pv) },
            { color: 'transparent', label: 'Change', value: pv == null ? DASH : change?.type === 'pct' ? `${formatDiff(v - pv)} (${formatChange(change)})` : formatDiff(v - pv) },
          ]
        }}
      />
    </AreaChart>
  )
}

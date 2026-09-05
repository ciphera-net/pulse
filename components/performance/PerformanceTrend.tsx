'use client'

import { useMemo } from 'react'
import { curveLinear } from 'd3-shape'
import type { PerformanceCheck } from '@/lib/api/performance'
import { zoneParts } from '@/lib/utils/siteTime'
import { formatDateFullUTC, formatDateShortUTC, formatTimeUTC } from '@/lib/utils/formatDate'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import {
  AreaChart,
  Area,
  Grid,
  XAxis,
  YAxis,
  ChartTooltip,
  ReferenceLine,
  chartCssVars,
} from '@/components/ui/area-chart'

// ---------------------------------------------------------------------------
// Performance score trend — on the shared instrument since the chart-consistency
// round (05-09-2026).
//
// Until then this was the one chart that deliberately did NOT use
// components/ui/area-chart: the instrument could not express a fixed y domain,
// per-point dots under a smoothed line, or a boundary annotation — and those
// three things ARE the redesign (the old auto-scaled chart plotted a 71→91
// swing between two single runs of an unchanged page as a collapse). The
// instrument now has all three (`yDomain`/`yTicks`, `pointsKey`,
// `ReferenceLine`), so the chart keeps every claim it used to make and gains
// what it never had: a tooltip, a cursor, a hover dot, touch, the dashboard's
// axes and motion. What the drawing CLAIMS is unchanged:
//
//   * y is pinned to 0–100, the actual range of a Lighthouse score, with the
//     gridlines at the band boundaries (50 and 90 are where the score changes
//     colour) — so a 10-point move looks like a 10-point move.
//   * The LINE is a trailing median, which is the trend.
//   * The DOTS are the individual checks, which is the spread. Both are shown
//     because hiding either one is a different lie.
//   * A dashed boundary marks where the instrument changed. Everything left of
//     it is a single PSI run of unknown Lighthouse version; everything right is
//     the median of three on a pinned version. They are not the same
//     measurement, and the chart says so.
//
// Time: check instants are converted to the SITE's wall clock and stamped as
// UTC — the instrument's convention (parseSiteWallClock) — so UTC getters print
// site time on the axis and in the card for every viewer.
// ---------------------------------------------------------------------------

const MEDIAN_WINDOW = 7

interface PerformanceTrendProps {
  checks: PerformanceCheck[]
  className?: string
  /** The SITE's IANA timezone — check instants label their axis day in site
   * time (22-08-2026 alignment; previously UTC). */
  timezone: string | null
}

interface Point {
  t: number
  score: number
  median: number
  source: PerformanceCheck['source']
}

/** Trailing median over the last `window` values, inclusive of the current one. */
export function trailingMedian(values: number[], window = MEDIAN_WINDOW): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).sort((a, b) => a - b)
    // Lower median, matching the backend's rule: with an even count the
    // pessimistic choice is the one that does not quietly suppress a regression.
    return slice[Math.floor((slice.length - 1) / 2)]
  })
}

/**
 * The first check produced by the self-hosted runner, i.e. where the instrument
 * changed. Returns null when the series is entirely one side of the cutover —
 * an annotation pointing off the edge of the plot is worse than none.
 */
export function provenanceBoundary(points: { t: number; source: string }[]): number | null {
  const firstLighthouse = points.findIndex(p => p.source === 'lighthouse')
  if (firstLighthouse <= 0) return null
  return points[firstLighthouse].t
}

/** An instant as the site's wall clock, stamped as UTC (the instrument's convention). */
function toSiteWallClock(t: number, tz: string | null): Date {
  const p = zoneParts(new Date(t), tz)
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute))
}

const INSTRUMENT_LABEL: Record<PerformanceCheck['source'], string> = {
  psi: 'PageSpeed',
  lighthouse: 'Lighthouse',
}

export function PerformanceTrend({ checks, className, timezone }: PerformanceTrendProps) {
  const points = useMemo<Point[]>(() => {
    const usable = checks
      .filter(c => c.performance_score !== null)
      .map(c => ({ t: new Date(c.checked_at).getTime(), score: c.performance_score as number, source: c.source }))
      .sort((a, b) => a.t - b.t)
    const medians = trailingMedian(usable.map(u => u.score))
    return usable.map((u, i) => ({ ...u, median: medians[i] }))
  }, [checks])

  const rows = useMemo(
    () =>
      points.map(p => ({
        dateObj: toSiteWallClock(p.t, timezone),
        median: p.median,
        score: p.score,
        source: p.source,
      })),
    [points, timezone],
  )

  const boundary = useMemo(() => provenanceBoundary(points), [points])
  const boundaryWall = boundary !== null ? toSiteWallClock(boundary, timezone) : null
  const hasLegacy = points.some(p => p.source === 'psi')

  if (points.length < 2) return null

  return (
    <div data-tour="performance-trend" className={className}>
      {/* min-w-0 is load-bearing: the app shell's ancestors lack it, so a wide
          child forces the whole shell to scroll horizontally and the shell's
          overflow-x-hidden then DELETES the overflowing content rather than
          revealing it. The fixed height is the chart's height authority —
          fillParent lets the plot take all of it. */}
      <div className="h-80 min-w-0">
        <AreaChart
          animationDuration={400}
          data={rows as unknown as Record<string, unknown>[]}
          fillParent
          margin={{ top: 20, right: 20, bottom: 40, left: 50 }}
          xDataKey="dateObj"
          yDomain={[0, 100]}
          yTicks={[0, 50, 90, 100]}
        >
          <Grid horizontal numTicksRows={4} stroke="var(--chart-grid)" vertical={false} />
          <Area
            curve={curveLinear}
            dataKey="median"
            fadeStrokeEdges={false}
            fill="var(--chart-1)"
            fillOpacity={0.15}
            gradientToOpacity={0}
            // The spread: one static dot per check, from the raw score.
            pointsKey="score"
            stroke="var(--chart-1)"
            strokeWidth={2}
          />
          {boundaryWall && (
            <ReferenceLine label={`median of 3 from ${formatDateShortUTC(boundaryWall)} →`} x={boundaryWall} />
          )}
          <XAxis formatLabel={d => formatDateShortUTC(d)} numTicks={8} />
          <YAxis formatValue={v => String(v)} numTicks={4} />
          <ChartTooltip
            rows={point => [
              { color: 'var(--chart-1)', label: `${MEDIAN_WINDOW}-check median`, value: String(point.median) },
              { color: chartCssVars.foregroundMuted, label: 'This check', value: String(point.score) },
              { color: chartCssVars.foregroundMuted, label: 'Instrument', value: INSTRUMENT_LABEL[point.source as PerformanceCheck['source']] ?? '—' },
            ]}
            showDatePill={false}
            title={point => {
              const d = point.dateObj as Date
              return `${formatDateFullUTC(d)} · ${formatTimeUTC(d)}`
            }}
          />
        </AreaChart>
      </div>

      {/* Each clause is its own inline-flex run. A bare glyph dropped straight
          into the paragraph aligns its 24px box on the text BASELINE, which
          lifts the whole caption line; wrapping the clause makes the glyph a
          flex item that centres against its own text instead. */}
      <p className="mt-2 flex flex-wrap items-center gap-x-1 text-caption text-neutral-500">
        <span className="inline-flex items-center gap-1">
          dots = individual checks · line = {MEDIAN_WINDOW}-check median
          <TermInfoTip term="trend_trailing_median" />
        </span>
        {hasLegacy && boundaryWall && (
          <span className="inline-flex items-center gap-1">
            · history before {formatDateShortUTC(boundaryWall)} is single-run, Lighthouse version unknown
            <TermInfoTip term="trend_provenance_boundary" />
          </span>
        )}
      </p>
    </div>
  )
}

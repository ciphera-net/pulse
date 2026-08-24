'use client'

import { useMemo } from 'react'
import type { PerformanceCheck } from '@/lib/api/performance'
import { safeTimeZone } from '@/lib/utils/siteTime'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'

// ---------------------------------------------------------------------------
// Performance score trend.
//
// WHY THIS IS NOT components/ui/area-chart. The shared chart derives its y
// domain from the data and cannot express a fixed axis, per-point dots under a
// smoothed line, or a boundary annotation — and those three things ARE the
// redesign. The old chart auto-scaled, so a 71→91 swing between two single runs
// of an unchanged page filled the plot and read as a collapse. It plotted
// sampling noise as signal.
//
// The visual vocabulary is deliberately unchanged: the same orange line, the
// same gradient area fill, the same hairline grid and the same CSS variables
// (--chart-line-primary, --chart-grid) every other instrument uses. What changed
// is what the drawing CLAIMS:
//
//   * y is pinned to 0–100, the actual range of a Lighthouse score, so a
//     10-point move looks like a 10-point move.
//   * The LINE is a trailing median, which is the trend.
//   * The DOTS are the individual checks, which is the spread. Both are shown
//     because hiding either one is a different lie.
//   * A dashed boundary marks where the instrument changed. Everything left of
//     it is a single PSI run of unknown Lighthouse version; everything right is
//     the median of three on a pinned version. They are not the same
//     measurement and the chart says so.
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

export function PerformanceTrend({ checks, className, timezone }: PerformanceTrendProps) {
  const points = useMemo<Point[]>(() => {
    const usable = checks
      .filter(c => c.performance_score !== null)
      .map(c => ({ t: new Date(c.checked_at).getTime(), score: c.performance_score as number, source: c.source }))
      .sort((a, b) => a.t - b.t)
    const medians = trailingMedian(usable.map(u => u.score))
    return usable.map((u, i) => ({ ...u, median: medians[i] }))
  }, [checks])

  if (points.length < 2) return null

  const W = 1000
  const H = 240
  const padL = 34
  const padR = 14
  const padT = 12
  const padB = 26
  const iw = W - padL - padR
  const ih = H - padT - padB

  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const span = t1 - t0 || 1
  const x = (t: number) => padL + ((t - t0) / span) * iw
  // Pinned 0–100. A Lighthouse score cannot leave this range, so the axis is a
  // fact about the metric rather than a fact about this particular week's data.
  const y = (v: number) => padT + (1 - v / 100) * ih

  const line = 'M' + points.map(p => `${x(p.t).toFixed(1)},${y(p.median).toFixed(1)}`).join('L')
  const area = `${line}L${x(t1).toFixed(1)},${y(0).toFixed(1)}L${x(t0).toFixed(1)},${y(0).toFixed(1)}Z`

  const boundary = provenanceBoundary(points)
  const gradientId = 'pagespeed-trend-fill'

  const fmtDate = (t: number) =>
    new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: safeTimeZone(timezone) })
  const midT = t0 + span / 2

  const hasLegacy = points.some(p => p.source === 'psi')

  return (
    <div data-tour="performance-trend" className={className}>
      {/* min-w-0 is load-bearing: the app shell's ancestors lack it, so a wide
          child forces the whole shell to scroll horizontally and the shell's
          overflow-x-hidden then DELETES the overflowing content rather than
          revealing it. */}
      <div className="min-w-0">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label="Performance score trend"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--chart-line-primary)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--chart-line-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Gridlines at the Lighthouse band boundaries, not at arbitrary
              quantiles — 50 and 90 are where the score changes colour, so they
              are the lines worth drawing. */}
          {[0, 50, 90, 100].map(g => (
            <g key={g}>
              <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text
                x={padL - 8}
                y={y(g) + 3.5}
                fill="currentColor"
                fontSize="10"
                textAnchor="end"
                className="fill-neutral-500"
              >
                {g}
              </text>
            </g>
          ))}

          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke="var(--chart-line-primary)" strokeWidth={1.6} />

          {/* Individual checks. Showing the spread alongside the median is the
              point: a wide scatter around a flat line is a noisy measurement,
              not a stable page, and the reader can see which one they have. */}
          {points.map(p => (
            <circle
              key={p.t}
              cx={x(p.t)}
              cy={y(p.score)}
              r={1.8}
              className="fill-neutral-400"
              opacity={0.5}
            />
          ))}

          {boundary !== null && (
            <g>
              <line
                x1={x(boundary)}
                y1={padT}
                x2={x(boundary)}
                y2={H - padB}
                stroke="currentColor"
                className="stroke-neutral-500"
                strokeDasharray="3 4"
                strokeOpacity={0.6}
              />
              <text
                x={x(boundary) - 6}
                y={padT + 10}
                fontSize="9.5"
                textAnchor="end"
                className="fill-neutral-500"
              >
                median of 3 from {fmtDate(boundary)} →
              </text>
            </g>
          )}

          <text x={padL} y={H - 6} fontSize="10" className="fill-neutral-500">
            {fmtDate(t0)}
          </text>
          <text x={x(midT)} y={H - 6} fontSize="10" textAnchor="middle" className="fill-neutral-500">
            {fmtDate(midT)}
          </text>
          <text x={W - padR} y={H - 6} fontSize="10" textAnchor="end" className="fill-neutral-500">
            {fmtDate(t1)}
          </text>
        </svg>
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
        {hasLegacy && boundary !== null && (
          <span className="inline-flex items-center gap-1">
            · history before {fmtDate(boundary)} is single-run, Lighthouse version unknown
            <TermInfoTip term="trend_provenance_boundary" />
          </span>
        )}
      </p>
    </div>
  )
}

'use client'

import { useId } from 'react'
import { line as shapeLine, curveLinear } from 'd3-shape'

// ---------------------------------------------------------------------------
// The KPI tile mini chart, in the big chart's language (sharp-chart round,
// 01-09-2026, artifact "The Sharp Line" — M1 "lifted" pick):
//
//   - curveLinear. This SUPERSEDES the 21-08-2026 revert to monotone: the
//     owner picked the sharp instrument on mocks of their own data.
//   - ZERO-BASED scale, like the big chart's axis: y maps value/seriesMax
//     from the tile floor, so highs and lows keep true proportion — a
//     min/max-normalized stretch would fabricate drama in a flat week.
//   - M1 lift: the series max rises to ~4px below the svg top (just under
//     the tile's label row), grounded at the tile floor — never floaty.
//   - Gradient fill (fades to nothing by the floor) instead of a flat wash,
//     scaled down from the big chart's weight; the fade is also what keeps a
//     high-riding series (Bounce ~90%) from flooding the tile.
//   - Dashed tail on the in-progress bucket, same as the big chart
//     (period-token semantics, passed down by the consumer).
//
// Gaps follow THE BIG CHART's per-metric rule (owner report 01-09-2026: the
// bounce/duration minis looked "nothing like the real charts"): a metric the
// deck plots missing-as-zero anchors its empty buckets at the floor here too,
// so the mini is the big chart in miniature. Only unflagged metrics keep the
// old compress-the-gap behaviour (their series are dense in practice anyway).
// ---------------------------------------------------------------------------

export type SparkMetric = 'visitors' | 'pageviews' | 'pages_per_visit' | 'bounce_rate' | 'avg_duration'

export default function RailSparkline({ data, dataKey, active, dashedTail = false, missingAsZero = false }: {
  data: {
    pageviews: number
    visitors: number
    bounce_rate: number | null
    avg_duration: number | null
    /** Precomputed by the consumer's chart pipeline (the deck divides by
     *  VISITS, migration-164 rule). When present it wins — the mini must
     *  plot the same series the big chart plots, never re-derive it. */
    pages_per_visit?: number | null
  }[]
  dataKey: SparkMetric
  active: boolean
  /** The range ends now — dash the final segment like the big chart. */
  dashedTail?: boolean
  /** Plot a null bucket at zero, exactly like the big chart's flag for this
   *  metric — the mini must draw the same shape the chart draws. */
  missingAsZero?: boolean
}) {
  const gradientId = useId()
  if (data.length < 2) return null
  const values = data
    .map((d) =>
      dataKey === 'pages_per_visit'
        ? d.pages_per_visit !== undefined
          ? d.pages_per_visit
          : (d.visitors > 0 ? d.pageviews / d.visitors : 0)
        : d[dataKey] as number | null
    )
    .map((v) => (missingAsZero ? (v ?? 0) : v))
    .filter((v): v is number => v != null)
  if (values.length < 2) return null
  const max = Math.max(...values) || 1
  const h = 52
  const padBottom = 2
  const padTop = 4

  const coords = values.map((v, i) => ({
    x: (i / (values.length - 1)) * 100,
    y: h - padBottom - (v / max) * (h - padBottom - padTop),
  }))

  const mkLine = shapeLine<{ x: number; y: number }>()
    .x((c) => c.x)
    .y((c) => c.y)
    .curve(curveLinear)
  const n = coords.length
  const hasTail = dashedTail && n >= 2
  const solidCoords = hasTail ? coords.slice(0, n - 1) : coords
  const linePath = mkLine(solidCoords) ?? ''
  const tailPath = hasTail ? (mkLine(coords.slice(n - 2)) ?? '') : ''
  const areaPath = (mkLine(coords) ?? '') + ` L100,${h} L0,${h} Z`

  const ink = active ? 'rgb(253, 94, 15)' : 'rgb(82, 82, 82)'

  return (
    <svg viewBox={`0 0 100 ${h}`} className="absolute bottom-0 left-0 right-0 w-full z-0 transition-opacity duration-base opacity-30 group-hover:opacity-60 ease-apple" style={{ height: h }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={ink} stopOpacity={active ? 0.22 : 0.16} />
          <stop offset="95%" stopColor={ink} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        className={active ? "stroke-brand-orange" : "stroke-neutral-600 group-hover:stroke-brand-orange"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {hasTail && (
        <path
          d={tailPath}
          fill="none"
          className={active ? "stroke-brand-orange" : "stroke-neutral-600 group-hover:stroke-brand-orange"}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}

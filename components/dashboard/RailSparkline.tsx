'use client'

import { line as shapeLine, curveMonotoneX } from 'd3-shape'

// ─── RailSparkline ───────────────────────────────────────────────────
//
// The edge-to-edge ghost trace behind a KPI row: grey at rest, brand
// orange on hover, permanently orange on the active metric (owner pick
// "S4, like before", 19-08-2026 — the pre-deck tile sparkline, extracted
// from Chart.tsx so the command deck and the share page render the same
// instrument from one source). Smoothed with curveMonotoneX like the
// hero chart and every other surface — the sharp-trace decision was
// reverted 21-08-2026 (owner call; monotone cannot overshoot a measured
// point, so it fabricates no peaks).
//
// Unmeasured buckets (null) are SKIPPED, not plotted as zeros — this is
// a decorative trend line with no time axis, and a fabricated dip to 0
// is still a fabrication. (The hero chart's zero-fill decision is about
// its time axis; a sparkline compresses to the measured points.)

type SparkMetric = 'pageviews' | 'visitors' | 'pages_per_visit' | 'bounce_rate' | 'avg_duration'

export default function RailSparkline({ data, dataKey, active }: {
  data: { pageviews: number; visitors: number; bounce_rate: number | null; avg_duration: number | null }[]
  dataKey: SparkMetric
  active: boolean
}) {
  if (data.length < 2) return null
  const values = data
    .map((d) =>
      dataKey === 'pages_per_visit'
        ? (d.visitors > 0 ? d.pageviews / d.visitors : 0)
        : d[dataKey] as number | null
    )
    .filter((v): v is number => v != null)
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const h = 52
  const padBottom = 2
  const padTop = 16

  const coords = values.map((v, i) => ({
    x: (i / (values.length - 1)) * 100,
    y: h - padBottom - ((v - min) / range) * (h - padBottom - padTop),
  }))

  // Monotone smoothing — the hero chart's grammar (reverted from sharp
  // 21-08-2026), at the rail's scale too.
  const linePath =
    shapeLine<{ x: number; y: number }>()
      .x((c) => c.x)
      .y((c) => c.y)
      .curve(curveMonotoneX)(coords) ?? ''
  const fillPath = linePath + ` L100,${h} L0,${h} Z`

  return (
    <svg viewBox={`0 0 100 ${h}`} className="absolute bottom-0 left-0 right-0 w-full z-0 transition-opacity duration-base opacity-30 group-hover:opacity-60 ease-apple" style={{ height: h }} preserveAspectRatio="none">
      <path d={fillPath} className={active ? "fill-brand-orange/[0.08]" : "fill-neutral-600/[0.05] group-hover:fill-brand-orange/[0.08]"} />
      <path
        d={linePath}
        fill="none"
        className={active ? "stroke-brand-orange" : "stroke-neutral-600 group-hover:stroke-brand-orange"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

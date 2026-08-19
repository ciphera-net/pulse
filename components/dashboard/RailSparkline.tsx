'use client'

// ─── RailSparkline ───────────────────────────────────────────────────
//
// The edge-to-edge ghost trace behind a KPI row: grey at rest, brand
// orange on hover, permanently orange on the active metric (owner pick
// "S4, like before", 19-08-2026 — this IS the pre-deck tile sparkline,
// extracted verbatim from Chart.tsx so the command deck and the share
// page render the same instrument from one source).
//
// Unmeasured buckets (null) are SKIPPED, not plotted as zeros — this is
// a decorative trend line with no time axis, and a fabricated dip to 0
// is still a fabrication. (The hero chart's zero-fill decision is about
// its time axis; a sparkline compresses to the measured points.)

type SparkMetric = 'pageviews' | 'visitors' | 'pages_per_visit' | 'bounce_rate' | 'avg_duration' | 'engagement'

function smoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length < 2) return ''
  let d = `M${coords[0].x},${coords[0].y}`
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)]
    const p1 = coords[i]
    const p2 = coords[i + 1]
    const p3 = coords[Math.min(coords.length - 1, i + 2)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return d
}

export default function RailSparkline({ data, dataKey, active, engagementDaily }: {
  data: { pageviews: number; visitors: number; bounce_rate: number | null; avg_duration: number | null; engagement?: number }[]
  dataKey: SparkMetric
  active: boolean
  engagementDaily?: { date: string; score: number }[]
}) {
  // Engagement always uses daily scores (not hourly-mapped) for real variation.
  const sourceValues = dataKey === 'engagement' && engagementDaily?.length
    ? engagementDaily.map(d => d.score)
    : null
  if (!sourceValues && data.length < 2) return null
  if (sourceValues && sourceValues.length < 2) return null
  const values = sourceValues ?? data
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

  const linePath = smoothPath(coords)
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

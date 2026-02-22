'use client'

/**
 * Mini sparkline SVG for KPI cards.
 * Renders a line chart from an array of data points.
 */
export default function Sparkline({
  data,
  dataKey,
  color,
  width = 56,
  height = 20,
}: {
  /** Array of objects with numeric values (e.g. DailyStat with visitors, pageviews) */
  data: ReadonlyArray<object>
  dataKey: string
  color: string
  width?: number
  height?: number
}) {
  if (!data.length) return null
  const values = data.map((d) => Number((d as Record<string, unknown>)[dataKey] ?? 0))
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const padding = 2
  const w = width - padding * 2
  const h = height - padding * 2

  const points = values.map((v, i) => {
    const x = padding + (i / Math.max(values.length - 1, 1)) * w
    const y = padding + h - ((v - min) / range) * h
    return `${x},${y}`
  })

  const pathD = points.length > 1 ? `M ${points.join(' L ')}` : `M ${points[0]} L ${points[0]}`

  return (
    <svg width={width} height={height} className="flex-shrink-0" aria-hidden>
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

'use client'

import { useId } from 'react'
import { line as shapeLine, curveLinear } from 'd3-shape'

// ---------------------------------------------------------------------------
// The MINI tier of the chart language — one core for every decorative
// sparkline in the product (chart-consistency round, 05-09-2026).
//
// The KPI rail's mini and the fleet card's ghost trace were two independent
// hand-rolls of the same 100-unit svg, and only one of them received the
// 01-09 sharp-chart decisions; the other kept a monotone curve, a flat wash
// and no tail, with its docblock still claiming "the same curve as every
// shipped chart". Extracting the drawing into a values-based core means the
// rule set lives once:
//
//   - curveLinear (sharp-chart round, 01-09-2026 — supersedes monotone).
//   - ZERO-BASED scale: y maps value/seriesMax from the floor, so highs and
//     lows keep true proportion; a min/max stretch fabricates drama.
//   - Lift geometry as props (padTop/padBottom): the rail's M1 pick puts the
//     max ~4px under the tile's label row; a taller host picks its own.
//   - Gradient fill fading to nothing at the floor, never a flat wash.
//   - Dashed `4 4` tail on the in-progress final bucket, decided by the
//     CONSUMER from server-owned semantics (period token / window contract),
//     never client date math.
//   - Ink as a mode (active = brand orange, rest = neutral-600), with the
//     rail's rest-on-hover lift available to hosts that want it.
//   - ONE opacity channel: modulation lives on the svg (via className), never
//     multiplied by a per-path opacity.
// ---------------------------------------------------------------------------

export interface SparklineProps {
  /** One value per bucket, in order. Nulls are dropped, or anchored at the
   *  floor when `missingAsZero` is set (the surface's own gap rule). */
  values: (number | null)[]
  /** Brand ink; false = resting neutral. */
  active: boolean
  /** Rest ink lifts to brand on the host's `group` hover (the rail's rule). */
  restHoverInk?: boolean
  /** Dash the final segment — the range ends now. */
  dashedTail?: boolean
  missingAsZero?: boolean
  /** viewBox height in user units; the svg is stretched by the host. */
  height?: number
  padTop?: number
  padBottom?: number
  /** Host classes for the svg (position, size, opacity channel, transitions). */
  className?: string
  style?: React.CSSProperties
}

const VIEW_W = 100

export function Sparkline({
  values: raw,
  active,
  restHoverInk = true,
  dashedTail = false,
  missingAsZero = false,
  height = 52,
  padTop = 4,
  padBottom = 2,
  className = '',
  style,
}: SparklineProps) {
  const gradientId = useId()
  const values = raw
    .map((v) => (missingAsZero ? (v ?? 0) : v))
    .filter((v): v is number => v != null)
  if (values.length < 2) return null

  const max = Math.max(...values) || 1
  const coords = values.map((v, i) => ({
    x: (i / (values.length - 1)) * VIEW_W,
    y: height - padBottom - (v / max) * (height - padBottom - padTop),
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
  const areaPath = (mkLine(coords) ?? '') + ` L${VIEW_W},${height} L0,${height} Z`

  const ink = active ? 'rgb(253, 94, 15)' : 'rgb(82, 82, 82)'
  const strokeClass = active
    ? 'stroke-brand-orange'
    : restHoverInk
      ? 'stroke-neutral-600 group-hover:stroke-brand-orange'
      : 'stroke-neutral-600'

  return (
    <svg
      aria-hidden="true"
      className={className}
      preserveAspectRatio="none"
      style={style}
      viewBox={`0 0 ${VIEW_W} ${height}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="5%" stopColor={ink} stopOpacity={active ? 0.22 : 0.16} />
          <stop offset="95%" stopColor={ink} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        className={strokeClass}
        d={linePath}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {hasTail && (
        <path
          className={strokeClass}
          d={tailPath}
          fill="none"
          strokeDasharray="4 4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}

export default Sparkline

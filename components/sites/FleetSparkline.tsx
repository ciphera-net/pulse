'use client'

import { curveMonotoneX } from 'd3-shape'
import { LinePath, AreaClosed } from '@/lib/charts/primitives'
import type { SiteOverviewDay } from '@/lib/api/sites'

const VIEW_W = 100
const VIEW_H = 64
const PAD_TOP = 10
const PAD_BOTTOM = 6

interface FleetSparklineProps {
  days: SiteOverviewDay[]
  /** Stalled cards render the ghost trace in dimmed neutral instead of brand orange. */
  dim?: boolean
}

/**
 * The Fleet Deck card's 7-day ghost sparkline — rides the scrim full-bleed.
 * curveMonotoneX via d3-shape, the same curve as every shipped chart. Decorative
 * (aria-hidden): the card's one number is the datum; this is its shape.
 */
export function FleetSparkline({ days, dim = false }: FleetSparklineProps) {
  if (days.length < 2) return null
  const max = Math.max(...days.map((d) => d.visitors), 1)
  const step = VIEW_W / (days.length - 1)
  const x = (_: SiteOverviewDay, i: number) => i * step
  const y = (d: SiteOverviewDay) =>
    VIEW_H - PAD_BOTTOM - (d.visitors / max) * (VIEW_H - PAD_TOP - PAD_BOTTOM)

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full opacity-80 ${
        dim ? 'text-neutral-600' : 'text-brand-orange'
      }`}
    >
      <AreaClosed
        data={days}
        x={x}
        y={y}
        yScale={{ range: () => [0, VIEW_H] }}
        curve={curveMonotoneX}
        fill="currentColor"
        fillOpacity={dim ? 0.08 : 0.1}
      />
      <LinePath
        data={days}
        x={x}
        y={y}
        curve={curveMonotoneX}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        opacity={0.55}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

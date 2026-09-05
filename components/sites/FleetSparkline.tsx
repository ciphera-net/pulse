'use client'

import { Sparkline } from '@/components/ui/sparkline'
import type { SiteOverviewDay } from '@/lib/api/sites'

interface FleetSparklineProps {
  days: SiteOverviewDay[]
  /** Stalled cards render the ghost trace in dimmed neutral instead of brand orange. */
  dim?: boolean
}

/**
 * The Fleet Deck card's 7-day ghost sparkline — rides the scrim full-bleed.
 * Drawn by the shared mini core (components/ui/sparkline.tsx) since the
 * chart-consistency round (05-09-2026): linear joins, zero-based scale,
 * gradient to the floor, and the dashed tail on the final bucket — the
 * overview window is the server's "today-6 … today" (lib/api/sites.ts), so
 * the last point is ALWAYS the in-progress day; no client date math decides
 * that. Decorative (aria-hidden, pointer-events-none): the card's one number
 * is the datum; this is its shape. One opacity channel, on the svg.
 */
export function FleetSparkline({ days, dim = false }: FleetSparklineProps) {
  if (days.length < 2) return null
  return (
    <Sparkline
      active={!dim}
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full transition-opacity duration-base ease-apple ${
        dim ? 'opacity-50' : 'opacity-60 group-hover:opacity-80'
      }`}
      dashedTail
      height={64}
      padBottom={6}
      padTop={10}
      restHoverInk={false}
      values={days.map((d) => d.visitors)}
    />
  )
}

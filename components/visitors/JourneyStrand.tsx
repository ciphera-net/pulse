'use client'

// ─── Signature device #2: the journey strand (approved §9a.4) ───────
//
// An inline SVG of ONE visit: a node per page, a 1.5px line connecting them,
// slightly larger endpoints, and an ORANGE node wherever a custom event fired.
// It is the smallest honest picture of a visit — a shape you can read at a
// glance in a table row without reading a single word.
//
// A per-visitor Sankey was considered and rejected in the design round: one
// visitor's Sankey is a straight line (measured on the Rybbit demo, which shows
// "No journeys in this range" for most users). A strand says the same thing in
// 76 pixels and never lies about having more structure than it has.

interface JourneyStrandProps {
  /** How many pages the visit had. Capped at CAP nodes for rendering. */
  pages: number
  /** Zero-based indices of nodes where a custom event fired. */
  eventAt?: number[]
  width?: number
  className?: string
}

const CAP = 7
const NODE = 3
const END_NODE = 4

export function JourneyStrand({ pages, eventAt = [], width = 76, className }: JourneyStrandProps) {
  const n = Math.max(1, Math.min(pages, CAP))
  const height = 12
  const cy = height / 2
  const pad = END_NODE + 1
  const usable = Math.max(1, width - pad * 2)
  const step = n > 1 ? usable / (n - 1) : 0
  const events = new Set(eventAt)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className={className}
    >
      {n > 1 && (
        <line
          x1={pad}
          y1={cy}
          x2={pad + step * (n - 1)}
          y2={cy}
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-neutral-700"
        />
      )}
      {Array.from({ length: n }, (_, i) => {
        const isEnd = i === 0 || i === n - 1
        const isEvent = events.has(i)
        return (
          <circle
            key={i}
            cx={pad + step * i}
            cy={cy}
            r={isEnd ? END_NODE : NODE}
            // The orange node is the strand's only colour, and it means exactly
            // one thing: a custom event fired on that page. Colouring anything
            // else here would make the signal unreadable.
            className={isEvent ? 'fill-brand-orange' : 'fill-neutral-500'}
          />
        )
      })}
    </svg>
  )
}

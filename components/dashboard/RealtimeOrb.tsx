'use client'

import { cn } from '@/lib/utils'

/**
 * The live-visitor orb, and the switch into realtime mode.
 *
 * It replaces the old chip-plus-popover: clicking it no longer opens a list of
 * active pages, it puts the WHOLE dashboard on a live rolling window. The pages
 * that used to live in the popover are in the dimension cards below, which now
 * describe the same window.
 *
 * DESIGN, approved from the production-mocked options round on 22-09-2026:
 * a 12px two-layer orange orb and the count ALONE — no label, no word.
 *
 * ⚠️ Because the number is bare, `aria-label` and `title` carry the full phrase.
 * A lone digit in a toolbar is meaningless to a screen reader and ambiguous to a
 * first-time viewer, and dropping the visible label is exactly what makes them
 * load-bearing rather than decorative.
 *
 * ⚠️ `tabular-nums`, never `font-mono`: a count is not code, and Facet reserves
 * the mono face for things that would be meaningful typed into a terminal.
 *
 * The chip is square (`rounded-none`) and only the orb is `rounded-full` —
 * Facet's radius scale is 0 at every step but `full`.
 */
export default function RealtimeOrb({
  count,
  live,
  onToggle,
}: {
  /** Visitors active in the tracker's five-minute presence window. */
  count: number
  /** True when the dashboard is currently in realtime mode. */
  live: boolean
  onToggle: () => void
}) {
  const label = `${count} current ${count === 1 ? 'visitor' : 'visitors'}`

  return (
    <button
      type="button"
      // The product tour anchors a step to this attribute. It moved with the
      // control rather than being dropped, or the tour would break silently.
      data-tour="realtime-trigger"
      aria-pressed={live}
      aria-label={live ? `${label}. Leave realtime view` : `${label}. Show realtime view`}
      title={label}
      onClick={onToggle}
      className={cn(
        'flex h-10 items-center gap-2.5 rounded-none border bg-card px-3 text-sm text-foreground transition-colors ease-apple',
        live ? 'border-brand-orange' : 'border-input hover:border-line-hover',
      )}
    >
      <span className="relative flex h-3 w-3">
        {/* The halo only animates when somebody is actually here. A pulsing orb
            over a zero would be the interface insisting on life it cannot see. */}
        {count > 0 && (
          <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-brand-orange opacity-75" />
        )}
        <span
          className={cn(
            'relative inline-flex h-3 w-3 rounded-full',
            count > 0 ? 'bg-brand-orange' : 'bg-neutral-600',
          )}
        />
      </span>
      <span className="tabular-nums text-base font-medium text-foreground">{count}</span>
    </button>
  )
}

'use client'

import { cn } from '@/lib/utils'
import { DASHBOARD_REALTIME_MINUTES } from '@/lib/dashboard/realtimeRange'

/**
 * The live-visitor orb, and the one way into realtime mode.
 *
 * DESIGN, approved from the production-mocked options round on 25-09-2026 (direction
 * A — "smaller, same place", PULSE-65): no box, an 8px dot and the count ALONE in
 * `text-sm`. Nobody here → a grey dot and 0, still clickable; somebody here → the
 * brand-orange dot with its ping halo; realtime on → the `bg-accent` surface and
 * aria-pressed. Placed at the far left of the dashboard toolbar, directly left of the
 * view switcher on Visitors, and display-only under the site name on the share page.
 *
 * ⚠️ Because the number is bare, `aria-label` and `title` carry the full phrase — and
 * the phrase names its window, because the count and the realtime view are the SAME
 * five minutes now (the one question an orb beside a live view invites).
 *
 * ⚠️ `tabular-nums`, never `font-mono`: a count is not code, and Facet reserves the
 * mono face for things that would be meaningful typed into a terminal.
 */
export function describeLiveCount(count: number): string {
  const window = `in the last ${DASHBOARD_REALTIME_MINUTES} minutes`
  if (count === 0) return `Nobody on the site ${window}`
  return `${count} ${count === 1 ? 'person' : 'people'} on the site ${window}`
}

function Dot({ here }: { here: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {/* The halo only animates when somebody is actually here. A pulsing orb over a
          zero would be the interface insisting on life it cannot see. */}
      {here && <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-brand-orange opacity-75" />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', here ? 'bg-brand-orange' : 'bg-neutral-400')} />
    </span>
  )
}

export default function RealtimeOrb({
  count,
  live = false,
  onToggle,
}: {
  /** People on the site in the realtime window (the tracker's presence count). */
  count: number
  /** True when the page is in realtime mode. */
  live?: boolean
  /**
   * Enters and leaves realtime. ABSENT on the share page, where the orb is DISPLAY-ONLY:
   * realtime MODE on the public surface is still refused (pulse-backend parseLiveWindow,
   * pending its privacy pass), so there it must not become a toggle.
   */
  onToggle?: () => void
}) {
  const here = count > 0
  const phrase = describeLiveCount(count)

  if (!onToggle) {
    return (
      <span
        role="status"
        aria-label={phrase}
        title={phrase}
        data-live-orb="display"
        className={cn('inline-flex h-10 items-center gap-2 px-2 text-sm', here ? 'text-foreground' : 'text-muted-foreground')}
      >
        <Dot here={here} />
        <span className="tabular-nums">{count}</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      // The product tour anchors a step to this attribute (lib/tour/anchors.ts). It moved
      // with the control rather than being dropped, or the tour would break silently.
      data-tour="realtime-trigger"
      data-live-orb="toggle"
      aria-pressed={live}
      aria-label={live ? `${phrase}. Leave realtime view` : `${phrase}. Show realtime view`}
      title={phrase}
      onClick={onToggle}
      className={cn(
        'flex h-10 items-center gap-2 rounded-none px-2 text-sm transition-colors ease-apple hover:bg-accent',
        live ? 'bg-accent text-foreground' : here ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <Dot here={here} />
      <span className="tabular-nums">{count}</span>
    </button>
  )
}

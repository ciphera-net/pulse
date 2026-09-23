import type { PeriodPreset } from '@/lib/constants/periods'
import type { Period } from '@/lib/hooks/periodUrl'
import { getLast30MinutesRange } from '@/lib/utils/dateRanges'

// ─── The site dashboard's LIVE MODE declaration ──────────────────────────────
//
// Picking "Realtime" does not choose a window length the way every other preset
// does — it puts the whole page into a live mode: the chart redraws in minute
// buckets, the KPI rail and every block below describe the same rolling window,
// and a WebSocket tells the page to refetch as visitors arrive.
//
// It is declared here rather than added to the GLOBAL preset list because the
// `Period` grammar is shared with funnels, search, CDN and uptime, none of which
// can serve a live window — a global entry would appear in their pickers and
// silently resolve to something they cannot honour. `extraPresets` is the
// established page-scoped seam; the Visitors page already uses it for its own
// live group (lib/visitors/range.ts), and this follows that shape deliberately
// rather than inventing a second mechanism.

/**
 * The live window, in rolling MINUTES.
 *
 * 30 minutes is the span the chart draws, one bar per minute — long enough to
 * show a shape and short enough that every bucket is a real measurement rather
 * than a mostly-empty axis.
 *
 * ⚠️ It is NOT the same number as the "current visitors" count in the orb. That
 * is the tracker's own five-minute presence window (internal/realtime), which
 * answers "who is here now"; this answers "what happened in the last half hour".
 * Two different questions, deliberately two different spans — do not "fix" them
 * into agreement.
 */
export const DASHBOARD_REALTIME_MINUTES = 30

export const DASHBOARD_ROLLING_MINUTES: Partial<Record<Period, number>> = {
  realtime: DASHBOARD_REALTIME_MINUTES,
}

export const DASHBOARD_REALTIME_PRESETS: {
  group: string
  presets: PeriodPreset[]
} = {
  group: 'Live',
  presets: [
    {
      key: 'realtime',
      label: 'Realtime',
      group: 'Live',
      // resolve() still returns a concrete span so the picker can render a label
      // and any consumer that insists on dates has something true to read. The
      // FETCH does not use it — a live window is sent as `minutes=`, because
      // "the last 30 minutes" is not expressible as two dates without losing the
      // thing that makes it live.
      resolve: getLast30MinutesRange,
    },
  ],
}

/** True when the page is in live mode. One predicate, so no component invents its own. */
export function isRealtimePeriod(period: Period): boolean {
  return period === 'realtime'
}

/**
 * Realtime is a MODE, not a view somebody picked for next time — so it must never
 * be written to the dashboard's range memory.
 *
 * 🔴 It was, until 23-09-2026, and that had two costs at once: a later visit
 * opened in a live view nobody chose, and the preference it overwrote was gone
 * for good, because memory cannot tell you what it replaced.
 */
export const DASHBOARD_EPHEMERAL_PERIODS: readonly Period[] = ['realtime']

/** The view a reader was on before they glanced at the live one. */
export interface PreviousView {
  period: Period
  /** Carried only for a custom span, where the token alone is not the view. */
  range?: { start: string; end: string }
}

/**
 * Where leaving realtime should land.
 *
 * 🔴 This used to be DEFAULT_PERIOD unconditionally, which meant somebody on
 * "Last 7 days" who glanced at who was on the site now came back to "Last 30
 * days". Checking the live view is a DETOUR, and a detour that silently rewrites
 * where you were is a bug.
 *
 * Order, and why:
 *  1. The view held from this session — what the reader was actually on.
 *  2. This page's stored preference, when there is no session history (a tab
 *     opened straight onto ?period=realtime, or reloaded while live). It is
 *     never realtime itself, because realtime is declared ephemeral, so this
 *     cannot put somebody back into the view they were leaving.
 *  3. The default, when a reader has no preference yet.
 *
 * The session view is deliberately NOT in the URL: that keeps a shared
 * ?period=realtime link honest, carrying the live view and nothing about the
 * sender's private history. A recipient has no session view and falls through
 * to their OWN remembered period, which is the right answer for them.
 */
export function periodOnLeavingRealtime(
  previous: PreviousView | null,
  remembered: Period | null,
  fallback: Period,
): PreviousView {
  if (previous) return previous
  // A stored realtime would be a bug elsewhere (see DASHBOARD_EPHEMERAL_PERIODS),
  // but refusing it here too means one defect cannot become a trap door that
  // makes the control look broken.
  if (remembered && !isRealtimePeriod(remembered)) return { period: remembered }
  return { period: fallback }
}

import type { Period } from '@/lib/hooks/periodUrl'

// ─── The LIVE MODE declaration — the dashboard and Visitors ─────────────────
//
// Realtime does not choose a window length the way a menu row does — it puts the whole
// page into a live mode: the chart redraws in minute buckets, the KPI rail and every
// block below describe the same rolling window, and a WebSocket tells the page to
// refetch as visitors arrive. It is entered from the orb (RealtimeOrb) and nowhere else:
// it is not a row in the view switcher (owner decision 25-09-2026).

/**
 * The live window, in rolling MINUTES — the same span as the orb's count.
 *
 * 🔁 This was 30 until 25-09-2026, beside a comment saying the orb (the tracker's
 * five-minute presence window, internal/realtime) and the view were "two different
 * questions, deliberately two different spans — do not 'fix' them into agreement". That
 * 30 was a design default of the 22-09 build, not a ruling, and the owner saw the cost
 * side by side: realtime on, the orb reading 0 while the page's own rail read 1.
 * Owner, 25-09-2026: "the orb should show last 5 min & also the realtime should show 5
 * mins." Confirmed AFTER seeing what it costs — measured over 7 days, the share of
 * minutes in which the realtime view shows at least one pageview is 25% on the busiest
 * site and 5–9% on a typical one at 5 minutes, against 72% and 24–40% at 30 (plan
 * §11.10). The view is often empty now, and says so in one line (REALTIME_EMPTY_LINE).
 *
 * 5 is also the API's floor (pulse-backend utils_extra.go liveWindowMin), so no backend
 * change was needed.
 */
export const DASHBOARD_REALTIME_MINUTES = 5

/** What every block in realtime mode says when the window is empty (owner copy, 25-09). */
export const REALTIME_EMPTY_LINE = 'Nobody on the site in the last 5 minutes.'

/** Periods served as a rolling window, mapped to their width in minutes. */
export const REALTIME_ROLLING_MINUTES: Partial<Record<Period, number>> = {
  realtime: DASHBOARD_REALTIME_MINUTES,
}

/** True when the page is in live mode. One predicate, so no component invents its own. */
export function isRealtimePeriod(period: Period): boolean {
  return period === 'realtime'
}

/**
 * Realtime is a MODE, not a view somebody picked for next time — so it is never
 * written to the view memory, on any page.
 *
 * 🔴 It was, until 23-09-2026, and that had two costs at once: a later visit opened in
 * a live view nobody chose, and the preference it overwrote was gone for good, because
 * memory cannot tell you what it replaced.
 */
export const REALTIME_MODES: readonly Period[] = ['realtime']

/** The view a reader was on before they glanced at the live one. */
export interface PreviousView {
  period: Period
  /** Carried only for a custom span, where the token alone is not the view. */
  range?: { start: string; end: string }
}

/**
 * Where leaving realtime should land.
 *
 * 🔴 This used to be DEFAULT_PERIOD unconditionally, which meant somebody on "Last 7
 * days" who glanced at who was on the site now came back to "Last 30 days". Checking the
 * live view is a DETOUR, and a detour that silently rewrites where you were is a bug.
 *
 * Order, and why:
 *  1. The view held from this session — what the reader was actually on.
 *  2. The stored view (the one memory: a named row, or this tab's custom range), when
 *     there is no session history (a tab opened straight onto ?period=realtime, or
 *     reloaded while live). It is never realtime itself, because realtime is a mode and
 *     is never stored, so this cannot put somebody back into the view they were leaving.
 *  3. The default, when a reader has no preference yet.
 *
 * The session view is deliberately NOT in the URL: that keeps a shared ?period=realtime
 * link honest, carrying the live view and nothing about the sender's private history. A
 * recipient has no session view and falls through to their OWN stored view.
 */
export function periodOnLeavingRealtime(
  previous: PreviousView | null,
  remembered: PreviousView | null,
  fallback: Period,
): PreviousView {
  if (previous) return previous
  // A stored realtime would be a bug elsewhere (see REALTIME_MODES), but refusing it
  // here too means one defect cannot become a trap door that makes the control look
  // broken.
  if (remembered && !isRealtimePeriod(remembered.period)) return remembered
  return { period: fallback }
}

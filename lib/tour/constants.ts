/**
 * Tour wiring shared between the controller and its entry points. Kept apart
 * from TourController so the command palette can reference the handoff keys
 * without pulling driver.js into its chunk.
 */

/** localStorage: `${TOUR_DONE_PREFIX}${userId}` — per-user "seen it" flag. */
export const TOUR_DONE_PREFIX = 'pulse_tour_done_'

/**
 * sessionStorage one-shot: a manual start requested from another route,
 * written as a Date.now() timestamp. The palette sets it before navigating to
 * the dashboard; the controller consumes it on mount. An event alone cannot
 * survive the navigation.
 */
export const TOUR_REQUEST_KEY = 'pulse_tour_request'

/**
 * A request is honoured only while the navigation that queued it is plausibly
 * still in flight. Without the cutoff, a request whose dashboard never fully
 * rendered (load error, back button mid-navigation) sits in the tab for its
 * whole life and force-starts the tour on an unrelated dashboard visit later.
 */
export const TOUR_REQUEST_TTL_MS = 60_000

/** Window event for a manual start when the dashboard is already mounted. */
export const TOUR_START_EVENT = 'pulse:start-tour'

/** The tour exists on md+ only (owner ruling 24-08-2026: no mobile tour). */
export const TOUR_MD_QUERY = '(min-width: 768px)'

/** driver.js stamps this on <body> for the duration of a run. */
export const TOUR_ACTIVE_CLASS = 'driver-active'

/**
 * True while the tour owns the screen. App-global shortcut handlers check
 * this: ⌘K, `?`, `,`, `g x` and `[` would otherwise open surfaces that render
 * BENEATH driver's overlay (app modals sit at z-[100]/[101], the overlay at
 * 10000) and arrive click-dead.
 */
export function isTourActive(): boolean {
  return typeof document !== 'undefined' && document.body.classList.contains(TOUR_ACTIVE_CLASS)
}

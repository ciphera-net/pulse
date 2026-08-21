/**
 * Which date range the dashboard body is allowed to render.
 *
 * 🔴 THIS IS A FUNCTION BECAUSE THE INLINE VERSION LEAKED. It was one
 * expression on the dashboard page, and the first attempt at fixing the
 * 20-08-2026 themodestyhouse.com report suppressed the *request* for an
 * unresolved period while leaving this expression to fall through to the
 * client-computed range — which for the placeholder period is the same
 * thirty-day window the fix existed to keep off the screen. Extracted so the
 * rule can be stated once, tested, and broken loudly.
 *
 * The rule, in order:
 *
 *  1. **Period not resolved yet → null.** `useUrlDateRange` reads the
 *     remembered preset in an effect, so the first render of a bare-URL mount
 *     reports DEFAULT_PERIOD ('30'). That is a PLACEHOLDER, not a choice.
 *     Rendering anything against it shows a customer thirty days of data under
 *     whatever label the picker settles on a render later.
 *  2. **Server answer wins.** For a relative period the server resolves the
 *     boundary in the SITE's timezone and echoes it; the client must display
 *     that, never its own arithmetic.
 *  3. **Waiting on the server → null**, so consumers hold rather than guess.
 *  4. **Custom ranges need no resolution** — the user gave explicit dates.
 *
 * null means "no range yet". Every consumer must gate on it; that is what
 * makes a loading state possible instead of a wrong one.
 */
export interface DateRange {
  start: string
  end: string
}

export function resolveDashboardRange(
  periodReady: boolean,
  serverRange: DateRange | undefined,
  apiPeriod: string | undefined,
  clientRange: DateRange,
): DateRange | null {
  // 1 — the placeholder period must never reach a consumer.
  if (!periodReady) return null
  // 2 — the server owns timezone-sensitive resolution.
  if (serverRange) return serverRange
  // 3 — a relative period with no answer yet is not a range.
  if (apiPeriod) return null
  // 4 — custom ranges are explicit dates; nothing to resolve.
  return clientRange
}

/**
 * The range a page may FETCH with — empty strings until the period is resolved.
 *
 * The dashboard gates by holding a NULLABLE range and not rendering its cards
 * (`resolveDashboardRange` above). The other date-ranged pages — funnels,
 * search, cdn, uptime — pass concrete dates straight into SWR hooks whose keys
 * already null out on an empty date, so withholding the dates is the same gate
 * expressed in the shape those pages already have.
 *
 * 🔴 KEEP THE PICKER'S VALUE SEPARATE. Callers pass the hook's `dateRange` to
 * the DateRangePicker for DISPLAY and this value to hooks for FETCHING. They
 * differ for exactly one render, and collapsing them would blank the picker.
 *
 * Why it matters here is milder than on the dashboard but not nothing: these
 * pages key their caches on the DATES, so a placeholder fetch lands in its own
 * entry and cannot be served for the real range. What it costs is a wasted
 * 30-day request on every bare-URL mount, and a possible flash of 30-day
 * numbers before the remembered preset arrives.
 */
export function fetchableRange(periodReady: boolean, picked: DateRange): DateRange {
  return periodReady ? picked : { start: '', end: '' }
}

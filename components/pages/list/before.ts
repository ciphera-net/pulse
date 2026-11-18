// ---------------------------------------------------------------------------
// The period before, as the Pages page knows it (18-11-2026). The list's Change column, an opened page's measures and
// the strip's tiles each say what the period before held, and what they may say depends on what the page knows:
//   none      there is no period before to compare (All time, or a page that compares nothing)
//   loading   its read is on the way: what depends on it shows the loading mark, never "no period before"
//   failed    its read failed: the line says so, never "no period before"
//   ready     in hand
// Where it is in hand and a figure had no value then, the line says why in words. It never puts a dash in a
// sentence: the owner, 18-11-2026, of "— in the period before": "this needs fixing".
// ---------------------------------------------------------------------------

export type BeforeState = 'none' | 'loading' | 'failed' | 'ready'

/** What the page knows of the period before, from its read. `asked`: there is a period before and it was asked for. */
export function beforeState(asked: boolean, data: unknown, error: unknown): BeforeState {
  if (!asked) return 'none'
  // An answer in hand wins over a later failure: SWR keeps the last answer when a refresh fails.
  if (data !== undefined) return 'ready'
  return error ? 'failed' : 'loading'
}

/** A figure that had views behind it in the period before and still no value: time or scroll not reported. */
export const NOT_MEASURED_BEFORE = 'not measured in the period before'
/** The read of the period before failed. */
export const BEFORE_DID_NOT_LOAD = 'the period before did not load'

/**
 * The line under a figure about the period before. `then` is the figure then, or null where it had none;
 * `none` is what this place says when there is no period before; `missing` why a figure had no value then.
 * Null while the period before loads: the caller draws the loading mark in its place.
 */
export function beforeLine(state: BeforeState, then: string | null, none: string, missing: string): string | null {
  switch (state) {
    case 'none':
      return none
    case 'loading':
      return null
    case 'failed':
      return BEFORE_DID_NOT_LOAD
    case 'ready':
      return then != null ? `${then} in the period before` : missing
  }
}

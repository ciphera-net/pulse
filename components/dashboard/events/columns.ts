// ---------------------------------------------------------------------------
// ONE definition of the Events block's number columns, used by the names in each pane's header and by the numbers
// under them, so the two cannot drift apart (components/dashboard/events/).
// ---------------------------------------------------------------------------

/** Rows to a page, as every block of the frame: seven rows fill the body over the footer. */
export const LIMIT = 7

/** A count's column (visitors, events). */
export const COL = 'w-14 shrink-0 text-right'
/** The conversion's column: its name is the widest of the head. */
export const COL_RATE = 'w-[74px] shrink-0 text-right'
/** A value's share of the events that carry its property. */
export const COL_SHARE = 'w-12 shrink-0 text-right'
/** The caret's own column at a row's right end (the press cue), and the same room in the header. */
export const COL_CUE = 'w-4 shrink-0'
/** The space between two columns, and between their two names. */
export const GAP = 'gap-3'

/**
 * A row's name and its bar in ONE box, from the row's left edge to where the numbers begin. Three number columns
 * take up to two fifths of a row, so the blocks' usual bar (three quarters of the whole row) would run under them.
 * In this box the longest bar ends where the numbers start, at every width.
 */
export const LABEL_BOX = 'pointer-events-none relative -ml-2 flex h-full min-w-0 flex-1 items-center pl-2'

/** On a narrow block the list keeps who did it and the conversion; how often comes back from `sm` up. */
export const NARROW_OFF = 'hidden sm:block'

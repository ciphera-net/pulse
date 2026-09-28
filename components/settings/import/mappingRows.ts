// ─── The mapping step's state, as pure functions (M12-d, mapping A) ────────
//
// One row per source event: its label and count, the name it gets in Pulse
// (suggested, editable), and whether it is imported. A switched-off row keeps
// its name (the ruled shot shows it, disabled), and sends `null`.
//
// The page checks every name before the create request (the same rules the
// server applies, core/events.ts), so the customer is told next to the field,
// never by a 400 after the button. The server re-checks all of it (D9).

import {
  eventNameProblem,
  isBuiltinEventName,
  suggestEventName,
  type EventNameProblem,
  type SourceEvent,
} from '@/lib/import/core/events'
import { BUILTIN_EVENT_NOTE, KNOWN_EVENT_NOTE, addsUpWithNote } from '@/lib/import/source-display'
import type { EventMap } from '@/lib/import/types'

export interface MappingRow {
  source_name: string
  count: number
  /** The name in Pulse, as the field holds it. */
  name: string
  included: boolean
  /** The customer typed in this field: a later suggestion (the goals arriving) leaves it alone. */
  edited: boolean
}

/** Every source event, with M12-d's suggestion, imported. */
export function initialRows(events: readonly SourceEvent[], source: string, goalNames: readonly string[]): MappingRow[] {
  return events.map((e, i) => ({
    source_name: e.source_name,
    count: e.count,
    name: suggestEventName(e.source_name, i + 1, { source, goalNames }).name,
    included: true,
    edited: false,
  }))
}

/** The suggestions again (the site's goals arrived after the first render), for every row not typed in. */
export function resuggest(rows: readonly MappingRow[], source: string, goalNames: readonly string[]): MappingRow[] {
  return rows.map((r, i) => (r.edited ? r : { ...r, name: suggestEventName(r.source_name, i + 1, { source, goalNames }).name }))
}

/** Words under a name that breaks a rule. Not ruled copy: the rule, said plainly (W-M12-1 carries it too). */
export const PROBLEM_TEXT: Readonly<Record<EventNameProblem, string>> = {
  empty: 'Enter a name, or switch this event off.',
  too_long: 'Use at most 64 characters.',
  charset: 'Use only letters, numbers and underscores.',
  reserved: 'Pulse keeps this name for its own events.',
}

/** Why an imported row's name can't be sent, or null. A switched-off row is never a problem. */
export function rowProblem(row: MappingRow): EventNameProblem | null {
  return row.included ? eventNameProblem(row.name) : null
}

/**
 * The lines under a row's name (W-M12-2, W-M12-3, constraint 5): what the name
 * adds to. Only for an imported row with a valid name, since a note about a
 * name that can't be sent would be about nothing.
 *
 * `known` is every name Pulse already records for this site: its goals' event
 * names and the names it has measured itself. A built-in says what it adds to
 * instead, so the two never stack.
 */
export function rowNotes(rows: readonly MappingRow[], index: number, known: ReadonlySet<string>): string[] {
  const row = rows[index]
  if (!row || rowProblem(row) !== null || !row.included) return []
  const notes: string[] = []
  if (isBuiltinEventName(row.name)) notes.push(BUILTIN_EVENT_NOTE[row.name])
  else if (known.has(row.name)) notes.push(KNOWN_EVENT_NOTE)
  const others = rows.filter((r, i) => i !== index && r.included && r.name === row.name).map((r) => r.source_name)
  if (others.length > 0) notes.push(addsUpWithNote(others))
  return notes
}

/** What the create request carries, and whether it may be sent. */
export function mappingResult(rows: readonly MappingRow[]): { map: EventMap; valid: boolean; included: number } {
  const map: EventMap = {}
  let valid = true
  let included = 0
  for (const r of rows) {
    if (rowProblem(r) !== null) valid = false
    map[r.source_name] = r.included ? r.name : null
    if (r.included) included++
  }
  return { map, valid, included }
}

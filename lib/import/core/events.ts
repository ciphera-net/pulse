// ─── Imported events: names, suggestions and the per-day cap (M12) ────────
//
// A source's custom events arrive under the tool's own labels ("Outbound Link:
// Click", "Signup Form", Matomo's "Category - Action"), and most of those are
// not valid Pulse event names (`^[a-zA-Z0-9_]+$`, at most 64 characters). So
// the confirm step asks for a name per source event (M12-d, Q-M12-1), and this
// module holds every rule that step and the parsers share:
//
//   - `cleanSourceName`: the source label as it travels on the wire. The
//     browser sends every source event under this form, whatever the
//     customer's map says, so the fingerprint depends on the file only (M12-b);
//   - `eventNameProblem`: the client-side mirror of the server's
//     `EventNameValid` plus the names Pulse keeps for itself. The server
//     re-checks every name (D9, `invalid_event_map`); this only lets the page
//     say so first;
//   - `suggestEventName`: built-in equivalents (Q-M12-2), then an existing goal,
//     then the slug;
//   - `capEvents`: 1,000 source names per day plus `(other)`, the acquisition
//     cap's shape through the same `capGroup` (M12-g).
//
// Pure functions only: the worker imports the cleaning and the cap, the page
// imports the names.

import type { EventRow } from '../types'
import { OTHER, capGroup } from './cap'

/** A Pulse event name's longest form (the server's MaxEventNameLen). */
export const MAX_EVENT_NAME_LENGTH = 64
/** A source label's longest form on the wire (contract §3.12m12b-1). */
export const MAX_SOURCE_NAME_LENGTH = 200
/** Named source events per day before the rest fold into `(other)` (M12-g). */
export const EVENT_NAME_CAP = 1000
/**
 * Distinct source events one import may name: the server refuses an
 * `event_map` with more keys (contract §3.12m12b-2), so the browser never plans
 * more. Past it, the smallest names over the whole file travel as `(other)`.
 */
export const MAX_SOURCE_EVENTS = 10_000

/** The server's EventNameRegex. */
const EVENT_NAME_RE = /^[a-zA-Z0-9_]+$/

/**
 * Names Pulse's own tracker collects and an import may add to (Q-M12-2, M12-e).
 * Each is what the Events card shows, with its underscores as spaces.
 */
export const BUILTIN_EVENT_NAMES = ['outbound_link', 'file_download', '404'] as const
export type BuiltinEventName = (typeof BUILTIN_EVENT_NAMES)[number]

/**
 * Names Pulse used to collect and deliberately no longer does. A copy of
 * pulse-backend's `retiredEventNames` (internal/api/events.go), which the
 * server's `event_map` check refuses: kept in step by hand, and the server is
 * the one that decides.
 */
export const RETIRED_EVENT_NAMES: ReadonlySet<string> = new Set([
  'rage_click',
  'dead_click',
  'content_copy',
  'content_print',
  'video_play',
  'video_pause',
  'video_complete',
])

/**
 * Each tool's own labels for Pulse's built-ins (Q-M12-2): matched exactly, as
 * the tool writes them, never by similarity. GA4's pair is listed for M5.
 */
const BUILTIN_BY_SOURCE: Readonly<Record<string, Readonly<Record<string, BuiltinEventName>>>> = {
  plausible: { 'Outbound Link: Click': 'outbound_link', 'File Download': 'file_download', '404': '404' },
  ga4: { click: 'outbound_link', file_download: 'file_download' },
}

/**
 * Runes pulse-backend's textclean.Clean drops (internal/textclean): '<' and
 * '>', every control (Go's unicode.IsControl is exactly Cc), Cf, Zl, Zp,
 * Variation_Selector and Other_Default_Ignorable_Code_Point. JS has no
 * `Other_` property, but Default_Ignorable_Code_Point is Other_DICP plus Cf
 * plus Variation_Selector minus White_Space and a few Cf format marks, none of
 * which Other_DICP holds, so adding DICP to Cf and Variation_Selector removes
 * exactly the same set.
 */
const SERVER_DROPPED =
  /[<>\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Variation_Selector}\p{Default_Ignorable_Code_Point}]/gu

const LONE_SURROGATE = /\p{Cs}/gu

/** Go's unicode.IsSpace, at either end: \t \n \v \f \r, space, U+0085, U+00A0, and every Z rune. */
const GO_SPACE_ENDS = /^[\t\n\v\f\r \u0085\u00A0\p{Z}]+|[\t\n\v\f\r \u0085\u00A0\p{Z}]+$/gu

/** Go's strings.TrimSpace. */
function goTrimSpace(s: string): string {
  return s.replace(GO_SPACE_ENDS, '')
}

/**
 * A source label as it goes on the wire, keyed EXACTLY as the server keys it
 * (textclean.Clean): a lone surrogate (the only malformed text a JS string can
 * hold; the CSV reader already refuses invalid UTF-8 bytes) becomes U+FFFD, the
 * server's dropped runes go, Go's TrimSpace runs, then the 200-character cap
 * (code points, so an emoji is never split) and the trim again. Idempotent.
 *
 * 🔴 Why exact: two labels that differ only by a '<', a zero-width joiner or an
 * emoji variation selector are one key on the server. If the browser kept
 * them apart, its map would hold two keys the server collapses into one, and
 * the server refuses the whole map as a duplicate. Cleaned here, they are one
 * name before the fold, so they merge like any repeated name.
 *
 * `''` means the row has no usable name and is skipped as `event_name_invalid`.
 */
export function cleanSourceName(raw: string): string {
  // In `u` mode a surrogate PAIR is one code point, so \p{Cs} matches only a
  // lone half: the same as String.prototype.toWellFormed, which older browsers lack.
  let out = goTrimSpace(raw.replace(LONE_SURROGATE, '\uFFFD').replace(SERVER_DROPPED, ''))
  const chars = Array.from(out)
  if (chars.length > MAX_SOURCE_NAME_LENGTH) out = goTrimSpace(chars.slice(0, MAX_SOURCE_NAME_LENGTH).join(''))
  return out
}

/**
 * Visitors of two rows merged under one source name: summed when both say,
 * null when either doesn't. A merged row whose parts are partly unmeasured
 * has no honest total, and a partial sum would read as one (null is "not
 * measured", never zero). Within one export every row is one or the other, so
 * in practice this only ever sums, or stays null.
 */
export function mergeEventVisitors(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a + b
}

/**
 * M12-d's slug: lower-case, every run of anything outside `[a-z0-9_]` becomes
 * one `_`, underscores trimmed from both ends, cut to 64 (and trimmed again).
 * A name with nothing left is `event_<n>`, `n` being its 1-based position in
 * the list the customer sees.
 */
export function slugEventName(sourceName: string, n: number): string {
  const slug = sourceName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_EVENT_NAME_LENGTH)
    .replace(/_+$/, '')
  return slug === '' ? `event_${n}` : slug
}

export type EventNameProblem = 'empty' | 'too_long' | 'charset' | 'reserved'

/**
 * Why `name` can't be a Pulse event name, or null when it can. Mirrors
 * `EventNameValid` (the charset and 64) and refuses `pageview`, every `pulse_`
 * autocapture name and the retired set (M12-e): the server does the same.
 */
export function eventNameProblem(name: string): EventNameProblem | null {
  if (name === '') return 'empty'
  if (name.length > MAX_EVENT_NAME_LENGTH) return 'too_long'
  if (!EVENT_NAME_RE.test(name)) return 'charset'
  const lower = name.toLowerCase()
  if (lower === 'pageview' || lower.startsWith('pulse_') || RETIRED_EVENT_NAMES.has(lower)) return 'reserved'
  return null
}

/** The built-in a tool's own label stands for, or null (exact match only). */
export function builtinTarget(source: string, sourceName: string): BuiltinEventName | null {
  const table = BUILTIN_BY_SOURCE[source]
  if (!table || !Object.prototype.hasOwnProperty.call(table, sourceName)) return null
  return table[sourceName]
}

export function isBuiltinEventName(name: string): name is BuiltinEventName {
  return (BUILTIN_EVENT_NAMES as readonly string[]).includes(name)
}

export interface EventSuggestion {
  name: string
  /** Set when the suggestion is one of Pulse's own names. */
  builtin: BuiltinEventName | null
}

/**
 * M12-d's order: the tool's label for a built-in; else an existing goal whose
 * event name is the slug (compared without case, suggested as the goal spells
 * it, so the imported counts land on the goal); else the slug. A slug that is
 * reserved is never suggested: it takes `event_<n>` instead.
 */
export function suggestEventName(
  sourceName: string,
  n: number,
  ctx: { source: string; goalNames: readonly string[] },
): EventSuggestion {
  const builtin = builtinTarget(ctx.source, sourceName)
  if (builtin) return { name: builtin, builtin }
  const slug = slugEventName(sourceName, n)
  const goal = ctx.goalNames.find((g) => g.toLowerCase() === slug && eventNameProblem(g) === null)
  if (goal) return { name: goal, builtin: null }
  if (eventNameProblem(slug) !== null) return { name: `event_${n}`, builtin: null }
  return { name: slug, builtin: null }
}

/** One source event and its count over the whole file (the plan's list). */
export interface SourceEvent {
  source_name: string
  count: number
}

/** Every source event mapped to its suggestion: what a caller with no mapping step sends. */
export function defaultEventMap(
  events: readonly SourceEvent[],
  source: string,
  goalNames: readonly string[],
): Record<string, string> {
  const map: Record<string, string> = {}
  events.forEach((e, i) => {
    map[e.source_name] = suggestEventName(e.source_name, i + 1, { source, goalNames }).name
  })
  return map
}

/**
 * Per day: at most 1,000 named source events, ranked by count (then visitors,
 * then name); the rest summed into one `(other)` row on top. A source's own
 * `(other)` is never counted as a named event.
 */
export function capEvents(rows: readonly EventRow[]): EventRow[] {
  const groups = new Map<string, EventRow[]>()
  for (const r of rows) {
    let list = groups.get(r.date)
    if (!list) groups.set(r.date, (list = []))
    list.push(r)
  }
  const out: EventRow[] = []
  for (const list of groups.values()) {
    const split = capGroup(
      list,
      EVENT_NAME_CAP,
      (r) => ({ visitors: r.count, pageviews: r.visitors, visits: null, tiebreak: r.source_name }),
      (r) => r.source_name === OTHER,
    )
    if (!split) {
      for (const r of list) out.push(r)
      continue
    }
    for (const r of split.kept) out.push(r)
    const other: EventRow = { date: split.folded[0].date, source_name: OTHER, visitors: null, count: 0 }
    let first = true
    for (const r of split.folded) {
      other.count += r.count
      other.visitors = first ? r.visitors : mergeEventVisitors(other.visitors, r.visitors)
      first = false
    }
    out.push(other)
  }
  return out
}

/**
 * The plan's list of source events: every name the batches carry except
 * `(other)` (which needs no map entry), with its total count, largest first
 * and then by name, so the confirm step lists the same file the same way.
 */
export function sourceEventList(rows: readonly EventRow[]): SourceEvent[] {
  const totals = new Map<string, number>()
  for (const r of rows) {
    if (r.source_name === OTHER) continue
    totals.set(r.source_name, (totals.get(r.source_name) ?? 0) + r.count)
  }
  return [...totals.entries()]
    .map(([source_name, count]) => ({ source_name, count }))
    .sort((a, b) => b.count - a.count || (a.source_name < b.source_name ? -1 : a.source_name > b.source_name ? 1 : 0))
}

/**
 * Keeps at most `limit` distinct source names across the whole file (the
 * largest by total count, then by name); every other name's rows are folded
 * into that day's `(other)` row, merged with any `(other)` the day already has,
 * so a day still carries one row per key. Deterministic in the file alone, so
 * the fingerprint stays a function of the file.
 */
export function capSourceEvents(rows: readonly EventRow[], limit: number = MAX_SOURCE_EVENTS): EventRow[] {
  const keep = new Set(sourceEventList(rows).slice(0, limit).map((e) => e.source_name))
  const out: EventRow[] = []
  const other = new Map<string, EventRow>()
  for (const r of rows) {
    if (r.source_name !== OTHER && keep.has(r.source_name)) {
      out.push(r)
      continue
    }
    const have = other.get(r.date)
    if (!have) other.set(r.date, { date: r.date, source_name: OTHER, visitors: r.visitors, count: r.count })
    else {
      have.count += r.count
      have.visitors = mergeEventVisitors(have.visitors, r.visitors)
    }
  }
  if (other.size === 0) return out
  for (const o of other.values()) out.push(o)
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.source_name < b.source_name ? -1 : a.source_name > b.source_name ? 1 : 0))
  return out
}

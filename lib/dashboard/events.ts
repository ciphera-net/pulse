// ---------------------------------------------------------------------------
// The Events block of the new dashboard frame: its names and its numbers, pure, so they can be tested without the
// block (components/dashboard/events/EventsBlock.tsx; design Pulse/docs/plans/14-11-2026-dashboard-overhaul-2-plan.md
// §10t, §10ad, rulings R37, R41 and R51).
//
//   * Which events Pulse writes by itself, and what each is called. The site's own events and the automatic ones
//     are the block's two tabs: today's block prints every stored name with its underscores as spaces, so the
//     tracker's own events read as the site's ("pulse click").
//   * A goal is an event with a name of its own, so a goal is a row of the same list under that name (R37).
//   * A property's name, and the reading order of an automatic event's keys.
//   * Who did an event (its visitors), the share a row prints, and the rows of one property's values.
//
// Lookups go through Maps: an event or a key is any string a site sends, and a plain object would answer
// "constructor" or "toString" with a function.
// ---------------------------------------------------------------------------
import type { EventPropertyValue, GoalCountStat } from '@/lib/api/stats'
import { groupSameRows } from '@/lib/dashboard/sameRows'

/** The Events block's note when its numbers include imported days (M12-f), in the rail's own words (M11). */
export const EVENTS_IMPORTED_WORD = 'incl. imported days'

/**
 * Events written without the site's own code: by the tracker (outbound_link, file_download), by the optional
 * interactions script (pulse_*), or by the server (404, from a page's title). Stored name to the name shown.
 */
const AUTOMATIC_EVENTS = new Map<string, string>([
  ['outbound_link', 'Outbound clicks'],
  ['file_download', 'File downloads'],
  ['404', 'Pages not found'],
  ['pulse_click', 'Clicks'],
  ['pulse_copy', 'Copies'],
  ['pulse_form_submit', 'Form submits'],
])

/** True for an event Pulse writes by itself. `pulse_` is the tracker's own prefix: a new name under it is automatic too. */
export function isAutomatic(event: string): boolean {
  return AUTOMATIC_EVENTS.has(event) || event.startsWith('pulse_')
}

/** The cap's fold row (M12-g): stored as `(other)`, shown as a word. */
const OTHER = '(other)'

/** A stored key made readable: underscores as spaces, the first letter a capital. */
function readable(key: string): string {
  const s = key.replace(/_/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : key
}

/** A row's name: the goal's own name, the automatic event's, or the stored name made readable. */
export function eventName(row: Pick<GoalCountStat, 'event_name' | 'display_name'>): string {
  if (row.event_name === OTHER) return 'Other'
  return row.display_name?.trim() || AUTOMATIC_EVENTS.get(row.event_name) || readable(row.event_name)
}

/**
 * What each row of ONE list reads, by stored event name.
 *
 * A list draws a name once (lib/dashboard/sameRows.ts). A row is one event, because its properties are read by its
 * stored name, so two events are never merged: two whose names read the same (`signup` and `Signup` both read
 * "Signup") each read their stored name instead, which no other event of the list has. Repeated until nothing
 * reads the same, because a stored name could in turn match another row's name; each pass only ever moves a row to
 * its stored name, so it ends.
 */
export function eventLabels(rows: readonly Pick<GoalCountStat, 'event_name' | 'display_name'>[]): Map<string, string> {
  const labels = new Map(rows.map((row) => [row.event_name, eventName(row)]))
  let changed = true
  while (changed) {
    changed = false
    for (const group of groupSameRows(rows, (row) => labels.get(row.event_name) as string)) {
      if (group.length < 2) continue
      for (const row of group) {
        if (labels.get(row.event_name) === row.event_name) continue
        labels.set(row.event_name, row.event_name)
        changed = true
      }
    }
  }
  return labels
}

/** The properties the tracker writes itself, by the word a person would use. */
const AUTOMATIC_KEYS = new Map<string, string>([
  ['url', 'Link'],
  ['page_path', 'Page'],
  ['text', 'Text'],
  ['tag', 'Element'],
  ['id', 'Element id'],
  ['fields', 'Fields'],
  ['form_id', 'Form id'],
  ['form_name', 'Form name'],
])

/** A property's name: the tracker's own keys get their word, a site's own keys are made readable. */
export function propertyName(event: string, key: string): string {
  return (isAutomatic(event) ? AUTOMATIC_KEYS.get(key) : undefined) ?? readable(key)
}

/** The tracker's own keys in a reading order: what was pressed first, the page it was pressed on last. */
const AUTOMATIC_KEY_ORDER = ['url', 'text', 'fields', 'form_name', 'form_id', 'tag', 'id', 'page_path']

/**
 * The keys in the order their tabs stand. A site's own keys keep the server's order (by how many events carry
 * them); an automatic event's are put in reading order, because the server's put outbound clicks on "Page" first
 * (both keys are on every click).
 */
export function orderKeys<T extends { key: string }>(event: string, keys: readonly T[]): T[] {
  if (!isAutomatic(event)) return [...keys]
  const rank = (key: string) => {
    const i = AUTOMATIC_KEY_ORDER.indexOf(key)
    return i === -1 ? AUTOMATIC_KEY_ORDER.length : i
  }
  return [...keys].sort((a, b) => rank(a.key) - rank(b.key))
}

/** Who did an event: the server's distinct visitors, or its count where an older answer carries none. */
export const people = (row: GoalCountStat): number => row.visitors ?? row.count

/**
 * The site's own events and the automatic ones, each ranked by visitors, then by events. Rows that tie on both
 * keep the order the server sent them in.
 */
export function splitEvents(goalCounts: readonly GoalCountStat[]): { own: GoalCountStat[]; automatic: GoalCountStat[] } {
  const ranked = [...goalCounts].sort((a, b) => people(b) - people(a) || b.count - a.count)
  return { own: ranked.filter((row) => !isAutomatic(row.event_name)), automatic: ranked.filter((row) => isAutomatic(row.event_name)) }
}

/**
 * A share as a row prints it: one decimal under ten, none from ten, and never a nought that rounding made.
 * Null where there is nothing to divide by: the row prints a dash, never 0%.
 */
export function percent(part: number, whole: number): string | null {
  if (whole <= 0) return null
  const pct = (part / whole) * 100
  if (pct === 0) return '0%'
  if (pct < 0.1) return '<0.1%'
  // Rounded to one decimal FIRST: 9.96 is "10%", never "10.0%".
  const one = Math.round(pct * 10) / 10
  return one >= 10 ? `${Math.round(pct)}%` : `${one.toFixed(1)}%`
}

/** One row of a property's values. */
export interface PropertyValueRow {
  /** The stored value the row is drawn from (its title): of a merged row, its most counted. */
  value: string
  /** Every stored value the row stands for, most counted first. */
  values: string[]
  /** What the row reads. */
  label: string
  /** A link's host without `www.`, for its icon; null for a value that is not a link. */
  host: string | null
  /** Events carrying the value, added up over a merged row's values. */
  count: number
}

/** What a stored value reads as: a link without its scheme, its `www.` and a closing slash, with its host; anything else as stored. */
export function readPropertyValue(value: string): { label: string; host: string | null } {
  if (/^https?:\/\//i.test(value)) {
    try {
      const host = new URL(value).hostname.replace(/^www\./, '')
      if (host) return { label: value.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''), host }
    } catch {
      // Not a parsable link: read as stored, with no icon.
    }
  }
  return { label: value, host: null }
}

/**
 * A property's values as rows: values that read the same are ONE row (lib/dashboard/sameRows.ts), with their events
 * added up. `http://` beside `https://`, `www.` beside the bare host and a closing slash all read alike. A link and
 * a plain value never merge: the link carries its icon, so the two read differently. With nothing to merge the rows
 * keep the server's order (most events first); merged rows are ranked by events again.
 */
export function propertyValueRows(values: readonly EventPropertyValue[]): PropertyValueRow[] {
  const read = values.map((v) => ({ ...readPropertyValue(v.value), value: v.value, count: v.count }))
  const groups = groupSameRows(read, (row) => `${row.host === null ? 'text' : 'link'}|${row.label}`)
  if (groups.length === read.length) return read.map((row) => ({ ...row, values: [row.value] }))
  return groups
    .map((parts) => {
      const byCount = [...parts].sort((a, b) => b.count - a.count)
      return { ...byCount[0], values: byCount.map((part) => part.value), count: parts.reduce((sum, part) => sum + part.count, 0) }
    })
    .sort((a, b) => b.count - a.count)
}

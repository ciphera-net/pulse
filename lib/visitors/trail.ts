import type { VisitEvent } from '@/lib/api/visitors'

/**
 * The visit trail's grouping and labelling, as pure functions.
 *
 * Round-6 decision (owner, 10-09-2026): events group under the page they fired
 * on, the card carries per-type filter chips, and the two event types Pulse
 * captures ITSELF are described in words instead of shown as a name chip plus a
 * url chip plus a page_path chip that repeats the row's own path.
 *
 * Lives here rather than in the component because every rule below has a wrong
 * version that looks right on the happy path, and the wrong versions are what
 * the tests exist to catch.
 */

/** The four buckets the chip row filters on. */
export type TrailKind = 'pageview' | 'outbound' | 'download' | 'event'

export const TRAIL_KINDS: TrailKind[] = ['pageview', 'outbound', 'download', 'event']

/**
 * 🔴 THE SENTENCE IS RENDERED FROM THE SCHEMA, NEVER FROM THE NAME.
 *
 * An event name is chosen by the customer and carries no guaranteed meaning. We
 * have the counter-example in production: one site emits an event called
 * `outbound_click` whose properties are `{brand, garment, surface}` — a fashion
 * site's product event with nothing to do with outbound links. A renderer that
 * trusted the name would describe it wrongly.
 *
 * A `source: 'tracker'` field would not help either: the ingest endpoint is
 * public and its payload is client-authored, so such a field would be
 * self-reported — the same reason `ja4_class` is the only Cerberus signal that is
 * trusted. So an event earns a sentence only when its name AND its exact
 * property shape match a type this tracker actually emits, and anything else
 * falls back to the name chip it has today.
 */
const AUTO_SHAPES: Record<string, { keys: Set<string>; required: string }> = {
  outbound_link: { keys: new Set(['url', 'page_path']), required: 'url' },
  file_download: { keys: new Set(['url', 'page_path']), required: 'url' },
}

/** True when the event is one of ours AND its properties are exactly the shape we emit. */
function matchesAutoShape(e: VisitEvent): boolean {
  const shape = AUTO_SHAPES[e.event_name]
  if (!shape) return false
  const props = e.properties ?? {}
  const value = props[shape.required]
  if (typeof value !== 'string' || value.length === 0) return false
  // An EXTRA key means somebody else's event wearing our name — refuse it.
  return Object.keys(props).every((k) => shape.keys.has(k))
}

export function kindOf(e: VisitEvent): TrailKind {
  if (e.type === 'pageview') return 'pageview'
  if (!matchesAutoShape(e)) return 'event'
  if (e.event_name === 'outbound_link') return 'outbound'
  if (e.event_name === 'file_download') return 'download'
  return 'event'
}

/**
 * A readable destination for an outbound click: host plus path, no scheme, no
 * trailing slash. Falls back to the raw string when it will not parse — never to
 * an empty label, which would render as a sentence with a hole in it.
 */
export function prettyDestination(raw: string): string {
  try {
    const u = new URL(raw)
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')
    return u.host + path
  } catch {
    return raw
  }
}

/** The file a download link points at — its last path segment. */
export function downloadName(raw: string): string {
  try {
    const u = new URL(raw)
    const last = u.pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : u.host
  } catch {
    return raw
  }
}

/**
 * The sentence for a schema-matched auto-captured event, or null when the event
 * must keep its name-chip rendering.
 */
export function autoSentence(e: VisitEvent): string | null {
  if (!matchesAutoShape(e)) return null
  const url = (e.properties ?? {})[AUTO_SHAPES[e.event_name].required]
  if (e.event_name === 'outbound_link') return `Left for ${prettyDestination(url)}`
  if (e.event_name === 'file_download') return `Downloaded ${downloadName(url)}`
  return null
}

/**
 * Properties worth showing as chips beside a sentence.
 *
 * For a schema-matched event the sentence already says everything the properties
 * hold — and `page_path` duplicates the row's own path, which is the standing
 * normalisation trap — so it renders no chips at all. Every other event shows all
 * of them, unchanged: D6 pinned FULL properties, truncated for layout only.
 */
export function chipProps(e: VisitEvent): [string, string][] {
  if (matchesAutoShape(e)) return []
  return Object.entries(e.properties ?? {})
}

/** One page of the trail, with the events that fired while it was open. */
export interface TrailGroup {
  /** The pageview this group is built around, or null for an orphan event. */
  page: VisitEvent | null
  /** The row's label: the pageview's path, or the orphan event's own path. */
  path: string | null
  /** Dwell for the page row. Null for an orphan, which has no dwell to report. */
  dwell: number | null
  /** Timestamp used for keying and ordering. */
  timestamp: string
  events: VisitEvent[]
}

/**
 * Group a trail into page rows.
 *
 * 🔑 AN EVENT BELONGS TO THE MOST RECENT PRECEDING PAGEVIEW, not to the pageview
 * whose path it happens to match. Measured on a real visit: `welcome_site_added`
 * fired on `/setup/site` at 14:26:24.508 and the `/setup/install` pageview
 * arrived at 14:26:24.882 — 374ms later. The event belongs to the page that was
 * open, which is the one BEFORE it. Grouping forwards would file it under the
 * page the visitor was navigating to.
 *
 * ⚠️ But the path is still checked, as a refusal rather than a matcher: if an
 * event's path disagrees with the open page's, the event gets its own row showing
 * its own path. Attaching it anyway would print an event under a page it says
 * itself it did not happen on. A null path (a site that does not collect them)
 * is not a disagreement — there is nothing to disagree with.
 *
 * `active` filters by kind. With 'pageview' switched off there is no skeleton to
 * hang events from, so every surviving event becomes its own row — which is
 * exactly the "show me only the clicks" reading the chip is for.
 */
export function groupTrail(events: VisitEvent[], active: Set<TrailKind>): TrailGroup[] {
  const groups: TrailGroup[] = []
  const pagesShown = active.has('pageview')

  for (const e of events) {
    const kind = kindOf(e)
    if (!active.has(kind)) continue

    if (kind === 'pageview') {
      groups.push({ page: e, path: e.path, dwell: e.duration, timestamp: e.timestamp, events: [] })
      continue
    }

    const open = pagesShown ? groups[groups.length - 1] : undefined
    const attachable =
      open !== undefined &&
      open.page !== null &&
      (e.path === null || open.path === null || e.path === open.path)

    if (attachable) open.events.push(e)
    else groups.push({ page: null, path: e.path, dwell: null, timestamp: e.timestamp, events: [e] })
  }

  return groups
}

/**
 * Counts per kind, over EVERY loaded event rather than the filtered set — a chip
 * whose own count changed when you clicked it could never be clicked back.
 */
export function countByKind(events: VisitEvent[]): Record<TrailKind, number> {
  const out: Record<TrailKind, number> = { pageview: 0, outbound: 0, download: 0, event: 0 }
  for (const e of events) out[kindOf(e)]++
  return out
}

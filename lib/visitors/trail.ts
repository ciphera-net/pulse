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

/**
 * The buckets the chip row filters on.
 *
 * Round 7 (owner, 11-09-2026) split what used to be one `event` bucket: our own
 * three captured types now have their own, and `event` keeps its original
 * meaning — a CUSTOMER's event, which we cannot describe. Before this, a visit
 * with ten clicks, eight copies and two customer events read `Events 20`, so
 * "show me only the copies" was not expressible.
 *
 * The order is the order the chips render in.
 */
export type TrailKind = 'pageview' | 'click' | 'copy' | 'form' | 'outbound' | 'download' | 'event'

export const TRAIL_KINDS: TrailKind[] = [
  'pageview', 'click', 'copy', 'form', 'outbound', 'download', 'event',
]

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
  // Round 7: the three the companion script records (script.interactions.js).
  //
  // ⚠️ THE OPTIONAL KEYS ARE DECLARED AND NOTHING DEPENDS ON THEM. Measured over
  // every such row in production 11-09-2026: `pulse_click` is always exactly
  // {text, tag, page_path} — `id` has NEVER been present — and
  // `pulse_form_submit` is always {fields, page_path}, with `form_id`/`form_name`
  // never present. The design doc's proposed sentence named the form, and there
  // is no name to print: ciphera.net/contact is 8 unnamed fields and the ID login
  // form is 5. So the keys are allowed (a `keys` membership test permits an
  // absent one) and every template below reads only the required property.
  pulse_click: { keys: new Set(['text', 'tag', 'id', 'page_path']), required: 'text' },
  pulse_copy: { keys: new Set(['chars', 'source_tag', 'page_path']), required: 'chars' },
  pulse_form_submit: {
    keys: new Set(['fields', 'form_id', 'form_name', 'page_path']),
    required: 'fields',
  },
}

/**
 * The noun for the control that was clicked. Measured: `tag` is only ever `a` or
 * `button` (the companion walks up to the nearest button, anchor or
 * [role=button], and records `hit.tagName`), so a `role=button` on a div reports
 * `div` — hence the fallback, which must never be an empty string in a sentence.
 */
const CONTROL_NOUN: Record<string, string> = { a: 'link', button: 'button' }

/**
 * The noun for the element something was copied out of.
 *
 * 🔴 THIS IS THE WHOLE ANSWER TO "WHAT DID THEY COPY?" AND IT MUST STAY THAT WAY.
 * `pulse_copy` carries a character COUNT and the source element's tag — never the
 * text, and a tracker test asserts the copied string appears nowhere in the
 * payload. People copy their own data back out of a page.
 */
const SOURCE_NOUN: Record<string, string> = {
  p: 'a paragraph',
  h1: 'a heading', h2: 'a heading', h3: 'a heading',
  h4: 'a heading', h5: 'a heading', h6: 'a heading',
  li: 'a list item',
  td: 'a table cell', th: 'a table cell',
  code: 'a code block', pre: 'a code block',
  blockquote: 'a quote',
  figcaption: 'a caption',
  a: 'a link',
  span: 'the page', div: 'the page', unknown: 'the page',
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
  // 🔴 A KIND IS EARNED BY THE SCHEMA, NOT THE NAME — the same rule as the
  // sentence, and for the same reason. A customer's `outbound_click` must not
  // land in the Outbound bucket, or the chip row lies about what it filters.
  if (!matchesAutoShape(e)) return 'event'
  switch (e.event_name) {
    case 'outbound_link': return 'outbound'
    case 'file_download': return 'download'
    case 'pulse_click': return 'click'
    case 'pulse_copy': return 'copy'
    case 'pulse_form_submit': return 'form'
  }
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
  const p = e.properties ?? {}
  const required = p[AUTO_SHAPES[e.event_name].required]
  switch (e.event_name) {
    case 'outbound_link':
      return `Left for ${prettyDestination(required)}`
    case 'file_download':
      return `Downloaded ${downloadName(required)}`
    case 'pulse_click': {
      // Wording chosen by the owner 11-09-2026: NAME THE CONTROL. `tag` is
      // therefore shown rather than stored-and-never-shown, which is the
      // script_features trap in miniature — a value nobody can see is a value
      // nobody notices has stopped working.
      const noun = CONTROL_NOUN[p.tag] ?? 'control'
      return `Clicked the ${noun} \u201c${required}\u201d`
    }
    case 'pulse_copy': {
      const n = count(required)
      // A non-numeric `chars` is somebody else's payload wearing our name: the
      // schema guard checks the KEYS, and this checks the value is what the
      // sentence is about to do arithmetic on.
      if (n === null) return null
      const noun = SOURCE_NOUN[p.source_tag] ?? 'the page'
      return `Copied ${n.toLocaleString('en-GB')} character${n === 1 ? '' : 's'} from ${noun}`
    }
    case 'pulse_form_submit': {
      const n = count(required)
      if (n === null) return null
      // Degrades UP, not down. No form on any of our sites carries an id or a
      // name, so the unnamed wording is the NORMAL case; a named one would be
      // the exception, and this is where it would appear if it ever did.
      const named = p.form_name ?? p.form_id
      const what = named ? `the \u201c${named}\u201d form` : 'a form'
      return `Submitted ${what} with ${n} field${n === 1 ? '' : 's'}`
    }
  }
  return null
}

/**
 * A count out of a property value, or null when it is not one.
 *
 * The tracker sends `String(n)`, so every count arrives as a string. A sentence
 * that interpolated it raw would print "Copied 1e3 characters" or worse; a
 * sentence that did arithmetic on NaN would print "Copied NaN characters".
 * Neither is a thing this surface may say, so an unusable value costs the event
 * its sentence and it falls back to the name chip, which is honest.
 */
function count(raw: string): number | null {
  if (!/^\d{1,15}$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) ? n : null
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

// ─── Causal order inside one gesture ────────────────────────────────────────
//
// 🔴 TWO EVENTS FROM ONE GESTURE HAVE NO RELIABLE ORDER, so the trail imposes one.
//
// `internal/api/events.go` assigns `Timestamp: now` per REQUEST at ingest, and one
// gesture can produce two requests. Measured across all of production 11-09-2026,
// on ONE site with ONE unchanged codebase: its own `outbound_click` event was
// recorded before our `outbound_link` **310** times and after it **141** times.
// The same pair, both ways, 31% inverted. The two fetches race and the trail
// prints whichever won.
//
// The symptom the owner reported, on ciphera.net/pricing:
//
//     Left for pulse.ciphera.net/signup
//     header_cta_get_started
//
// — the departure printed above the click that caused it, 38.5ms apart. And no
// client sequence number would fix that one: the core's outbound listener is on
// the CAPTURE phase on purpose, so the browser genuinely fired them in that
// order, and a faithful client order would preserve exactly this reading.
//
// So inside a window where the order is not a fact, order CAUSALLY: what the
// visitor did, then what followed from it.

/**
 * ⚠️ THE WINDOW IS MEASURED, NOT PICKED.
 *
 * Every same-gesture pair in production falls under 250ms —
 * `outbound_click`↔`outbound_link` tops out at 208ms,
 * `outbound_link`→`header_cta_get_started` at 76ms,
 * `pulse_click`→`pulse_form_submit` at 10ms — and the 250ms–1s band holds NO
 * cause→consequence pair at all: it is `pageview`→`pageview` (548 of them) and
 * repeated same-name events (`nav_open`, `load_more`, `rail_scroll`). Outside the
 * window nothing moves.
 */
const GESTURE_WINDOW_MS = 250

/**
 * Rank inside one gesture. 0 is what the visitor did; 1 is what followed from it.
 *
 * ⚠️ Ranked by NAME, deliberately, unlike every describing function here. A rank
 * is not a description: mis-ranking a customer event that happens to be called
 * `outbound_link` moves it to the end of a 250ms cluster, which no reader can
 * see. Refusing to rank it would instead leave the real defect on screen.
 */
function causalRank(e: VisitEvent): number {
  switch (e.event_name) {
    case 'outbound_link':
    case 'file_download':
    case 'pulse_form_submit':
      return 1
    default:
      return 0
  }
}

function ms(timestamp: string): number {
  return Date.parse(timestamp)
}

/**
 * Re-order the events inside each gesture cluster, and nothing else.
 *
 * 🔴 A CLUSTER NEVER CONTAINS A PAGEVIEW AND NEVER SPANS TWO PATHS. Both are
 * load-bearing, not tidiness:
 *
 *   - Moving a pageview would move the row everything else hangs under. An
 *     `outbound_link` on /a and the pageview for /b 20ms later are one gesture by
 *     the clock, and hoisting the pageview above the departure would file the
 *     departure under the page the visitor had not reached yet.
 *   - A cluster is bounded by the FIRST member's timestamp, not the previous
 *     one's, so three events 200ms apart cannot chain into a 600ms "gesture".
 *
 * A stable sort inside the cluster means equal ranks keep the order the server
 * gave them, so this only ever moves a consequence after its cause.
 *
 * Timestamps that will not parse (a fixture using 't1', 't2') yield NaN, which
 * fails the window test, so nothing moves — the safe direction.
 */
export function orderTrail(events: VisitEvent[]): VisitEvent[] {
  const out: VisitEvent[] = []
  let i = 0
  while (i < events.length) {
    const first = events[i]
    if (kindOf(first) === 'pageview') {
      out.push(first)
      i++
      continue
    }
    const start = ms(first.timestamp)
    let j = i + 1
    while (
      j < events.length &&
      kindOf(events[j]) !== 'pageview' &&
      events[j].path === first.path &&
      Number.isFinite(start) &&
      Number.isFinite(ms(events[j].timestamp)) &&
      ms(events[j].timestamp) - start <= GESTURE_WINDOW_MS
    ) {
      j++
    }
    const cluster = events.slice(i, j)
    if (cluster.length > 1) {
      // Array.prototype.sort is stable (spec since ES2019), which is what keeps
      // same-rank events in their original order.
      cluster.sort((a, b) => causalRank(a) - causalRank(b))
    }
    out.push(...cluster)
    i = j
  }
  return out
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

  // 🔴 ORDERED HERE, not at the call site. A consumer that forgot would render a
  // trail whose steps print in the order two fetches happened to land in — which
  // is what this function's caller did until round 7.
  for (const e of orderTrail(events)) {
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
  // Derived from TRAIL_KINDS rather than written out, so adding a kind cannot
  // leave a bucket undefined — which would render as `Clicks undefined`.
  const out = Object.fromEntries(TRAIL_KINDS.map((k) => [k, 0])) as Record<TrailKind, number>
  for (const e of events) out[kindOf(e)]++
  return out
}

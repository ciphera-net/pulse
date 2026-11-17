// * Dimension filter types and utilities for dashboard filtering

export interface DimensionFilter {
  dimension: string
  operator: 'is' | 'is_not' | 'contains' | 'not_contains'
  values: string[]
}

/** A suggested value for a dimension, sourced from the breakdown endpoints. */
export interface FilterSuggestion {
  value: string
  label: string
  count?: number
  /** A city's or a region's country (ISO code), for its flag in the Filter menu; the reads of the two carry it. */
  country?: string
  /**
   * Every stored value the suggestion stands for, most counted first, where stored values that read the same are
   * one row (a list never draws the same row twice, plan section 10ab): `http` beside `https`, `www.` beside the
   * bare host. Its filter takes all of them. Absent when the row is one stored value, `value`.
   */
  values?: string[]
}

export const DIMENSION_LABELS: Record<string, string> = {
  page: 'Page',
  referrer: 'Referrer',
  channel: 'Channel',
  country: 'Country',
  city: 'City',
  region: 'Region',
  browser: 'Browser',
  os: 'OS',
  device: 'Device',
  screen_resolution: 'Screen Resolution',
  utm_source: 'UTM Source',
  utm_medium: 'UTM Medium',
  utm_campaign: 'UTM Campaign',
  utm_term: 'UTM Term',
  utm_content: 'UTM Content',
  event_name: 'Event',
  // The event filter's bare kind (below): keeps whole visitors, where event_name tests a row.
  event: 'Event',
  entry_path: 'Entry page',
  // Not in the picker (DIMENSION_CATEGORIES) yet: a row of the Locations block sets these two, and without a label
  // its pill read "language is en-US" and "timezone is Europe/Brussels", the raw keys.
  language: 'Language',
  timezone: 'Timezone',
}

export const OPERATOR_LABELS: Record<string, string> = {
  is: 'is',
  is_not: 'is not',
  contains: 'contains',
  not_contains: 'does not contain',
}

export const DIMENSIONS = Object.keys(DIMENSION_LABELS)
export const OPERATORS = Object.keys(OPERATOR_LABELS) as DimensionFilter['operator'][]

// * Dimensions a page has to ALLOW explicitly (FilterBuilder's `allowedDimensions`)
// * — never offered by default. `entry_path` is the journeys API's own parameter
// * (not a `filters=` dimension), so the dashboard and funnels pickers, which
// * pass no allowlist, must not see it: their backend would 400 on it.
export const SCOPED_DIMENSIONS: ReadonlySet<string> = new Set(['entry_path'])

// * Where a dimension takes fewer operators than the full set. The entry page
// * is an exact path the API matches on — there is no "is not" or "contains".
export const DIMENSION_OPERATORS: Record<string, readonly DimensionFilter['operator'][]> = {
  entry_path: ['is'],
}

export function operatorsFor(dimension: string | null | undefined): readonly DimensionFilter['operator'][] {
  return (dimension && DIMENSION_OPERATORS[dimension]) || OPERATORS
}

// * Dimensions that carry exactly ONE value (the API takes a single entry path;
// * a pill claiming "/a (+1)" while only /a applied would be a fabrication).
export const SINGLE_VALUE_DIMENSIONS: ReadonlySet<string> = new Set(['entry_path'])

export const DIMENSION_CATEGORIES = [
  { label: 'Pages', dimensions: ['page'] },
  { label: 'Sources', dimensions: ['referrer', 'channel'] },
  { label: 'Campaigns', dimensions: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] },
  { label: 'Device', dimensions: ['browser', 'os', 'device', 'screen_resolution'] },
  { label: 'Audience', dimensions: ['country', 'region', 'city'] },
  { label: 'Journey', dimensions: ['entry_path'] },
  { label: 'Events', dimensions: ['event_name'] },
] as const

// * Values may legitimately contain the format's structural delimiters
// * (`,` between filters, `|` between fields, `;` between values), so the v2
// * format percent-escapes each value on serialize and unescapes on parse.
// * Only the delimiters and `%` itself are escaped.
// *
// * The format is VERSIONED via the "v2:" prefix because escaping is ambiguous
// * in-band: stored page paths routinely contain literal %2C/%7C/%3B/%25 (the
// * ingest pipeline re-encodes retained query strings), so a legacy URL like
// * "page|is|/search?q=a%2Cb" must NOT be unescaped. Unprefixed (legacy) input
// * is parsed exactly as before — raw values, byte-for-byte. No legacy string
// * can collide with the prefix: dimensions are allowlisted and "v2:page" is
// * not one. The backend mirrors all of this in ParseFilters
// * (internal/api/stats.go).
export const FILTERS_V2_PREFIX = 'v2:'

const VALUE_ESCAPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/%/g, '%25'], // must run first: escapes the escape character
  [/,/g, '%2C'],
  [/\|/g, '%7C'],
  [/;/g, '%3B'],
]

export function escapeFilterValue(value: string): string {
  return VALUE_ESCAPES.reduce((v, [re, code]) => v.replace(re, code), value)
}

export function unescapeFilterValue(value: string): string {
  // * Decodes exactly the four sequences the escaper produces (uppercase only),
  // * with %25 last so a decoded "%" can never be re-consumed.
  return value
    .replaceAll('%2C', ',')
    .replaceAll('%7C', '|')
    .replaceAll('%3B', ';')
    .replaceAll('%25', '%')
}

// ---------------------------------------------------------------------------
// Match any (R65, 16-11-2026; design Pulse/docs/plans/16-11-2026-match-any-filter-design.md).
// With two filters or more a page can count what fits EVERY filter (All, as always) or what fits AT LEAST ONE (Any).
// The mode travels INSIDE the filters string, in front of the version: `any:v2:country|is|DE,device|is|mobile`.
// Every carrier of filters already carries that string (the address, a saved set), and a reader that does not know
// the prefix refuses the whole string: it can never answer All for an Any request.
//
// The server takes Any across dimension filters. Beside an event filter (or the old `event_name`) it refuses, and
// one filter alone says the same under both, so `modeFor` is the ONE place that decides the mode a set is really in.
// ---------------------------------------------------------------------------

/** The beta that offers the switch (lib/betas.ts; read with useFeature). */
export const MATCH_ANY_FLAG = 'match-any'
export type FilterMode = 'all' | 'any'
export const FILTERS_ANY_PREFIX = 'any:'

/** Whether these filters can be matched by Any at all: two or more, none of them an event filter. */
export function canMatchAny(filters: DimensionFilter[]): boolean {
  return filters.length >= 2 && !filters.some((f) => isEventKind(f.dimension) || f.dimension === 'event_name')
}

/** The mode the filters are really in: Any only where it can apply. */
export function modeFor(filters: DimensionFilter[], mode: FilterMode): FilterMode {
  return mode === 'any' && canMatchAny(filters) ? 'any' : 'all'
}

/** The mode a filters string (an address's, a saved set's) asks for. `any:` counts only in front of the version. */
export function parseFilterMode(raw: string | null | undefined): FilterMode {
  return raw?.startsWith(FILTERS_ANY_PREFIX + FILTERS_V2_PREFIX) ? 'any' : 'all'
}

/**
 * Serialize filters to query param format: "v2:browser|is|Chrome,country|is|US", and under Match any
 * "any:v2:browser|is|Chrome,country|is|US". Match all keeps its bytes, so no address or cached read changes.
 */
export function serializeFilters(filters: DimensionFilter[], mode: FilterMode = 'all'): string {
  if (!filters.length) return ''
  const body = filters
    .map(f => `${f.dimension}|${f.operator}|${f.values.map(escapeFilterValue).join(';')}`)
    .join(',')
  return (modeFor(filters, mode) === 'any' ? FILTERS_ANY_PREFIX : '') + FILTERS_V2_PREFIX + body
}

/** Parse filters from URL search param string (v2-prefixed or legacy). The mode is read apart: parseFilterMode. */
export function parseFiltersFromURL(text: string): DimensionFilter[] {
  if (!text) return []
  const raw = parseFilterMode(text) === 'any' ? text.slice(FILTERS_ANY_PREFIX.length) : text
  const isV2 = raw.startsWith(FILTERS_V2_PREFIX)
  const body = isV2 ? raw.slice(FILTERS_V2_PREFIX.length) : raw
  if (!body) return []
  return body.split(',').map(part => {
    const [dimension, operator, valuesRaw] = part.split('|')
    return {
      dimension,
      operator: operator as DimensionFilter['operator'],
      // * Drop empty / whitespace-only values. An empty valuesRaw splits to ['']
      // * (length 1), which used to slip past the length check below and send an
      // * empty filter value the backend rejects with a 400 on every request.
      values: (valuesRaw?.split(';') ?? [])
        .map(v => (isV2 ? unescapeFilterValue(v.trim()) : v.trim()))
        .filter(v => v !== ''),
    }
  }).filter(f => f.dimension && f.operator && f.values.length > 0)
}

/** Build display label for a filter pill */
export function filterLabel(f: DimensionFilter): string {
  const dim = kindLabel(f.dimension)
  const op = OPERATOR_LABELS[f.operator] || f.operator
  const val = f.values.length > 1 ? `${f.values[0]} +${f.values.length - 1}` : f.values[0]
  return `${dim} ${op} ${val}`
}

// ---------------------------------------------------------------------------
// The event filter (owner ruling R45 of 15-11-2026; design Pulse/docs/plans/15-11-2026-event-and-outbound-link-filter-
// design.md, sections 3 to 8). Two kinds the server reads in the v2 format only. Each keeps or leaves out WHOLE
// visitors, everything they did that day, never single rows:
//   * `event`: the visitors who did any of the named events that day ("is"), or none of them ("is not").
//   * `event_property:<event>:<key>`: the visitors who did <event> with <key> matching. An outbound link is this
//     kind on the event `outbound_link` and its property `url`. The key is escaped like a value (it may hold the
//     format's delimiters); an event name cannot hold any of them (ingest's own rule), so it is written as is.
// While the event-filters beta is on they replace `event_name` (a test on a row): an old address's `event_name` is
// read as `event`. The server refuses the two side by side, and more than MAX_EVENT_FILTERS event filters.
// ---------------------------------------------------------------------------

/** The beta that offers the two kinds (lib/betas.ts; read with useFeature). */
export const EVENT_FILTERS_FLAG = 'event-filters'
export const EVENT_KIND = 'event'
const EVENT_PROPERTY_PREFIX = 'event_property:'
/** The most event filters one page may carry: each is one more full read of the range on the server. */
export const MAX_EVENT_FILTERS = 2
/** Said when a third event filter is asked for. */
export const TOO_MANY_EVENT_FILTERS = 'A page can have at most two event filters.'

/** Whether one more event filter would pass the most a page may carry (a filter equal to one on adds nothing). */
export function eventFilterRoomFor(filter: DimensionFilter, filters: DimensionFilter[]): boolean {
  if (!isEventKind(filter.dimension)) return true
  if (filters.some((f) => f.dimension === filter.dimension && f.operator === filter.operator && f.values.join(';') === filter.values.join(';'))) return true
  return filters.filter((f) => isEventKind(f.dimension)).length < MAX_EVENT_FILTERS
}

/**
 * The Events category while the event-filters beta is on: an event, an event's property and an outbound link in place of
 * `event_name`.
 */
export function categoriesFor(eventFilters: boolean): { label: string; dimensions: readonly string[] }[] {
  return DIMENSION_CATEGORIES.map((c) =>
    eventFilters && c.dimensions.includes('event_name' as never)
      ? { label: c.label, dimensions: c.dimensions.flatMap((d) => (d === 'event_name' ? [EVENT_KIND, EVENT_PROPERTY_SCOPE, OUTBOUND_KIND] : [d])) }
      : { label: c.label, dimensions: c.dimensions },
  )
}
export const OUTBOUND_EVENT = 'outbound_link'
export const OUTBOUND_KEY = 'url'

/** The kind of a property filter: `event_property:<event>:<key>`, the key escaped. */
export function eventPropertyKind(event: string, key: string): string {
  return `${EVENT_PROPERTY_PREFIX}${event.toLowerCase()}:${escapeFilterValue(key)}`
}

/** The outbound link's kind: the `url` of the `outbound_link` event. */
export const OUTBOUND_KIND = eventPropertyKind(OUTBOUND_EVENT, OUTBOUND_KEY)

/** A property filter's event and key (unescaped), or null for any other kind. */
export function eventPropertyOf(dimension: string): { event: string; key: string } | null {
  if (!dimension.startsWith(EVENT_PROPERTY_PREFIX)) return null
  const rest = dimension.slice(EVENT_PROPERTY_PREFIX.length)
  const at = rest.indexOf(':')
  if (at <= 0) return null
  const key = unescapeFilterValue(rest.slice(at + 1))
  return key.trim() ? { event: rest.slice(0, at), key } : null
}

/** Whether a kind is one of the event filter's two (a test on a visitor's day, not on a row). */
export function isEventKind(dimension: string): boolean {
  return dimension === EVENT_KIND || eventPropertyOf(dimension) !== null
}

/**
 * "Event property" (R45; design section 8: "a property is picked as event, then key, then value"). A kind a picker
 * offers that is no filter of its own: it lists the page's events, an event lists its keys (`propertyKeysScope`),
 * and a key lists the values of the kind `event_property:<event>:<key>`. Never serialised: without a colon it cannot
 * be read as a property kind.
 */
export const EVENT_PROPERTY_SCOPE = 'event_property'

// The keys of one event, as a list a picker reads on its way to a property ("Event property": an event, then one of
// its keys, then a value). Never a filter: the server knows no such kind, and nothing serialises one.
// `event_property_keys:` cannot be read as a property kind, whose prefix ends in a colon right after "property".
const PROPERTY_KEYS_PREFIX = 'event_property_keys:'

/** The read of an event's keys, as useFilterSuggestions takes it. */
export function propertyKeysScope(event: string): string {
  return `${PROPERTY_KEYS_PREFIX}${event.toLowerCase()}`
}

/** The event whose keys a scope reads, or null for any other scope. */
export function propertyKeysEvent(scope: string): string | null {
  if (!scope.startsWith(PROPERTY_KEYS_PREFIX)) return null
  return scope.slice(PROPERTY_KEYS_PREFIX.length) || null
}

/**
 * An old address's `event_name` filters, read as `event` (R45: an old Event link takes the new meaning), the names
 * lower-cased as ingest stores every name. Only while the event-filters beta is on; every other filter passes as is.
 */
export function readEventNameAsEvent(filters: DimensionFilter[]): DimensionFilter[] {
  if (!filters.some((f) => f.dimension === 'event_name')) return filters
  return filters.map((f) => (f.dimension === 'event_name' ? { ...f, dimension: EVENT_KIND, values: f.values.map((v) => v.toLowerCase()) } : f))
}

/**
 * A kind as a reader names it: "Event", "Outbound link", or a property as its event's name and its key
 * ("Signup: Plan"). `eventLabel` names an event (the Events block's names) and `keyLabel` a key (the names of the
 * Events block's property tabs); without them the stored names are used.
 */
export function kindLabel(
  dimension: string,
  eventLabel: (event: string) => string = (e) => e,
  keyLabel: (event: string, key: string) => string = (_e, k) => k,
): string {
  if (dimension === OUTBOUND_KIND) return 'Outbound link'
  const property = eventPropertyOf(dimension)
  if (property) return `${eventLabel(property.event)}: ${keyLabel(property.event, property.key)}`
  return DIMENSION_LABELS[dimension] || dimension
}

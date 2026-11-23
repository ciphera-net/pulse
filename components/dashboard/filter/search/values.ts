'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DIMENSION_CATEGORIES,
  EVENT_KIND,
  EVENT_PROPERTY_SCOPE,
  OUTBOUND_KIND,
  SCOPED_DIMENSIONS,
  eventPropertyKind,
  eventPropertyOf,
  kindLabel,
  propertyKeysEvent,
  propertyKeysScope,
  type DimensionFilter,
  type FilterSuggestion,
} from '@/lib/filters'
import type { DashboardData } from '@/lib/api/stats'
import { eventName, propertyName, readPropertyValue } from '@/lib/dashboard/events'
import { outboundLinkRows } from '@/lib/dashboard/outbound'

// ---------------------------------------------------------------------------
// What the Search filter can be on, and the page's real values for each (owner ruling R36 of 15-11-2026, built
// from the lab's picked option: Pulse/docs/data/14-11-2026-dashboard-frame-lab/lab/filter/).
//
// Every value and count is the page's own: the suggestion reads the old picker makes (within the range and the
// filters now on), and, for the kinds that have no value read, the lists the dashboard's own answer already holds.
// ---------------------------------------------------------------------------

/** The old picker's groups, plus Language and Timezone, which filter today but were in no picker. */
export const GROUPS: { label: string; dimensions: string[] }[] = DIMENSION_CATEGORIES
  .map((c) => ({ label: c.label as string, dimensions: c.dimensions.filter((d) => !SCOPED_DIMENSIONS.has(d)) as string[] }))
  .filter((c) => c.dimensions.length > 0)
  .map((c) => (c.label === 'Audience' ? { ...c, dimensions: [...c.dimensions, 'language', 'timezone'] } : c))

export const ALL_DIMENSIONS = GROUPS.flatMap((g) => g.dimensions)

// "Event property" (lib/filters.ts, EVENT_PROPERTY_SCOPE) is a chip of the Events group that is no filter of its own:
// it narrows the search to the page's events, an event narrows it to that event's keys, and a key to the values of the
// kind `event_property:<event>:<key>`. Each step is the Search filter's own device, a kind that narrows the search.
export { EVENT_PROPERTY_SCOPE }

/**
 * The groups every page offers (R45; every team since 23-11-2026): the Events group offers an event, an event's property
 * and an outbound link, each a test on a visitor's day, in place of the row test `event_name` (design section 8).
 */
export const EVENT_FILTER_GROUPS: { label: string; dimensions: string[] }[] = GROUPS.map((g) =>
  g.dimensions.includes('event_name')
    ? { ...g, dimensions: g.dimensions.flatMap((d) => (d === 'event_name' ? [EVENT_KIND, EVENT_PROPERTY_SCOPE, OUTBOUND_KIND] : [d])) }
    : g,
)

/**
 * The groups of a page whose read answers fewer kinds than the dashboard's (the Journeys page:
 * lib/hooks/useJourneyFilters): only the kinds in `only`, in the groups' order, and first a group for each kind the
 * default groups leave out (the entry page: lib/filters.ts names its group, "Journey"). No `only`: every group.
 */
export function groupsOnly(groups: { label: string; dimensions: string[] }[], only?: readonly string[]): { label: string; dimensions: string[] }[] {
  if (!only) return groups
  const allowed = new Set(only)
  const kept = groups.map((g) => ({ ...g, dimensions: g.dimensions.filter((d) => allowed.has(d)) })).filter((g) => g.dimensions.length > 0)
  const missing = only.filter((d) => !kept.some((g) => g.dimensions.includes(d)))
  const added = missing.flatMap((d) => {
    const named = DIMENSION_CATEGORIES.find((c) => (c.dimensions as readonly string[]).includes(d))
    return named ? [{ label: named.label as string, dimensions: [d] }] : []
  })
  return [...added, ...kept]
}

/**
 * Every kind a page reads values for up front, in the groups' order. "Event property" is not one: its first step lists
 * the events, which the Event kind already reads, and its later steps are read when they open (useScopeList).
 */
export function dimensionsFor(): string[] {
  return EVENT_FILTER_GROUPS.flatMap((g) => g.dimensions).filter((d) => d !== EVENT_PROPERTY_SCOPE)
}

/** An event's name as the Events block writes it (with no list at hand: the stored name made readable). */
const eventLabel = (event: string) => eventName({ event_name: event, display_name: null })

/** An event's name as the page's own list gives it (a goal's own name), else as the Events block writes it. */
function eventNameOn(event: string, pageValues?: PageValues): string {
  return pageValues?.[EVENT_KIND]?.find((s) => s.value === event)?.label ?? eventLabel(event)
}

/**
 * A kind as a reader names it: "Outbound link", or a property as its event and its key the way the Events block names
 * them ("Sign-ups: Plan", "File downloads: Link"). The steps of "Event property" are named too: the chip itself, and
 * an event's keys by the event's name. `pageValues` (the page's own answer) gives an event its owner's name.
 */
export function labelOf(dimension: string, pageValues?: PageValues): string {
  if (dimension === EVENT_PROPERTY_SCOPE) return 'Event property'
  const keysOf = propertyKeysEvent(dimension)
  if (keysOf) return eventNameOn(keysOf, pageValues)
  return kindLabel(dimension, (event) => eventNameOn(event, pageValues), propertyName)
}

/**
 * A value row's kind column (84 px wide): a property by its key alone ("Category"), because the chip above the list
 * names its event and "Add to cart: Category" did not fit (seen on the lab page, 16-11-2026); every other kind as
 * labelOf names it.
 */
export function columnLabelOf(dimension: string, pageValues?: PageValues): string {
  const property = dimension === OUTBOUND_KIND ? null : eventPropertyOf(dimension)
  return property ? propertyName(property.event, property.key) : labelOf(dimension, pageValues)
}

/** The field's prompt while a kind narrows the search. */
export function placeholderOf(scope: string): string {
  if (scope === EVENT_PROPERTY_SCOPE) return 'Search events'
  if (propertyKeysEvent(scope)) return 'Search properties'
  const property = scope === OUTBOUND_KIND ? null : eventPropertyOf(scope)
  if (property) return `Search ${propertyName(property.event, property.key).toLowerCase()}`
  return `Search ${labelOf(scope).toLowerCase()}`
}

/**
 * Where a row of a scope leads when pressed: an event of "Event property" to its keys, a key to its values. Null where
 * the row is a value, which a press adds as a filter.
 */
export function drillOf(scope: string | null, value: string): string | null {
  if (scope === EVENT_PROPERTY_SCOPE) return propertyKeysScope(value)
  const event = scope ? propertyKeysEvent(scope) : null
  return event ? eventPropertyKind(event, value) : null
}

/** Kinds whose value is free text as well as a list: a "contains" filter makes sense on them. */
export const TEXT_DIMENSIONS: ReadonlySet<string> = new Set(['page', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', EVENT_KIND, OUTBOUND_KIND])

/** Whether "contains" makes sense on a kind: the text kinds, and every event property (the server takes it on all). */
export function isTextKind(dimension: string): boolean {
  return TEXT_DIMENSIONS.has(dimension) || eventPropertyOf(dimension) !== null
}

export type PageValues = Record<string, FilterSuggestion[]>
export type Loaded = Record<string, FilterSuggestion[]>

/** The events list's fold row (M12-g): the events past its cap, stored as `(other)`. */
const OTHER_EVENTS = '(other)'

/** The kinds the page's own answer lists, which have no value read of their own. */
export function pageValuesFrom(dashboard: DashboardData | null | undefined): PageValues {
  if (!dashboard) return {}
  const goals = dashboard.goal_counts ?? []
  return {
    event_name: goals.map((g) => ({ value: g.event_name, label: g.display_name || g.event_name.replace(/_/g, ' '), count: g.count })),
    // The event filter's bare kind lists the same events (R45: "Events come from the page's own answer, with the
    // names their owner gave them"), each named as the Events block names its row ("Outbound clicks", a goal by its
    // own name); the counts are the page's. Not the list's fold row: `(other)` stands for the events past its cap
    // and is no event name, so the server refuses a filter on it.
    [EVENT_KIND]: goals.filter((g) => g.event_name !== OTHER_EVENTS).map((g) => ({ value: g.event_name, label: eventName(g), count: g.count })),
    channel: (dashboard.channels ?? []).map((c) => ({ value: c.channel, label: c.channel, count: c.visitors })),
    screen_resolution: (dashboard.screen_resolutions ?? []).map((s) => ({ value: s.screen_resolution, label: s.screen_resolution, count: s.visitors })),
    language: (dashboard.languages ?? []).map((l) => ({ value: l.language, label: l.language, count: l.visitors })),
    timezone: (dashboard.timezones ?? []).map((t) => ({ value: t.timezone, label: t.timezone, count: t.visitors })),
  }
}

/** The country of each city and of each region, by kind then value: a filter's pill draws that country's flag. */
export type PlaceCountries = Record<string, Record<string, string>>

/**
 * The countries of the cities and regions the page's own answer lists (16-11-2026). A pill has only the stored value
 * ("Oslo"), and under that filter the page's cities are that city's rows, so the page knows its country. Kept apart
 * from pageValuesFrom on purpose: a kind listed there is read as a complete list and is never asked for again, which
 * would freeze the Filter menu's cities and regions at the page's top ten.
 */
export function placeCountriesFrom(dashboard: DashboardData | null | undefined): PlaceCountries {
  if (!dashboard) return {}
  const index = <T extends { country?: string }>(rows: T[] | null | undefined, name: (row: T) => string) => {
    const out: Record<string, string> = {}
    // The first row wins: the page ranks by visitors, so a name two countries share draws the busier one's flag.
    for (const row of rows ?? []) if (name(row) && row.country && !(name(row) in out)) out[name(row)] = row.country
    return out
  }
  return { city: index(dashboard.cities, (c) => c.city), region: index(dashboard.regions, (r) => r.region) }
}

/** One found value, with the kind it belongs to. */
export interface Found extends FilterSuggestion {
  dimension: string
}

/** What matches the typed text, the most counted first inside each kind, at most `perKind` each. */
export function search(values: Loaded, text: string, only: string | null, perKind: number, dimensions: string[] = ALL_DIMENSIONS): Found[] {
  const q = text.trim().toLowerCase()
  const out: Found[] = []
  for (const dimension of only ? [only] : dimensions) {
    const list = values[dimension] ?? []
    const hits = (q === '' ? list : list.filter((s) => s.label.toLowerCase().includes(q) || s.value.toLowerCase().includes(q)))
      .slice()
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    for (const s of hits.slice(0, only ? 50 : perKind)) out.push({ ...s, dimension })
  }
  // Across kinds: a value that starts with the text first, then the most counted.
  if (!only && q !== '') {
    out.sort((a, b) => Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q)) || (b.count ?? 0) - (a.count ?? 0))
  }
  return out
}

/**
 * How many kinds' lists one Filter button reads at once (PUL-94, 23-11-2026). Every read is a ClickHouse query on the
 * dashboard user, which allows 16 at once for every customer together. A hover on the dashboard read its lists all at
 * once: 9 requests (the kinds the page's own answer lists make none, and the API client sends the three campaign kinds'
 * identical read once), more than half of that limit from one person
 * (Pulse/docs/audits/23-11-2026-clickhouse-dashboard-cap-pul-93.md). The reads start when the pointer reaches the
 * button, so the lists are in by the time the panel opens.
 */
export const SUGGESTION_READS_AT_ONCE = 4

/**
 * Runs `work` on every item, at most `limit` at once, in the items' order, and resolves when all are done. Stops
 * starting items once `stale()` says a newer reading has replaced this one. `work` must not reject.
 */
async function eachAtMost<T>(items: readonly T[], limit: number, stale: () => boolean, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const lane = async () => {
    while (next < items.length && !stale()) {
      const item = items[next++]
      await work(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
}

/**
 * The values of every kind, read while `on` (the panel is open, or the pointer has reached the Filter button), and
 * read again when the page's answer changes. A kind with a filter on is offered its whole list from before that
 * filter (read under "Country is Norway", the countries would be Norway alone), with the counts the filters now on
 * give where they are known. A list stays on screen while its next reading is out. The lists are read
 * SUGGESTION_READS_AT_ONCE at a time, and a reading the next one replaces stops asking.
 */
export function useFilterValues({
  on,
  fetchSuggestions,
  pageValues,
  filters,
  dimensions = ALL_DIMENSIONS,
}: {
  on: boolean
  fetchSuggestions: ((dimension: string) => Promise<FilterSuggestion[]>) | undefined
  pageValues: PageValues
  filters: DimensionFilter[]
  /** The kinds the page offers (dimensionsFor). */
  dimensions?: string[]
}): { values: Loaded; ready: boolean } {
  const [values, setValues] = useState<Loaded>({})
  const [ready, setReady] = useState(false)
  // Lists read while their own kind had no filter on.
  const base = useRef<Loaded>({})
  const latest = useRef(0)
  const pageKey = Object.keys(pageValues).map((k) => `${k}:${pageValues[k].length}`).join(',')
  const filtersKey = filters.map((f) => `${f.dimension}|${f.operator}|${f.values.join(';')}`).join(',')
  useEffect(() => {
    if (!on || !fetchSuggestions) return
    const mine = ++latest.current
    const filteredOn = (dimension: string) => filters.some((f) => f.dimension === dimension)
    const next: Loaded = {}
    void eachAtMost(
      dimensions,
      SUGGESTION_READS_AT_ONCE,
      () => latest.current !== mine,
      async (dimension) => {
        let list: FilterSuggestion[] = []
        if (pageValues[dimension]) list = pageValues[dimension]
        else {
          try {
            list = await fetchSuggestions(dimension)
          } catch {
            list = []
          }
        }
        if (!filteredOn(dimension)) base.current[dimension] = list
        else if (base.current[dimension]) {
          const now = new Map(list.map((s) => [s.value, s.count]))
          list = base.current[dimension].map((s) => (now.has(s.value) ? { ...s, count: now.get(s.value) } : s))
        }
        next[dimension] = list
      },
    ).then(() => {
      if (latest.current !== mine) return
      setValues(next)
      setReady(true)
    })
    // The reads follow the page: its answer (pageKey), the filters now on and the kinds it offers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, fetchSuggestions, pageKey, filtersKey, dimensions.join(',')])
  return { values, ready }
}

/** Whether a scope's list is read when it opens rather than up front: an event's keys, or a property no page reads up front. */
export function readsOnOpen(scope: string | null, known: readonly string[]): scope is string {
  if (scope === null || known.includes(scope)) return false
  return propertyKeysEvent(scope) !== null || eventPropertyOf(scope) !== null
}

type ScopeRead = { list: FilterSuggestion[]; failed: false } | { list: null; failed: true }

/**
 * The list of a step of "Event property" that no page reads up front: an event's keys, or one property's values. Read
 * when the step opens, and kept while the page's reads stay the same (the suggestion reader changes with the range and
 * the filters), so going back a step shows its list at once. A property with a filter on is offered its list from
 * before that filter, with the counts the filters now on give, as every kind is (useFilterValues). A failed read is
 * said, never shown as an empty list; `retry` reads again.
 */
export function useScopeList({
  scope,
  fetchSuggestions,
  filters,
  known,
}: {
  scope: string | null
  fetchSuggestions: ((dimension: string) => Promise<FilterSuggestion[]>) | undefined
  filters: DimensionFilter[]
  /** The kinds the page reads up front (dimensionsFor): an outbound link reached through its event is one. */
  known: readonly string[]
}): { list: FilterSuggestion[]; ready: boolean; failed: boolean; retry: () => void } {
  const filtersKey = filters.map((f) => `${f.dimension}|${f.operator}|${f.values.join(';')}`).join(',')
  const [reads, setReads] = useState<Record<string, ScopeRead>>({})
  // What was read belongs to one suggestion reader under one set of filters: another range or other filters read
  // again. Adjusted during render, React's pattern for state derived from props, so no frame shows the old lists.
  const [readFor, setReadFor] = useState(() => ({ reader: fetchSuggestions, filtersKey }))
  if (readFor.reader !== fetchSuggestions || readFor.filtersKey !== filtersKey) {
    setReadFor({ reader: fetchSuggestions, filtersKey })
    setReads({})
  }
  // Lists read while their own kind had no filter on.
  const base = useRef<Record<string, FilterSuggestion[]>>({})
  // The reader and filters now, and the reads out (each scope with the reader and filters it was asked under).
  const latestFilters = useRef(filtersKey)
  const latestReader = useRef(fetchSuggestions)
  useEffect(() => {
    latestFilters.current = filtersKey
    latestReader.current = fetchSuggestions
  }, [fetchSuggestions, filtersKey])
  const reading = useRef<Map<string, { reader: unknown; filtersKey: string }>>(new Map())
  const active = readsOnOpen(scope, known) && fetchSuggestions ? scope : null
  const read = active ? reads[active] : undefined

  useEffect(() => {
    if (!active || !fetchSuggestions || reads[active]) return
    const out = reading.current.get(active)
    if (out && out.reader === fetchSuggestions && out.filtersKey === filtersKey) return
    const reader = fetchSuggestions
    const asked = filtersKey
    const filteredOn = filters.some((f) => f.dimension === active)
    reading.current.set(active, { reader, filtersKey: asked })
    void reader(active)
      .then((fresh): ScopeRead => {
        if (!filteredOn) base.current[active] = fresh
        else if (base.current[active]) {
          const now = new Map(fresh.map((s) => [s.value, s.count]))
          return { list: base.current[active].map((s) => (now.has(s.value) ? { ...s, count: now.get(s.value) } : s)), failed: false }
        }
        return { list: fresh, failed: false }
      })
      .catch((): ScopeRead => ({ list: null, failed: true }))
      .then((result) => {
        const mine = reading.current.get(active)
        if (mine && mine.reader === reader && mine.filtersKey === asked) reading.current.delete(active)
        // A read asked under a reader or filters the page has since replaced is dropped: its list describes another
        // range or other filters.
        if (latestReader.current !== reader || latestFilters.current !== asked) return
        setReads((prev) => ({ ...prev, [active]: result }))
      })
    // The read follows the scope and the page's reader; `filtersKey` stands for the filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, fetchSuggestions, reads, filtersKey])

  const retry = useCallback(() => {
    if (!active) return
    setReads((prev) => {
      const next = { ...prev }
      delete next[active]
      return next
    })
  }, [active])

  return { list: read?.list ?? [], ready: read !== undefined && !read.failed, failed: read?.failed === true, retry }
}

const regions = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    return null
  }
})()

/**
 * A value as a reader names it: a country by its name, an event by the name its list gives it, an outbound link as the
 * Outbound tab writes it and any other property's value as the Events block writes it (a link without its scheme, its
 * `www.` and a closing slash), the rest as stored.
 */
export function valueName(dimension: string, value: string, pageValues?: PageValues): string {
  if (dimension === 'country' && /^[A-Z]{2}$/.test(value)) return regions?.of(value) ?? value
  const listed = pageValues?.[dimension]?.find((s) => s.value === value)?.label
  if (listed) return listed
  if (dimension === EVENT_KIND) return eventLabel(value)
  if (dimension === OUTBOUND_KIND) return outboundLinkRows([{ value, count: 0 }])[0]?.label ?? value
  if (eventPropertyOf(dimension)) return readPropertyValue(value).label
  return dimension === 'event_name' ? value.replace(/_/g, ' ') : value
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { DIMENSION_CATEGORIES, EVENT_KIND, OUTBOUND_KIND, SCOPED_DIMENSIONS, kindLabel, type DimensionFilter, type FilterSuggestion } from '@/lib/filters'
import type { DashboardData } from '@/lib/api/stats'
import { eventName } from '@/lib/dashboard/events'

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

/**
 * The groups while the event-filters beta is on (R45): the Events group offers an event and an outbound link, each a
 * test on a visitor's day, in place of the row test `event_name` (design 15-11-2026-event-and-outbound-link-filter-
 * design.md, section 8).
 */
export const EVENT_FILTER_GROUPS: { label: string; dimensions: string[] }[] = GROUPS.map((g) =>
  g.dimensions.includes('event_name') ? { ...g, dimensions: g.dimensions.flatMap((d) => (d === 'event_name' ? [EVENT_KIND, OUTBOUND_KIND] : [d])) } : g,
)

/** The groups a page offers: the event filter's while its beta is on. */
export function groupsFor(eventFilters: boolean): { label: string; dimensions: string[] }[] {
  return eventFilters ? EVENT_FILTER_GROUPS : GROUPS
}

/** Every kind a page offers, in the groups' order. */
export function dimensionsFor(eventFilters: boolean): string[] {
  return groupsFor(eventFilters).flatMap((g) => g.dimensions)
}

/** An event's name as the Events block writes it. */
const eventLabel = (event: string) => eventName({ event_name: event, display_name: null })
/** A kind as a reader names it ("Outbound link", "Signup: plan"). */
export const labelOf = (dimension: string) => kindLabel(dimension, eventLabel)
/** Kinds whose value is free text as well as a list: a "contains" filter makes sense on them. */
export const TEXT_DIMENSIONS: ReadonlySet<string> = new Set(['page', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', EVENT_KIND, OUTBOUND_KIND])

export type PageValues = Record<string, FilterSuggestion[]>
export type Loaded = Record<string, FilterSuggestion[]>

/** The kinds the page's own answer lists, which have no value read of their own. */
export function pageValuesFrom(dashboard: DashboardData | null | undefined): PageValues {
  if (!dashboard) return {}
  const events = (dashboard.goal_counts ?? []).map((g) => ({ value: g.event_name, label: g.display_name || g.event_name.replace(/_/g, ' '), count: g.count }))
  return {
    event_name: events,
    // The event filter's bare kind lists the same events (R45: "Events come from the page's own answer, with the
    // names their owner gave them"); the counts are the page's.
    [EVENT_KIND]: events,
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
 * The values of every kind, read while `on` (the panel is open, or the pointer has reached the Filter button), and
 * read again when the page's answer changes. A kind with a filter on is offered its whole list from before that
 * filter (read under "Country is Norway", the countries would be Norway alone), with the counts the filters now on
 * give where they are known. A list stays on screen while its next reading is out.
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
    void Promise.all(
      dimensions.map(async (dimension) => {
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
      }),
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

const regions = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    return null
  }
})()

/** A value as a reader names it: a country by its name, an event by the name its list gives it, the rest as stored. */
export function valueName(dimension: string, value: string, pageValues?: PageValues): string {
  if (dimension === 'country' && /^[A-Z]{2}$/.test(value)) return regions?.of(value) ?? value
  const listed = pageValues?.[dimension]?.find((s) => s.value === value)?.label
  if (listed) return listed
  if (dimension === EVENT_KIND) return eventLabel(value)
  return dimension === 'event_name' ? value.replace(/_/g, ' ') : value
}

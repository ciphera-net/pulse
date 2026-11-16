import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  EVENT_KIND,
  EVENT_PROPERTY_SCOPE,
  OUTBOUND_KIND,
  categoriesFor,
  eventPropertyKind,
  eventPropertyOf,
  isEventKind,
  kindLabel,
  propertyKeysEvent,
  propertyKeysScope,
  type DimensionFilter,
  type FilterSuggestion,
} from '@/lib/filters'
import {
  columnLabelOf,
  dimensionsFor,
  drillOf,
  groupsFor,
  isTextKind,
  labelOf,
  pageValuesFrom,
  placeholderOf,
  readsOnOpen,
  useScopeList,
  valueName,
} from '../values'
import { describe as describeSet, valueText } from '../saved'

// The parts "Event property" is built from (R45; design section 8): the steps' names and where each leads, the
// read that opens a step, and how a property's value and kind are written for a reader.

describe('the steps of Event property are never a filter', () => {
  it('names an event\'s keys by a scope no filter kind can be read as', () => {
    expect(propertyKeysScope('Signup')).toBe('event_property_keys:signup')
    expect(propertyKeysEvent(propertyKeysScope('signup'))).toBe('signup')
    expect(propertyKeysEvent(OUTBOUND_KIND)).toBeNull()
    expect(propertyKeysEvent('event_property_keys:')).toBeNull()
    for (const step of [EVENT_PROPERTY_SCOPE, propertyKeysScope('signup')]) {
      expect(eventPropertyOf(step), step).toBeNull()
      expect(isEventKind(step), step).toBe(false)
    }
  })

  it('stands between Event and Outbound link in both pickers, under the beta only', () => {
    const events = (eventFilters: boolean) => categoriesFor(eventFilters).find((c) => c.label === 'Events')?.dimensions
    expect(events(true)).toEqual([EVENT_KIND, EVENT_PROPERTY_SCOPE, OUTBOUND_KIND])
    expect(events(false)).toEqual(['event_name'])
    expect(groupsFor(true).find((g) => g.label === 'Events')?.dimensions).toEqual([EVENT_KIND, EVENT_PROPERTY_SCOPE, OUTBOUND_KIND])
    expect(groupsFor(false).flatMap((g) => g.dimensions)).not.toContain(EVENT_PROPERTY_SCOPE)
  })

  it('is no kind read up front: its first step lists the events the Event kind reads', () => {
    expect(dimensionsFor(true)).toEqual(expect.arrayContaining([EVENT_KIND, OUTBOUND_KIND]))
    expect(dimensionsFor(true)).not.toContain(EVENT_PROPERTY_SCOPE)
  })
})

describe('where a row of each step leads', () => {
  it('an event to its keys, a key to its property kind, and a value nowhere', () => {
    expect(drillOf(EVENT_PROPERTY_SCOPE, 'signup')).toBe(propertyKeysScope('signup'))
    expect(drillOf(propertyKeysScope('signup'), 'plan')).toBe(eventPropertyKind('signup', 'plan'))
    expect(drillOf(propertyKeysScope('outbound_link'), 'url')).toBe(OUTBOUND_KIND)
    expect(drillOf(eventPropertyKind('signup', 'plan'), 'pro')).toBeNull()
    expect(drillOf('country', 'NO')).toBeNull()
    expect(drillOf(null, 'signup')).toBeNull()
  })

  it('reads a step when it opens only where no list is read up front', () => {
    const known = dimensionsFor(true)
    expect(readsOnOpen(propertyKeysScope('signup'), known)).toBe(true)
    expect(readsOnOpen(eventPropertyKind('signup', 'plan'), known)).toBe(true)
    expect(readsOnOpen(OUTBOUND_KIND, known)).toBe(false)
    expect(readsOnOpen(EVENT_PROPERTY_SCOPE, known)).toBe(false)
    expect(readsOnOpen('country', known)).toBe(false)
    expect(readsOnOpen(null, known)).toBe(false)
  })

  it('offers "contains" on every property and the text kinds, never on a step', () => {
    expect(isTextKind(eventPropertyKind('signup', 'plan'))).toBe(true)
    expect(isTextKind(OUTBOUND_KIND)).toBe(true)
    expect(isTextKind('page')).toBe(true)
    expect(isTextKind('country')).toBe(false)
    expect(isTextKind(EVENT_PROPERTY_SCOPE)).toBe(false)
    expect(isTextKind(propertyKeysScope('signup'))).toBe(false)
  })
})

describe('names, as the Events block gives them', () => {
  const page = pageValuesFrom({
    goal_counts: [
      { event_name: 'signup', display_name: 'Sign-ups', count: 12 },
      { event_name: 'outbound_link', count: 30 },
      { event_name: 'add_to_cart', count: 3 },
      { event_name: '(other)', count: 9 },
    ],
  } as never)

  it('lists the event kind\'s events by the Events block\'s names, without the fold row', () => {
    expect(page[EVENT_KIND]).toEqual([
      { value: 'signup', label: 'Sign-ups', count: 12 },
      { value: 'outbound_link', label: 'Outbound clicks', count: 30 },
      { value: 'add_to_cart', label: 'Add to cart', count: 3 },
    ])
    // The row test keeps its list as it was, fold row included.
    expect(page.event_name.map((e) => e.value)).toContain('(other)')
  })

  it('names a property by its event\'s name on the page and its key as the property tabs do', () => {
    expect(labelOf(eventPropertyKind('signup', 'plan'), page)).toBe('Sign-ups: Plan')
    expect(labelOf(eventPropertyKind('signup', 'plan'))).toBe('Signup: Plan')
    expect(labelOf(eventPropertyKind('file_download', 'url'))).toBe('File downloads: Link')
    expect(labelOf(eventPropertyKind('signup', 'billing_cycle'))).toBe('Signup: Billing cycle')
    expect(labelOf(OUTBOUND_KIND)).toBe('Outbound link')
    expect(labelOf(EVENT_PROPERTY_SCOPE)).toBe('Event property')
    expect(labelOf(propertyKeysScope('signup'), page)).toBe('Sign-ups')
    expect(labelOf('country')).toBe('Country')
    // Without its key namer the shared label keeps the stored key, as the server-facing words do.
    expect(kindLabel(eventPropertyKind('signup', 'plan'))).toBe('signup: plan')
  })

  it('names a property value row\'s column by its key alone, every other kind as its label', () => {
    expect(columnLabelOf(eventPropertyKind('signup', 'plan'), page)).toBe('Plan')
    expect(columnLabelOf(eventPropertyKind('file_download', 'url'))).toBe('Link')
    expect(columnLabelOf(OUTBOUND_KIND)).toBe('Outbound link')
    expect(columnLabelOf('country')).toBe('Country')
  })

  it('prompts each step in its own words', () => {
    expect(placeholderOf(EVENT_PROPERTY_SCOPE)).toBe('Search events')
    expect(placeholderOf(propertyKeysScope('signup'))).toBe('Search properties')
    expect(placeholderOf(eventPropertyKind('signup', 'plan'))).toBe('Search plan')
    expect(placeholderOf(eventPropertyKind('file_download', 'url'))).toBe('Search link')
    expect(placeholderOf(OUTBOUND_KIND)).toBe('Search outbound link')
    expect(placeholderOf('country')).toBe('Search country')
  })

  it('writes a property\'s link as the Events block does, and an outbound link as the Outbound tab does', () => {
    expect(valueName(eventPropertyKind('file_download', 'url'), 'https://www.example.com/a.pdf/')).toBe('example.com/a.pdf')
    expect(valueName(eventPropertyKind('signup', 'plan'), 'pro')).toBe('pro')
    expect(valueName(OUTBOUND_KIND, 'https://www.github.com/ciphera?tab=repos')).toBe('github.com/ciphera?tab=repos')
    // The Outbound tab's own writing: no anchor, the host in lower case.
    expect(valueName(OUTBOUND_KIND, 'https://www.GitHub.com/ciphera#readme')).toBe('github.com/ciphera')
    expect(valueName(OUTBOUND_KIND, 'not a link')).toBe('not a link')
  })

  it('describes a saved set\'s property filter by the page\'s names', () => {
    expect(describeSet([{ dimension: eventPropertyKind('signup', 'plan'), operator: 'is', values: ['pro'] }], page)).toBe('Sign-ups: Plan is pro')
  })

  it('names a merged row\'s stored values once in a pill', () => {
    const f: DimensionFilter = { dimension: OUTBOUND_KIND, operator: 'is', values: ['https://github.com/ciphera', 'http://www.github.com/ciphera'] }
    expect(valueText(f, {})).toBe('github.com/ciphera')
    const two: DimensionFilter = { dimension: 'country', operator: 'is', values: ['NO', 'SE'] }
    expect(valueText(two, {})).toBe('Norway or Sweden')
  })
})

describe('useScopeList: a step read when it opens', () => {
  const KEYS = propertyKeysScope('signup')
  const LIST: FilterSuggestion[] = [{ value: 'plan', label: 'Plan', count: 10 }]
  const known = dimensionsFor(true)

  it('reads a step once, keeps it, and reads nothing for a scope read up front', async () => {
    const read = vi.fn(async () => LIST)
    const { result, rerender } = renderHook((props: { scope: string | null }) => useScopeList({ scope: props.scope, fetchSuggestions: read, filters: [], known }), {
      initialProps: { scope: KEYS as string | null },
    })
    expect(result.current.ready).toBe(false)
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.list).toEqual(LIST)
    rerender({ scope: OUTBOUND_KIND })
    rerender({ scope: KEYS })
    expect(result.current.list).toEqual(LIST)
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith(KEYS)
  })

  it('says a failed read, and reads again on retry', async () => {
    let fail = true
    const read = vi.fn(async () => {
      if (fail) throw new Error('500')
      return LIST
    })
    const { result } = renderHook(() => useScopeList({ scope: KEYS, fetchSuggestions: read, filters: [], known }))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.ready).toBe(false)
    expect(result.current.list).toEqual([])
    fail = false
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.failed).toBe(false)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('reads again under another reader (a new range) and drops what the old one answers late', async () => {
    let answer: (list: FilterSuggestion[]) => void = () => {}
    const slow = vi.fn(() => new Promise<FilterSuggestion[]>((r) => { answer = r }))
    const fresh = vi.fn(async () => [{ value: 'source', label: 'Source', count: 2 }])
    const { result, rerender } = renderHook((props: { reader: (d: string) => Promise<FilterSuggestion[]> }) => useScopeList({ scope: KEYS, fetchSuggestions: props.reader, filters: [], known }), {
      initialProps: { reader: slow as (d: string) => Promise<FilterSuggestion[]> },
    })
    rerender({ reader: fresh })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.list.map((s) => s.value)).toEqual(['source'])
    await act(async () => { answer(LIST) })
    expect(result.current.list.map((s) => s.value)).toEqual(['source'])
  })

  it('never serves a list read under one reader (one range) under the next', async () => {
    const before = vi.fn(async () => LIST)
    const after = vi.fn(async () => [{ value: 'source', label: 'Source', count: 2 }])
    const { result, rerender } = renderHook((props: { reader: (d: string) => Promise<FilterSuggestion[]> }) => useScopeList({ scope: KEYS, fetchSuggestions: props.reader, filters: [], known }), {
      initialProps: { reader: before as (d: string) => Promise<FilterSuggestion[]> },
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.list.map((s) => s.value)).toEqual(['plan'])
    rerender({ reader: after })
    // Not the old range's list for a frame: the step reads again.
    expect(result.current.list.map((s) => s.value)).not.toEqual(['plan'])
    await waitFor(() => expect(result.current.list.map((s) => s.value)).toEqual(['source']))
    expect(after).toHaveBeenCalledWith(KEYS)
  })

  it('reads again when the filters change under one reader', async () => {
    const read = vi.fn(async () => LIST)
    const { result, rerender } = renderHook((props: { filters: DimensionFilter[] }) => useScopeList({ scope: KEYS, fetchSuggestions: read, filters: props.filters, known }), {
      initialProps: { filters: [] as DimensionFilter[] },
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    rerender({ filters: [{ dimension: 'country', operator: 'is', values: ['NO'] }] })
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  })

  it('offers a property with a filter on its list from before that filter, with the counts now', async () => {
    const PLAN = eventPropertyKind('signup', 'plan')
    const before: FilterSuggestion[] = [{ value: 'pro', label: 'pro', count: 7 }, { value: 'team', label: 'team', count: 3 }]
    const under: FilterSuggestion[] = [{ value: 'pro', label: 'pro', count: 5 }]
    let filtered = false
    const read = vi.fn(async () => (filtered ? under : before))
    const { result, rerender } = renderHook((props: { filters: DimensionFilter[] }) => useScopeList({ scope: PLAN, fetchSuggestions: read, filters: props.filters, known }), {
      initialProps: { filters: [] as DimensionFilter[] },
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    filtered = true
    rerender({ filters: [{ dimension: PLAN, operator: 'is', values: ['pro'] }] })
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.list).toEqual([{ value: 'pro', label: 'pro', count: 5 }, { value: 'team', label: 'team', count: 3 }])
  })
})

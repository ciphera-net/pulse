import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within, waitFor } from '@testing-library/react'
import SearchFilter from '../SearchFilter'
import FiltersBox from '../FiltersBox'
import type { DimensionFilter, FilterSuggestion } from '@/lib/filters'

// The new dashboard's filter (owner rulings R36, R46, R48 of 15-11-2026). What each test pins is the ruling or the
// measurement it carries, so a later change that undoes one fails here first.

const LISTS: Record<string, FilterSuggestion[]> = {
  country: [{ value: 'NO', label: 'Norway', count: 120 }, { value: 'SE', label: 'Sweden', count: 40 }],
  page: [{ value: '/nordic-trails', label: '/nordic-trails', count: 30 }, { value: '/blog', label: '/blog', count: 300 }],
  referrer: [{ value: 'google.com', label: 'google.com', count: 500 }],
  device: [{ value: 'mobile', label: 'Mobile', count: 900 }, { value: 'desktop', label: 'Desktop', count: 700 }],
}
const PAGE = { event_name: [{ value: 'add_to_cart', label: 'Add to cart', count: 50 }] }

function renderFilter(fetchSuggestions: (d: string) => Promise<FilterSuggestion[]> = async (d) => LISTS[d] ?? [], filters: DimensionFilter[] = []) {
  const onApply = vi.fn()
  const fetch = vi.fn(fetchSuggestions)
  render(<SearchFilter filters={filters} onApply={onApply} fetchSuggestions={fetch} pageValues={PAGE} />)
  return { onApply, fetch, button: screen.getByTestId('search-filter-button') }
}
const panel = () => screen.queryByTestId('search-filter-panel')
const field = () => within(panel() as HTMLElement).getByRole('combobox')
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

afterEach(() => cleanup())

describe('SearchFilter', () => {
  it('draws its first view at once, every kind with its icon, before any value has been read (R46: the flash)', async () => {
    // A read that never answers: the first view must not wait for it.
    const { button } = renderFilter(() => new Promise(() => {}))
    fireEvent.click(button)
    expect(panel()).toBeTruthy()
    const kinds = [...(panel() as HTMLElement).querySelectorAll('[data-search-filter-kind]')].map((k) => k.getAttribute('data-search-filter-kind'))
    expect(kinds).toEqual(expect.arrayContaining(['page', 'referrer', 'country', 'device', 'event_name', 'language', 'timezone']))
    expect((panel() as HTMLElement).querySelector('[aria-busy="true"]')).toBeNull()
    // Every kind carries its own icon.
    for (const k of (panel() as HTMLElement).querySelectorAll('[data-search-filter-kind]')) expect(k.querySelector('svg')).toBeTruthy()
  })

  it('lets the first view\'s kinds take the keyboard before any value has been read', () => {
    const { button } = renderFilter(() => new Promise(() => {}))
    fireEvent.click(button)
    // The first kind is picked; one step down is the second, and Enter narrows the search to it.
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect((panel() as HTMLElement).querySelector('[data-search-filter-scope="referrer"]')).toBeTruthy()
  })

  it('reads the values from the moment the pointer reaches the button, before the press', async () => {
    const { button, fetch } = renderFilter()
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.pointerEnter(button)
    await settle()
    expect(fetch).toHaveBeenCalled()
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['country', 'page', 'device']))
    // The kinds the page's own answer lists are not read again.
    expect(fetch.mock.calls.map((c) => c[0])).not.toContain('event_name')
  })

  it('finds values across kinds as it is typed; Enter adds "is", Alt+Enter adds "is not", and it stays open', async () => {
    const { button, onApply } = renderFilter()
    fireEvent.click(button)
    await settle()
    fireEvent.change(field(), { target: { value: 'nor' } })
    const rows = within(panel() as HTMLElement).getAllByRole('option').map((r) => r.textContent)
    expect(rows[0]).toContain('Norway')
    expect(rows.some((r) => r?.includes('/nordic-trails'))).toBe(true)
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onApply).toHaveBeenLastCalledWith({ dimension: 'country', operator: 'is', values: ['NO'] }, null)
    expect(panel()).toBeTruthy()
    expect((field() as HTMLInputElement).value).toBe('')
    fireEvent.change(field(), { target: { value: 'mob' } })
    fireEvent.keyDown(field(), { key: 'Enter', altKey: true })
    expect(onApply).toHaveBeenLastCalledWith({ dimension: 'device', operator: 'is_not', values: ['mobile'] }, null)
  })

  it('offers "contains" for a text kind, and a kind narrows the search until Backspace on an empty field', async () => {
    const { button, onApply } = renderFilter()
    fireEvent.click(button)
    await settle()
    fireEvent.change(field(), { target: { value: 'trail' } })
    const contains = within(panel() as HTMLElement).getAllByRole('option').find((r) => r.textContent?.includes('contains'))
    expect(contains?.textContent).toContain('Page')
    fireEvent.click(contains as HTMLElement)
    expect(onApply).toHaveBeenLastCalledWith({ dimension: 'page', operator: 'contains', values: ['trail'] }, null)
    fireEvent.click((panel() as HTMLElement).querySelector('[data-search-filter-kind="device"]') as HTMLElement)
    expect((panel() as HTMLElement).querySelector('[data-search-filter-scope="device"]')).toBeTruthy()
    const scoped = within(panel() as HTMLElement).getAllByRole('option').map((r) => r.textContent)
    expect(scoped.every((r) => r?.includes('Device'))).toBe(true)
    fireEvent.keyDown(field(), { key: 'Backspace' })
    expect((panel() as HTMLElement).querySelector('[data-search-filter-scope]')).toBeNull()
  })

  it('opens on F from anywhere, never while something is being typed; Escape clears, then closes', async () => {
    renderFilter()
    const outside = document.createElement('input')
    document.body.appendChild(outside)
    fireEvent.keyDown(outside, { key: 'f' })
    expect(panel()).toBeNull()
    fireEvent.keyDown(document.body, { key: 'f' })
    expect(panel()).toBeTruthy()
    fireEvent.change(field(), { target: { value: 'x' } })
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(panel()).toBeTruthy()
    expect((field() as HTMLInputElement).value).toBe('')
    fireEvent.keyDown(field(), { key: 'Escape' })
    await waitFor(() => expect(panel()).toBeNull())
    outside.remove()
  })

  // `g f` goes to Funnels: ShortcutHandler (on the document) marks the F handled, and the filter must not open as well.
  // Until 16-11-2026 it did, because its listener never asked.
  it('does not open on an F already handled, as the F of `g f`', () => {
    renderFilter()
    const handle = (e: KeyboardEvent) => e.preventDefault()
    document.addEventListener('keydown', handle)
    fireEvent.keyDown(document.body, { key: 'f' })
    document.removeEventListener('keydown', handle)
    expect(panel()).toBeNull()
    fireEvent.keyDown(document.body, { key: 'f' })
    expect(panel()).toBeTruthy()
  })

  it('carries the date button\'s caret, a quarter turn while open (R48)', () => {
    const { button } = renderFilter()
    const caret = () => button.querySelectorAll('svg')[1]
    expect(caret().getAttribute('class')).not.toContain('rotate-90')
    fireEvent.click(button)
    expect(caret().getAttribute('class')).toContain('rotate-90')
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('offers nothing the server does not do yet: no saved sets, no "any", no event property or outbound link', () => {
    const { button } = renderFilter()
    fireEvent.click(button)
    const text = (panel() as HTMLElement).textContent ?? ''
    for (const word of ['Saved', 'Match', 'any', "event's property", 'outbound link', 'drawn']) expect(text).not.toContain(word)
  })
})

describe('FiltersBox (R46: "One box")', () => {
  const country: DimensionFilter = { dimension: 'country', operator: 'is', values: ['NO'] }
  const device: DimensionFilter = { dimension: 'device', operator: 'is_not', values: ['mobile'] }
  const many: DimensionFilter = { dimension: 'country', operator: 'is', values: ['NO', 'SE', 'DK', 'FI'] }
  const box = (filters: DimensionFilter[]) => {
    const onApply = vi.fn()
    const onRemove = vi.fn()
    const onClearAll = vi.fn()
    render(<FiltersBox filters={filters} onApply={onApply} onRemove={onRemove} onClearAll={onClearAll} pageValues={PAGE} />)
    return { onApply, onRemove, onClearAll }
  }

  it('draws nothing with no filter', () => {
    box([])
    expect(screen.queryByTestId('filter-pill')).toBeNull()
    expect(screen.queryByTestId('filters-box')).toBeNull()
  })

  it('shows one filter as itself: a press on its operator flips it, its x removes it', () => {
    const { onApply, onRemove } = box([country])
    const pill = screen.getByTestId('filter-pill')
    expect(pill.textContent).toContain('Country')
    expect(pill.textContent).toContain('Norway')
    fireEvent.click(within(pill).getByRole('button', { name: /Country is: press to switch to is not/ }))
    expect(onApply).toHaveBeenCalledWith({ ...country, operator: 'is_not' }, 0)
    fireEvent.click(within(pill).getByRole('button', { name: 'Remove Country filter' }))
    expect(onRemove).toHaveBeenCalledWith(0)
    expect(screen.queryByTestId('filters-box')).toBeNull()
  })

  it('folds two or more into one box, "2 filters", whose list flips and removes each by its own index', async () => {
    const { onApply, onRemove } = box([country, device])
    expect(screen.queryByTestId('filter-pill')).toBeNull()
    const theBox = screen.getByTestId('filters-box')
    expect(theBox.textContent).toContain('2 filters')
    fireEvent.click(theBox)
    const rows = screen.getAllByTestId('filters-menu-row')
    expect(rows).toHaveLength(2)
    fireEvent.click(within(rows[1]).getByRole('button', { name: /Device is not: press to switch to is$/ }))
    expect(onApply).toHaveBeenCalledWith({ ...device, operator: 'is' }, 1)
    // Each row removes its OWN filter: the second row's x, the second filter.
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Remove Device filter' }))
    expect(onRemove).toHaveBeenCalledWith(1)
    expect(onRemove).not.toHaveBeenCalledWith(0)
  })

  it('takes every filter away with the box\'s own x, in one change, and closes the list (R59)', async () => {
    const { onRemove, onClearAll } = box([country, device])
    // The x sits in the box's own border, after the box's button: one control, as a single filter's pill is.
    const control = screen.getByTestId('filters-box-control')
    expect(within(control).getByTestId('filters-box').textContent).toContain('2 filters')
    const x = within(control).getByRole('button', { name: 'Remove every filter' })
    expect(x.className.split(' ')).toEqual(expect.arrayContaining(['w-8', 'border-s', 'border-brand-orange/20']))
    fireEvent.click(screen.getByTestId('filters-box'))
    expect(screen.getAllByTestId('filters-menu-row')).toHaveLength(2)
    fireEvent.click(x)
    // One call to the page's clear, never one removal per filter (each would be an address update of its own).
    expect(onClearAll).toHaveBeenCalledTimes(1)
    expect(onRemove).not.toHaveBeenCalled()
    // The list leaves through its exit animation.
    await waitFor(() => expect(screen.queryAllByTestId('filters-menu-row')).toHaveLength(0))
  })

  it('offers no clear-all for a single filter, whose own x already removes it', () => {
    box([country])
    expect(screen.queryByRole('button', { name: 'Remove every filter' })).toBeNull()
  })

  it('writes several values of one kind as an "or", and draws no "Clear all"', () => {
    box([many])
    expect(screen.getByTestId('filter-pill').textContent).toContain('Norway, Sweden or 2 more')
    expect(screen.queryByText(/clear all/i)).toBeNull()
    cleanup()
    box([{ dimension: 'country', operator: 'is', values: ['NO', 'SE'] }])
    expect(screen.getByTestId('filter-pill').textContent).toContain('Norway or Sweden')
  })
})

describe('SearchFilter with the event-filters beta (R45)', () => {
  const EVENT_PAGE = {
    event_name: [{ value: 'signup', label: 'Sign-ups', count: 12 }],
    event: [{ value: 'signup', label: 'Sign-ups', count: 12 }],
  }
  const OUTBOUND: FilterSuggestion[] = [{ value: 'https://github.com/ciphera', label: 'github.com/ciphera', count: 5 }]
  async function renderBeta(filters: DimensionFilter[] = []) {
    const { OUTBOUND_KIND } = await import('@/lib/filters')
    const onApply = vi.fn()
    const fetch = vi.fn(async (d: string) => (d === OUTBOUND_KIND ? OUTBOUND : (LISTS[d] ?? [])))
    render(<SearchFilter filters={filters} onApply={onApply} fetchSuggestions={fetch} pageValues={EVENT_PAGE} eventFilters />)
    return { onApply, fetch, button: screen.getByTestId('search-filter-button'), OUTBOUND_KIND }
  }

  it('offers an event and an outbound link in place of the row test event_name', async () => {
    const { button, OUTBOUND_KIND } = await renderBeta()
    fireEvent.click(button)
    const kinds = [...(panel() as HTMLElement).querySelectorAll('[data-search-filter-kind]')].map((k) => k.getAttribute('data-search-filter-kind'))
    expect(kinds).toEqual(expect.arrayContaining(['event', OUTBOUND_KIND]))
    expect(kinds).not.toContain('event_name')
    const outbound = (panel() as HTMLElement).querySelector(`[data-search-filter-kind="${OUTBOUND_KIND}"]`)
    expect(outbound?.textContent).toContain('Outbound link')
  })

  it('adds an event as the event kind, and reads outbound links from their own read', async () => {
    const { button, onApply, fetch, OUTBOUND_KIND } = await renderBeta()
    fireEvent.click(button)
    await settle()
    expect(fetch.mock.calls.map((c) => c[0])).toContain(OUTBOUND_KIND)
    // The page's own answer lists the events: not read again.
    expect(fetch.mock.calls.map((c) => c[0])).not.toContain('event')
    fireEvent.change(field(), { target: { value: 'sign' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onApply).toHaveBeenLastCalledWith({ dimension: 'event', operator: 'is', values: ['signup'] }, null)
    fireEvent.change(field(), { target: { value: 'github' } })
    fireEvent.keyDown(field(), { key: 'Enter', altKey: true })
    expect(onApply).toHaveBeenLastCalledWith({ dimension: OUTBOUND_KIND, operator: 'is_not', values: ['https://github.com/ciphera'] }, null)
  })

  it('refuses a third event filter in the words of the limit, and lets a repeated one through', async () => {
    const { toast } = await import('@ciphera-net/facet')
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '' as never)
    const { OUTBOUND_KIND, TOO_MANY_EVENT_FILTERS } = await import('@/lib/filters')
    const two: DimensionFilter[] = [
      { dimension: 'event', operator: 'is', values: ['purchase'] },
      { dimension: OUTBOUND_KIND, operator: 'is', values: ['https://github.com/ciphera'] },
    ]
    const { button, onApply } = await renderBeta(two)
    fireEvent.click(button)
    await settle()
    fireEvent.change(field(), { target: { value: 'sign' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onApply).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(TOO_MANY_EVENT_FILTERS)
    // A dimension filter still goes on beside two event filters.
    fireEvent.change(field(), { target: { value: 'nor' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onApply).toHaveBeenLastCalledWith({ dimension: 'country', operator: 'is', values: ['NO'] }, null)
    // One equal to a filter already on adds nothing, so it is no third: it reaches the page, which keeps one.
    error.mockClear()
    fireEvent.change(field(), { target: { value: 'github' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onApply).toHaveBeenLastCalledWith({ dimension: OUTBOUND_KIND, operator: 'is', values: ['https://github.com/ciphera'] }, null)
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('the page\'s own events for the event kind (R45: "Events come from the page\'s own answer")', () => {
  it('lists the dashboard\'s events under the event kind with the owner\'s names, else the Events block\'s', async () => {
    const { pageValuesFrom } = await import('../values')
    const values = pageValuesFrom({ goal_counts: [{ event_name: 'signup', display_name: 'Sign-ups', count: 12 }, { event_name: 'add_to_cart', count: 3 }] } as never)
    expect(values.event).toEqual([
      { value: 'signup', label: 'Sign-ups', count: 12 },
      { value: 'add_to_cart', label: 'Add to cart', count: 3 },
    ])
    // The same events, with the same counts, as the row test's list.
    expect(values.event.map((e) => [e.value, e.count])).toEqual(values.event_name.map((e) => [e.value, e.count]))
  })
})

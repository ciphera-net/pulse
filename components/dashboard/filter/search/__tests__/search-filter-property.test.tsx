import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import SearchFilter from '../SearchFilter'
import {
  EVENT_PROPERTY_SCOPE,
  OUTBOUND_KIND,
  eventPropertyKind,
  propertyKeysScope,
  type DimensionFilter,
  type FilterSuggestion,
} from '@/lib/filters'

// "Event property" in the Search filter (R45; design 15-11-2026-event-and-outbound-link-filter-design.md, section 8:
// "a property is picked as event, then key, then value"). Each test pins one step of that, or one thing a step must
// say when its read fails or comes back empty.

const PAGE = {
  event: [
    { value: 'signup', label: 'Sign-ups', count: 12 },
    { value: 'outbound_link', label: 'Outbound clicks', count: 30 },
  ],
}
const PLAN = eventPropertyKind('signup', 'plan')
const READS: Record<string, FilterSuggestion[]> = {
  [propertyKeysScope('signup')]: [{ value: 'plan', label: 'Plan', count: 10 }, { value: 'source', label: 'Source', count: 4 }],
  [PLAN]: [
    { value: 'pro', label: 'pro', count: 7 },
    // Two stored values that read the same, as one row.
    { value: 'https://example.com/team', label: 'example.com/team', count: 3, values: ['https://example.com/team', 'http://www.example.com/team/'] },
  ],
  [OUTBOUND_KIND]: [{ value: 'https://github.com/ciphera', label: 'github.com/ciphera', count: 5 }],
}

function renderBeta(read: (d: string) => Promise<FilterSuggestion[]> = async (d) => READS[d] ?? [], filters: DimensionFilter[] = []) {
  const onApply = vi.fn()
  const fetch = vi.fn(read)
  render(<SearchFilter filters={filters} onApply={onApply} fetchSuggestions={fetch} pageValues={PAGE} eventFilters />)
  return { onApply, fetch, button: screen.getByTestId('search-filter-button') }
}
const panel = () => screen.queryByTestId('search-filter-panel') as HTMLElement
const field = () => within(panel()).getByRole('combobox') as HTMLInputElement
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const rows = () => [...panel().querySelectorAll('[data-search-filter-row]')] as HTMLElement[]
const scopeChip = () => panel().querySelector('[data-search-filter-scope]')
const footer = () => (panel().lastElementChild as HTMLElement).textContent ?? ''

async function openProperty() {
  const r = renderBeta()
  fireEvent.click(r.button)
  await settle()
  fireEvent.click(panel().querySelector(`[data-search-filter-kind="${EVENT_PROPERTY_SCOPE}"]`) as HTMLElement)
  await settle()
  return r
}

afterEach(() => cleanup())

describe('Event property in the Search filter (R45, design section 8)', () => {
  it('offers Event property between Event and Outbound link, with the property mark', () => {
    const { button } = renderBeta()
    fireEvent.click(button)
    const kinds = [...panel().querySelectorAll('[data-search-filter-kind]')].map((k) => k.getAttribute('data-search-filter-kind'))
    const at = kinds.indexOf(EVENT_PROPERTY_SCOPE)
    expect(kinds.slice(at - 1, at + 2)).toEqual(['event', EVENT_PROPERTY_SCOPE, OUTBOUND_KIND])
    const chip = panel().querySelector(`[data-search-filter-kind="${EVENT_PROPERTY_SCOPE}"]`) as HTMLElement
    expect(chip.textContent).toBe('Event property')
    expect(chip.querySelector('svg')).toBeTruthy()
  })

  it('is never read up front: the first step lists the events the Event kind already has', async () => {
    const { fetch } = await openProperty()
    expect(fetch.mock.calls.map((c) => c[0])).not.toContain(EVENT_PROPERTY_SCOPE)
    expect(scopeChip()?.textContent).toContain('Event property')
    expect(field().placeholder).toBe('Search events')
    // The page's events, the busiest first, each a row that opens the next step (the caret), named as the list names it.
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Outbound clicks'), expect.stringContaining('Sign-ups')])
    for (const row of rows()) expect(row.querySelector('[data-search-filter-drill]')).toBeTruthy()
    // Enter opens, and there is nothing to exclude at this step.
    expect(footer()).toContain('open')
    expect(footer()).not.toContain('exclude')
  })

  it('goes event, then key, then value, and adds the property filter with every value a row stands for', async () => {
    const { onApply, fetch } = await openProperty()
    fireEvent.change(field(), { target: { value: 'sign' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    await settle()
    // An event's keys are read when the step opens, named as the Events block's tabs name them.
    expect(fetch.mock.calls.map((c) => c[0])).toContain(propertyKeysScope('signup'))
    expect(field().placeholder).toBe('Search properties')
    expect(field().value).toBe('')
    // Every step's chip carries the property's mark (its own icon, beside the x's).
    expect(scopeChip()?.querySelector(':scope > svg')).toBeTruthy()
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Plan'), expect.stringContaining('Source')])
    for (const row of rows()) expect(row.querySelector('[data-search-filter-drill]')).toBeTruthy()
    fireEvent.click(rows()[0])
    await settle()
    expect(fetch.mock.calls.map((c) => c[0])).toContain(PLAN)
    // The event by the name the page gives it, the key by its tab's name.
    expect(scopeChip()?.textContent).toContain('Sign-ups: Plan')
    expect(field().placeholder).toBe('Search plan')
    expect(scopeChip()?.querySelector(':scope > svg')).toBeTruthy()
    // The kind column names the key alone: the chip above names the event ("Sign-ups: Plan" did not fit 84 px).
    expect(rows()[0].querySelector('span')?.textContent).toBe('Plan')
    // Values are no doors: no caret, and Enter adds.
    for (const row of rows()) expect(row.querySelector('[data-search-filter-drill]')).toBeNull()
    expect(footer()).toContain('exclude')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onApply).toHaveBeenLastCalledWith({ dimension: PLAN, operator: 'is', values: ['pro'] }, null)
  })

  it('adds a merged row with all its stored values, and as "is not" with Alt', async () => {
    const { onApply } = await openProperty()
    fireEvent.click(rows()[1]) // Sign-ups
    await settle()
    fireEvent.click(rows()[0]) // Plan
    await settle()
    fireEvent.change(field(), { target: { value: 'example' } })
    fireEvent.keyDown(field(), { key: 'Enter', altKey: true })
    expect(onApply).toHaveBeenLastCalledWith({ dimension: PLAN, operator: 'is_not', values: ['https://example.com/team', 'http://www.example.com/team/'] }, null)
  })

  it('offers "contains" on a property, never on the events or the keys', async () => {
    const { onApply } = await openProperty()
    fireEvent.change(field(), { target: { value: 'zzz' } })
    expect(panel().textContent).not.toContain('contains')
    fireEvent.change(field(), { target: { value: '' } })
    fireEvent.click(rows()[1])
    await settle()
    fireEvent.change(field(), { target: { value: 'zzz' } })
    expect(panel().textContent).not.toContain('contains')
    fireEvent.change(field(), { target: { value: '' } })
    fireEvent.click(rows()[0])
    await settle()
    fireEvent.change(field(), { target: { value: 'pr' } })
    const typed = rows().find((r) => r.textContent?.includes('contains'))
    expect(typed).toBeTruthy()
    fireEvent.click(typed as HTMLElement)
    expect(onApply).toHaveBeenLastCalledWith({ dimension: PLAN, operator: 'contains', values: ['pr'] }, null)
  })

  it('goes back one step on Backspace in an empty field: values, keys, events, every kind', async () => {
    await openProperty()
    fireEvent.click(rows()[1])
    await settle()
    fireEvent.click(rows()[0])
    await settle()
    expect(field().placeholder).toBe('Search plan')
    fireEvent.keyDown(field(), { key: 'Backspace' })
    expect(field().placeholder).toBe('Search properties')
    fireEvent.keyDown(field(), { key: 'Backspace' })
    expect(field().placeholder).toBe('Search events')
    fireEvent.keyDown(field(), { key: 'Backspace' })
    expect(scopeChip()).toBeNull()
    expect(panel().querySelector(`[data-search-filter-kind="${EVENT_PROPERTY_SCOPE}"]`)).toBeTruthy()
  })

  it('shows a step it went back to at once, without reading it again', async () => {
    const { fetch } = await openProperty()
    fireEvent.click(rows()[1])
    await settle()
    fireEvent.click(rows()[0])
    await settle()
    fireEvent.keyDown(field(), { key: 'Backspace' })
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Plan'), expect.stringContaining('Source')])
    expect(fetch.mock.calls.filter((c) => c[0] === propertyKeysScope('signup'))).toHaveLength(1)
  })

  it('takes every kind back with the chip\'s x and with Escape, from any step', async () => {
    await openProperty()
    fireEvent.click(rows()[1])
    await settle()
    fireEvent.click(within(scopeChip() as HTMLElement).getByRole('button', { name: 'Search every kind again' }))
    expect(scopeChip()).toBeNull()
    // Backspace now has no step to go back to.
    fireEvent.click(panel().querySelector(`[data-search-filter-kind="${EVENT_PROPERTY_SCOPE}"]`) as HTMLElement)
    await settle()
    fireEvent.click(rows()[1])
    await settle()
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(scopeChip()).toBeNull()
    fireEvent.click(panel().querySelector('[data-search-filter-kind="event"]') as HTMLElement)
    fireEvent.keyDown(field(), { key: 'Backspace' })
    expect(scopeChip()).toBeNull()
  })

  it('holds a step\'s place while its read is out, never saying it is empty', async () => {
    renderBeta(async (d) => (d === propertyKeysScope('signup') ? new Promise<FilterSuggestion[]>(() => {}) : READS[d] ?? []))
    fireEvent.click(screen.getByTestId('search-filter-button'))
    await settle()
    fireEvent.click(panel().querySelector(`[data-search-filter-kind="${EVENT_PROPERTY_SCOPE}"]`) as HTMLElement)
    fireEvent.click(rows()[1])
    await settle()
    expect(panel().querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(panel().textContent).not.toContain('No properties were sent')
    expect(rows()).toEqual([])
  })

  it('says when an event carries no property, and never says "matches" with nothing typed', async () => {
    renderBeta(async (d) => (d === propertyKeysScope('signup') ? [] : READS[d] ?? []))
    fireEvent.click(screen.getByTestId('search-filter-button'))
    await settle()
    fireEvent.click(panel().querySelector(`[data-search-filter-kind="${EVENT_PROPERTY_SCOPE}"]`) as HTMLElement)
    fireEvent.click(rows()[1])
    await settle()
    expect(panel().textContent).toContain('No properties were sent with this event.')
    expect(panel().textContent).not.toContain('matches')
  })

  it('says a failed read, never an empty list, and reads again on Try again', async () => {
    let fail = true
    const { fetch } = renderBeta(async (d) => {
      if (d === propertyKeysScope('signup') && fail) throw new Error('500')
      return READS[d] ?? []
    })
    fireEvent.click(screen.getByTestId('search-filter-button'))
    await settle()
    fireEvent.click(panel().querySelector(`[data-search-filter-kind="${EVENT_PROPERTY_SCOPE}"]`) as HTMLElement)
    fireEvent.click(rows()[1])
    await settle()
    const failed = screen.getByTestId('search-filter-failed')
    expect(failed.textContent).toContain('The properties of this event could not be loaded.')
    expect(panel().textContent).not.toContain('No properties were sent')
    fail = false
    fireEvent.click(within(failed).getByRole('button', { name: 'Try again' }))
    await settle()
    expect(fetch.mock.calls.filter((c) => c[0] === propertyKeysScope('signup'))).toHaveLength(2)
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Plan'), expect.stringContaining('Source')])
  })

  it('reads an outbound link reached through its event from the list the page already read', async () => {
    const { fetch } = renderBeta(async (d) => (d === propertyKeysScope('outbound_link') ? [{ value: 'url', label: 'Link', count: 30 }] : READS[d] ?? []))
    fireEvent.click(screen.getByTestId('search-filter-button'))
    await settle()
    fireEvent.click(panel().querySelector(`[data-search-filter-kind="${EVENT_PROPERTY_SCOPE}"]`) as HTMLElement)
    fireEvent.click(rows()[0]) // Outbound clicks
    await settle()
    fireEvent.click(rows()[0]) // Link
    await settle()
    expect(scopeChip()?.textContent).toContain('Outbound link')
    expect(rows()[0].textContent).toContain('github.com/ciphera')
    expect(fetch.mock.calls.filter((c) => c[0] === OUTBOUND_KIND)).toHaveLength(1)
  })

  it('refuses a third event filter at the last step, as anywhere', async () => {
    const { toast } = await import('@ciphera-net/facet')
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '' as never)
    const two: DimensionFilter[] = [
      { dimension: 'event', operator: 'is', values: ['purchase'] },
      { dimension: OUTBOUND_KIND, operator: 'is', values: ['https://github.com/ciphera'] },
    ]
    const { onApply } = renderBeta(undefined, two)
    fireEvent.click(screen.getByTestId('search-filter-button'))
    await settle()
    fireEvent.click(panel().querySelector(`[data-search-filter-kind="${EVENT_PROPERTY_SCOPE}"]`) as HTMLElement)
    fireEvent.click(rows()[1])
    await settle()
    fireEvent.click(rows()[0])
    await settle()
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onApply).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('a property filter\'s pill (FiltersBox)', () => {
  it('names the property by its event\'s name on the page and its key\'s tab name', async () => {
    const { default: FiltersBox } = await import('../FiltersBox')
    render(<FiltersBox filters={[{ dimension: PLAN, operator: 'is', values: ['pro'] }]} onApply={vi.fn()} onRemove={vi.fn()} onClearAll={vi.fn()} pageValues={PAGE} />)
    expect(screen.getByTestId('filter-pill').textContent).toContain('Sign-ups: Plan')
    expect(screen.getByTestId('filter-pill').textContent).not.toContain('event_property')
  })
})

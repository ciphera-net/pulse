import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

// The older picker's "Event property" (a funnel's page, Settings, Export; R45, design section 8, every team since
// 23-11-2026): the range's events, then the picked event's keys, then the value stage takes the property kind like any
// other. Backspace goes back one step; a failed read is said and read again on Retry.

import DimensionStage from '../DimensionStage'
import ValuePicker from '../ValuePicker'
import { EVENT_KIND, EVENT_PROPERTY_SCOPE, OUTBOUND_KIND, eventPropertyKind, propertyKeysScope, type FilterSuggestion } from '@/lib/filters'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
})

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const READS: Record<string, FilterSuggestion[]> = {
  [EVENT_KIND]: [{ value: 'signup', label: 'Sign-ups', count: 12 }, { value: 'outbound_link', label: 'Outbound clicks', count: 30 }],
  [propertyKeysScope('signup')]: [{ value: 'plan', label: 'Plan', count: 10 }],
}
const stepRows = () => [...document.querySelectorAll<HTMLElement>('[data-property-step-row]')]

function renderStage(read: (d: string) => Promise<FilterSuggestion[]> = async (d) => READS[d] ?? [], active = new Set<string>()) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  const fetch = vi.fn(read)
  render(<DimensionStage activeDimensions={active} onPick={onPick} onClose={onClose} fetchSuggestions={fetch} />)
  return { onPick, onClose, fetch }
}

describe('Event property in the older picker (R45)', () => {
  it('offers Event property by its name, between Event and Outbound link', () => {
    renderStage()
    const kinds = screen.getAllByRole('option').map((o) => o.id.replace('filter-dim-', ''))
    const at = kinds.indexOf(EVENT_PROPERTY_SCOPE)
    expect(kinds.slice(at - 1, at + 2)).toEqual([EVENT_KIND, EVENT_PROPERTY_SCOPE, OUTBOUND_KIND])
    expect(screen.getByRole('option', { name: /Event property/ })).toBeTruthy()
  })

  it('goes event, then key, and hands the value stage the property\'s kind', async () => {
    const { onPick, fetch } = renderStage()
    fireEvent.click(screen.getByRole('option', { name: /Event property/ }))
    await settle()
    // Never picked as a kind of its own: the range's events are read for it.
    expect(onPick).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenLastCalledWith(EVENT_KIND)
    expect(screen.getByPlaceholderText('Search events')).toBeTruthy()
    expect(stepRows().map((r) => r.textContent)).toEqual([expect.stringContaining('Sign-ups'), expect.stringContaining('Outbound clicks')])
    fireEvent.click(stepRows()[0])
    await settle()
    expect(fetch).toHaveBeenLastCalledWith(propertyKeysScope('signup'))
    expect(screen.getByPlaceholderText('Search properties')).toBeTruthy()
    expect(document.querySelector('[data-property-step-token]')?.textContent).toBe('Signup')
    fireEvent.keyDown(screen.getByPlaceholderText('Search properties'), { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(eventPropertyKind('signup', 'plan'))
  })

  it('goes back one step on Backspace in an empty field, and to the kinds from the events', async () => {
    const { onClose } = renderStage()
    fireEvent.click(screen.getByRole('option', { name: /Event property/ }))
    await settle()
    fireEvent.click(stepRows()[0])
    await settle()
    fireEvent.keyDown(screen.getByPlaceholderText('Search properties'), { key: 'Backspace' })
    await settle()
    expect(screen.getByPlaceholderText('Search events')).toBeTruthy()
    fireEvent.keyDown(screen.getByPlaceholderText('Search events'), { key: 'Backspace' })
    expect(screen.getByPlaceholderText('Filter by…')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says an event with no property, and a failed read with a Retry that reads again', async () => {
    let fail = true
    const { fetch } = renderStage(async (d) => {
      if (d === propertyKeysScope('signup')) {
        if (fail) throw new Error('500')
        return []
      }
      return READS[d] ?? []
    })
    fireEvent.click(screen.getByRole('option', { name: /Event property/ }))
    await settle()
    fireEvent.click(stepRows()[0])
    await settle()
    expect(screen.getByTestId('property-step-failed').textContent).toContain('The properties of this event could not be loaded.')
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    // The failed line gives way to the loading box at once, never staying up while the list is read again.
    expect(screen.queryByTestId('property-step-failed')).toBeNull()
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy()
    await settle()
    expect(fetch.mock.calls.filter((c) => c[0] === propertyKeysScope('signup'))).toHaveLength(2)
    expect(document.body.textContent).toContain('No properties were sent with this event.')
  })

  it('marks Event property while a property filter (not an outbound link) is on', () => {
    renderStage(undefined, new Set([eventPropertyKind('signup', 'plan')]))
    const chip = screen.getByRole('option', { name: /Event property/ })
    expect(chip.querySelector('[aria-label="has an active filter"]')).toBeTruthy()
    cleanup()
    renderStage(undefined, new Set([OUTBOUND_KIND]))
    expect(screen.getByRole('option', { name: /Event property/ }).querySelector('[aria-label="has an active filter"]')).toBeNull()
  })
})

describe('ValuePicker and merged suggestions (a list never draws the same row twice)', () => {
  const MERGED: FilterSuggestion[] = [
    { value: 'https://github.com/ciphera', label: 'github.com/ciphera', count: 6, values: ['https://github.com/ciphera', 'http://www.github.com/ciphera'] },
    { value: 'https://docs.example/x', label: 'docs.example/x', count: 1 },
  ]

  it('takes every stored value of a merged row, shows it on once all are chosen, and drops them together', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<ValuePicker dimension={OUTBOUND_KIND} values={[]} onChange={onChange} onFetchSuggestions={async () => MERGED} />)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: /github\.com\/ciphera/ }))
    expect(onChange).toHaveBeenLastCalledWith(['https://github.com/ciphera', 'http://www.github.com/ciphera'])
    rerender(<ValuePicker dimension={OUTBOUND_KIND} values={['https://github.com/ciphera', 'http://www.github.com/ciphera']} onChange={onChange} onFetchSuggestions={async () => MERGED} />)
    await settle()
    // Neither stored address is drawn again as a chosen value outside the list.
    expect(screen.getAllByRole('button', { name: /github\.com/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /github\.com\/ciphera/ }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('names the property in its search box as the dashboard does', async () => {
    render(<ValuePicker dimension={eventPropertyKind('signup', 'plan')} values={[]} onChange={() => {}} onFetchSuggestions={async () => []} />)
    await settle()
    expect(screen.getByPlaceholderText('Search signup: plan…')).toBeTruthy()
  })
})

describe('the value stage takes the property like any kind', () => {
  it('names the property in its token as the dashboard does', async () => {
    const { default: ValueStage } = await import('../ValueStage')
    render(
      <ValueStage
        draft={{ stage: 'value', dimension: eventPropertyKind('signup', 'plan'), operator: 'is', values: [], editingIndex: null }}
        isDuplicate={false}
        onBack={() => {}}
        onOperatorChange={() => {}}
        onValuesChange={() => {}}
        onApply={() => {}}
        fetchSuggestions={async () => []}
      />,
    )
    await settle()
    expect(screen.getByRole('button', { name: 'Signup: Plan' })).toBeTruthy()
  })
})

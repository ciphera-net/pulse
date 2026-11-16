import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import FilterPill from '@/components/dashboard/FilterPill'
import type { DimensionFilter } from '@/lib/filters'

// PULSE-173: a grouped-language row's click produces ONE filter carrying every
// member locale of the group. The chip must read the language NAME, not an
// arbitrary member ("en-US +8"), which would hide that the filter is really
// "the English group" and would name a member that happens to sort first for
// no reason a reader can see. Every other multi-value filter (any other
// dimension, or a language filter with exactly one value) is unaffected.
describe('FilterPill — language chip (PULSE-173)', () => {
  it('a multi-value language filter reads the GROUP name, not a member value', () => {
    const filter: DimensionFilter = {
      dimension: 'language',
      operator: 'is',
      values: ['en-US', 'en-GB', 'en', 'en-PK', 'en-AU', 'en-CA', 'en-IN', 'en-IE', 'en-SG'],
    }
    render(<FilterPill filter={filter} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('English')).toBeTruthy()
    expect(screen.queryByText(/en-US/)).toBeNull()
    expect(screen.queryByText(/\+8/)).toBeNull()
  })

  it('derives the name from whichever member is listed first — they all share one base subtag', () => {
    const filter: DimensionFilter = { dimension: 'language', operator: 'is', values: ['nl-NL', 'nl'] }
    render(<FilterPill filter={filter} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Dutch')).toBeTruthy()
  })

  it('a single-value language filter still reads the raw value, unchanged', () => {
    const filter: DimensionFilter = { dimension: 'language', operator: 'is', values: ['en-US'] }
    render(<FilterPill filter={filter} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('en-US')).toBeTruthy()
    expect(screen.queryByText('English')).toBeNull()
  })

  it('a multi-value filter on any OTHER dimension keeps the generic "+N" label', () => {
    const filter: DimensionFilter = { dimension: 'country', operator: 'is', values: ['US', 'GB', 'DE'] }
    render(<FilterPill filter={filter} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('US +2')).toBeTruthy()
    expect(screen.queryByText('United States')).toBeNull()
  })

  // A grouped row's click produces a homogeneous filter, but the chip stays
  // editable afterwards: ValuePicker's handleAddCustom lets a reader append a
  // free-text value to an existing filter. Once that value belongs to a
  // different base language, the filter no longer means "the English group"
  // and must not keep saying "English".
  it('a language filter with an appended member from a DIFFERENT base language reads the generic label, not the group name', () => {
    const filter: DimensionFilter = {
      dimension: 'language',
      operator: 'is',
      values: ['en-US', 'en-GB', 'en', 'en-PK', 'en-AU', 'en-CA', 'en-IN', 'en-IE', 'en-SG', 'fr-FR'],
    }
    render(<FilterPill filter={filter} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('en-US +9')).toBeTruthy()
    expect(screen.queryByText('English')).toBeNull()
  })

  it('mixed case and an @posix suffix still count as the same base language', () => {
    const filter: DimensionFilter = { dimension: 'language', operator: 'is', values: ['en-US', 'EN-GB', 'en@currency=USD'] }
    render(<FilterPill filter={filter} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('English')).toBeTruthy()
    expect(screen.queryByText(/en-US/)).toBeNull()
  })
})

// The event filter's kinds on the older pages' pills (a funnel's page, Journeys, Settings, Export): by the names the
// dashboard gives them, never their keys (found 16-11-2026: an outbound link's pill read
// "event_property:outbound_link:url is https://…").
describe('FilterPill and the event filter (R45)', () => {
  it('names an outbound link and writes it as the Outbound tab does, a merged row once', async () => {
    const { OUTBOUND_KIND } = await import('@/lib/filters')
    const filter: DimensionFilter = { dimension: OUTBOUND_KIND, operator: 'is', values: ['https://github.com/ciphera', 'http://www.github.com/ciphera'] }
    render(<FilterPill filter={filter} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Outbound link')).toBeTruthy()
    expect(screen.getByText('github.com/ciphera')).toBeTruthy()
    expect(screen.queryByText(/event_property/)).toBeNull()
    expect(screen.queryByText(/\+1/)).toBeNull()
  })

  it('names a property by its event and key, and an event by its readable name', async () => {
    const { eventPropertyKind } = await import('@/lib/filters')
    render(<FilterPill filter={{ dimension: eventPropertyKind('signup', 'plan'), operator: 'is', values: ['pro', 'team'] }} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Signup: Plan')).toBeTruthy()
    expect(screen.getByText('pro +1')).toBeTruthy()
  })

  it('leaves every other kind\'s values as they were (a country stays its code)', () => {
    render(<FilterPill filter={{ dimension: 'country', operator: 'is', values: ['NO'] }} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('NO')).toBeTruthy()
    expect(screen.getByText('Country')).toBeTruthy()
  })
})

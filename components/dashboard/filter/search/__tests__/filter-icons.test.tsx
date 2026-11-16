import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import SearchFilter from '../SearchFilter'
import FiltersBox from '../FiltersBox'
import type { DimensionFilter, FilterSuggestion } from '@/lib/filters'

// ---------------------------------------------------------------------------
// The Filter menu's rows and the filters box draw every value as the blocks do (16-11-2026). A city's and a region's
// flag is its country's: the menu's rows carry it from their read, a pill finds it in the page's own lists.
// ---------------------------------------------------------------------------

const LISTS: Record<string, FilterSuggestion[]> = {
  city: [{ value: 'Oslo', label: 'Oslo', count: 50, country: 'NO' }, { value: 'Malmö', label: 'Malmö', count: 20, country: 'SE' }],
  region: [{ value: 'Viken', label: 'Viken', count: 30, country: 'NO' }],
}
const PAGE = {
  channel: [{ value: 'Organic Search', label: 'Organic Search', count: 90 }],
  language: [{ value: 'nb', label: 'nb', count: 40 }],
  timezone: [{ value: 'Europe/Oslo', label: 'Europe/Oslo', count: 40 }],
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const flagOf = (el: Element) => el.querySelector('img')?.getAttribute('src')?.match(/\/flags\/([a-z]+)\.svg$/)?.[1] ?? null

afterEach(() => cleanup())

describe('the Filter menu\'s rows', () => {
  it('draw a city\'s and a region\'s country flag, a language\'s and a timezone\'s flag, and a channel\'s mark', async () => {
    render(<SearchFilter filters={[]} onApply={vi.fn()} fetchSuggestions={async (d) => LISTS[d] ?? []} pageValues={PAGE} />)
    fireEvent.click(screen.getByTestId('search-filter-button'))
    await settle()
    const panel = screen.getByTestId('search-filter-panel')
    const field = within(panel).getByRole('combobox')
    const rowFor = (text: string) => {
      fireEvent.change(field, { target: { value: text } })
      return within(panel).getAllByRole('option')[0]
    }
    expect(flagOf(rowFor('oslo'))).toBe('no')
    expect(flagOf(rowFor('malm'))).toBe('se')
    expect(flagOf(rowFor('viken'))).toBe('no')
    expect(flagOf(rowFor('nb'))).toBe('no')
    expect(flagOf(rowFor('europe/oslo'))).toBe('no')
    // The channel's Sources mark: an svg, no picture.
    const channel = rowFor('organic')
    expect(channel.querySelector('img')).toBeNull()
    expect(channel.querySelector('svg')).toBeTruthy()
  })
})

describe('a filter\'s pill', () => {
  const city: DimensionFilter = { dimension: 'city', operator: 'is', values: ['Oslo'] }
  it('draws the city\'s country flag from the page\'s own lists', () => {
    render(<FiltersBox filters={[city]} onApply={vi.fn()} onRemove={vi.fn()} onClearAll={vi.fn()} pageValues={{}} places={{ city: { Oslo: 'NO' } }} />)
    expect(flagOf(screen.getByTestId('filter-pill'))).toBe('no')
  })

  it('keeps the kind\'s mark when the page does not list that city', () => {
    render(<FiltersBox filters={[city]} onApply={vi.fn()} onRemove={vi.fn()} onClearAll={vi.fn()} pageValues={{}} places={{}} />)
    const pill = screen.getByTestId('filter-pill')
    expect(pill.querySelector('img')).toBeNull()
    expect(pill.querySelector('svg')).toBeTruthy()
  })
})

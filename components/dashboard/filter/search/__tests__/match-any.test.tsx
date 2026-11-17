import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { DimensionFilter, FilterMode } from '@/lib/filters'
import { SiteScopeProvider, memberScope } from '@/lib/scope/SiteScope'

// ---------------------------------------------------------------------------
// Match any's switch (R65 of 16-11-2026, the match-any beta; its place is R75 of 17-11-2026, "the word on the box"):
// where the page hands the box a switch (`onMode`: the team has the beta), the box says how its filters are joined in
// a word of its own, "all 3 filters", and one press on that word makes it "any of 3 filters". The word is a control
// apart from the count, which still opens the list. Beside an event filter the server reads Match all only: the word
// is plain text there and the list opens with the line that says why. Without `onMode` the box is what it was.
// ---------------------------------------------------------------------------

vi.mock('@/lib/features', () => ({ useFeature: () => false }))
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))
vi.mock('@/lib/api/savedFilters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/savedFilters')>()),
  listSavedFilters: vi.fn().mockResolvedValue([]),
  createSavedFilter: vi.fn(),
  deleteSavedFilter: vi.fn(),
}))

import FiltersBox, { MATCH_ANY_NEEDS_NO_EVENT } from '../FiltersBox'

const PAGE = { event_name: [{ value: 'signup', label: 'Signup', count: 50 }] }
const NORWAY: DimensionFilter = { dimension: 'country', operator: 'is', values: ['NO'] }
const MOBILE: DimensionFilter = { dimension: 'device', operator: 'is', values: ['mobile'] }
const GOOGLE: DimensionFilter = { dimension: 'referrer', operator: 'is', values: ['Google'] }
const SIGNUP: DimensionFilter = { dimension: 'event', operator: 'is', values: ['signup'] }

function box(filters: DimensionFilter[], mode: FilterMode | undefined, onMode?: (mode: FilterMode) => void) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SiteScopeProvider scope={memberScope('site-1')}>
        <FiltersBox filters={filters} onApply={vi.fn()} onRemove={vi.fn()} onClearAll={vi.fn()} pageValues={PAGE} mode={mode} onMode={onMode} />
      </SiteScopeProvider>
    </SWRConfig>,
  )
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
/** What the box says, read as a person does: its parts in order, a space between them. */
const said = () => Array.from(screen.getByTestId('filters-box-control').querySelectorAll('[data-testid^="filters-box-mode"], [data-testid="filters-box"]'))
  .map((part) => part.textContent?.trim())
  .join(' ')
const firstInList = () => (screen.getByTestId('filters-menu').querySelector('[data-menu-list]') as HTMLElement).firstElementChild?.getAttribute('data-testid')

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('the word on the box', () => {
  it('says "all 3 filters" while the page counts what fits every filter', async () => {
    box([NORWAY, MOBILE, GOOGLE], 'all', vi.fn())
    await settle()
    expect(said()).toBe('all 3 filters')
    const word = screen.getByTestId('filters-box-mode')
    expect(word.tagName).toBe('BUTTON')
    expect(word.textContent).toBe('all')
    expect(word.getAttribute('data-mode')).toBe('all')
    expect(word.getAttribute('aria-label')).toBe('Matching all filters: press to match any')
    expect(word.getAttribute('title')).toBe('Press for "any": count what fits at least one filter')
  })

  it('one press on the word hands the page the other mode, and opens nothing', async () => {
    const onMode = vi.fn()
    box([NORWAY, MOBILE], 'all', onMode)
    await settle()
    fireEvent.click(screen.getByTestId('filters-box-mode'))
    expect(onMode).toHaveBeenCalledTimes(1)
    expect(onMode).toHaveBeenCalledWith('any')
    // The word is not the list's button: the filters stay folded.
    expect(screen.queryByTestId('filters-menu')).toBeNull()
  })

  it('says "any of 3 filters" while the page counts what fits at least one, and one press goes back', async () => {
    const onMode = vi.fn()
    box([NORWAY, MOBILE, GOOGLE], 'any', onMode)
    await settle()
    expect(said()).toBe('any of 3 filters')
    const word = screen.getByTestId('filters-box-mode')
    expect(word.textContent).toBe('any of')
    expect(word.getAttribute('data-mode')).toBe('any')
    expect(word.getAttribute('aria-label')).toBe('Matching any filter: press to match all')
    expect(word.getAttribute('title')).toBe('Press for "all": count what fits every filter')
    fireEvent.click(word)
    expect(onMode).toHaveBeenCalledTimes(1)
    expect(onMode).toHaveBeenCalledWith('all')
  })

  it('leaves the count as the button that opens the list, and the list is the filters alone', async () => {
    const onMode = vi.fn()
    box([NORWAY, MOBILE, GOOGLE], 'all', onMode)
    await settle()
    const count = screen.getByTestId('filters-box')
    expect(count.textContent).toBe('3 filters')
    expect(count.getAttribute('aria-haspopup')).toBe('dialog')
    expect(count.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(count)
    expect(count.getAttribute('aria-expanded')).toBe('true')
    // The mode has no row of its own in the list, and a word that can be pressed needs no line to explain it.
    expect(firstInList()).toBe('filters-menu-row')
    expect(screen.getAllByTestId('filters-menu-row')).toHaveLength(3)
    expect(screen.queryByTestId('filters-match-why')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(onMode).not.toHaveBeenCalled()
  })

  it('opens the list from the icons too, which a keyboard passes over: the count is its stop', async () => {
    box([NORWAY, MOBILE], 'all', vi.fn())
    await settle()
    const icons = screen.getByTestId('filters-box-icons')
    expect(icons.getAttribute('tabindex')).toBe('-1')
    expect(icons.getAttribute('aria-hidden')).toBe('true')
    // The word and the count are in the tab order, in the order they read.
    const stops = Array.from(screen.getByTestId('filters-box-control').querySelectorAll('button:not([tabindex="-1"])')).map((b) => b.getAttribute('data-testid'))
    expect(stops).toEqual(['filters-box-mode', 'filters-box', 'filters-box-clear'])
    fireEvent.click(icons)
    expect(screen.getByTestId('filters-menu')).toBeTruthy()
    expect(screen.getByTestId('filters-box').getAttribute('aria-expanded')).toBe('true')
  })
})

describe('where the word is not a switch', () => {
  it('is absent without a team that has the beta: the box is what it was', async () => {
    box([NORWAY, MOBILE], undefined, undefined)
    await settle()
    expect(screen.queryByTestId('filters-box-mode')).toBeNull()
    expect(screen.queryByTestId('filters-box-mode-fixed')).toBeNull()
    expect(screen.queryByTestId('filters-box-icons')).toBeNull()
    expect(screen.getByTestId('filters-box').textContent).toBe('2 filters')
    fireEvent.click(screen.getByTestId('filters-box'))
    expect(firstInList()).toBe('filters-menu-row')
    expect(screen.getAllByTestId('filters-menu-row')).toHaveLength(2)
    expect(screen.queryByTestId('filters-match-why')).toBeNull()
  })

  it('is plain text beside an event filter, and the list opens with the line that says why', async () => {
    const onMode = vi.fn()
    box([NORWAY, MOBILE, SIGNUP], 'all', onMode)
    await settle()
    expect(said()).toBe('all 3 filters')
    expect(screen.queryByTestId('filters-box-mode')).toBeNull()
    const word = screen.getByTestId('filters-box-mode-fixed')
    expect(word.tagName).toBe('SPAN')
    expect(word.textContent).toBe('all')
    expect(word.getAttribute('title')).toBe(MATCH_ANY_NEEDS_NO_EVENT)
    fireEvent.click(word)
    expect(onMode).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('filters-box'))
    expect(firstInList()).toBe('filters-match-why')
    expect(screen.getByTestId('filters-match-why').textContent).toBe(MATCH_ANY_NEEDS_NO_EVENT)
    expect(screen.getAllByTestId('filters-menu-row')).toHaveLength(3)
  })

  it('has no place with one filter: a single filter is a pill, and says the same under both', async () => {
    box([NORWAY], 'any', vi.fn())
    await settle()
    expect(screen.queryByTestId('filters-box')).toBeNull()
    expect(screen.queryByTestId('filters-box-mode')).toBeNull()
    expect(screen.queryByTestId('filters-box-mode-fixed')).toBeNull()
    expect(screen.getByTestId('filter-pill')).toBeTruthy()
  })
})

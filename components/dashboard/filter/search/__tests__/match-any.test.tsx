import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { DimensionFilter, FilterMode } from '@/lib/filters'
import { SiteScopeProvider, memberScope } from '@/lib/scope/SiteScope'

// ---------------------------------------------------------------------------
// Match any's switch (R65 of 16-11-2026, the match-any beta): the filters box's list opens with a "Match" row and its
// All / Any switch where the page hands the box one (`onMode`: the team has the beta), and the box says "Any of N
// filters" while the page is in Any. Beside an event filter the server reads Match all only: the switch is off there
// and the row says why. Without `onMode` the box is what it was.
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
const open = async () => { await settle(); fireEvent.click(screen.getByTestId('filters-box')) }

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('the Match row', () => {
  it('opens the list, over the filters it joins, with All on', async () => {
    box([NORWAY, MOBILE, GOOGLE], 'all', vi.fn())
    await open()
    const list = screen.getByTestId('filters-menu').querySelector('[data-menu-list]') as HTMLElement
    expect(list.firstElementChild?.getAttribute('data-testid')).toBe('filters-match-row')
    const row = within(screen.getByTestId('filters-match-row'))
    expect(row.getByText('Match')).toBeTruthy()
    expect(row.getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('true')
    expect(row.getByRole('radio', { name: 'Any' }).getAttribute('aria-checked')).toBe('false')
    expect(row.getByRole('radiogroup').getAttribute('aria-label')).toBe('Match all filters or any filter')
    expect(screen.queryByTestId('filters-match-why')).toBeNull()
    // The filters keep their own rows under it.
    expect(screen.getAllByTestId('filters-menu-row')).toHaveLength(3)
  })

  it('hands the page the mode that was pressed', async () => {
    const onMode = vi.fn()
    box([NORWAY, MOBILE], 'all', onMode)
    await open()
    fireEvent.click(within(screen.getByTestId('filters-match-row')).getByRole('radio', { name: 'Any' }))
    expect(onMode).toHaveBeenCalledTimes(1)
    expect(onMode).toHaveBeenCalledWith('any')
  })

  it('shows Any on, and the box says so, while the page counts what fits at least one filter', async () => {
    const onMode = vi.fn()
    box([NORWAY, MOBILE, GOOGLE], 'any', onMode)
    await settle()
    expect(screen.getByTestId('filters-box')).toHaveTextContent('Any of 3 filters')
    fireEvent.click(screen.getByTestId('filters-box'))
    const row = within(screen.getByTestId('filters-match-row'))
    expect(row.getByRole('radio', { name: 'Any' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(row.getByRole('radio', { name: 'All' }))
    expect(onMode).toHaveBeenCalledWith('all')
  })

  it('says "3 filters", as it always has, under Match all', async () => {
    box([NORWAY, MOBILE, GOOGLE], 'all', vi.fn())
    await settle()
    expect(screen.getByTestId('filters-box').textContent).toBe('3 filters')
  })
})

describe('where the switch is not offered', () => {
  it('is absent without a team that has the beta: the box is what it was', async () => {
    box([NORWAY, MOBILE], undefined, undefined)
    await open()
    expect(screen.queryByTestId('filters-match-row')).toBeNull()
    expect(screen.getByTestId('filters-box').textContent).toBe('2 filters')
    expect(screen.getAllByTestId('filters-menu-row')).toHaveLength(2)
  })

  it('is off beside an event filter, and the row says why', async () => {
    const onMode = vi.fn()
    box([NORWAY, MOBILE, SIGNUP], 'all', onMode)
    await open()
    const row = within(screen.getByTestId('filters-match-row'))
    const any = row.getByRole('radio', { name: 'Any' }) as HTMLButtonElement
    expect(any.disabled).toBe(true)
    expect(screen.getByTestId('filters-match-why').textContent).toBe(MATCH_ANY_NEEDS_NO_EVENT)
    fireEvent.click(any)
    expect(onMode).not.toHaveBeenCalled()
  })

  it('has no place with one filter: a single filter is a pill, and says the same under both', async () => {
    box([NORWAY], 'all', vi.fn())
    await settle()
    expect(screen.queryByTestId('filters-box')).toBeNull()
    expect(screen.getByTestId('filter-pill')).toBeTruthy()
    expect(screen.queryByTestId('filters-match-row')).toBeNull()
  })
})

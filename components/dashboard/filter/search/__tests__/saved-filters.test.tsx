import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { DimensionFilter } from '@/lib/filters'
import { SiteScopeProvider, memberScope, SITE_PAGES, type SiteScope } from '@/lib/scope/SiteScope'

// ---------------------------------------------------------------------------
// Saved filters (R59 and R60 of 16-11-2026, option A "In the filters box"): the team's sets, per site, for every team
// since the same day (no flag). The box's list saves the filters on under a name typed in place; a single filter's bookmark
// does the same; the Filter panel lists the sets at the top of its first view and puts one on in a single change.
// Whoever may edit the site saves and deletes; every member reads; a public page shows nothing and asks nothing.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({ canEdit: true }))
// Saved filters read no flag since 16-11-2026: every other beta stays off here.
vi.mock('@/lib/features', () => ({ useFeature: () => false }))
vi.mock('@/lib/auth/permissions', () => ({ useCan: (perm: string) => (perm === 'sites.edit' ? state.canEdit : false) }))

const api = vi.hoisted(() => ({
  listSavedFilters: vi.fn(),
  createSavedFilter: vi.fn(),
  deleteSavedFilter: vi.fn(),
}))
vi.mock('@/lib/api/savedFilters', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api/savedFilters')>()), ...api }))

import FiltersBox from '../FiltersBox'
import SearchFilter from '../SearchFilter'
import { describe as describeSet, suggestName } from '../saved'
import { keyOf, setFor } from '@/lib/swr/savedFilters'
import { ApiError } from '@/lib/api/client'

const PAGE = { event_name: [{ value: 'add_to_cart', label: 'Add to cart', count: 50 }] }
const NORWAY: DimensionFilter = { dimension: 'country', operator: 'is', values: ['NO'] }
const NOT_MOBILE: DimensionFilter = { dimension: 'device', operator: 'is_not', values: ['mobile'] }
const SAVED = [
  { id: 'set-2', name: 'Phones in Norway', filters: 'v2:country|is|NO,device|is|mobile', created_at: '2026-11-16T01:00:00Z' },
  { id: 'set-1', name: 'Norway', filters: 'v2:country|is|NO', created_at: '2026-11-15T01:00:00Z' },
]
const publicScope: SiteScope = { siteId: 'site-1', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' }

function within_(scope: SiteScope, node: React.ReactNode) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SiteScopeProvider scope={scope}>{node}</SiteScopeProvider>
    </SWRConfig>,
  )
}
const box = (filters: DimensionFilter[], scope: SiteScope = memberScope('site-1')) =>
  within_(scope, <FiltersBox filters={filters} onApply={vi.fn()} onRemove={vi.fn()} onClearAll={vi.fn()} pageValues={PAGE} />)
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

beforeEach(() => {
  state.canEdit = true
  api.listSavedFilters.mockReset().mockResolvedValue([])
  api.createSavedFilter.mockReset().mockImplementation(async (_site: string, body: { name: string; filters: string }) => ({ id: 'new', ...body, created_at: '2026-11-16T02:00:00Z' }))
  api.deleteSavedFilter.mockReset().mockResolvedValue(undefined)
})
afterEach(() => cleanup())

describe('how a set is named and matched', () => {
  it('describes a set with the box\'s own words and suggests a name from its values', () => {
    expect(describeSet([NORWAY, NOT_MOBILE], PAGE)).toBe('Country is Norway and Device is not mobile')
    expect(suggestName([NORWAY, NOT_MOBILE], PAGE)).toBe('Norway, not mobile')
    expect(suggestName([NORWAY, NOT_MOBILE, { dimension: 'page', operator: 'is', values: ['/blog'] }], PAGE)).toBe('Norway, not mobile and 1 more')
  })

  it('matches the filters on to a set whatever the order of the filters or their values', () => {
    const a: DimensionFilter[] = [NORWAY, { dimension: 'device', operator: 'is', values: ['mobile', 'tablet'] }]
    const b: DimensionFilter[] = [{ dimension: 'device', operator: 'is', values: ['tablet', 'mobile'] }, NORWAY]
    expect(keyOf(a)).toBe(keyOf(b))
    expect(setFor(b, [{ id: 's', name: 'x', filters: a, mode: 'all' }])?.id).toBe('s')
    expect(setFor([], [{ id: 's', name: 'x', filters: a, mode: 'all' }])).toBeNull()
  })

  it('keeps Match any apart: the same filters under the other mode are another set (R65)', () => {
    const both: DimensionFilter[] = [NORWAY, { dimension: 'device', operator: 'is', values: ['mobile'] }]
    expect(keyOf(both, 'any')).not.toBe(keyOf(both, 'all'))
    expect(keyOf(both)).toBe(keyOf(both, 'all'))
    const sets = [{ id: 'any', name: 'Either', filters: both, mode: 'any' as const }, { id: 'all', name: 'Both', filters: both, mode: 'all' as const }]
    expect(setFor(both, sets, 'any')?.id).toBe('any')
    expect(setFor(both, sets, 'all')?.id).toBe('all')
    expect(setFor(both, sets)?.id).toBe('all')
    // One filter says the same under both, so its mode never tells two sets apart.
    expect(keyOf([NORWAY], 'any')).toBe(keyOf([NORWAY], 'all'))
  })
})

describe('the filters box saves the filters on (R59: option A)', () => {
  it('ends the list with "Save these filters", names the set in place and sends the address form', async () => {
    box([NORWAY, NOT_MOBILE])
    await settle()
    fireEvent.click(screen.getByTestId('filters-box'))
    fireEvent.click(screen.getByTestId('filters-save-row'))
    const input = screen.getByRole('textbox', { name: 'Name for these filters' }) as HTMLInputElement
    expect(input.value).toBe('Norway, not mobile')
    fireEvent.change(input, { target: { value: 'Not phones in Norway' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await settle()
    expect(api.createSavedFilter).toHaveBeenCalledWith('site-1', { name: 'Not phones in Norway', filters: 'v2:country|is|NO,device|is_not|mobile' })
    // The list now says the filters on are that set.
    await waitFor(() => expect(screen.getByText('Saved as')).toBeTruthy())
    expect(screen.getByText('Not phones in Norway')).toBeTruthy()
    expect(screen.queryByTestId('filters-save-row')).toBeNull()
  })

  it('keeps the field open with the server\'s reason when a save is refused', async () => {
    api.createSavedFilter.mockRejectedValue(new ApiError('conflict', 409, { error: 'name_taken' }))
    box([NORWAY, NOT_MOBILE])
    await settle()
    fireEvent.click(screen.getByTestId('filters-box'))
    fireEvent.click(screen.getByTestId('filters-save-row'))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name for these filters' }), { key: 'Enter' })
    expect(await screen.findByRole('alert')).toHaveTextContent('A saved filter already has this name.')
    expect(screen.getByRole('textbox', { name: 'Name for these filters' })).toBeTruthy()
  })

  it('says "Saved as" when the filters on are a set, and Escape takes the field back to its row', async () => {
    api.listSavedFilters.mockResolvedValue(SAVED)
    box([{ dimension: 'device', operator: 'is', values: ['mobile'] }, NORWAY])
    await settle()
    fireEvent.click(screen.getByTestId('filters-box'))
    expect(await screen.findByText('Phones in Norway')).toBeTruthy()
    cleanup()
    api.listSavedFilters.mockResolvedValue([])
    box([NORWAY, NOT_MOBILE])
    await settle()
    fireEvent.click(screen.getByTestId('filters-box'))
    fireEvent.click(screen.getByTestId('filters-save-row'))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name for these filters' }), { key: 'Escape' })
    expect(screen.getByTestId('filters-save-row')).toBeTruthy()
    expect(screen.getAllByTestId('filters-menu-row')).toHaveLength(2)
  })

  it('saves a single filter from the bookmark beside its x', async () => {
    box([NORWAY])
    await settle()
    const pill = screen.getByTestId('filter-pill')
    const bookmark = within(pill).getByRole('button', { name: 'Save this filter' })
    // Beside the x, the size of the x.
    expect(bookmark.nextElementSibling?.getAttribute('aria-label')).toBe('Remove Country filter')
    expect(bookmark.className.split(' ')).toEqual(expect.arrayContaining(['w-8', 'border-s']))
    fireEvent.click(bookmark)
    const input = screen.getByRole('textbox', { name: 'Name for this filter' }) as HTMLInputElement
    expect(input.value).toBe('Norway')
    fireEvent.keyDown(input, { key: 'Enter' })
    await settle()
    expect(api.createSavedFilter).toHaveBeenCalledWith('site-1', { name: 'Norway', filters: 'v2:country|is|NO' })
    await waitFor(() => expect(within(screen.getByTestId('filter-pill')).getByRole('button', { name: 'Saved as Norway' })).toBeTruthy())
  })

  it('offers no save to a reader who may not edit the site, but still says "Saved as"', async () => {
    state.canEdit = false
    api.listSavedFilters.mockResolvedValue(SAVED)
    box([NORWAY, NOT_MOBILE])
    await settle()
    fireEvent.click(screen.getByTestId('filters-box'))
    expect(screen.queryByTestId('filters-save-row')).toBeNull()
    cleanup()
    box([NORWAY])
    await settle()
    await waitFor(() => expect(within(screen.getByTestId('filter-pill')).getByRole('button', { name: 'Saved as Norway' })).toBeTruthy())
    cleanup()
    api.listSavedFilters.mockResolvedValue([])
    box([NOT_MOBILE])
    await settle()
    expect(within(screen.getByTestId('filter-pill')).queryByTestId('filter-pill-save')).toBeNull()
  })

  it('shows nothing and asks nothing on a public page', async () => {
    box([NORWAY], publicScope)
    await settle()
    expect(screen.queryByTestId('filter-pill-save')).toBeNull()
    expect(api.listSavedFilters).not.toHaveBeenCalled()
  })
})

describe('the Filter panel lists the sets (R59)', () => {
  const panel = (filters: DimensionFilter[] = [], onApplySet = vi.fn()) => {
    within_(memberScope('site-1'), <SearchFilter filters={filters} onApply={vi.fn()} fetchSuggestions={async () => []} pageValues={PAGE} onApplySet={onApplySet} />)
    return { onApplySet }
  }

  it('lists them under "Saved" above the kinds, the newest first, the one on the page marked', async () => {
    api.listSavedFilters.mockResolvedValue(SAVED)
    panel([NORWAY])
    await settle()
    fireEvent.click(screen.getByTestId('search-filter-button'))
    expect(await screen.findByTestId('saved-filters-heading')).toHaveTextContent('Saved')
    const rows = [...document.querySelectorAll('[data-saved-row]')]
    expect(rows.map((r) => r.getAttribute('data-saved-row'))).toEqual(['Phones in Norway', 'Norway'])
    expect(rows.map((r) => r.getAttribute('data-on'))).toEqual(['false', 'true'])
    expect(rows[0].textContent).toContain('Country is Norway and Device is mobile')
  })

  it('puts a set on in place of the filters on, in one change, and closes', async () => {
    api.listSavedFilters.mockResolvedValue(SAVED)
    const { onApplySet } = panel([NOT_MOBILE])
    await settle()
    fireEvent.click(screen.getByTestId('search-filter-button'))
    fireEvent.click(within(await screen.findByText('Phones in Norway').then((n) => n.closest('[data-saved-row]') as HTMLElement)).getByRole('option'))
    expect(onApplySet).toHaveBeenCalledTimes(1)
    expect(onApplySet).toHaveBeenCalledWith([NORWAY, { dimension: 'device', operator: 'is', values: ['mobile'] }], 'all')
    await waitFor(() => expect(screen.queryByTestId('search-filter-panel')).toBeNull())
  })

  it('puts a set saved under Match any on WITH its mode, and marks it only while the page is in that mode (R65)', async () => {
    const either = { id: 'set-3', name: 'Norway or phones', filters: 'any:v2:country|is|NO,device|is|mobile', created_at: '2026-11-16T03:00:00Z' }
    api.listSavedFilters.mockResolvedValue([either, ...SAVED])
    const onApplySet = vi.fn()
    const both: DimensionFilter[] = [NORWAY, { dimension: 'device', operator: 'is', values: ['mobile'] }]
    within_(memberScope('site-1'), <SearchFilter filters={both} onApply={vi.fn()} fetchSuggestions={async () => []} pageValues={PAGE} onApplySet={onApplySet} mode="any" />)
    await settle()
    fireEvent.click(screen.getByTestId('search-filter-button'))
    await screen.findByTestId('saved-filters-heading')
    const rows = [...document.querySelectorAll('[data-saved-row]')]
    // The page holds the two filters under Match any: the Any set is the one on, its Match all twin is not.
    expect(rows.map((r) => [r.getAttribute('data-saved-row'), r.getAttribute('data-on')])).toEqual([
      ['Norway or phones', 'true'], ['Phones in Norway', 'false'], ['Norway', 'false'],
    ])
    fireEvent.click(within(rows[0] as HTMLElement).getByRole('option'))
    expect(onApplySet).toHaveBeenCalledWith(both, 'any')
  })

  it('reaches the sets from the keyboard first: Enter on the first row puts it on', async () => {
    api.listSavedFilters.mockResolvedValue(SAVED)
    const { onApplySet } = panel()
    await settle()
    fireEvent.click(screen.getByTestId('search-filter-button'))
    await screen.findByTestId('saved-filters-heading')
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(onApplySet).toHaveBeenCalledWith([NORWAY, { dimension: 'device', operator: 'is', values: ['mobile'] }], 'all')
  })

  it('deletes a set from its bin, for whoever may edit; a reader sees no bin', async () => {
    api.listSavedFilters.mockResolvedValue(SAVED)
    panel()
    await settle()
    fireEvent.click(screen.getByTestId('search-filter-button'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Norway' }))
    await settle()
    expect(api.deleteSavedFilter).toHaveBeenCalledWith('site-1', 'set-1')
    await waitFor(() => expect(document.querySelector('[data-saved-row="Norway"]')).toBeNull())
    cleanup()
    state.canEdit = false
    panel()
    await settle()
    fireEvent.click(screen.getByTestId('search-filter-button'))
    await screen.findByTestId('saved-filters-heading')
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull()
  })

  it('lists no set without a way to put one on', async () => {
    api.listSavedFilters.mockResolvedValue(SAVED)
    within_(memberScope('site-1'), <SearchFilter filters={[]} onApply={vi.fn()} fetchSuggestions={async () => []} pageValues={PAGE} />)
    await settle()
    fireEvent.click(screen.getByTestId('search-filter-button'))
    expect(screen.queryByTestId('saved-filters-heading')).toBeNull()
  })
})

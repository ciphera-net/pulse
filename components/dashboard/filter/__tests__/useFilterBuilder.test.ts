import { describe, it, expect } from 'vitest'
import {
  filterBuilderReducer,
  isDuplicateFilter,
  moveHighlight,
  INITIAL_DRAFT,
  type FilterDraft,
} from '../useFilterBuilder'
import type { DimensionFilter } from '@/lib/filters'

const referrerFilter: DimensionFilter = {
  dimension: 'referrer',
  operator: 'is',
  values: ['linkedin.com'],
}

describe('filterBuilderReducer', () => {
  it('open_create resets to the dimension stage', () => {
    const dirty: FilterDraft = { stage: 'value', dimension: 'browser', operator: 'contains', values: ['Chrome'], editingIndex: 2 }
    expect(filterBuilderReducer(dirty, { type: 'open_create' })).toEqual(INITIAL_DRAFT)
  })

  it('open_edit prefills the value stage with the filter and its index', () => {
    const next = filterBuilderReducer(INITIAL_DRAFT, { type: 'open_edit', filter: referrerFilter, index: 1 })
    expect(next).toEqual({
      stage: 'value',
      dimension: 'referrer',
      operator: 'is',
      values: ['linkedin.com'],
      editingIndex: 1,
    })
  })

  it('open_edit copies values so later edits cannot mutate the committed filter', () => {
    const next = filterBuilderReducer(INITIAL_DRAFT, { type: 'open_edit', filter: referrerFilter, index: 0 })
    expect(next.values).not.toBe(referrerFilter.values)
  })

  it('pick_dimension advances to the value stage and clears values on change', () => {
    const editing = filterBuilderReducer(INITIAL_DRAFT, { type: 'open_edit', filter: referrerFilter, index: 0 })
    const back = filterBuilderReducer(editing, { type: 'back' })
    const switched = filterBuilderReducer(back, { type: 'pick_dimension', dimension: 'browser' })
    expect(switched.stage).toBe('value')
    expect(switched.dimension).toBe('browser')
    expect(switched.values).toEqual([])
  })

  it('re-picking the same dimension keeps chosen values', () => {
    const editing = filterBuilderReducer(INITIAL_DRAFT, { type: 'open_edit', filter: referrerFilter, index: 0 })
    const back = filterBuilderReducer(editing, { type: 'back' })
    const samePick = filterBuilderReducer(back, { type: 'pick_dimension', dimension: 'referrer' })
    expect(samePick.values).toEqual(['linkedin.com'])
  })

  it('set_operator never clears values', () => {
    const editing = filterBuilderReducer(INITIAL_DRAFT, { type: 'open_edit', filter: referrerFilter, index: 0 })
    const changed = filterBuilderReducer(editing, { type: 'set_operator', operator: 'not_contains' })
    expect(changed.operator).toBe('not_contains')
    expect(changed.values).toEqual(['linkedin.com'])
  })

  it('back returns to the dimension stage without losing the draft', () => {
    const editing = filterBuilderReducer(INITIAL_DRAFT, { type: 'open_edit', filter: referrerFilter, index: 0 })
    const back = filterBuilderReducer(editing, { type: 'back' })
    expect(back.stage).toBe('dimension')
    expect(back.dimension).toBe('referrer')
    expect(back.values).toEqual(['linkedin.com'])
  })
})

describe('isDuplicateFilter', () => {
  const committed: DimensionFilter[] = [
    referrerFilter,
    { dimension: 'browser', operator: 'is', values: ['Chrome', 'Firefox'] },
  ]

  it('flags an exact duplicate when creating', () => {
    expect(isDuplicateFilter(
      { dimension: 'referrer', operator: 'is', values: ['linkedin.com'], editingIndex: null },
      committed,
    )).toBe(true)
  })

  it('does not flag a different operator or values', () => {
    expect(isDuplicateFilter(
      { dimension: 'referrer', operator: 'is_not', values: ['linkedin.com'], editingIndex: null },
      committed,
    )).toBe(false)
    expect(isDuplicateFilter(
      { dimension: 'browser', operator: 'is', values: ['Chrome'], editingIndex: null },
      committed,
    )).toBe(false)
  })

  it('never flags the filter being edited as a duplicate of itself', () => {
    expect(isDuplicateFilter(
      { dimension: 'referrer', operator: 'is', values: ['linkedin.com'], editingIndex: 0 },
      committed,
    )).toBe(false)
  })

  it('is inert with no dimension or no values', () => {
    expect(isDuplicateFilter({ dimension: null, operator: 'is', values: ['x'], editingIndex: null }, committed)).toBe(false)
    expect(isDuplicateFilter({ dimension: 'referrer', operator: 'is', values: [], editingIndex: null }, committed)).toBe(false)
  })
})

describe('moveHighlight', () => {
  it('wraps in both directions', () => {
    expect(moveHighlight(0, -1, 5)).toBe(4)
    expect(moveHighlight(4, 1, 5)).toBe(0)
    expect(moveHighlight(2, 1, 5)).toBe(3)
  })

  it('enters the list from an unset highlight', () => {
    expect(moveHighlight(-1, 1, 5)).toBe(0)
    expect(moveHighlight(-1, -1, 5)).toBe(4)
  })

  it('returns -1 for an empty list', () => {
    expect(moveHighlight(0, 1, 0)).toBe(-1)
  })
})

'use client'

import { useCallback, useReducer, useRef, useState } from 'react'
import type { DimensionFilter, FilterSuggestion } from '@/lib/filters'

// ---------------------------------------------------------------------------
// Filter builder draft state — a pure reducer so the transition rules are
// unit-testable, wrapped by a thin hook that adds open/anchor bookkeeping and
// a per-session suggestion cache.
// ---------------------------------------------------------------------------

export type FilterBuilderStage = 'dimension' | 'value'

export interface FilterDraft {
  stage: FilterBuilderStage
  dimension: string | null
  operator: DimensionFilter['operator']
  values: string[]
  /** Index into the page's committed filters when editing; null when creating. */
  editingIndex: number | null
}

export const INITIAL_DRAFT: FilterDraft = {
  stage: 'dimension',
  dimension: null,
  operator: 'is',
  values: [],
  editingIndex: null,
}

export type FilterBuilderAction =
  | { type: 'open_create' }
  | { type: 'open_edit'; filter: DimensionFilter; index: number }
  | { type: 'pick_dimension'; dimension: string }
  | { type: 'set_operator'; operator: DimensionFilter['operator'] }
  | { type: 'set_values'; values: string[] }
  | { type: 'back' }
  | { type: 'reset' }

export function filterBuilderReducer(draft: FilterDraft, action: FilterBuilderAction): FilterDraft {
  switch (action.type) {
    case 'open_create':
    case 'reset':
      return INITIAL_DRAFT
    case 'open_edit':
      return {
        stage: 'value',
        dimension: action.filter.dimension,
        operator: action.filter.operator,
        values: [...action.filter.values],
        editingIndex: action.index,
      }
    case 'pick_dimension':
      return {
        ...draft,
        stage: 'value',
        dimension: action.dimension,
        // * Switching dimension invalidates chosen values; re-picking the same
        // * one (back-and-forth) keeps them.
        values: action.dimension === draft.dimension ? draft.values : [],
      }
    case 'set_operator':
      // * Operator changes never clear values (design D3).
      return { ...draft, operator: action.operator }
    case 'set_values':
      return { ...draft, values: action.values }
    case 'back':
      return { ...draft, stage: 'dimension' }
    default:
      return draft
  }
}

/**
 * Exact-duplicate check against committed filters, mirroring the page-level
 * guard (order-sensitive on values). The filter being edited is excluded so
 * saving it unchanged never reads as a duplicate of itself.
 */
export function isDuplicateFilter(
  draft: Pick<FilterDraft, 'dimension' | 'operator' | 'values' | 'editingIndex'>,
  filters: DimensionFilter[],
): boolean {
  if (!draft.dimension || draft.values.length === 0) return false
  return filters.some((f, i) =>
    i !== draft.editingIndex &&
    f.dimension === draft.dimension &&
    f.operator === draft.operator &&
    f.values.join(';') === draft.values.join(';')
  )
}

/** Wrap-around keyboard highlight movement for a list of `length` items. */
export function moveHighlight(current: number, delta: 1 | -1, length: number): number {
  if (length <= 0) return -1
  if (current < 0) return delta === 1 ? 0 : length - 1
  return (current + delta + length) % length
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseFilterBuilder {
  open: boolean
  anchor: HTMLElement | null
  draft: FilterDraft
  dispatch: React.Dispatch<FilterBuilderAction>
  openCreate: (anchor: HTMLElement) => void
  openEdit: (filter: DimensionFilter, index: number, anchor: HTMLElement) => void
  close: () => void
  /** Cache-first suggestion fetch for the popover session (cleared on close). */
  fetchSuggestions: ((dimension: string) => Promise<FilterSuggestion[]>) | undefined
}

export function useFilterBuilder(
  onFetchSuggestions?: (dimension: string) => Promise<FilterSuggestion[]>,
): UseFilterBuilder {
  const [draft, dispatch] = useReducer(filterBuilderReducer, INITIAL_DRAFT)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const cacheRef = useRef(new Map<string, FilterSuggestion[]>())

  const openCreate = useCallback((anchorEl: HTMLElement) => {
    cacheRef.current.clear()
    dispatch({ type: 'open_create' })
    setAnchor(anchorEl)
    setOpen(true)
  }, [])

  const openEdit = useCallback((filter: DimensionFilter, index: number, anchorEl: HTMLElement) => {
    cacheRef.current.clear()
    dispatch({ type: 'open_edit', filter, index })
    setAnchor(anchorEl)
    setOpen(true)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setAnchor(null)
    dispatch({ type: 'reset' })
  }, [])

  const fetchSuggestions = useCallback(async (dimension: string): Promise<FilterSuggestion[]> => {
    if (!onFetchSuggestions) return []
    const cached = cacheRef.current.get(dimension)
    if (cached) return cached
    const data = await onFetchSuggestions(dimension)
    cacheRef.current.set(dimension, data)
    return data
  }, [onFetchSuggestions])

  return {
    open,
    anchor,
    draft,
    dispatch,
    openCreate,
    openEdit,
    close,
    fetchSuggestions: onFetchSuggestions ? fetchSuggestions : undefined,
  }
}

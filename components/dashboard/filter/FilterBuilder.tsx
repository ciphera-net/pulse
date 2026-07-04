'use client'

import { useMemo } from 'react'
import type { DimensionFilter } from '@/lib/filters'
import FilterPopover from './FilterPopover'
import DimensionStage from './DimensionStage'
import ValueStage from './ValueStage'
import { isDuplicateFilter, type UseFilterBuilder } from './useFilterBuilder'

// ---------------------------------------------------------------------------
// FilterBuilder — assembles the popover with its two stages around the
// useFilterBuilder hook the page owns. The page keeps owning the committed
// filters, URL sync and suggestion fetching; this component only renders the
// draft surface.
// ---------------------------------------------------------------------------

export interface FilterBuilderProps {
  builder: UseFilterBuilder
  filters: DimensionFilter[]
  onApply: (filter: DimensionFilter, editingIndex: number | null) => void
  /** Optional dimension allowlist forwarded to the dimension stage. */
  allowedDimensions?: readonly string[]
}

export default function FilterBuilder({ builder, filters, onApply, allowedDimensions }: FilterBuilderProps) {
  const { open, anchor, draft, dispatch, close, fetchSuggestions } = builder

  const activeDimensions = useMemo(() => new Set(filters.map(f => f.dimension)), [filters])
  const duplicate = isDuplicateFilter(draft, filters)

  const apply = () => {
    if (!draft.dimension || draft.values.length === 0 || duplicate) return
    onApply(
      { dimension: draft.dimension, operator: draft.operator, values: draft.values },
      draft.editingIndex,
    )
    close()
  }

  return (
    <FilterPopover
      open={open}
      anchor={anchor}
      label={draft.editingIndex !== null ? 'Edit filter' : 'Add filter'}
      contentKey={draft.stage}
      onClose={close}
    >
      {draft.stage === 'dimension' ? (
        <DimensionStage
          activeDimensions={activeDimensions}
          onPick={dimension => dispatch({ type: 'pick_dimension', dimension })}
          onClose={close}
          allowed={allowedDimensions}
        />
      ) : (
        <ValueStage
          draft={draft}
          isDuplicate={duplicate}
          onBack={() => dispatch({ type: 'back' })}
          onOperatorChange={operator => dispatch({ type: 'set_operator', operator })}
          onValuesChange={values => dispatch({ type: 'set_values', values })}
          onApply={apply}
          fetchSuggestions={fetchSuggestions}
        />
      )}
    </FilterPopover>
  )
}

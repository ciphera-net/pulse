'use client'

import { CaretLeft } from '@phosphor-icons/react'
import { DIMENSION_LABELS, type DimensionFilter, type FilterSuggestion } from '@/lib/filters'
import type { FilterDraft } from './useFilterBuilder'
import OperatorChip from './OperatorChip'
import ValuePicker from './ValuePicker'

// ---------------------------------------------------------------------------
// ValueStage — stage 2 of the filter popover: dimension token + operator chip
// + inline value picker + apply. ⌘/Ctrl-Enter applies from anywhere in the
// stage; plain Enter applies via the picker when its search box is empty.
// ---------------------------------------------------------------------------

export interface ValueStageProps {
  draft: FilterDraft
  isDuplicate: boolean
  onBack: () => void
  onOperatorChange: (operator: DimensionFilter['operator']) => void
  onValuesChange: (values: string[]) => void
  onApply: () => void
  fetchSuggestions?: (dimension: string) => Promise<FilterSuggestion[]>
}

export default function ValueStage({
  draft,
  isDuplicate,
  onBack,
  onOperatorChange,
  onValuesChange,
  onApply,
  fetchSuggestions,
}: ValueStageProps) {
  const canApply = draft.values.length > 0 && !isDuplicate
  const dimLabel = draft.dimension ? (DIMENSION_LABELS[draft.dimension] ?? draft.dimension) : ''

  const handleApply = () => {
    if (canApply) onApply()
  }

  return (
    <div
      onKeyDown={e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          handleApply()
        }
      }}
    >
      {/* Header: back · dimension token · operator */}
      <div className="flex items-center gap-2 p-2 border-b border-neutral-800">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to dimensions"
          className="flex items-center justify-center w-6 h-6 rounded-none text-neutral-500 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer ease-apple"
        >
          <CaretLeft className="w-3.5 h-3.5" weight="bold" />
        </button>
        <button
          type="button"
          onClick={onBack}
          className="px-2 py-1 text-xs font-medium rounded-none bg-brand-orange/10 text-brand-orange border border-brand-orange/20 hover:bg-brand-orange/15 transition-colors cursor-pointer ease-apple"
        >
          {dimLabel}
        </button>
        <OperatorChip operator={draft.operator} onChange={onOperatorChange} />
      </div>

      {/* Values */}
      <ValuePicker
        dimension={draft.dimension}
        values={draft.values}
        onChange={onValuesChange}
        onFetchSuggestions={fetchSuggestions}
        autoFocus
        onSubmit={handleApply}
        onBackspaceWhenEmpty={onBack}
      />

      {/* Apply */}
      <div className="p-2 border-t border-neutral-800 space-y-1.5">
        {isDuplicate && (
          <p className="px-1 text-xs text-neutral-500">
            This exact filter is already active.
          </p>
        )}
        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply}
          className={`w-full px-3 py-2 text-sm font-medium rounded-none transition-[color,background-color,transform] duration-fast ease-apple active:scale-[0.98] ${
            canApply
              ? 'bg-brand-orange text-white hover:bg-brand-orange-hover cursor-pointer'
              : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
          }`}
        >
          {draft.editingIndex !== null ? 'Update filter' : 'Apply filter'}
          {draft.values.length > 1 ? ` · ${draft.values.length}` : ''}
        </button>
      </div>
    </div>
  )
}

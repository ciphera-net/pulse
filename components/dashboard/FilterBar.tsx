'use client'

import { type DimensionFilter, filterLabel } from '@/lib/filters'

interface FilterBarProps {
  filters: DimensionFilter[]
  onRemove: (index: number) => void
  onClear: () => void
}

export default function FilterBar({ filters, onRemove, onClear }: FilterBarProps) {
  if (filters.length === 0) return null

  return (
    <>
      {filters.map((f, i) => (
        <button
          key={`${f.dimension}-${f.operator}-${f.values.join(',')}`}
          onClick={() => onRemove(i)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-orange-button text-white hover:bg-brand-orange-button-hover transition-colors cursor-pointer group"
          title={`Remove filter: ${filterLabel(f)}`}
        >
          <span>{filterLabel(f)}</span>
          <svg className="w-3 h-3 opacity-70 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ))}
      {filters.length > 1 && (
        <button
          onClick={onClear}
          className="px-2 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          Clear all
        </button>
      )}
    </>
  )
}

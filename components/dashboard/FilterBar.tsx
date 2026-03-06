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
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
        Filters
      </span>
      {filters.map((f, i) => (
        <button
          key={`${f.dimension}-${f.operator}-${f.values.join(',')}`}
          onClick={() => onRemove(i)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-brand-orange/10 text-brand-orange border border-brand-orange/20 hover:bg-brand-orange/20 transition-colors cursor-pointer group"
          title={`Remove filter: ${filterLabel(f)}`}
        >
          <span>{filterLabel(f)}</span>
          <svg className="w-3 h-3 opacity-60 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ))}
      {filters.length > 1 && (
        <button
          onClick={onClear}
          className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

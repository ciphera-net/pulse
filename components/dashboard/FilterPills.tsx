'use client'

import { AnimatePresence } from 'framer-motion'
import { type DimensionFilter } from '@/lib/filters'
import FilterPill from './FilterPill'

interface FilterPillsProps {
  filters: DimensionFilter[]
  onEdit: (index: number) => void
  onRemove: (index: number) => void
  onClear: () => void
}

export default function FilterPills({ filters, onEdit, onRemove, onClear }: FilterPillsProps) {
  if (filters.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <AnimatePresence mode="popLayout">
        {filters.map((filter, index) => (
          <FilterPill
            key={`${filter.dimension}-${filter.operator}-${index}`}
            filter={filter}
            onEdit={() => onEdit(index)}
            onRemove={() => onRemove(index)}
          />
        ))}
      </AnimatePresence>
      {filters.length > 1 && (
        <button
          onClick={onClear}
          className="text-xs text-neutral-500 hover:text-red-400 transition-colors cursor-pointer px-1"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

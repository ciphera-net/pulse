'use client'

import { useState, useRef, useEffect } from 'react'
import { DIMENSION_LABELS, OPERATORS, OPERATOR_LABELS, type DimensionFilter } from '@/lib/filters'

export interface FilterSuggestion {
  value: string
  label: string
  count?: number
}

export interface FilterSuggestions {
  [dimension: string]: FilterSuggestion[]
}

interface AddFilterDropdownProps {
  onAdd: (filter: DimensionFilter) => void
  suggestions?: FilterSuggestions
}

// Which dimensions show as always-visible chips vs hidden in "More"
const PRIMARY_DIMS = ['page', 'referrer', 'country', 'browser', 'os', 'device']
const SECONDARY_DIMS = ['region', 'city', 'utm_source', 'utm_medium', 'utm_campaign']

function DimensionPopover({
  dimension,
  suggestions,
  onApply,
  onClose,
}: {
  dimension: string
  suggestions: FilterSuggestion[]
  onApply: (filter: DimensionFilter) => void
  onClose: () => void
}) {
  const [operator, setOperator] = useState<DimensionFilter['operator']>('is')
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  const filtered = suggestions.filter(s =>
    s.label.toLowerCase().includes(search.toLowerCase()) ||
    s.value.toLowerCase().includes(search.toLowerCase())
  )

  function handleSelectValue(value: string) {
    onApply({ dimension, operator, values: [value] })
    onClose()
  }

  function handleSubmitCustom() {
    if (!search.trim()) return
    onApply({ dimension, operator, values: [search.trim()] })
    onClose()
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1.5 z-50 w-72 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl overflow-hidden"
    >
      {/* Operator pills */}
      <div className="flex gap-1 px-3 pt-3 pb-2 flex-wrap">
        {OPERATORS.map(op => (
          <button
            key={op}
            onClick={() => setOperator(op)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
              operator === op
                ? 'bg-brand-orange text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            {OPERATOR_LABELS[op]}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="px-3 pb-2">
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              if (filtered.length === 1) {
                handleSelectValue(filtered[0].value)
              } else {
                handleSubmitCustom()
              }
            }
          }}
          placeholder={`Search or type ${DIMENSION_LABELS[dimension]?.toLowerCase()}...`}
          className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-colors"
        />
      </div>

      {/* Suggestions list */}
      {filtered.length > 0 && (
        <div className="max-h-52 overflow-y-auto border-t border-neutral-100 dark:border-neutral-800">
          {filtered.map(s => (
            <button
              key={s.value}
              onClick={() => handleSelectValue(s.value)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <span className="truncate text-neutral-900 dark:text-white">{s.label}</span>
              {s.count !== undefined && (
                <span className="text-xs text-neutral-400 dark:text-neutral-500 ml-2 tabular-nums flex-shrink-0">
                  {s.count.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Custom value apply when no matches */}
      {search.trim() && filtered.length === 0 && (
        <div className="px-3 py-3 border-t border-neutral-100 dark:border-neutral-800">
          <button
            onClick={handleSubmitCustom}
            className="w-full px-3 py-2 text-sm font-medium bg-brand-orange text-white rounded-lg hover:bg-brand-orange/90 transition-colors cursor-pointer"
          >
            Filter by &ldquo;{search.trim()}&rdquo;
          </button>
        </div>
      )}
    </div>
  )
}

export default function AddFilterDropdown({ onAdd, suggestions = {} }: AddFilterDropdownProps) {
  const [openDim, setOpenDim] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMore) return
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMore])

  function renderChip(dim: string) {
    const isOpen = openDim === dim
    return (
      <div key={dim} className="relative">
        <button
          onClick={() => {
            setOpenDim(isOpen ? null : dim)
            setShowMore(false)
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
            isOpen
              ? 'bg-brand-orange/10 text-brand-orange border border-brand-orange/30'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-white border border-transparent'
          }`}
        >
          {DIMENSION_LABELS[dim]}
          <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <DimensionPopover
            dimension={dim}
            suggestions={suggestions[dim] || []}
            onApply={onAdd}
            onClose={() => setOpenDim(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PRIMARY_DIMS.map(renderChip)}

      {/* More dropdown for secondary dimensions */}
      <div className="relative" ref={moreRef}>
        <button
          onClick={() => {
            setShowMore(!showMore)
            setOpenDim(null)
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
            showMore || SECONDARY_DIMS.includes(openDim || '')
              ? 'bg-brand-orange/10 text-brand-orange border border-brand-orange/30'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-white border border-transparent'
          }`}
        >
          More
          <svg className={`w-3 h-3 transition-transform ${showMore ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showMore && (
          <div className="absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl overflow-hidden py-1 min-w-[160px]">
            {SECONDARY_DIMS.map(dim => (
              <button
                key={dim}
                onClick={() => {
                  setShowMore(false)
                  setOpenDim(dim)
                }}
                className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                {DIMENSION_LABELS[dim]}
              </button>
            ))}
          </div>
        )}
        {/* Render popover for secondary dims inline here */}
        {openDim && SECONDARY_DIMS.includes(openDim) && (
          <DimensionPopover
            dimension={openDim}
            suggestions={suggestions[openDim] || []}
            onApply={onAdd}
            onClose={() => setOpenDim(null)}
          />
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
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
  onFetchSuggestions?: (dimension: string) => Promise<FilterSuggestion[]>
}

const ALL_DIMS = ['page', 'referrer', 'country', 'region', 'city', 'browser', 'os', 'device', 'utm_source', 'utm_medium', 'utm_campaign']

export default function AddFilterDropdown({ onAdd, suggestions = {}, onFetchSuggestions }: AddFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedDim, setSelectedDim] = useState<string | null>(null)
  const [operator, setOperator] = useState<DimensionFilter['operator']>('is')
  const [search, setSearch] = useState('')
  const [fetchedSuggestions, setFetchedSuggestions] = useState<FilterSuggestion[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen])

  // Focus search input when a dimension is selected
  useEffect(() => {
    if (selectedDim) inputRef.current?.focus()
  }, [selectedDim])

  // Fetch full suggestions when a dimension is selected
  useEffect(() => {
    if (!selectedDim || !onFetchSuggestions) {
      setFetchedSuggestions([])
      return
    }
    let cancelled = false
    setIsFetching(true)
    onFetchSuggestions(selectedDim).then(data => {
      if (!cancelled) {
        setFetchedSuggestions(data)
        setIsFetching(false)
      }
    }).catch(() => {
      if (!cancelled) setIsFetching(false)
    })
    return () => { cancelled = true }
  }, [selectedDim, onFetchSuggestions])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setSelectedDim(null)
    setOperator('is')
    setSearch('')
    setFetchedSuggestions([])
  }, [])

  function handleSelectValue(value: string) {
    onAdd({ dimension: selectedDim!, operator, values: [value] })
    handleClose()
  }

  function handleSubmitCustom() {
    if (!search.trim() || !selectedDim) return
    onAdd({ dimension: selectedDim, operator, values: [search.trim()] })
    handleClose()
  }

  // Use fetched data if available, fall back to prop suggestions
  const dimSuggestions = selectedDim
    ? (fetchedSuggestions.length > 0 ? fetchedSuggestions : (suggestions[selectedDim] || []))
    : []
  const filtered = dimSuggestions.filter(s =>
    s.label.toLowerCase().includes(search.toLowerCase()) ||
    s.value.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          if (isOpen) { handleClose() } else { setIsOpen(true) }
        }}
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
          isOpen
            ? 'bg-brand-orange/10 text-brand-orange border border-brand-orange/30'
            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white border border-transparent'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
        </svg>
        Filter
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl overflow-hidden min-w-[280px]">
          {!selectedDim ? (
            /* Step 1: Dimension list */
            <div className="py-1">
              {ALL_DIMS.map(dim => (
                <button
                  key={dim}
                  onClick={() => setSelectedDim(dim)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <span className="text-white font-medium">{DIMENSION_LABELS[dim]}</span>
                  <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          ) : (
            /* Step 2: Operator + search + values */
            <>
              {/* Header with back button */}
              <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                <button
                  onClick={() => { setSelectedDim(null); setSearch(''); setOperator('is'); setFetchedSuggestions([]) }}
                  className="p-1 text-neutral-400 hover:text-neutral-300 transition-colors cursor-pointer rounded-md hover:bg-neutral-800"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm font-semibold text-white">
                  {DIMENSION_LABELS[selectedDim]}
                </span>
              </div>

              {/* Operator pills */}
              <div className="flex gap-1 px-3 pb-2 flex-wrap">
                {OPERATORS.map(op => (
                  <button
                    key={op}
                    onClick={() => setOperator(op)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                      operator === op
                        ? 'bg-brand-orange text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
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
                  placeholder={`Search ${DIMENSION_LABELS[selectedDim]?.toLowerCase()}...`}
                  className="w-full px-3 py-2 text-sm bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-colors"
                />
              </div>

              {/* Values list */}
              {isFetching ? (
                <div className="px-4 py-6 text-center">
                  <div className="inline-block w-4 h-4 border-2 border-neutral-600 border-t-brand-orange rounded-full animate-spin" />
                </div>
              ) : filtered.length > 0 ? (
                <div className="max-h-52 overflow-y-auto border-t border-neutral-800">
                  {filtered.map(s => (
                    <button
                      key={s.value}
                      onClick={() => handleSelectValue(s.value)}
                      className="w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <span className="truncate text-white">{s.label}</span>
                      {s.count !== undefined && (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500 ml-2 tabular-nums flex-shrink-0">
                          {s.count.toLocaleString()}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : search.trim() ? (
                <div className="px-3 py-3 border-t border-neutral-800">
                  <button
                    onClick={handleSubmitCustom}
                    className="w-full px-3 py-2 text-sm font-medium bg-brand-orange text-white rounded-lg hover:bg-brand-orange/90 transition-colors cursor-pointer"
                  >
                    Filter by &ldquo;{search.trim()}&rdquo;
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  )
}

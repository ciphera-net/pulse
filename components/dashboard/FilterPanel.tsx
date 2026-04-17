'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import {
  DIMENSION_LABELS,
  DIMENSIONS,
  OPERATORS,
  OPERATOR_LABELS,
  type DimensionFilter,
} from '@/lib/filters'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterSuggestion {
  value: string
  label: string
  count?: number
}

interface DraftFilter {
  dimension: string | null
  operator: DimensionFilter['operator']
  values: string[]
}

interface FilterPanelProps {
  filters: DimensionFilter[]
  onApply: (filters: DimensionFilter[]) => void
  onFetchSuggestions?: (dimension: string) => Promise<FilterSuggestion[]>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyDraft(): DraftFilter {
  return { dimension: null, operator: 'is', values: [] }
}

function toDrafts(filters: DimensionFilter[]): DraftFilter[] {
  if (filters.length === 0) return [emptyDraft()]
  return filters.map(f => ({
    dimension: f.dimension,
    operator: f.operator,
    values: [...f.values],
  }))
}

function toApplicable(drafts: DraftFilter[]): DimensionFilter[] {
  return drafts
    .filter((d): d is DraftFilter & { dimension: string } => d.dimension !== null && d.values.length > 0)
    .map(d => ({ dimension: d.dimension, operator: d.operator, values: d.values }))
}

// ---------------------------------------------------------------------------
// InlineDropdown — reusable single-select dropdown
// ---------------------------------------------------------------------------

interface InlineDropdownProps {
  value: string | null
  options: { value: string; label: string }[]
  placeholder: string
  disabled?: boolean
  onChange: (value: string) => void
}

function InlineDropdown({ value, options, placeholder, disabled, onChange }: InlineDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  const selectedLabel = options.find(o => o.value === value)?.label ?? null

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer min-w-[100px] ${
          disabled
            ? 'bg-neutral-800/50 border-neutral-700/50 text-neutral-500 cursor-not-allowed'
            : open
              ? 'bg-neutral-800 border-brand-orange/40 text-white'
              : 'bg-neutral-800 border-neutral-700 text-white hover:border-neutral-600'
        } ease-apple`}
      >
        <span className={selectedLabel ? 'text-white' : 'text-neutral-500'}>
          {selectedLabel ?? placeholder}
        </span>
        <svg className="w-3 h-3 text-neutral-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-[60] glass-overlay rounded-lg shadow-xl shadow-black/20 overflow-hidden min-w-[160px] max-h-60 overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full flex items-center px-3 py-2 text-xs text-left transition-colors cursor-pointer ${
                opt.value === value
                  ? 'bg-brand-orange/10 text-brand-orange'
                  : 'text-white hover:bg-neutral-800'
              } ease-apple`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ValueMultiSelect — multi-select with search, checkboxes, pills
// ---------------------------------------------------------------------------

interface ValueMultiSelectProps {
  dimension: string | null
  values: string[]
  disabled?: boolean
  onChange: (values: string[]) => void
  onFetchSuggestions?: (dimension: string) => Promise<FilterSuggestion[]>
}

function ValueMultiSelect({ dimension, values, disabled, onChange, onFetchSuggestions }: ValueMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<FilterSuggestion[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  // Fetch suggestions when opened and dimension is set
  useEffect(() => {
    if (!open || !dimension || !onFetchSuggestions) return
    let cancelled = false
    setIsFetching(true)
    onFetchSuggestions(dimension).then(data => {
      if (!cancelled) { setSuggestions(data); setIsFetching(false) }
    }).catch(() => {
      if (!cancelled) setIsFetching(false)
    })
    return () => { cancelled = true }
  }, [open, dimension, onFetchSuggestions])

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const filtered = suggestions.filter(s =>
    s.label.toLowerCase().includes(search.toLowerCase()) ||
    s.value.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(val: string) {
    if (values.includes(val)) {
      onChange(values.filter(v => v !== val))
    } else {
      onChange([...values, val])
    }
  }

  function handleAddCustom() {
    const trimmed = search.trim()
    if (!trimmed) return
    if (!values.includes(trimmed)) {
      onChange([...values, trimmed])
    }
    setSearch('')
  }

  const dimLabel = dimension ? (DIMENSION_LABELS[dimension] ?? dimension) : 'value'

  return (
    <div className="relative flex-1 min-w-0" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer w-full min-w-0 ${
          disabled
            ? 'bg-neutral-800/50 border-neutral-700/50 text-neutral-500 cursor-not-allowed'
            : open
              ? 'bg-neutral-800 border-brand-orange/40 text-white'
              : 'bg-neutral-800 border-neutral-700 text-white hover:border-neutral-600'
        } ease-apple`}
      >
        {values.length === 0 ? (
          <span className="text-neutral-500 truncate">Select values...</span>
        ) : (
          <span className="flex items-center gap-1 flex-wrap min-w-0">
            {values.slice(0, 3).map(v => (
              <span key={v} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-micro-label font-medium bg-brand-orange/15 text-brand-orange max-w-[120px] truncate">
                {v}
              </span>
            ))}
            {values.length > 3 && (
              <span className="text-micro-label text-neutral-400">+{values.length - 3}</span>
            )}
          </span>
        )}
        <svg className="w-3 h-3 text-neutral-400 flex-shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-[60] glass-overlay rounded-lg shadow-xl shadow-black/20 min-w-[240px] w-full">
          {/* Search input */}
          <div className="p-2">
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (filtered.length === 1 && !values.includes(filtered[0].value)) {
                    toggle(filtered[0].value)
                    setSearch('')
                  } else {
                    handleAddCustom()
                  }
                }
              }}
              placeholder={`Search ${dimLabel.toLowerCase()}...`}
              className="w-full px-2.5 py-1.5 text-xs bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-brand-orange/40 focus:border-brand-orange/40 transition-colors ease-apple"
            />
          </div>

          {/* Suggestion list */}
          {isFetching ? (
            <div className="px-4 py-4 text-center">
              <div className="inline-block w-3.5 h-3.5 border-2 border-neutral-600 border-t-brand-orange rounded-full animate-spin" />
            </div>
          ) : filtered.length > 0 ? (
            <div className="max-h-48 overflow-y-auto border-t border-neutral-800">
              {filtered.map(s => {
                const checked = values.includes(s.value)
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggle(s.value)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-neutral-800 transition-colors cursor-pointer ease-apple"
                  >
                    {/* Checkbox */}
                    <span className={`flex items-center justify-center w-3.5 h-3.5 rounded border flex-shrink-0 transition-colors ${
                      checked
                        ? 'bg-brand-orange border-brand-orange'
                        : 'border-neutral-600 bg-transparent'
                    } ease-apple`}>
                      {checked && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate text-white flex-1 min-w-0">{s.label}</span>
                    {s.count !== undefined && (
                      <span className="text-micro-label text-neutral-500 tabular-nums flex-shrink-0">
                        {s.count.toLocaleString()}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : search.trim() ? (
            <div className="px-2 pb-2 border-t border-neutral-800 pt-2">
              <button
                type="button"
                onClick={handleAddCustom}
                className="w-full px-3 py-1.5 text-xs font-medium bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer border border-neutral-700 ease-apple"
              >
                Filter by &ldquo;{search.trim()}&rdquo;
              </button>
            </div>
          ) : (
            <div className="px-3 py-3 text-xs text-neutral-500 text-center border-t border-neutral-800">
              No suggestions available
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilterRow
// ---------------------------------------------------------------------------

interface FilterRowProps {
  draft: DraftFilter
  onChange: (updated: DraftFilter) => void
  onRemove: () => void
  onFetchSuggestions?: (dimension: string) => Promise<FilterSuggestion[]>
}

function FilterRow({ draft, onChange, onRemove, onFetchSuggestions }: FilterRowProps) {
  const dimensionOptions = DIMENSIONS.map(d => ({ value: d, label: DIMENSION_LABELS[d] }))
  const operatorOptions = OPERATORS.map(o => ({ value: o, label: OPERATOR_LABELS[o] }))
  const hasDimension = draft.dimension !== null

  return (
    <div className="flex items-center gap-2">
      {/* Dimension */}
      <InlineDropdown
        value={draft.dimension}
        options={dimensionOptions}
        placeholder="Dimension"
        onChange={dim => onChange({ dimension: dim, operator: 'is', values: [] })}
      />

      {/* Operator */}
      <InlineDropdown
        value={draft.operator}
        options={operatorOptions}
        placeholder="Operator"
        disabled={!hasDimension}
        onChange={op => onChange({ ...draft, operator: op as DimensionFilter['operator'] })}
      />

      {/* Value multi-select */}
      <ValueMultiSelect
        dimension={draft.dimension}
        values={draft.values}
        disabled={!hasDimension}
        onChange={vals => onChange({ ...draft, values: vals })}
        onFetchSuggestions={onFetchSuggestions}
      />

      {/* Delete */}
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-neutral-500 hover:text-red-400 transition-colors cursor-pointer flex-shrink-0 rounded-md hover:bg-neutral-800 ease-apple"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilterPanel (default export)
// ---------------------------------------------------------------------------

export default function FilterPanel({ filters, onApply, onFetchSuggestions }: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [drafts, setDrafts] = useState<DraftFilter[]>(() => toDrafts(filters))
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [fixedPos, setFixedPos] = useState<{ left: number; top: number } | null>(null)

  // Sync drafts from props when panel opens
  const handleOpen = useCallback(() => {
    setDrafts(toDrafts(filters))
    setIsOpen(true)
  }, [filters])

  const handleDiscard = useCallback(() => {
    setIsOpen(false)
  }, [])

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    let top = rect.bottom + 8
    if (panelRef.current) {
      const maxTop = window.innerHeight - panelRef.current.offsetHeight - 16
      top = Math.min(top, Math.max(16, maxTop))
    }
    setFixedPos({ left: rect.left, top })
  }, [])

  // Re-position on open + on resize/scroll while open
  useEffect(() => {
    if (!isOpen) return
    updatePosition()
    requestAnimationFrame(() => updatePosition())
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, updatePosition])

  // Outside click / Escape discards — panel is portal-rendered so we check both refs
  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        ref.current && !ref.current.contains(target) &&
        (!panelRef.current || !panelRef.current.contains(target))
      ) handleDiscard()
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') handleDiscard()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, handleDiscard])

  function updateDraft(index: number, updated: DraftFilter) {
    setDrafts(prev => prev.map((d, i) => (i === index ? updated : d)))
  }

  function removeDraft(index: number) {
    setDrafts(prev => {
      const next = prev.filter((_, i) => i !== index)
      return next.length === 0 ? [emptyDraft()] : next
    })
  }

  function addDraft() {
    setDrafts(prev => [...prev, emptyDraft()])
  }

  function handleSave() {
    onApply(toApplicable(drafts))
    setIsOpen(false)
  }

  const activeCount = filters.length
  const hasActive = activeCount > 0

  const panel = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
          className="fixed z-[100] glass-overlay rounded-xl shadow-2xl shadow-black/50 p-4 min-w-[720px] origin-top-left"
          style={fixedPos ? { left: fixedPos.left, top: fixedPos.top } : { opacity: 0 }}
        >
      {/* Filter rows */}
      <div className="flex flex-col gap-2">
        {drafts.map((draft, i) => (
          <FilterRow
            key={i}
            draft={draft}
            onChange={updated => updateDraft(i, updated)}
            onRemove={() => removeDraft(i)}
            onFetchSuggestions={onFetchSuggestions}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={addDraft}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer ease-apple"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Filter
        </button>

        <button
          type="button"
          onClick={handleSave}
          className="px-3 py-1.5 text-xs font-medium bg-brand-orange text-white rounded-lg hover:bg-brand-orange-hover transition-[color,transform] duration-fast ease-apple active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 cursor-pointer shadow-sm"
        >
          Save Filters
        </button>
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => { if (isOpen) handleDiscard(); else handleOpen() }}
        className={`inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-lg border shadow-sm transition-[color,background-color,border-color,transform] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 cursor-pointer ${
          hasActive || isOpen
            ? 'bg-brand-orange/10 text-brand-orange border-brand-orange/30'
            : 'bg-neutral-900/80 text-neutral-300 hover:bg-neutral-800 hover:text-white border-white/[0.08]'
        } ease-apple`}
      >
        {/* Adjustments/sliders icon */}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>
        Filter
        {hasActive && (
          <span className="inline-flex items-center justify-center w-4 h-4 text-micro-label font-bold rounded-full bg-brand-orange text-white leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {typeof document !== 'undefined' ? createPortal(panel, document.body) : panel}
    </div>
  )
}

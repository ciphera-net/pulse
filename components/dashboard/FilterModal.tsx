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
  DIMENSION_CATEGORIES,
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

export interface FilterModalProps {
  open: boolean
  initialDimension: string | null
  initialFilter: DimensionFilter | null
  onSave: (filter: DimensionFilter) => void
  onClose: () => void
  onFetchSuggestions?: (dimension: string) => Promise<FilterSuggestion[]>
}

// ---------------------------------------------------------------------------
// InlineDropdown — grouped single-select
// ---------------------------------------------------------------------------

interface InlineDropdownProps {
  value: string | null
  options: { value: string; label: string }[]
  grouped?: { label: string; dimensions: readonly string[] }[]
  placeholder: string
  disabled?: boolean
  onChange: (value: string) => void
}

function InlineDropdown({ value, options, grouped, placeholder, disabled, onChange }: InlineDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const selectedLabel = options.find(o => o.value === value)?.label ?? null

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`flex items-center justify-between gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors cursor-pointer w-full ${
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
        <svg className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-[110] glass-overlay rounded-lg shadow-xl shadow-black/30 min-w-[200px] w-full max-h-72 overflow-y-auto">
          {grouped ? (
            grouped.map(cat => (
              <div key={cat.label}>
                <div className="px-3 py-1.5 text-micro-label font-semibold text-neutral-500 uppercase tracking-wider bg-neutral-900/60 sticky top-0">
                  {cat.label}
                </div>
                {cat.dimensions.map(dim => (
                  <button
                    key={dim}
                    type="button"
                    onClick={() => { onChange(dim); setOpen(false) }}
                    className={`w-full flex items-center px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
                      dim === value
                        ? 'bg-brand-orange/10 text-brand-orange'
                        : 'text-white hover:bg-neutral-800'
                    } ease-apple`}
                  >
                    {DIMENSION_LABELS[dim] ?? dim}
                  </button>
                ))}
              </div>
            ))
          ) : (
            options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full flex items-center px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
                  opt.value === value
                    ? 'bg-brand-orange/10 text-brand-orange'
                    : 'text-white hover:bg-neutral-800'
                } ease-apple`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ValueMultiSelect — combobox with search + checkboxes
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

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  useEffect(() => {
    if (!open || !dimension || !onFetchSuggestions) return
    let cancelled = false
    setIsFetching(true)
    onFetchSuggestions(dimension)
      .then(data => { if (!cancelled) { setSuggestions(data); setIsFetching(false) } })
      .catch(() => { if (!cancelled) setIsFetching(false) })
    return () => { cancelled = true }
  }, [open, dimension, onFetchSuggestions])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Reset suggestions when dimension changes
  useEffect(() => {
    setSuggestions([])
    setSearch('')
  }, [dimension])

  const filtered = suggestions.filter(s =>
    s.label.toLowerCase().includes(search.toLowerCase()) ||
    s.value.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(val: string) {
    onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val])
  }

  function handleAddCustom() {
    const trimmed = search.trim()
    if (!trimmed || values.includes(trimmed)) return
    onChange([...values, trimmed])
    setSearch('')
  }

  const dimLabel = dimension ? (DIMENSION_LABELS[dimension] ?? dimension) : 'value'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors cursor-pointer w-full ${
          disabled
            ? 'bg-neutral-800/50 border-neutral-700/50 text-neutral-500 cursor-not-allowed'
            : open
              ? 'bg-neutral-800 border-brand-orange/40 text-white'
              : 'bg-neutral-800 border-neutral-700 text-white hover:border-neutral-600'
        } ease-apple`}
      >
        {values.length === 0 ? (
          <span className="text-neutral-500">Select values…</span>
        ) : (
          <span className="flex items-center gap-1 flex-wrap min-w-0 flex-1">
            {values.slice(0, 3).map(v => (
              <span key={v} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-brand-orange/15 text-brand-orange max-w-[140px] truncate">
                {v}
              </span>
            ))}
            {values.length > 3 && (
              <span className="text-xs text-neutral-400">+{values.length - 3}</span>
            )}
          </span>
        )}
        <svg className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-[110] glass-overlay rounded-lg shadow-xl shadow-black/30 w-full min-w-[260px]">
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
              placeholder={`Search ${dimLabel.toLowerCase()}…`}
              className="w-full px-2.5 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-brand-orange/40 focus:border-brand-orange/40 transition-colors ease-apple"
            />
          </div>

          {isFetching ? (
            <div className="px-4 py-4 text-center">
              <div className="inline-block w-4 h-4 border-2 border-neutral-600 border-t-brand-orange rounded-full animate-spin" />
            </div>
          ) : filtered.length > 0 ? (
            <div className="max-h-52 overflow-y-auto border-t border-neutral-800">
              {filtered.map(s => {
                const checked = values.includes(s.value)
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggle(s.value)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-neutral-800 transition-colors cursor-pointer ease-apple"
                  >
                    <span className={`flex items-center justify-center w-3.5 h-3.5 rounded border flex-shrink-0 transition-colors ${
                      checked ? 'bg-brand-orange border-brand-orange' : 'border-neutral-600 bg-transparent'
                    } ease-apple`}>
                      {checked && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate text-white flex-1 min-w-0">{s.label}</span>
                    {s.count !== undefined && (
                      <span className="text-xs text-neutral-500 tabular-nums flex-shrink-0">
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
                className="w-full px-3 py-1.5 text-sm font-medium bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer border border-neutral-700 ease-apple"
              >
                Filter by &ldquo;{search.trim()}&rdquo;
              </button>
            </div>
          ) : (
            <div className="px-3 py-3 text-sm text-neutral-500 text-center border-t border-neutral-800">
              No suggestions available
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilterModal (default export)
// ---------------------------------------------------------------------------

export default function FilterModal({
  open,
  initialDimension,
  initialFilter,
  onSave,
  onClose,
  onFetchSuggestions,
}: FilterModalProps) {
  const [dimension, setDimension] = useState<string | null>(
    initialFilter?.dimension ?? initialDimension ?? null
  )
  const [operator, setOperator] = useState<DimensionFilter['operator']>(
    initialFilter?.operator ?? 'is'
  )
  const [values, setValues] = useState<string[]>(initialFilter?.values ?? [])

  // Sync state when modal opens (handles re-use of the same instance)
  useEffect(() => {
    if (open) {
      setDimension(initialFilter?.dimension ?? initialDimension ?? null)
      setOperator(initialFilter?.operator ?? 'is')
      setValues(initialFilter?.values ?? [])
    }
  }, [open, initialFilter, initialDimension])

  // Escape closes
  useEffect(() => {
    if (!open) return
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  const handleDimensionChange = useCallback((dim: string) => {
    setDimension(dim)
    setValues([])
  }, [])

  const handleSave = useCallback(() => {
    if (!dimension || values.length === 0) return
    onSave({ dimension, operator, values })
    onClose()
  }, [dimension, operator, values, onSave, onClose])

  const canSave = dimension !== null && values.length > 0

  const dimensionOptions = DIMENSIONS.map(d => ({ value: d, label: DIMENSION_LABELS[d] }))
  const operatorOptions = OPERATORS.map(o => ({ value: o, label: OPERATOR_LABELS[o] }))

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-wrapper"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-[2px]"
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
            className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-neutral-900 shadow-2xl shadow-black/60 p-6"
            style={{ backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.04), transparent 120px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">
                {initialFilter ? 'Edit Filter' : 'Add Filter'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer ease-apple"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Fields */}
            <div className="flex flex-col gap-3">
              {/* Dimension */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Dimension</label>
                <InlineDropdown
                  value={dimension}
                  options={dimensionOptions}
                  grouped={DIMENSION_CATEGORIES as unknown as { label: string; dimensions: readonly string[] }[]}
                  placeholder="Select dimension…"
                  onChange={handleDimensionChange}
                />
              </div>

              {/* Operator */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Condition</label>
                <InlineDropdown
                  value={operator}
                  options={operatorOptions}
                  placeholder="Select operator…"
                  disabled={!dimension}
                  onChange={val => setOperator(val as DimensionFilter['operator'])}
                />
              </div>

              {/* Values */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Values</label>
                <ValueMultiSelect
                  dimension={dimension}
                  values={values}
                  disabled={!dimension}
                  onChange={setValues}
                  onFetchSuggestions={onFetchSuggestions}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer ease-apple"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-[color,background-color,transform] duration-fast ease-apple active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
                  canSave
                    ? 'bg-brand-orange text-white hover:bg-brand-orange-hover cursor-pointer shadow-sm'
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                }`}
              >
                Apply Filter
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}

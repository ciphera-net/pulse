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
  type FilterSuggestion,
} from '@/lib/filters'
import ValuePicker from './filter/ValuePicker'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// * FilterSuggestion moved to lib/filters (it is model, not modal); re-exported
// * here so existing imports keep resolving until the popover swap removes them.
export type { FilterSuggestion } from '@/lib/filters'

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
        className={`flex items-center justify-between gap-1.5 px-3 py-2 text-sm font-medium rounded-none border transition-colors cursor-pointer w-full ${
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
        <div className="absolute top-full left-0 mt-1 z-[110] bg-popover border border-border rounded-none shadow-lg min-w-[200px] w-full max-h-72 overflow-y-auto">
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-none border transition-colors cursor-pointer w-full ${
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
              <span key={v} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-none text-xs font-medium bg-brand-orange/15 text-brand-orange max-w-[140px] truncate">
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
        <div className="absolute top-full left-0 mt-1 z-[110] bg-popover border border-border rounded-none shadow-lg w-full min-w-[260px]">
          <ValuePicker
            dimension={dimension}
            values={values}
            onChange={onChange}
            onFetchSuggestions={onFetchSuggestions}
            autoFocus
          />
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
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
            className="w-full max-w-md rounded-none border border-neutral-800 bg-neutral-900 shadow-xl p-6"
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
                className="p-1 rounded-none text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer ease-apple"
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
            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-neutral-800/60">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white rounded-none hover:bg-neutral-800 transition-colors cursor-pointer ease-apple"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className={`px-4 py-1.5 text-xs font-medium rounded-none transition-[color,background-color,transform] duration-fast ease-apple active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
                  canSave
                    ? 'bg-brand-orange text-white hover:bg-brand-orange-hover cursor-pointer'
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

'use client'

import { useState, useRef, useEffect } from 'react'
import { DIMENSION_LABELS, type FilterSuggestion } from '@/lib/filters'

// ---------------------------------------------------------------------------
// ValuePicker — inline value search + multi-select list with live counts.
//
// Owns search text, suggestion fetching (with an explicit failed state — a
// dead request must not read as "no suggestions"), and the custom-value
// affordance; the parent owns the selected values.
// ---------------------------------------------------------------------------

export interface ValuePickerProps {
  dimension: string | null
  values: string[]
  onChange: (values: string[]) => void
  onFetchSuggestions?: (dimension: string) => Promise<FilterSuggestion[]>
  autoFocus?: boolean
  /** Enter with an empty search box — the popover uses it to apply the draft. */
  onSubmit?: () => void
  /** Backspace with an empty search box — the popover uses it to go back a stage. */
  onBackspaceWhenEmpty?: () => void
}

export default function ValuePicker({ dimension, values, onChange, onFetchSuggestions, autoFocus, onSubmit, onBackspaceWhenEmpty }: ValuePickerProps) {
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<FilterSuggestion[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // * Fetch on mount and whenever the dimension changes. Consumers that only
  // * want fetch-on-open (the modal's dropdown) mount the picker lazily.
  useEffect(() => {
    setSuggestions([])
    setSearch('')
    setFetchFailed(false)
    if (!dimension || !onFetchSuggestions) return
    let cancelled = false
    setIsFetching(true)
    onFetchSuggestions(dimension)
      .then(data => { if (!cancelled) { setSuggestions(data); setIsFetching(false) } })
      .catch(() => { if (!cancelled) { setFetchFailed(true); setIsFetching(false) } })
    return () => { cancelled = true }
  }, [dimension, onFetchSuggestions, retryTick])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

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
    <>
      <div className="p-2">
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (search.trim() === '') {
                onSubmit?.()
              } else if (filtered.length === 1 && !values.includes(filtered[0].value)) {
                toggle(filtered[0].value)
                setSearch('')
              } else {
                handleAddCustom()
              }
            } else if (e.key === 'Backspace' && search === '') {
              e.preventDefault()
              onBackspaceWhenEmpty?.()
            }
          }}
          placeholder={`Search ${dimLabel.toLowerCase()}…`}
          className="w-full px-2.5 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded-none text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-brand-orange/40 focus:border-brand-orange/40 transition-colors ease-apple"
        />
      </div>

      {isFetching ? (
        <div className="px-4 py-4 text-center">
          <div className="inline-block w-4 h-4 border-2 border-neutral-600 border-t-brand-orange rounded-full animate-spin" />
        </div>
      ) : fetchFailed && suggestions.length === 0 && !search.trim() ? (
        /* * A failed fetch must not masquerade as "no suggestions" — typing a
         * custom value still works either way. */
        <div className="px-3 py-3 text-center border-t border-neutral-800 space-y-1.5">
          <p className="text-sm text-red-400">Couldn&apos;t load suggestions</p>
          <button
            type="button"
            onClick={() => setRetryTick(t => t + 1)}
            className="text-xs font-medium text-neutral-400 hover:text-white underline underline-offset-2 transition-colors cursor-pointer ease-apple"
          >
            Retry
          </button>
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
                <span className={`flex items-center justify-center w-3.5 h-3.5 rounded-none border flex-shrink-0 transition-colors ${
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
            className="w-full px-3 py-1.5 text-sm font-medium bg-neutral-800 text-white rounded-none hover:bg-neutral-700 transition-colors cursor-pointer border border-neutral-700 ease-apple"
          >
            Filter by &ldquo;{search.trim()}&rdquo;
          </button>
        </div>
      ) : (
        <div className="px-3 py-3 text-sm text-neutral-500 text-center border-t border-neutral-800">
          No {dimLabel.toLowerCase()} recorded in this period — type a value to filter anyway
        </div>
      )}
    </>
  )
}

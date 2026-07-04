'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CaretDown, Check, FileText, GlobeHemisphereWest, House, MagnifyingGlass } from '@phosphor-icons/react'
import FilterPopover from '@/components/dashboard/filter/FilterPopover'
import { moveHighlight } from '@/components/dashboard/filter/useFilterBuilder'
import type { EntryPoint } from '@/lib/api/journeys'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// EntryCombobox — the journeys entry-point picker. A quiet h-10 trigger and a
// searchable anchored panel (FilterPopover shell: portal, flip, clamp, focus
// trap, shadow) with kind glyphs and tabular session counts per row.
// ---------------------------------------------------------------------------

/** Case-insensitive path filter; pure for tests. */
export function filterEntries(entries: EntryPoint[], query: string): EntryPoint[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter(e => e.path.toLowerCase().includes(q))
}

function pathGlyph(path: string) {
  if (path === '/') return <House className="h-4 w-4 shrink-0 text-neutral-500" />
  return <FileText className="h-4 w-4 shrink-0 text-neutral-500" />
}

interface EntryComboboxProps {
  /** '' means all entry points. */
  value: string
  onChange: (path: string) => void
  entries: EntryPoint[]
  className?: string
}

export function EntryCombobox({ value, onChange, entries, className }: EntryComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlight, setHighlight] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => filterEntries(entries, search), [entries, search])
  // * Row 0 is "All entry points", data rows follow.
  const rowCount = filtered.length + 1

  useEffect(() => {
    if (!open) {
      setSearch('')
      setHighlight(0)
    }
  }, [open])

  useEffect(() => {
    setHighlight(h => Math.min(Math.max(h, 0), rowCount - 1))
  }, [rowCount])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const pick = (path: string) => {
    onChange(path)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => moveHighlight(h, 1, rowCount))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => moveHighlight(h, -1, rowCount))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlight === 0) pick('')
      else if (filtered[highlight - 1]) pick(filtered[highlight - 1].path)
    } else if (e.key === 'Backspace' && search === '') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const current = value === '' ? null : entries.find(e => e.path === value)
  const triggerGlyph = value === ''
    ? <GlobeHemisphereWest className="h-4 w-4 shrink-0 text-neutral-500" />
    : pathGlyph(value)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-none border border-neutral-800 bg-transparent px-3 text-sm',
          'transition-colors duration-fast ease-apple hover:border-neutral-700',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange',
          className,
        )}
      >
        {triggerGlyph}
        <span className={cn('flex-1 truncate text-left', value === '' ? 'text-neutral-300' : 'text-white')}>
          {value === '' ? 'All entry points' : value}
        </span>
        {current && (
          <span className="text-xs tabular-nums text-neutral-500">{current.session_count.toLocaleString()}</span>
        )}
        <CaretDown className={cn('h-3.5 w-3.5 text-neutral-500 transition-transform duration-fast ease-apple', open && 'rotate-180')} />
      </button>

      <FilterPopover
        open={open}
        anchor={triggerRef.current}
        label="Filter by entry point"
        contentKey="entry"
        onClose={() => setOpen(false)}
      >
        <div onKeyDown={handleKeyDown}>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <MagnifyingGlass className="h-4 w-4 shrink-0 text-neutral-500" />
            <input
              data-autofocus
              value={search}
              onChange={e => { setSearch(e.target.value); setHighlight(0) }}
              placeholder="Search entry pages…"
              aria-label="Search entry pages"
              className="h-10 w-full bg-transparent text-sm text-white placeholder:text-neutral-600 focus:outline-none"
            />
          </div>
          <div ref={listRef} role="listbox" aria-label="Entry points" className="max-h-72 overflow-y-auto p-1.5">
            <button
              type="button"
              role="option"
              aria-selected={value === ''}
              data-index={0}
              onClick={() => pick('')}
              onMouseEnter={() => setHighlight(0)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-none px-2.5 py-2 text-left text-sm transition-colors duration-fast ease-apple',
                highlight === 0 ? 'bg-neutral-800 text-white' : 'text-neutral-300',
              )}
            >
              <GlobeHemisphereWest className="h-4 w-4 shrink-0 text-neutral-500" />
              <span className="flex-1 truncate">All entry points</span>
              {value === '' && <Check weight="bold" className="h-3.5 w-3.5 shrink-0 text-brand-orange" />}
            </button>
            {filtered.map((entry, i) => {
              const index = i + 1
              const selected = value === entry.path
              return (
                <button
                  key={entry.path}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-index={index}
                  title={entry.path}
                  onClick={() => pick(entry.path)}
                  onMouseEnter={() => setHighlight(index)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-none px-2.5 py-2 text-left text-sm transition-colors duration-fast ease-apple',
                    highlight === index ? 'bg-neutral-800 text-white' : 'text-neutral-300',
                  )}
                >
                  {pathGlyph(entry.path)}
                  <span className="flex-1 truncate">{entry.path}</span>
                  {selected && <Check weight="bold" className="h-3.5 w-3.5 shrink-0 text-brand-orange" />}
                  <span className="text-xs tabular-nums text-neutral-500">{entry.session_count.toLocaleString()}</span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-2.5 py-3 text-sm text-neutral-500">
                No entry pages match &ldquo;{search.trim()}&rdquo;.
              </div>
            )}
          </div>
        </div>
      </FilterPopover>
    </>
  )
}

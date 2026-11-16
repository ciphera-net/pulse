'use client'

// ---------------------------------------------------------------------------
// The parts of saved filters (R59 and R60 of 16-11-2026, option A "In the filters box"): the name field a set is named
// in where it is saved, a saved set's row in the Filter panel, and how a set is named and described. Built from the
// app's own devices: the box's list (FiltersBox), the panel's rows (SearchFilter) and the date menu.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import { BookmarkSimple, Trash } from '@phosphor-icons/react'
import { saveRefusal } from '@/lib/api/savedFilters'
import { OPERATOR_LABELS, type DimensionFilter } from '@/lib/filters'
import type { SavedSet } from '@/lib/swr/savedFilters'
import { cn } from '@/lib/utils'
import { labelOf, valueName, type PageValues } from './values'

const excluded = (f: DimensionFilter) => f.operator === 'is_not' || f.operator === 'not_contains'

/** "Norway", "Norway or Sweden", "Norway, Sweden or 2 more": the box's own wording. */
export function valueText(f: DimensionFilter, pageValues: PageValues): string {
  const names = f.values.map((v) => valueName(f.dimension, v, pageValues))
  return names.length <= 2 ? names.join(' or ') : `${names.slice(0, 2).join(', ')} or ${names.length - 2} more`
}

/** "Country is Norway and Device is mobile": what a saved set holds, for the line beside its name. */
export function describe(filters: DimensionFilter[], pageValues: PageValues): string {
  return filters.map((f) => `${labelOf(f.dimension)} ${OPERATOR_LABELS[f.operator]} ${valueText(f, pageValues)}`).join(' and ')
}

/** The name a set is offered when it is saved: its values, "Norway, mobile", "Norway, not google.com and 1 more". */
export function suggestName(filters: DimensionFilter[], pageValues: PageValues): string {
  const parts = filters.map((f) => `${excluded(f) ? 'not ' : ''}${valueName(f.dimension, f.values[0], pageValues)}`)
  const name = parts.length <= 2 ? parts.join(', ') : `${parts.slice(0, 2).join(', ')} and ${parts.length - 2} more`
  return name.slice(0, 60)
}

/** What a refused save says, under the name field. */
export function refusalLine(err: unknown): string {
  const why = saveRefusal(err)
  if (why === 'name_taken') return 'A saved filter already has this name.'
  if (why === 'limit_reached') return 'This site has 50 saved filters. Delete one to save another.'
  return 'These filters could not be saved. Try again.'
}

/**
 * Names a set where it is saved, in the row that offered it: no dialog over the page. The suggestion is selected, so
 * Enter keeps it and typing replaces it. Escape goes back to the row and leaves the list open. A refused save keeps
 * the field open with the reason under it.
 */
export function NameField({ initial, placeholder, label, onSave, onCancel }: {
  initial: string
  placeholder: string
  label: string
  /** Resolves when saved; a rejection is the server's refusal. */
  onSave: (name: string) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const ok = name.trim() !== '' && !busy
  const submit = async () => {
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await onSave(name.trim())
    } catch (err) {
      setError(refusalLine(err))
      setBusy(false)
      ref.current?.focus()
    }
  }
  return (
    <div data-saved-name-field="">
      <div className="flex h-11 items-center gap-2 ps-4">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <BookmarkSimple className="h-4 w-4 text-neutral-500" weight="bold" aria-hidden="true" />
        </span>
        <input
          ref={ref}
          value={name}
          maxLength={60}
          onChange={(e) => { setName(e.target.value); setError(null) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            } else if (e.key === 'Escape') {
              // Back to the row: the list it stands in stays open (its own Escape listener is on the document).
              e.preventDefault()
              e.stopPropagation()
              onCancel()
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'saved-name-error' : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={!ok}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void submit()}
          className="flex h-full shrink-0 items-center px-4 text-sm font-medium text-brand-ink hover:text-white disabled:pointer-events-none disabled:text-neutral-500"
          data-saved-name-save=""
        >
          Save
        </button>
      </div>
      {error && (
        <p id="saved-name-error" role="alert" className="px-4 pb-3 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** "Saved as …": the row that says the filters on are a saved set, its bookmark filled in the brand's ink. */
export function SavedAs({ name }: { name: string }) {
  return (
    <div className="flex h-11 items-center gap-2 px-4 text-sm text-neutral-500" data-saved-as="">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        <BookmarkSimple className="h-4 w-4 text-brand-ink" weight="fill" aria-hidden="true" />
      </span>
      {/* The space reaches the text a screen reader reads; a flex row draws its gap, not the space. */}
      <span className="shrink-0">Saved as</span>{' '}
      <span className="min-w-0 truncate font-medium text-white">{name}</span>
    </div>
  )
}

/**
 * A saved set as a row of the Filter panel's first view, in the panel's own row (36 px, the picked row lit): one press
 * puts it on the page in place of the filters that are on. The bookmark is filled in the brand's ink on the set the
 * page shows now. The bin at its end deletes it, for whoever may edit the site.
 */
export function SavedRow({ set, on, picked, onPick, onApply, onDelete, pageValues }: {
  set: SavedSet
  on: boolean
  picked: boolean
  onPick: () => void
  onApply: () => void
  /** Absent for a reader who may not delete. */
  onDelete?: () => void
  pageValues: PageValues
}) {
  return (
    <div className={cn('flex h-9 items-center', picked && 'bg-white/[0.06]')} data-saved-row={set.name} data-on={on ? 'true' : 'false'}>
      <button
        type="button"
        role="option"
        aria-selected={picked}
        // The field keeps the keyboard: a press on a row must not take the focus from it.
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={onPick}
        onClick={onApply}
        className="flex h-full min-w-0 flex-1 items-center gap-3 ps-3 text-left text-sm text-neutral-300 focus-visible:outline-none"
        data-saved-apply=""
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <BookmarkSimple className={cn('h-4 w-4', on ? 'text-brand-ink' : 'text-neutral-500')} weight={on ? 'fill' : 'bold'} aria-hidden="true" />
        </span>
        <span className="max-w-[220px] shrink-0 truncate text-white">{set.name}</span>{' '}
        <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{describe(set.filters, pageValues)}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${set.name}`}
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={onPick}
          onClick={onDelete}
          className="flex h-full w-11 shrink-0 items-center justify-center text-neutral-500 hover:text-destructive"
          data-saved-delete=""
        >
          <Trash className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

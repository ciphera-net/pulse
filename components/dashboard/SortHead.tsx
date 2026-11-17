'use client'

import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { ArrowDown, ArrowUp } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// A list sorted by its columns, high to low and low to high, in the new dashboard frame (rulings R41 and R51,
// design Pulse/docs/plans/14-11-2026-dashboard-overhaul-2-plan.md §10ad). Used by the Events block (visitors,
// events and conversion; the picked event's values by events and share), by the Pages block's Pages tab (visitors
// and views), and since 16-11-2026 by every other list of the dashboard with its one column (visitors; the Outbound
// tab's clicks).
//
// The column names over the numbers are the control. A press on a name sorts by its column, high to low; a second
// press on the same name turns it low to high. The sorted column carries its arrow; another shows a faint one under
// the pointer, so the names read as something to press. Same size, colour and widths as the labels they replace.
// ---------------------------------------------------------------------------

export type SortDir = 'desc' | 'asc'
export interface Sort<K extends string> {
  key: K
  dir: SortDir
}
export interface SortColumn<K extends string> {
  key: K
  label: string
  /** The column's width and alignment: the SAME classes as the numbers under it. */
  className: string
}

/**
 * The one column of a list whose rows show visitors alone: Sources, Locations, Technology and the Pages block's
 * Entries and Exits tabs (16-11-2026). No width: the number sits at the row's end, where the head ends too.
 */
export const VISITORS_COLUMN: readonly SortColumn<'visitors'>[] = [{ key: 'visitors', label: 'Visitors', className: '' }]
/** The Pages block's Outbound tab: a link's clicks. */
export const CLICKS_COLUMN: readonly SortColumn<'clicks'>[] = [{ key: 'clicks', label: 'Clicks', className: '' }]
/** A row's visitors for sortRows; a row without them counts as none. */
export const byVisitors = (row: { visitors?: number | null }): number => row.visitors ?? 0
/** The first order of every list: high to low, the order the server ranks by. */
export const VISITORS_DESC: Sort<'visitors'> = { key: 'visitors', dir: 'desc' }

/** Rows in the asked order. Ties keep the order the rows came in (the server's), in both directions. */
export function sortRows<T, K extends string>(rows: readonly T[], sort: Sort<K>, value: (row: T, key: K) => number): T[] {
  const sign = sort.dir === 'desc' ? -1 : 1
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => sign * (value(a.row, sort.key) - value(b.row, sort.key)) || a.i - b.i)
    .map(({ row }) => row)
}

/** The sort after a press on a column's name: a new column starts high to low; the same one turns. */
export function nextSort<K extends string>(sort: Sort<K>, key: K): Sort<K> {
  return sort.key === key ? { key, dir: sort.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }
}

/** A column's name in the head, as drawn: its box's right edge and width, and the width of its word's ink. */
export interface MeasuredName {
  key: string
  right: number
  width: number
  ink: number
}

/** A number in the block, as drawn: its box's right edge and width, and the width of its ink. */
export interface MeasuredNumber {
  right: number
  width: number
  ink: number
}

/**
 * Where each column's name sits over its numbers: how far right of its own end it is drawn, in px (R51).
 *
 * A name and its numbers end on the same edge. That reads right while a name is about as wide as its numbers
 * ("visitors", "events") and wrong when it is much wider: "conversion" is 54 px over "6.0%" at 32 px, and its
 * middle sat 11 px left of theirs with the right edges exactly equal. So a name wider than its numbers is centred
 * over them, and a narrower one keeps ending where they end.
 *
 * The numbers are found by the edge they share with their name (a column's name and numbers are right-aligned in
 * one box), within a pixel; the widest counts. A name or a number with no width is not drawn (a column hidden on a
 * narrow block) and counts for nothing. The shift is half the difference, to a quarter pixel.
 */
export function centredShifts(names: readonly MeasuredName[], numbers: readonly MeasuredNumber[]): Record<string, number> {
  const shifts: Record<string, number> = {}
  for (const name of names) {
    if (name.width === 0) continue
    let widest = 0
    for (const number of numbers) {
      if (number.width === 0 || Math.abs(number.right - name.right) > 1) continue
      widest = Math.max(widest, number.ink)
    }
    shifts[name.key] = widest > 0 && name.ink > widest ? Math.round((name.ink - widest) * 2) / 4 : 0
  }
  return shifts
}

/** The width of an element's text as drawn, not of its box: a number right-aligned in a 74 px column is 32 px. */
function inkWidth(el: Element): number {
  const range = document.createRange()
  range.selectNodeContents(el)
  // Every browser measures a range; a DOM without layout (a test's) falls back to the box.
  return typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect().width : el.getBoundingClientRect().width
}

/** The names of one head and the numbers of its block, measured on the page. Null outside a block. */
function measure(head: HTMLElement): Record<string, number> | null {
  const card = head.closest('[data-tour-card]')
  if (!card) return null
  const names: MeasuredName[] = []
  for (const button of head.querySelectorAll<HTMLElement>('[data-sort]')) {
    const word = button.querySelector('[data-sort-word]')
    const key = button.dataset.sort
    if (!word || !key) continue
    const box = button.getBoundingClientRect()
    names.push({ key, right: box.right, width: box.width, ink: box.width === 0 ? 0 : inkWidth(word) })
  }
  const numbers: MeasuredNumber[] = []
  for (const cell of card.querySelectorAll('.tabular-nums')) {
    // The head's own words, and the pager's page numbers, are not a column's numbers.
    if (head.contains(cell) || cell.closest('nav')) continue
    const box = cell.getBoundingClientRect()
    numbers.push({ right: box.right, width: box.width, ink: box.width === 0 ? 0 : inkWidth(cell) })
  }
  return centredShifts(names, numbers)
}

const sameShifts = (a: Record<string, number>, b: Record<string, number>) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(b).every((k) => a[k] === b[k])

type Shifts = Record<string, number>

/** Measures a head and keeps its shifts, leaving the state alone when nothing moved (so a render does not loop). */
function applyShifts(head: HTMLElement | null, setShifts: Dispatch<SetStateAction<Shifts>>) {
  const next = head ? measure(head) : null
  if (next) setShifts((prev) => (sameShifts(prev, next) ? prev : next))
}

/** The shift of each name of a head, kept in step with the block: after every render and when the block resizes. */
function useCentredNames(head: RefObject<HTMLSpanElement | null>): Shifts {
  const [shifts, setShifts] = useState<Shifts>({})
  // After every render: a sort, a filter or a range re-renders the block and moves its numbers. Measured before
  // the paint, so a name never shows at its old place for a frame. No dependency list on purpose: applyShifts
  // leaves the state alone when nothing moved, so the render it causes is at most one and cannot repeat.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    applyShifts(head.current, setShifts)
  })
  useEffect(() => {
    const el = head.current
    const card = el?.closest('[data-tour-card]')
    if (!el || !card || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => applyShifts(el, setShifts))
    observer.observe(card)
    return () => observer.disconnect()
  }, [head])
  return shifts
}

interface SortHeadProps<K extends string> {
  columns: readonly SortColumn<K>[]
  sort: Sort<K>
  onSort: (sort: Sort<K>) => void
  /** The gap between the columns: the same as the numbers'. */
  className?: string
}

/** The column names over a list's numbers, each a control. */
export function SortHead<K extends string>({ columns, sort, onSort, className = '' }: SortHeadProps<K>) {
  const head = useRef<HTMLSpanElement>(null)
  const shifts = useCentredNames(head)
  return (
    // A plain string, not cn(): the two `text-` utilities are a size and a colour, and a class merger may take them
    // for one group.
    <span ref={head} className={`inline-flex shrink-0 text-[11px] text-neutral-500 ${className}`} data-sort-head="">
      {columns.map((column) => {
        const on = sort.key === column.key
        const Arrow = on && sort.dir === 'asc' ? ArrowUp : ArrowDown
        const shift = shifts[column.key] ?? 0
        return (
          <button
            key={column.key}
            type="button"
            onClick={() => onSort(nextSort(sort, column.key))}
            // A column's name starts with a capital letter (17-11-2026); inside this sentence it is a common word.
            aria-label={`Sort by ${column.label.toLowerCase()}, ${on && sort.dir === 'desc' ? 'low to high' : 'high to low'}`}
            className={cn('group/sort inline-flex items-center justify-end transition-colors duration-fast ease-apple hover:text-white', column.className, on && 'text-neutral-300')}
            data-sort={column.key}
            data-dir={on ? sort.dir : undefined}
            data-shift={shift || undefined}
          >
            <span className="inline-flex items-center gap-0.5" style={shift ? { transform: `translateX(${shift}px)` } : undefined}>
              <Arrow weight="bold" className={cn('h-2.5 w-2.5 shrink-0', on ? 'opacity-100' : 'opacity-0 group-hover/sort:opacity-60')} aria-hidden="true" />
              <span data-sort-word="">{column.label}</span>
            </span>
          </button>
        )
      })}
    </span>
  )
}

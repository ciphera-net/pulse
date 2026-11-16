'use client'

import { useLayoutEffect, useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretRight, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { panelSurface, useGlassPanels } from '@/lib/dashboard/frame'
import { OPERATOR_LABELS, type DimensionFilter } from '@/lib/filters'
import { labelOf, type PageValues } from './values'
import { valueIcon, valueName } from './SearchFilter'

// ---------------------------------------------------------------------------
// The filters now on, in the toolbar (owner rulings R46 and R48 of 15-11-2026, option "One box"). One filter shows
// as itself; two or more fold into ONE box, "3 filters" with their icons, that opens their list. So the toolbar's
// line never wraps on a computer, however many filters there are: the live count, the Filter button and the date
// range stay where they are (before, a second filter pushed the range onto a line of its own).
//
// A filter's operator is a button of its own: one press turns "is" into "is not" and back. Its x removes it. The box
// has an x of its own at its right end, as a single filter's pill has, and it takes every filter away (R59 of
// 16-11-2026, "an x on the box", which supersedes the earlier "the clear all button needs to be removed": that was a
// "Clear all" row in the list).
// ---------------------------------------------------------------------------

/** The one-press opposite of an operator. */
export const OPPOSITE: Record<DimensionFilter['operator'], DimensionFilter['operator']> = {
  is: 'is_not',
  is_not: 'is',
  contains: 'not_contains',
  not_contains: 'contains',
}

const excluded = (f: DimensionFilter) => f.operator === 'is_not' || f.operator === 'not_contains'
/** "Norway", "Norway or Sweden", "Norway, Sweden or 2 more": several values of one kind are an "or". */
function valueText(f: DimensionFilter, pageValues: PageValues): string {
  const names = f.values.map((v) => valueName(f.dimension, v, pageValues))
  return names.length <= 2 ? names.join(' or ') : `${names.slice(0, 2).join(', ')} or ${names.length - 2} more`
}
const tone = (out: boolean) => (out ? 'border-white/[0.12] bg-white/[0.04] text-neutral-200' : 'border-brand-orange/20 bg-brand-orange/10 text-brand-ink')
function Icon({ f }: { f: DimensionFilter }) {
  return <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>img]:h-4 [&>img]:w-4 [&>svg]:h-4 [&>svg]:w-4">{valueIcon(f.dimension, f.values[0])}</span>
}

interface FiltersBoxProps {
  filters: DimensionFilter[]
  /** The page's own handler: replaces the filter at `index`. */
  onApply: (filter: DimensionFilter, editingIndex: number | null) => void
  onRemove: (index: number) => void
  pageValues: PageValues
}

interface BoxProps extends FiltersBoxProps {
  /** Takes every filter away in one change (the page's own handler, one address update). */
  onClearAll: () => void
}

/** One filter as a pill: its kind, its operator (a press flips it), its values, its x. */
function Pill({ f, i, onApply, onRemove, pageValues }: { f: DimensionFilter; i: number } & Omit<FiltersBoxProps, 'filters'>) {
  const out = excluded(f)
  const kind = labelOf(f.dimension)
  return (
    <span className={cn('inline-flex h-10 shrink-0 items-center border text-sm font-medium', tone(out))} data-testid="filter-pill">
      <span className="flex h-full items-center gap-1.5 ps-3 pe-1.5">
        <Icon f={f} />
        <span className={out ? 'text-neutral-400' : 'text-brand-ink/70'}>{kind}</span>
      </span>
      <button
        type="button"
        onClick={() => onApply({ ...f, operator: OPPOSITE[f.operator] }, i)}
        title={`Press for "${OPERATOR_LABELS[OPPOSITE[f.operator]]}"`}
        aria-label={`${kind} ${OPERATOR_LABELS[f.operator]}: press to switch to ${OPERATOR_LABELS[OPPOSITE[f.operator]]}`}
        className={cn('h-full px-1.5 underline decoration-dotted underline-offset-4 hover:decoration-solid', out ? 'text-white' : 'text-brand-ink/60 hover:text-brand-ink')}
      >
        {OPERATOR_LABELS[f.operator]}
      </button>
      <span className="max-w-[220px] truncate ps-1.5 pe-3">{valueText(f, pageValues)}</span>
      <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${kind} filter`} className={cn('flex h-full w-8 items-center justify-center border-s hover:text-white', out ? 'border-white/[0.12] text-neutral-500' : 'border-brand-orange/20')}>
        <X className="h-3.5 w-3.5" weight="bold" />
      </button>
    </span>
  )
}

/** The list behind the box: each filter a row of its own, reaching the menu's edges. */
function FiltersMenu({ anchor, filters, onApply, onRemove, pageValues, onClose }: Omit<FiltersBoxProps, never> & { anchor: HTMLElement; onClose: () => void }) {
  const glass = useGlassPanels()
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const width = Math.min(340, window.innerWidth - 16)
      setAt({ top: r.bottom + 8, left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])
  if (!at) return null
  return (
    // It enters and leaves as the date menu does (components/ui/DateRangePicker).
    <motion.div
      ref={ref}
      role="dialog"
      aria-label="Filters on"
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      style={{ top: at.top, left: at.left, width: Math.min(340, typeof window === 'undefined' ? 340 : window.innerWidth - 16) }}
      className={cn(panelSurface(glass), 'fixed z-[100] shadow-lg')}
      data-testid="filters-menu"
    >
      <div data-menu-list="" className="divide-y divide-white/[0.06]">
        {filters.map((f, i) => {
          const out = excluded(f)
          const kind = labelOf(f.dimension)
          return (
            <div key={`${f.dimension}-${i}`} className="flex h-11 items-center gap-2 ps-4 text-sm" data-testid="filters-menu-row">
              <Icon f={f} />
              <span className="shrink-0 text-neutral-500">{kind}</span>
              <button
                type="button"
                onClick={() => onApply({ ...f, operator: OPPOSITE[f.operator] }, i)}
                title={`Press for "${OPERATOR_LABELS[OPPOSITE[f.operator]]}"`}
                aria-label={`${kind} ${OPERATOR_LABELS[f.operator]}: press to switch to ${OPERATOR_LABELS[OPPOSITE[f.operator]]}`}
                className={cn('shrink-0 underline decoration-dotted underline-offset-4 hover:decoration-solid', out ? 'text-white' : 'text-brand-ink/80 hover:text-brand-ink')}
              >
                {OPERATOR_LABELS[f.operator]}
              </button>
              <span className="min-w-0 flex-1 truncate font-medium text-white">{valueText(f, pageValues)}</span>
              <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${kind} filter`} className="flex h-full w-11 shrink-0 items-center justify-center text-neutral-500 hover:text-white">
                <X className="h-3.5 w-3.5" weight="bold" />
              </button>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

export default function FiltersBox({ filters, onApply, onRemove, onClearAll, pageValues }: BoxProps) {
  // The list hangs from the whole box: the box and its x together.
  const ref = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  // The box's list closes with its last filter.
  const many = filters.length > 1
  useEffect(() => { if (!many) setOpen(false) }, [many])
  if (filters.length === 0) return null
  if (!many) return <Pill f={filters[0]} i={0} onApply={onApply} onRemove={onRemove} pageValues={pageValues} />
  return (
    <>
      {/* The box and its x are one bordered control, as a single filter's pill and its x are. */}
      <span ref={ref} className={cn('inline-flex h-10 shrink-0 items-center border text-sm font-medium', tone(false))} data-testid="filters-box-control">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-full items-center gap-1.5 px-3"
          data-testid="filters-box"
        >
          <span className="flex items-center -space-x-1" aria-hidden="true">
            {filters.slice(0, 3).map((f, i) => (
              <span key={i} className="flex h-5 w-5 items-center justify-center bg-neutral-900 ring-1 ring-brand-orange/20"><Icon f={f} /></span>
            ))}
          </span>
          {filters.length} filters
          {/* The date button's caret: a quarter turn while the list is open. */}
          <CaretRight weight="bold" className={cn('h-3.5 w-3.5 text-brand-ink/60 transition-transform', open && 'rotate-90')} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); onClearAll() }}
          aria-label="Remove every filter"
          className="flex h-full w-8 items-center justify-center border-s border-brand-orange/20 hover:text-white"
          data-testid="filters-box-clear"
        >
          <X className="h-3.5 w-3.5" weight="bold" />
        </button>
      </span>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && ref.current && (
            <FiltersMenu key="filters" anchor={ref.current} filters={filters} onApply={onApply} onRemove={onRemove} pageValues={pageValues} onClose={() => setOpen(false)} />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

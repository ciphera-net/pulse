'use client'

import { useLayoutEffect, useRef, useState, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BookmarkSimple, CaretRight, X } from '@phosphor-icons/react'
import { Switcher } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import { panelSurface, useGlassPanels } from '@/lib/dashboard/frame'
import { OPERATOR_LABELS, canMatchAny, type DimensionFilter, type FilterMode } from '@/lib/filters'
import { setFor, useSavedFilters, type SavedFilters, type SavedSet } from '@/lib/swr/savedFilters'
import { labelOf, type PageValues, type PlaceCountries } from './values'
import { valueIcon } from './SearchFilter'
import { NameField, SavedAs, suggestName, valueText } from './saved'

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
//
// Saved filters (R59 and R60; for every team since 16-11-2026): the box's list ends with "Save these filters", which names
// the set in place; a single filter's pill has a bookmark beside its x that opens the same field. While the filters
// on are a saved set, both say "Saved as …" instead. The sets themselves are listed in the Filter panel.
//
// Match any (R65 of 16-11-2026, the match-any beta): the box's list opens with a "Match" row and its All / Any
// switch, and the box says "Any of 3 filters" while the page counts what fits at least one. Beside an event filter
// the server reads Match all only, so the switch is off there and the row says why.
// ---------------------------------------------------------------------------

/** The one-press opposite of an operator. */
export const OPPOSITE: Record<DimensionFilter['operator'], DimensionFilter['operator']> = {
  is: 'is_not',
  is_not: 'is',
  contains: 'not_contains',
  not_contains: 'contains',
}

const excluded = (f: DimensionFilter) => f.operator === 'is_not' || f.operator === 'not_contains'
const MATCH_MODES: { value: FilterMode; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'any', label: 'Any' }]
/** Why the switch is off beside an event filter (the server reads Match all there). */
export const MATCH_ANY_NEEDS_NO_EVENT = 'With an event filter on, every filter has to match.'
const tone = (out: boolean) => (out ? 'border-white/[0.12] bg-white/[0.04] text-neutral-200' : 'border-brand-orange/20 bg-brand-orange/10 text-brand-ink')
function Icon({ f, places }: { f: DimensionFilter; places?: PlaceCountries }) {
  return <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>img]:h-4 [&>img]:w-4 [&>svg]:h-4 [&>svg]:w-4">{valueIcon(f.dimension, f.values[0], places?.[f.dimension]?.[f.values[0]])}</span>
}

interface FiltersBoxProps {
  filters: DimensionFilter[]
  /** The page's own handler: replaces the filter at `index`. */
  onApply: (filter: DimensionFilter, editingIndex: number | null) => void
  onRemove: (index: number) => void
  pageValues: PageValues
  /** The country of each city and region the page lists: their pills draw that country's flag (placeCountriesFrom). */
  places?: PlaceCountries
  /**
   * Match all or Match any, as the page reads its filters (lib/filters.ts, modeFor), and its switch. Absent `onMode`:
   * the page offers no switch (the match-any beta is off, or the page is not the dashboard).
   */
  mode?: FilterMode
  onMode?: (mode: FilterMode) => void
}

interface BoxProps extends FiltersBoxProps {
  /** Takes every filter away in one change (the page's own handler, one address update). */
  onClearAll: () => void
}

/**
 * A menu under its anchor, its right edge on the anchor's, kept inside the window. It enters and leaves as the date
 * menu does (components/ui/DateRangePicker); a press outside it and its anchor, or Escape, closes it.
 */
function AnchoredMenu({ anchor, width, label, onClose, testid, children }: {
  anchor: HTMLElement
  width: number
  label: string
  onClose: () => void
  testid: string
  children: ReactNode
}) {
  const glass = useGlassPanels()
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const w = Math.min(width, window.innerWidth - 16)
      setAt({ top: r.bottom + 8, left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), width: w })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, width])
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
    <motion.div
      ref={ref}
      role="dialog"
      aria-label={label}
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      style={{ top: at.top, left: at.left, width: at.width }}
      className={cn(panelSurface(glass), 'fixed z-[100] shadow-lg')}
      data-testid={testid}
    >
      {children}
    </motion.div>
  )
}

/** The box list's last row: saves the filters on under a name typed in place; once saved, says under which. */
function SaveRow({ filters, saved, savedAsAny, savedFilters, pageValues, mode }: { filters: DimensionFilter[]; saved: SavedSet | null; savedAsAny: SavedSet | null; savedFilters: SavedFilters; pageValues: PageValues; mode: FilterMode }) {
  const [naming, setNaming] = useState(false)
  if (saved) return <SavedAs name={saved.name} />
  if (savedAsAny) return <SavedAs name={savedAsAny.name} anyOff />
  if (!savedFilters.canEdit) return null
  if (naming) {
    return (
      <NameField
        initial={suggestName(filters, pageValues)}
        placeholder="Name these filters"
        label="Name for these filters"
        onSave={async (name) => { await savedFilters.save(name, filters, mode); setNaming(false) }}
        onCancel={() => setNaming(false)}
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setNaming(true)}
      className="flex h-11 w-full items-center gap-2 px-4 text-left text-sm text-neutral-300 hover:bg-white/[0.06] hover:text-white"
      data-testid="filters-save-row"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        <BookmarkSimple className="h-4 w-4 text-neutral-500" weight="bold" aria-hidden="true" />
      </span>
      Save these filters
    </button>
  )
}

/** One filter as a pill: its kind, its operator (a press flips it), its values, its x, and the bookmark that saves it. */
function Pill({ f, i, onApply, onRemove, pageValues, places, savedFilters }: { f: DimensionFilter; i: number; savedFilters: SavedFilters } & Omit<FiltersBoxProps, 'filters'>) {
  const out = excluded(f)
  const kind = labelOf(f.dimension, pageValues)
  const pillRef = useRef<HTMLSpanElement>(null)
  const [menu, setMenu] = useState(false)
  const saved = savedFilters.on ? setFor([f], savedFilters.sets) : null
  // The bookmark: for whoever may save, and for anyone once the filter is a saved set (to say under which name).
  const bookmark = savedFilters.on && (savedFilters.canEdit || saved !== null)
  return (
    <>
      <span ref={pillRef} className={cn('inline-flex h-10 shrink-0 items-center border text-sm font-medium', tone(out))} data-testid="filter-pill">
        <span className="flex h-full items-center gap-1.5 ps-3 pe-1.5">
          <Icon f={f} places={places} />
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
        {bookmark && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            aria-label={saved ? `Saved as ${saved.name}` : 'Save this filter'}
            className={cn('flex h-full w-8 items-center justify-center border-s hover:text-white', out ? 'border-white/[0.12] text-neutral-500' : 'border-brand-orange/20')}
            data-testid="filter-pill-save"
            data-saved={saved ? 'true' : 'false'}
          >
            <BookmarkSimple className="h-3.5 w-3.5" weight={saved ? 'fill' : 'bold'} aria-hidden="true" />
          </button>
        )}
        <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${kind} filter`} className={cn('flex h-full w-8 items-center justify-center border-s hover:text-white', out ? 'border-white/[0.12] text-neutral-500' : 'border-brand-orange/20')}>
          <X className="h-3.5 w-3.5" weight="bold" />
        </button>
      </span>
      {bookmark && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {menu && pillRef.current && (
            <AnchoredMenu key="pill-save" anchor={pillRef.current} width={320} label="Save this filter" onClose={() => setMenu(false)} testid="filter-pill-save-menu">
              <div data-menu-list="">
                {saved ? (
                  <SavedAs name={saved.name} />
                ) : (
                  <NameField
                    initial={suggestName([f], pageValues)}
                    placeholder="Name this filter"
                    label="Name for this filter"
                    onSave={async (name) => { await savedFilters.save(name, [f]); setMenu(false) }}
                    onCancel={() => setMenu(false)}
                  />
                )}
              </div>
            </AnchoredMenu>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

/** The list behind the box: each filter a row of its own, reaching the menu's edges, then the row that saves them. */
function FiltersMenu({ anchor, filters, onApply, onRemove, pageValues, places, onClose, savedFilters, mode = 'all', onMode }: Omit<FiltersBoxProps, never> & { anchor: HTMLElement; onClose: () => void; savedFilters: SavedFilters }) {
  const saved = savedFilters.on ? setFor(filters, savedFilters.sets, mode) : null
  // A set saved with Match any, on a page that reads Match all and offers no switch (the beta is off): the list says
  // so under the set's name, in place of offering to save filters that are saved already.
  const savedAsAny = savedFilters.on && !saved && mode === 'all' && !onMode ? setFor(filters, savedFilters.sets, 'any') : null
  return (
    <AnchoredMenu anchor={anchor} width={340} label="Filters on" onClose={onClose} testid="filters-menu">
      <div data-menu-list="" className="divide-y divide-white/[0.06]">
        {onMode && (
          // The switch stands over the filters it joins. It is the blocks' own switcher, so it reads as one.
          <div data-testid="filters-match-row">
            <div className="flex h-12 items-center justify-between gap-3 ps-4 pe-3 text-sm">
              <span className="text-neutral-400">Match</span>
              <Switcher
                size="sm"
                tone="solid"
                aria-label="Match all filters or any filter"
                options={MATCH_MODES}
                value={mode}
                onChange={(v) => onMode(v as FilterMode)}
                disabled={!canMatchAny(filters)}
              />
            </div>
            {!canMatchAny(filters) && (
              <p className="px-4 pb-3 text-xs text-neutral-500" data-testid="filters-match-why">{MATCH_ANY_NEEDS_NO_EVENT}</p>
            )}
          </div>
        )}
        {filters.map((f, i) => {
          const out = excluded(f)
          const kind = labelOf(f.dimension, pageValues)
          return (
            <div key={`${f.dimension}-${i}`} className="flex h-11 items-center gap-2 ps-4 text-sm" data-testid="filters-menu-row">
              <Icon f={f} places={places} />
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
        {savedFilters.on && <SaveRow filters={filters} saved={saved} savedAsAny={savedAsAny} savedFilters={savedFilters} pageValues={pageValues} mode={mode} />}
      </div>
    </AnchoredMenu>
  )
}

export default function FiltersBox({ filters, onApply, onRemove, onClearAll, pageValues, places, mode = 'all', onMode }: BoxProps) {
  const savedFilters = useSavedFilters()
  // The list hangs from the whole box: the box and its x together.
  const ref = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  // The box's list closes with its last filter.
  const many = filters.length > 1
  useEffect(() => { if (!many) setOpen(false) }, [many])
  if (filters.length === 0) return null
  if (!many) return <Pill f={filters[0]} i={0} onApply={onApply} onRemove={onRemove} pageValues={pageValues} places={places} savedFilters={savedFilters} />
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
              <span key={i} className="flex h-5 w-5 items-center justify-center bg-neutral-900 ring-1 ring-brand-orange/20"><Icon f={f} places={places} /></span>
            ))}
          </span>
          {mode === 'any' ? `Any of ${filters.length} filters` : `${filters.length} filters`}
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
            <FiltersMenu key="filters" anchor={ref.current} filters={filters} onApply={onApply} onRemove={onRemove} pageValues={pageValues} places={places} onClose={() => setOpen(false)} savedFilters={savedFilters} mode={mode} onMode={onMode} />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

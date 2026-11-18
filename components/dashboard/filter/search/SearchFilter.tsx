'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretRight, MagnifyingGlass, X } from '@phosphor-icons/react'
import { buttonVariants, toast } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import { SkeletonLine } from '@/components/skeleton/primitives'
import { panelSurface, useGlassPanels } from '@/lib/dashboard/frame'
import { FILTER_KEY, isPageShortcut } from '@/lib/keyboard/shortcuts'
import KeyCap from '@/components/ui/KeyCap'
import { formatCompactNumber } from '@/lib/utils/format'
import { getFilterValueIcon } from '@/lib/utils/icons'
import { EVENT_KIND, TOO_MANY_EVENT_FILTERS, eventFilterRoomFor, propertyKeysEvent, type DimensionFilter, type FilterMode, type FilterSuggestion } from '@/lib/filters'
import { DIMENSION_ICONS, iconKeyOf } from '../dimensionIcons'
import { setFor, useSavedFilters, type SavedSet } from '@/lib/swr/savedFilters'
import { SavedRow } from './saved'
import {
  EVENT_PROPERTY_SCOPE,
  columnLabelOf,
  dimensionsFor,
  drillOf,
  groupsFor,
  groupsOnly,
  isTextKind,
  labelOf,
  placeholderOf,
  readsOnOpen,
  search,
  useFilterValues,
  useScopeList,
  type Found,
  type Loaded,
  type PageValues,
} from './values'

// ---------------------------------------------------------------------------
// The Search filter: ONE field (owner ruling R36 of 15-11-2026, the new dashboard's filter; the lab's option
// "Search", Pulse/docs/data/14-11-2026-dashboard-frame-lab/lab/filter/SearchFilter.tsx).
//
// Type "nor" and get Norway, a page and a referrer, each with its count on this page. Enter adds the filter,
// Alt+Enter adds it as "is not", and the field stays open for the next one. F opens it from anywhere on the page.
// With the field empty it lists every kind of thing a filter can be on, each with its icon.
//
// Two things measured before they were built (R46, R48):
//   * The panel's first view needs no value, so it is drawn at once, at its full size. It used to wait for the
//     values behind a three-bar skeleton and grow when they landed, which showed the chart where the panel was
//     about to be. The values are read from the moment the pointer reaches the button.
//   * It enters and leaves as the date menu does (components/ui/DateRangePicker: 150 ms, from 4 px under and 98 %
//     of its size), and the button carries the date button's caret, a quarter turn while it is open.
// Under the event-filters beta (R45), "Event property" is a kind that narrows in three steps: the page's events, then
// the picked event's keys, then that property's values, each row of the first two ending in the caret that says a
// press opens something. Backspace in an empty field goes back one step.
// Not here, because the server does not do it yet: "match any".
// ---------------------------------------------------------------------------

// A value's reader name lives in ./values (saved filters' rows read it too); re-exported for this file's importers.
export { valueName } from './values'

/** A kind's own icon. */
export function DimensionIcon({ dimension, className = 'h-3.5 w-3.5' }: { dimension: string; className?: string }) {
  const Mark = DIMENSION_ICONS[iconKeyOf(dimension)]
  return Mark ? <Mark className={cn('shrink-0', className)} aria-hidden="true" /> : null
}

/**
 * A value's icon: its flag, favicon or mark as the blocks draw it (getFilterValueIcon, every kind). `country` is a
 * city's or a region's country, for its flag: a found value carries its own, a filter's pill looks it up.
 */
export function valueIcon(dimension: string, value: string, country?: string): ReactNode {
  return getFilterValueIcon(dimension, value, country)
}

/** The typed part of a label, a little brighter than the rest. */
function Marked({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return <>{text.slice(0, at)}<span className="font-medium text-white">{text.slice(at, at + query.length)}</span>{text.slice(at + query.length)}</>
}

type Item =
  | { kind: 'value'; found: Found }
  // A row that opens the next step of "Event property": an event to its keys, a key to its values.
  | { kind: 'drill'; found: Found; to: string }
  | { kind: 'contains'; dimension: string; text: string }
  | { kind: 'set'; set: SavedSet }
  | { kind: 'dimension'; dimension: string }

/** What an empty step says when nothing was typed: each step of "Event property" its own line, any other kind one. */
function emptyLine(scope: string | null): string {
  if (scope === EVENT_PROPERTY_SCOPE) return 'There are no events on this page.'
  if (scope && propertyKeysEvent(scope)) return 'No properties were sent with this event.'
  return 'There is nothing to pick from on this page.'
}

export interface SearchFilterProps {
  filters: DimensionFilter[]
  /** The page's own handler: adds the filter (index null). */
  onApply: (filter: DimensionFilter, editingIndex: number | null) => void
  /** The page's suggestion reads (the old picker's). */
  fetchSuggestions: ((dimension: string) => Promise<FilterSuggestion[]>) | undefined
  /** What the page's own answer lists for the kinds with no value read (events, channels, screens, languages, timezones). */
  pageValues: PageValues
  /**
   * Puts a saved set on the page IN PLACE of the filters that are on, in one change (saved filters, R59).
   * Without it the panel lists no saved set.
   */
  onApplySet?: (filters: DimensionFilter[], mode: FilterMode) => void
  /** Match all or Match any, as the page reads its filters: the saved set that is on is found with it. */
  mode?: FilterMode
  /**
   * The event-filters beta is on (R45): the Events group offers an event and an outbound link, each keeping or leaving
   * out whole visitors, in place of the row test `event_name`. At most MAX_EVENT_FILTERS of them at once.
   */
  eventFilters?: boolean
  /**
   * A page whose read answers fewer kinds than the dashboard's offers only these (the Journeys page:
   * JOURNEY_FILTER_DIMENSIONS), with a group for the entry page (values.ts groupsOnly). A module constant, so the
   * lists below are made once. Absent: every kind.
   */
  only?: readonly string[]
}


/** The Filter button and its panel. The panel is drawn in a portal, so it outlives the page's loading states. */
export default function SearchFilter({ filters, onApply, fetchSuggestions, pageValues, onApplySet, eventFilters = false, mode = 'all', only }: SearchFilterProps) {
  const glass = useGlassPanels()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const lastHeight = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  // The pointer reached the button (or it took the focus): the values are read before the press.
  const [warm, setWarm] = useState(false)
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(null)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<string | null>(null)
  // The steps above the scope ("Event property", then an event's keys): Backspace in an empty field goes back to the last.
  const [trail, setTrail] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const groups = useMemo(() => groupsOnly(groupsFor(eventFilters), only), [eventFilters, only])
  const dimensions = useMemo(() => (only ? groups.flatMap((g) => g.dimensions).filter((d) => d !== EVENT_PROPERTY_SCOPE) : dimensionsFor(eventFilters)), [groups, only, eventFilters])
  const { values, ready } = useFilterValues({ on: open || warm, fetchSuggestions, pageValues, filters, dimensions })
  // Saved filters: listed at the top of the first view while the page can put one on.
  const savedFilters = useSavedFilters()
  const sets = useMemo(() => (savedFilters.on && onApplySet ? savedFilters.sets : []), [savedFilters.on, savedFilters.sets, onApplySet])
  const current = setFor(filters, sets, mode)

  // The later steps of "Event property" are read when they open; its first lists the events the Event kind reads.
  const scopeRead = useScopeList({ scope, fetchSuggestions, filters, known: dimensions })
  const onOpen = readsOnOpen(scope, dimensions)
  const listed: Loaded = useMemo(() => {
    if (scope === EVENT_PROPERTY_SCOPE) return { ...values, [EVENT_PROPERTY_SCOPE]: values[EVENT_KIND] ?? [] }
    if (onOpen && scope) return { ...values, [scope]: scopeRead.list }
    return values
  }, [scope, onOpen, values, scopeRead.list])
  const listReady = onOpen ? scopeRead.ready : ready
  const failed = onOpen && scopeRead.failed
  // A step whose rows open the next one: Enter opens, and there is nothing to exclude.
  const drilling = scope === EVENT_PROPERTY_SCOPE || (scope !== null && propertyKeysEvent(scope) !== null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setScope(null)
    setTrail([])
    setIndex(0)
  }, [])

  // F opens it from anywhere, unless something is being typed. Not after `g`: `g f` goes to Funnels, and the press
  // that navigates is marked handled before it reaches the window (isPageShortcut).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== FILTER_KEY || !isPageShortcut(e)) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Under the button, its right edge on the button's, kept inside the window.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const b = buttonRef.current?.getBoundingClientRect()
      if (!b) return
      const width = Math.min(440, window.innerWidth - 16)
      setAt({ top: b.bottom + 8, left: Math.max(8, Math.min(b.right - width, window.innerWidth - width - 8)), width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // The field takes the keyboard once the panel is on the page.
  const placed = open && at !== null
  useEffect(() => {
    if (placed) inputRef.current?.focus()
  }, [placed])

  // A press outside the panel and its button closes it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return
      close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, close])

  const text = query.trim()
  const searching = text !== '' || scope !== null
  const loading = searching && !listReady && !failed
  const items: Item[] = useMemo(() => {
    // The first view (the saved sets, then every kind) needs no value: drawn at once, at its full size.
    if (!searching) {
      return [
        ...sets.map((set): Item => ({ kind: 'set', set })),
        ...groups.flatMap((g) => g.dimensions.map((dimension): Item => ({ kind: 'dimension', dimension }))),
      ]
    }
    if (!listReady) return []
    const found = search(listed, text, scope, 4, dimensions).map((f): Item => {
      const to = drillOf(scope, f.value)
      return to ? { kind: 'drill', found: f, to } : { kind: 'value', found: f }
    })
    const typed: Item[] = text === '' ? [] : (scope ? [scope] : ['page', 'referrer']).filter(isTextKind).map((dimension) => ({ kind: 'contains', dimension, text }))
    return [...found, ...typed]
  }, [searching, listReady, listed, text, scope, sets, groups, dimensions])
  const picked = Math.min(index, Math.max(0, items.length - 1))

  // While values are still being read for what was typed, the list keeps the height it had.
  useLayoutEffect(() => {
    if (!loading && listRef.current) lastHeight.current = listRef.current.offsetHeight
  })

  const add = (filter: DimensionFilter) => {
    // The server reads at most two event filters (each is one more read of the range).
    if (!eventFilterRoomFor(filter, filters)) {
      toast.error(TOO_MANY_EVENT_FILTERS)
      return
    }
    onApply(filter, null)
    setQuery('')
    setScope(null)
    setIndex(0)
    inputRef.current?.focus()
  }
  /** Narrows the search to a kind or a step; `from` is the step it was opened from, for Backspace. */
  const narrow = (to: string, from: string | null) => {
    setTrail((t) => (from === null ? [] : [...t, from]))
    setScope(to)
    setQuery('')
    setIndex(0)
    inputRef.current?.focus()
  }
  /** Back one step: to the step a row was opened from, or to every kind. */
  const back = () => {
    setScope(trail.length > 0 ? trail[trail.length - 1] : null)
    setTrail((t) => t.slice(0, -1))
    setIndex(0)
  }
  const act = (item: Item | undefined, exclude: boolean) => {
    if (!item) return
    // A merged row (two stored addresses that read the same) filters by every value it stands for.
    if (item.kind === 'value') add({ dimension: item.found.dimension, operator: exclude ? 'is_not' : 'is', values: item.found.values ?? [item.found.value] })
    else if (item.kind === 'drill') narrow(item.to, scope)
    else if (item.kind === 'contains') add({ dimension: item.dimension, operator: exclude ? 'not_contains' : 'contains', values: [item.text] })
    else if (item.kind === 'set') {
      // One press: the set in place of the filters on. The page reads again, so the panel closes first.
      close()
      onApplySet?.(item.set.filters, item.set.mode)
    } else narrow(item.dimension, null)
  }

  const row = (i: number, body: ReactNode, onPress: (exclude: boolean) => void, key: string) => (
    <button
      key={key}
      type="button"
      role="option"
      aria-selected={i === picked}
      // The field keeps the keyboard: a press on a row must not take the focus from it.
      onMouseDown={(e) => e.preventDefault()}
      onMouseMove={() => { if (i !== picked) setIndex(i) }}
      onClick={(e) => onPress(e.altKey)}
      className={cn('flex h-9 w-full items-center gap-3 px-3 text-left text-sm text-neutral-300 focus-visible:outline-none', i === picked && 'bg-white/[0.06]')}
      data-search-filter-row=""
    >
      {body}
    </button>
  )

  const list = () => {
    if (loading) {
      return (
        <div className="space-y-2 px-3 py-2" aria-busy="true">
          {[72, 54, 63].map((w) => <SkeletonLine key={w} className="h-5" style={{ width: `${w}%` }} />)}
        </div>
      )
    }
    if (!searching) {
      let i = -1
      return (
        <>
          {sets.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-1.5 text-[11px] text-neutral-500" data-testid="saved-filters-heading">Saved</div>
              {sets.map((set) => {
                const mine = ++i
                return (
                  <SavedRow
                    key={set.id}
                    set={set}
                    on={current?.id === set.id}
                    picked={mine === picked}
                    onPick={() => { if (mine !== picked) setIndex(mine) }}
                    onApply={() => act({ kind: 'set', set }, false)}
                    onDelete={savedFilters.canEdit ? () => {
                      savedFilters.remove(set.id).catch(() => toast.error('This saved filter could not be deleted. Try again.'))
                      inputRef.current?.focus()
                    } : undefined}
                    pageValues={pageValues}
                  />
                )
              })}
            </>
          )}
          <div className={cn('px-3 pb-1 text-[11px] text-neutral-500', sets.length > 0 ? 'mt-1.5 border-t border-white/[0.08] pt-2.5' : 'pt-1.5')}>Filter on</div>
          {groups.map((group) => (
            <div key={group.label} className="flex items-center gap-3 px-3 py-1">
              <span className="w-[84px] shrink-0 text-[11px] text-neutral-500">{group.label}</span>
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {group.dimensions.map((dimension) => {
                  const mine = ++i
                  return (
                    <button
                      key={dimension}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => { if (mine !== picked) setIndex(mine) }}
                      onClick={() => act({ kind: 'dimension', dimension }, false)}
                      className={cn('group/kind inline-flex h-7 items-center gap-1.5 border border-white/[0.08] px-2 text-xs text-neutral-300 hover:text-white', mine === picked && 'bg-white/[0.06] text-white')}
                      data-search-filter-kind={dimension}
                    >
                      <DimensionIcon dimension={dimension} className={cn('h-3.5 w-3.5', mine === picked ? 'text-neutral-300' : 'text-neutral-500 group-hover/kind:text-neutral-300')} />
                      {labelOf(dimension, pageValues)}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )
    }
    if (failed) {
      // A failed read is said, never drawn as an empty list.
      return (
        <div className="flex items-center gap-3 px-3 py-3 text-sm text-neutral-500" data-testid="search-filter-failed">
          <span className="min-w-0 flex-1">{scope && propertyKeysEvent(scope) ? 'The properties of this event could not be loaded.' : 'The values of this property could not be loaded.'}</span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              scopeRead.retry()
              inputRef.current?.focus()
            }}
            className="shrink-0 text-neutral-300 underline decoration-dotted underline-offset-4 hover:text-white hover:decoration-solid"
          >
            Try again
          </button>
        </div>
      )
    }
    if (items.length === 0) {
      return <p className="px-3 py-3 text-sm text-neutral-500">{text ? <>Nothing on this page matches &quot;{text}&quot;.</> : emptyLine(scope)}</p>
    }
    return items.map((item, i) => {
      if (item.kind === 'drill') {
        const f = item.found
        // An event of "Event property" is drawn as the Event kind draws it; a key with the property's mark.
        const event = scope === EVENT_PROPERTY_SCOPE
        return row(i, (
          <>
            <span className="w-[84px] shrink-0 truncate text-[11px] text-neutral-500">{labelOf(event ? EVENT_KIND : f.dimension, pageValues)}</span>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>img]:h-4 [&>img]:w-4 [&>svg]:h-4 [&>svg]:w-4">
              {event ? valueIcon(EVENT_KIND, f.value) : <DimensionIcon dimension={EVENT_PROPERTY_SCOPE} className="h-4 w-4 text-neutral-500" />}
            </span>
            <span className="min-w-0 flex-1 truncate"><Marked text={f.label} query={text} /></span>
            {f.count != null && <span className="shrink-0 text-xs tabular-nums text-neutral-500">{formatCompactNumber(f.count)}</span>}
            {/* The date button's caret: a press opens the next step. */}
            <CaretRight weight="bold" className={cn('h-3 w-3 shrink-0', i === picked ? 'text-neutral-300' : 'text-neutral-600')} aria-hidden="true" data-search-filter-drill="" />
          </>
        ), () => act(item, false), `drill-${f.dimension}-${f.value}`)
      }
      if (item.kind === 'value') {
        const f = item.found
        return row(i, (
          <>
            <span className="w-[84px] shrink-0 truncate text-[11px] text-neutral-500">{columnLabelOf(f.dimension, pageValues)}</span>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>img]:h-4 [&>img]:w-4 [&>svg]:h-4 [&>svg]:w-4">{valueIcon(f.dimension, f.value, f.country)}</span>
            {/* The suggestion's own label is the reader's name (a country by its name, an event by its list's name). */}
            <span className="min-w-0 flex-1 truncate"><Marked text={f.label} query={text} /></span>
            {f.count != null && <span className="shrink-0 text-xs tabular-nums text-neutral-500">{formatCompactNumber(f.count)}</span>}
          </>
        ), (exclude) => act(item, exclude), `${f.dimension}-${f.value}`)
      }
      if (item.kind === 'contains') {
        return row(i, (
          <>
            <span className="w-[84px] shrink-0 truncate text-[11px] text-neutral-500">{columnLabelOf(item.dimension, pageValues)}</span>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center"><DimensionIcon dimension={item.dimension} className="h-4 w-4 text-neutral-500" /></span>
            <span className="min-w-0 flex-1 truncate">contains <span className="font-medium text-white">&quot;{item.text}&quot;</span></span>
          </>
        ), (exclude) => act(item, exclude), `contains-${item.dimension}`)
      }
      return null
    })
  }

  const active = filters.length > 0 || open
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={() => setWarm(true)}
        onFocus={() => setWarm(true)}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          buttonVariants({ variant: 'chrome', size: 'toolbar' }),
          'active:scale-[0.97] transition-[color,background-color,border-color,transform] ease-apple',
          active && 'border-brand-orange/30 bg-brand-orange/10 text-brand-ink hover:border-brand-orange/30',
        )}
        data-testid="search-filter-button"
      >
        <MagnifyingGlass className="h-3.5 w-3.5" weight="bold" aria-hidden="true" />
        Filter
        <KeyCap>F</KeyCap>
        <CaretRight weight="bold" className={cn('text-muted-foreground/70 transition-transform', open && 'rotate-90')} aria-hidden="true" />
      </button>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && at && (
            <motion.div
              key="search-filter"
              ref={panelRef}
              role="dialog"
              aria-label="Filter"
              initial={{ opacity: 0, y: 4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              style={{ top: at.top, left: at.left, width: at.width }}
              className={cn(panelSurface(glass), 'fixed z-[100] shadow-lg')}
              data-testid="search-filter-panel"
            >
              <div className="flex items-center gap-2 border-b border-white/[0.08] px-3">
                <MagnifyingGlass className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                {scope && (
                  <span className="inline-flex h-6 shrink-0 items-center gap-1 border border-white/[0.08] ps-1.5 text-xs text-neutral-300" data-search-filter-scope={scope}>
                    <DimensionIcon dimension={scope} className="h-3.5 w-3.5 text-neutral-500" />
                    {labelOf(scope, pageValues)}
                    <button type="button" aria-label="Search every kind again" onClick={() => { setScope(null); setTrail([]); setIndex(0); inputRef.current?.focus() }} className="flex h-6 w-5 items-center justify-center text-neutral-500 hover:text-white">
                      <X className="h-3 w-3" weight="bold" />
                    </button>
                  </span>
                )}
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setIndex(0) }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(items.length ? (picked + 1) % items.length : 0) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(items.length ? (picked - 1 + items.length) % items.length : 0) }
                    else if (e.key === 'Enter') { e.preventDefault(); act(items[picked], e.altKey) }
                    else if (e.key === 'Escape') { e.preventDefault(); if (query || scope) { setQuery(''); setScope(null); setTrail([]); setIndex(0) } else close() }
                    else if (e.key === 'Backspace' && query === '' && scope) { e.preventDefault(); back() }
                  }}
                  placeholder={scope ? placeholderOf(scope) : 'Filter by page, source, country or event'}
                  aria-label="Filter"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="search-filter-list"
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none"
                />
                <KeyCap>esc</KeyCap>
              </div>
              <div
                id="search-filter-list"
                ref={listRef}
                role="listbox"
                // The rows of a search reach the list's edges, as every menu's do (R39): no strip above the first or
                // under the last. The first view holds a heading and the kinds, not rows, and keeps its room.
                className={cn('frame-scroll max-h-[min(472px,calc(100vh-220px))]', !searching && 'py-1.5')}
                style={loading && lastHeight.current ? { minHeight: lastHeight.current } : undefined}
              >
                {list()}
              </div>
              <div className="flex items-center gap-3 border-t border-white/[0.08] px-3 py-2 text-[11px] text-neutral-500">
                {drilling ? (
                  <span className="inline-flex items-center gap-1.5"><KeyCap>↵</KeyCap> open</span>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5"><KeyCap>↵</KeyCap> add</span>
                    <span className="inline-flex items-center gap-1.5"><KeyCap>⌥</KeyCap><KeyCap>↵</KeyCap> exclude</span>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

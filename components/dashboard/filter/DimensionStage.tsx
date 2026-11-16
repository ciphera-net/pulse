'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { EVENT_FILTERS_FLAG, EVENT_PROPERTY_SCOPE, OUTBOUND_KIND, SCOPED_DIMENSIONS, categoriesFor, eventPropertyOf, type FilterSuggestion } from '@/lib/filters'
import { useFeature } from '@/lib/features'
import { DIMENSION_ICONS, iconKeyOf } from './dimensionIcons'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { moveHighlight } from './useFilterBuilder'
import { labelOf } from './search/values'
import PropertyStep from './PropertyStep'

// * Mirrors the dashboard's tool iconography so the popover reads as the same
// * product surface (flags/brand icons appear once a dimension is picked).
// The map is shared with the Search filter (./dimensionIcons.ts).

// ---------------------------------------------------------------------------
// DimensionStage — stage 1 of the filter popover: type-to-search over the
// dimension list with full keyboard navigation. Orange dots mark dimensions
// that already carry an active filter.
// ---------------------------------------------------------------------------

export interface DimensionStageProps {
  activeDimensions: Set<string>
  onPick: (dimension: string) => void
  onClose: () => void
  /** Optional allowlist — when set, only these dimensions are offered (additive;
   * omitted on the dashboard, so it's unaffected). */
  allowed?: readonly string[]
  /** The page's suggestion reads: "Event property" lists the range's events, then an event's keys, through them. */
  fetchSuggestions?: (dimension: string) => Promise<FilterSuggestion[]>
}

export default function DimensionStage({ activeDimensions, onPick, onClose, allowed, fetchSuggestions }: DimensionStageProps) {
  // The steps of "Event property" opened so far ([] while the kinds are listed): the events, then an event's keys.
  const [path, setPath] = useState<string[]>([])
  if (path.length > 0) {
    const step = path[path.length - 1]
    return (
      <PropertyStep
        // One step, one list: a new step starts with an empty field and its own read.
        key={step}
        step={step}
        fetchSuggestions={fetchSuggestions}
        onOpen={(next) => setPath((p) => [...p, next])}
        onPick={onPick}
        onBack={() => setPath((p) => p.slice(0, -1))}
      />
    )
  }
  return <KindList activeDimensions={activeDimensions} onPick={(d) => (d === EVENT_PROPERTY_SCOPE ? setPath([d]) : onPick(d))} onClose={onClose} allowed={allowed} />
}

/** The kinds, grouped, with type-to-search and keyboard navigation. */
function KindList({ activeDimensions, onPick, onClose, allowed }: Omit<DimensionStageProps, 'fetchSuggestions'>) {
  const [search, setSearch] = useState('')
  const [highlight, setHighlight] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // * Self-focus on mount — the popover only focuses on open, so without this
  // * the keyboard is stranded after Backspace/back returns to this stage.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const query = search.trim().toLowerCase()
  const allowSet = useMemo(() => (allowed ? new Set(allowed) : null), [allowed])
  // * The event filter's beta (R45): the Events group offers an event and an outbound link in place of event_name.
  const eventFilters = useFeature(EVENT_FILTERS_FLAG) === true

  // * Groups with their matching dimensions; `flat` is the keyboard order.
  const { groups, flat } = useMemo(() => {
    const groups = categoriesFor(eventFilters)
      .map(cat => ({
        label: cat.label,
        dimensions: cat.dimensions.filter(
          // * No allowlist = the page's full vocabulary MINUS the scoped dimensions.
          d => (allowSet ? allowSet.has(d) : !SCOPED_DIMENSIONS.has(d)) && labelOf(d).toLowerCase().includes(query),
        ),
      }))
      .filter(g => g.dimensions.length > 0)
    return { groups, flat: groups.flatMap(g => g.dimensions) }
  }, [query, allowSet, eventFilters])

  // * Clamp the highlight when the filtered list shrinks.
  useEffect(() => {
    setHighlight(h => (flat.length === 0 ? -1 : Math.min(Math.max(h, 0), flat.length - 1)))
  }, [flat.length])

  useEffect(() => {
    if (highlight < 0) return
    listRef.current
      ?.querySelector(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => moveHighlight(h, 1, flat.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => moveHighlight(h, -1, flat.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const dim = flat[highlight] ?? flat[0]
      if (dim) onPick(dim)
    } else if (e.key === 'Backspace' && search === '') {
      e.preventDefault()
      onClose()
    }
  }

  const renderItem = (dim: string, index: number) => {
    const DimIcon = DIMENSION_ICONS[iconKeyOf(dim)]
    return (
      // * Tiny mount cascade (capped at 120ms) — rows that stay mounted while
      // * typing never re-animate, so keystroke filtering stays instant.
      <motion.button
        key={dim}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION_FAST, ease: EASE_APPLE, delay: Math.min(index * 0.015, 0.12) }}
        type="button"
        id={`filter-dim-${dim}`}
        role="option"
        aria-selected={index === highlight}
        data-index={index}
        onClick={() => onPick(dim)}
        onMouseEnter={() => setHighlight(index)}
        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left rounded-none transition-colors cursor-pointer ease-apple ${
          index === highlight ? 'bg-white/[0.06] text-white' : 'text-neutral-300'
        }`}
      >
        {DimIcon && (
          <DimIcon
            className={`w-4 h-4 flex-shrink-0 ${index === highlight ? 'text-neutral-300' : 'text-neutral-500'}`}
          />
        )}
        <span className="flex-1">{labelOf(dim)}</span>
        {(activeDimensions.has(dim) || (dim === EVENT_PROPERTY_SCOPE && [...activeDimensions].some(d => d !== OUTBOUND_KIND && eventPropertyOf(d) !== null))) && (
          <span
            aria-label="has an active filter"
            className="w-1.5 h-1.5 rounded-full bg-brand-orange flex-shrink-0"
          />
        )}
      </motion.button>
    )
  }

  // Flat index bookkeeping across groups for keyboard order.
  let runningIndex = -1

  return (
    <div>
      <div className="relative p-2 border-b border-neutral-800">
        <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 pointer-events-none" />
        <input
          ref={inputRef}
          data-autofocus
          role="combobox"
          aria-expanded="true"
          aria-controls="filter-dimension-list"
          aria-activedescendant={highlight >= 0 && flat[highlight] ? `filter-dim-${flat[highlight]}` : undefined}
          value={search}
          onChange={e => { setSearch(e.target.value); setHighlight(0) }}
          onKeyDown={handleKeyDown}
          placeholder="Filter by…"
          className="w-full pl-8 pr-2.5 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded-none text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-brand-orange/40 focus:border-brand-orange/40 transition-colors ease-apple"
        />
      </div>

      <div
        ref={listRef}
        id="filter-dimension-list"
        role="listbox"
        aria-label="Filter dimensions"
        // No padding, and no margin between two groups: a menu's rows reach its edges (the rule is written at
        // the date picker's rows). A group's heading keeps its own room over its first row.
        className="max-h-[320px] overflow-y-auto"
        data-menu-list=""
      >
        {flat.length === 0 ? (
          <div className="px-3 py-3 text-sm text-neutral-500 text-center">
            No matching dimensions
          </div>
        ) : query ? (
          // * While searching: one flat result list — headers just add noise.
          flat.map(dim => {
            runningIndex += 1
            return renderItem(dim, runningIndex)
          })
        ) : (
          groups.map(group => (
            <div key={group.label}>
              <div className="px-3 pt-2 pb-1 text-micro-label font-semibold text-neutral-500 uppercase tracking-wider">
                {group.label}
              </div>
              {group.dimensions.map(dim => {
                runningIndex += 1
                return renderItem(dim, runningIndex)
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  MagnifyingGlass,
  FileText,
  ArrowSquareOut,
  Broadcast,
  Tag,
  Compass,
  Cpu,
  DeviceMobile,
  FrameCorners,
  GlobeHemisphereWest,
  MapPin,
  Buildings,
  CursorClick,
  type Icon,
} from '@phosphor-icons/react'
import { DIMENSION_CATEGORIES, DIMENSION_LABELS } from '@/lib/filters'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { moveHighlight } from './useFilterBuilder'

// * Mirrors the dashboard's tool iconography so the popover reads as the same
// * product surface (flags/brand icons appear once a dimension is picked).
const DIMENSION_ICONS: Record<string, Icon> = {
  page: FileText,
  referrer: ArrowSquareOut,
  channel: Broadcast,
  utm_source: Tag,
  utm_medium: Tag,
  utm_campaign: Tag,
  utm_term: Tag,
  utm_content: Tag,
  browser: Compass,
  os: Cpu,
  device: DeviceMobile,
  screen_resolution: FrameCorners,
  country: GlobeHemisphereWest,
  region: MapPin,
  city: Buildings,
  event_name: CursorClick,
}

// ---------------------------------------------------------------------------
// DimensionStage — stage 1 of the filter popover: type-to-search over the
// dimension list with full keyboard navigation. Orange dots mark dimensions
// that already carry an active filter.
// ---------------------------------------------------------------------------

export interface DimensionStageProps {
  activeDimensions: Set<string>
  onPick: (dimension: string) => void
  onClose: () => void
}

export default function DimensionStage({ activeDimensions, onPick, onClose }: DimensionStageProps) {
  const [search, setSearch] = useState('')
  const [highlight, setHighlight] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const query = search.trim().toLowerCase()

  // * Groups with their matching dimensions; `flat` is the keyboard order.
  const { groups, flat } = useMemo(() => {
    const groups = DIMENSION_CATEGORIES
      .map(cat => ({
        label: cat.label,
        dimensions: cat.dimensions.filter(d => DIMENSION_LABELS[d].toLowerCase().includes(query)),
      }))
      .filter(g => g.dimensions.length > 0)
    return { groups, flat: groups.flatMap(g => g.dimensions) }
  }, [query])

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
    const DimIcon = DIMENSION_ICONS[dim]
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
        <span className="flex-1">{DIMENSION_LABELS[dim]}</span>
        {activeDimensions.has(dim) && (
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
        className="max-h-[320px] overflow-y-auto py-1"
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
            <div key={group.label} className="mb-1 last:mb-0">
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

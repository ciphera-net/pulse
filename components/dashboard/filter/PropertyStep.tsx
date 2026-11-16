'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CaretLeft, MagnifyingGlass } from '@phosphor-icons/react'
import { EVENT_KIND, EVENT_PROPERTY_SCOPE, eventPropertyKind, propertyKeysEvent, propertyKeysScope, type FilterSuggestion } from '@/lib/filters'
import { getFilterValueIcon } from '@/lib/utils/icons'
import { formatCompactNumber } from '@/lib/utils/format'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { labelOf } from './search/values'
import { DIMENSION_ICONS } from './dimensionIcons'
import { moveHighlight } from './useFilterBuilder'

// ---------------------------------------------------------------------------
// PropertyStep: the older filter popover's "Event property" (R45; design
// 15-11-2026-event-and-outbound-link-filter-design.md, section 8: "a property is picked as event, then key, then
// value"), on the funnel page, Journeys and Settings, Export. Inside the dimension stage it lists the range's events,
// then the picked event's keys; a key is a kind like any other, so the value stage takes it from there. The header is
// the value stage's (a back caret and the step's token), and the list the dimension stage's rows.
// ---------------------------------------------------------------------------

export interface PropertyStepProps {
  /**
   * EVENT_PROPERTY_SCOPE lists the events; an event's keys scope (propertyKeysScope) lists its keys. The parent keys the
   * component by it, so each step starts with an empty field and reads its own list.
   */
  step: string
  fetchSuggestions?: (dimension: string) => Promise<FilterSuggestion[]>
  /** An event was picked: its keys are the next step. */
  onOpen: (step: string) => void
  /** A key was picked: the property's kind, for the value stage. */
  onPick: (dimension: string) => void
  /** Back one step (Backspace in an empty field, or the caret). */
  onBack: () => void
}

type Read = { list: FilterSuggestion[] } | { failed: true }

export default function PropertyStep({ step, fetchSuggestions, onOpen, onPick, onBack }: PropertyStepProps) {
  const [search, setSearch] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [read, setRead] = useState<Read | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const event = propertyKeysEvent(step)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Read when the step opens, and again on Retry (which clears the failed read first).
  useLayoutEffect(() => {
    if (!fetchSuggestions) return
    let cancelled = false
    fetchSuggestions(step === EVENT_PROPERTY_SCOPE ? EVENT_KIND : step)
      .then((list) => { if (!cancelled) setRead({ list }) })
      .catch(() => { if (!cancelled) setRead({ failed: true }) })
    return () => { cancelled = true }
  }, [step, fetchSuggestions, retryTick])

  const list = read && 'list' in read ? read.list : []
  const query = search.trim().toLowerCase()
  const shown = list.filter((s) => s.label.toLowerCase().includes(query) || s.value.toLowerCase().includes(query))
  // The highlight, kept on a row that is listed.
  const picked = shown.length === 0 ? -1 : Math.min(Math.max(highlight, 0), shown.length - 1)

  const choose = (s: FilterSuggestion) => {
    if (event) onPick(eventPropertyKind(event, s.value))
    else onOpen(propertyKeysScope(s.value))
  }

  const Mark = DIMENSION_ICONS[EVENT_PROPERTY_SCOPE]

  return (
    <div>
      {/* The value stage's header: back, and the step's token. */}
      <div className="flex items-center gap-2 p-2 border-b border-neutral-800">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex items-center justify-center w-6 h-6 rounded-none text-neutral-500 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer ease-apple"
        >
          <CaretLeft className="w-3.5 h-3.5" weight="bold" />
        </button>
        <button
          type="button"
          onClick={onBack}
          className="px-2 py-1 text-xs font-medium rounded-none bg-brand-orange/10 text-brand-ink border border-brand-orange/20 hover:bg-brand-orange/15 transition-colors cursor-pointer ease-apple"
          data-property-step-token=""
        >
          {labelOf(step)}
        </button>
      </div>

      <div className="relative p-2 border-b border-neutral-800">
        <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 pointer-events-none" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setHighlight(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(moveHighlight(picked, 1, shown.length)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(moveHighlight(picked, -1, shown.length)) }
            else if (e.key === 'Enter') { e.preventDefault(); const s = shown[picked] ?? shown[0]; if (s) choose(s) }
            else if (e.key === 'Backspace' && search === '') { e.preventDefault(); onBack() }
          }}
          placeholder={event ? 'Search properties' : 'Search events'}
          aria-label={event ? 'Search properties' : 'Search events'}
          className="w-full pl-8 pr-2.5 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded-none text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-brand-orange/40 focus:border-brand-orange/40 transition-colors ease-apple"
        />
      </div>

      <div role="listbox" aria-label={event ? 'Properties' : 'Events'} className="max-h-[320px] overflow-y-auto" data-menu-list="">
        {read === null ? (
          // The value stage's loading box: one height while the read is out.
          <div className="flex min-h-[52px] items-center justify-center" aria-busy="true">
            <span className="inline-block w-4 h-4 border-2 border-neutral-600 border-t-brand-orange rounded-full animate-spin" />
          </div>
        ) : 'failed' in read ? (
          // A failed read is said, never shown as an empty list.
          <div className="px-3 py-3 text-center space-y-1.5" data-testid="property-step-failed">
            <p className="text-sm text-red-400">{event ? 'The properties of this event could not be loaded.' : 'The events could not be loaded.'}</p>
            <button
              type="button"
              onClick={() => {
                setRead(null)
                setRetryTick((t) => t + 1)
              }}
              className="text-xs font-medium text-neutral-400 hover:text-white underline underline-offset-2 transition-colors cursor-pointer ease-apple"
            >
              Retry
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="px-3 py-3 text-sm text-neutral-500 text-center">
            {query ? `Nothing matches "${search.trim()}".` : event ? 'No properties were sent with this event.' : 'There are no events in this period.'}
          </div>
        ) : (
          shown.map((s, index) => (
            <motion.button
              key={s.value}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DURATION_FAST, ease: EASE_APPLE, delay: Math.min(index * 0.015, 0.12) }}
              type="button"
              role="option"
              aria-selected={index === picked}
              onClick={() => choose(s)}
              onMouseEnter={() => setHighlight(index)}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left rounded-none transition-colors cursor-pointer ease-apple ${
                index === picked ? 'bg-white/[0.06] text-white' : 'text-neutral-300'
              }`}
              data-property-step-row={s.value}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4 ${index === picked ? 'text-neutral-300' : 'text-neutral-500'}`}>
                {event ? <Mark className="w-4 h-4" /> : getFilterValueIcon(EVENT_KIND, s.value)}
              </span>
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              {s.count != null && <span className="shrink-0 text-xs tabular-nums text-neutral-500">{formatCompactNumber(s.count)}</span>}
            </motion.button>
          ))
        )}
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input, Toggle } from '@ciphera-net/facet'
import { KitBlock, KitRow } from '@/components/settings/kit/Kit'
import { listGoals } from '@/lib/api/goals'
import { getGoalStats } from '@/lib/api/stats'
import type { SourceEvent } from '@/lib/import/core/events'
import { EVENT_MAPPING_CAPTION, eventsImportedCount } from '@/lib/import/source-display'
import type { EventMap } from '@/lib/import/types'
import {
  PROBLEM_TEXT,
  initialRows,
  mappingResult,
  resuggest,
  rowNotes,
  rowProblem,
  type MappingRow,
} from './mappingRows'

// ─── The mapping step (M12-d, owner pick A, 28-09-2026; drawn as one table since R51, option B) ────────────────
//
// One table row per source event: the tool's label and its count, the editable name in Pulse (monospace, because the
// value IS an event key, as Goals' event name field), and Facet's Toggle as the include switch. The section sits in
// the check after "Skipped", before the step's buttons, for every upload source, for Google Analytics and for Matomo
// (through their events preview).

/** The names this site already records, for W-M12-3 and the goal suggestion. */
export interface KnownEventNames {
  /** The site's goals' event names, as each goal spells it. */
  goalNames: string[]
  /** Every name Pulse already records: the goals', and the ones it measured itself. */
  known: ReadonlySet<string>
}

const EMPTY_KNOWN: KnownEventNames = { goalNames: [], known: new Set() }

/**
 * Reads the site's goals and the event names Pulse measured over the last
 * year. 🔑 Advisory only: these feed a suggestion and a note, never a rule the
 * server applies. So a failed read leaves the step working with plain slugs and
 * no "already records" line, rather than blocking an import on a hint.
 */
export function useKnownEventNames(siteId: string, enabled: boolean): KnownEventNames {
  const [known, setKnown] = useState<KnownEventNames>(EMPTY_KNOWN)
  useEffect(() => {
    if (!enabled) return
    let live = true
    const today = new Date()
    const end = today.toISOString().slice(0, 10)
    const start = new Date(today.getTime() - 365 * 86_400_000).toISOString().slice(0, 10)
    Promise.allSettled([listGoals(siteId), getGoalStats(siteId, start, end, 1000)]).then(([goals, stats]) => {
      if (!live) return
      const goalNames = goals.status === 'fulfilled' ? (goals.value ?? []).map((g) => g.event_name) : []
      const names = new Set<string>(goalNames)
      if (stats.status === 'fulfilled') for (const s of stats.value ?? []) names.add(s.event_name)
      setKnown({ goalNames, known: names })
    })
    return () => {
      live = false
    }
  }, [siteId, enabled])
  return known
}

export interface EventMappingState {
  rows: MappingRow[]
  setName: (index: number, name: string) => void
  toggle: (index: number) => void
  /** What `event_map` carries. */
  map: EventMap
  /** False while any imported row's name breaks a rule: the import button waits. */
  valid: boolean
  included: number
}

/** The rows for one plan's events. `key` resets them (a new plan, a new property). */
export function useEventMapping(
  events: readonly SourceEvent[] | null,
  source: string,
  goalNames: readonly string[],
  key: string | null,
): EventMappingState {
  const [rows, setRows] = useState<MappingRow[]>(() => (events ? initialRows(events, source, goalNames) : []))
  const lastKey = useRef(key)
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    setRows(events ? initialRows(events, source, goalNames) : [])
    // goalNames is handled by the next effect; resetting on it would drop typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, events, source])
  // The goals arrive after the first render: suggest again for rows not typed in.
  useEffect(() => {
    setRows((prev) => resuggest(prev, source, goalNames))
  }, [goalNames, source])

  const setName = useCallback((index: number, name: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, name, edited: true } : r)))
  }, [])
  const toggle = useCallback((index: number) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, included: !r.included } : r)))
  }, [])
  const result = useMemo(() => mappingResult(rows), [rows])
  return { rows, setName, toggle, ...result }
}

// The rules table's grammar (Privacy, copy deck §7.6): one column template for the header and every row, so the
// columns line up; each row is its own grid, and an `auto` column would size to each row's content. The count column
// fits "1,234,567" and the last one Facet's 44 px switch, so the switch ends on the section's right edge.
const COLUMNS = 'md:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.25fr)_3rem]'

/**
 * The Events section (R51, option B): its row with the caption and the count, then one table, Event in {tool} ·
 * Events · Name in Pulse · Import. The name is an event key, so its field reads in mono (as Goals' event name), at the
 * settings fields' height. Rows stack below `md`, so a phone never scrolls sideways.
 */
export function EventMapping({ state, known, tool }: { state: EventMappingState; known: ReadonlySet<string>; tool: string }) {
  const { rows } = state
  if (rows.length === 0) return null
  return (
    <div className="divide-y divide-border" data-testid="import-event-mapping">
      <KitRow label="Events" caption={EVENT_MAPPING_CAPTION}>
        <span className="text-sm text-muted-foreground" data-testid="import-events-count">
          {eventsImportedCount(state.included, rows.length)}
        </span>
      </KitRow>
      <KitBlock>
        <div role="table" aria-label="Events" data-import-events="table" className="w-full text-sm">
          <div role="rowgroup">
            <div role="row" className={`hidden gap-3 pb-2 text-xs text-muted-foreground md:grid ${COLUMNS}`}>
              <span role="columnheader">{`Event in ${tool}`}</span>
              <span role="columnheader" className="text-right">
                Events
              </span>
              <span role="columnheader">Name in Pulse</span>
              <span role="columnheader" className="text-right">
                Import
              </span>
            </div>
          </div>
          <div role="rowgroup" className="divide-y divide-border md:border-t md:border-border">
            {rows.map((row, i) => {
              const problem = rowProblem(row)
              const notes = rowNotes(rows, i, known)
              return (
                <div key={row.source_name} role="row" data-import-event="" className={`grid grid-cols-1 gap-3 py-3 md:items-start ${COLUMNS}`}>
                  {/* Text cells sit 12 px down and the switch 10 px, so each centres on the 44 px field's line. */}
                  <div role="cell" className="min-w-0 truncate font-medium text-foreground md:pt-3" title={row.source_name}>
                    {row.source_name}
                  </div>
                  <div role="cell" className="tabular-nums text-muted-foreground md:pt-3 md:text-right">
                    {row.count.toLocaleString('en-US')}
                    {/* Below md the column's header is hidden, so the count names its unit. */}
                    <span className="md:hidden">{row.count === 1 ? ' event' : ' events'}</span>
                  </div>
                  <div role="cell" className="min-w-0">
                    <Input
                      id={`import-event-${i}`}
                      value={row.name}
                      onChange={(e) => state.setName(i, e.target.value)}
                      disabled={!row.included}
                      spellCheck={false}
                      autoComplete="off"
                      aria-label={`Name in Pulse for ${row.source_name}`}
                      className="font-mono"
                      error={problem ? PROBLEM_TEXT[problem] : undefined}
                    />
                    {notes.map((n) => (
                      <p key={n} className="mt-1 text-xs text-muted-foreground">
                        {n}
                      </p>
                    ))}
                  </div>
                  <div role="cell" className="flex md:justify-end md:pt-2.5">
                    <Toggle checked={row.included} onChange={() => state.toggle(i)} aria-label={`Import ${row.source_name}`} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </KitBlock>
    </div>
  )
}

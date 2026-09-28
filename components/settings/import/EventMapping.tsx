'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input, Toggle } from '@ciphera-net/facet'
import { PanelRow, PanelRows } from '@/components/settings/panels'
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

// ─── The mapping step (M12-d, owner pick A, 28-09-2026) ────────────────────
//
// One settings row per source event, the grid every settings row uses
// (PanelRow): the tool's label and its count on the left, the editable name in
// Pulse in the middle (monospace, because the value IS an event key, as the
// Goals tab's Event name field), and Facet's Toggle as the include switch. The
// section sits in the confirm state after "Skipped", before the footer, for
// every upload source and for Matomo (through its events preview).

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

/** The Events section: the header row, then one row per source event. */
export function EventMapping({ state, known }: { state: EventMappingState; known: ReadonlySet<string> }) {
  const { rows } = state
  if (rows.length === 0) return null
  return (
    <div className="border-t border-border" data-testid="import-event-mapping">
      <PanelRows>
        <PanelRow label="Events" caption={EVENT_MAPPING_CAPTION}>
          <span className="text-sm text-muted-foreground" data-testid="import-events-count">
            {eventsImportedCount(state.included, rows.length)}
          </span>
        </PanelRow>
        {rows.map((row, i) => {
          const problem = rowProblem(row)
          const notes = rowNotes(rows, i, known)
          const inputId = `import-event-${i}`
          return (
            <PanelRow
              key={row.source_name}
              label={
                <span className="block truncate" title={row.source_name}>
                  {row.source_name}
                </span>
              }
              caption={<span className="tabular-nums">{`${row.count.toLocaleString('en-US')} ${row.count === 1 ? 'event' : 'events'}`}</span>}
              control={<Toggle checked={row.included} onChange={() => state.toggle(i)} aria-label={`Import ${row.source_name}`} />}
            >
              <Input
                id={inputId}
                value={row.name}
                onChange={(e) => state.setName(i, e.target.value)}
                disabled={!row.included}
                spellCheck={false}
                autoComplete="off"
                aria-label={`Name in Pulse for ${row.source_name}`}
                aria-invalid={problem !== null || undefined}
                className={`h-9 font-mono ${problem ? 'border-destructive focus:border-destructive' : ''}`}
              />
              {problem && <p className="mt-1 text-xs text-destructive">{PROBLEM_TEXT[problem]}</p>}
              {notes.map((n) => (
                <p key={n} className="mt-1 text-xs text-muted-foreground">
                  {n}
                </p>
              ))}
            </PanelRow>
          )
        })}
      </PanelRows>
    </div>
  )
}

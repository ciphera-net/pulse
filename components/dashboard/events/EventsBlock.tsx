'use client'

import { useMemo, useState } from 'react'
import { CaretRight, Target } from '@phosphor-icons/react'
import { Switcher } from '@ciphera-net/facet'
import CardEmptyState from '@/components/dashboard/CardEmptyState'
import { CardPager, useCardPage } from '@/components/dashboard/CardPager'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { DimensionInfoTip } from '@/components/dashboard/MetricInfoTip'
import { DIMENSION_ROW, ROW_NUMBER } from '@/components/dashboard/MetricRowStat'
import { SortHead, sortRows, type Sort, type SortColumn } from '@/components/dashboard/SortHead'
import { CompactNumber } from '@/components/ui/compact-number'
import type { GoalCountStat, ImportedProvenance } from '@/lib/api/stats'
import { EVENT_KIND, type DimensionFilter } from '@/lib/filters'
import { CardFooter, FRAME_CARD_BODY, FRAME_CARD_NOTE } from '@/lib/dashboard/frame'
import { EVENTS_IMPORTED_WORD, eventLabels, people, percent, splitEvents } from '@/lib/dashboard/events'
import { docsUrl } from '@/lib/docs'
import { EM_DASH } from '@/lib/utils/format'
import { COL, COL_CUE, COL_RATE, GAP, LABEL_BOX, LIMIT, NARROW_OFF } from './columns'
import { EventProperties, PaneLine } from './EventProperties'

// ---------------------------------------------------------------------------
// The Events block of the new dashboard frame (design Pulse/docs/plans/14-11-2026-dashboard-overhaul-2-plan.md
// §10t and §10ad; rulings R34, R37, R41 and R51). It runs across both columns and holds TWO panes, drawn inside the
// block's card (../ContentSignals.tsx holds the card's root for both arrangements of the page, which the tour finds
// the block by):
//
//   left   the events as a list: who did it (visitors), how often (events), and its conversion, the share of the
//          range's visitors who did it. Two tabs: the site's own events, and the automatic ones under names of
//          their own (outbound clicks, downloads, missing pages, the interactions script's clicks and copies). A
//          goal is an event with a name of its own, so it is a row of the same list under that name (R37).
//   right  the picked event's properties (./EventProperties.tsx). The picked event is the one pressed while it is
//          on the page, else the page's first, so the pane always belongs to a row on screen. It opens INSIDE the
//          block (R34): nothing opens, floats or changes size.
//
// Made consistent with the other blocks (R41): a name is white at the text's normal weight, a number is the blocks'
// grey number, the picked row is marked by its lit bar and a neutral tint. Every row ends with the date button's
// caret, orange on the event shown in the pane, so a row reads as something to press (R51). The column names sort
// the list, high to low and low to high (./SortHead in components/dashboard).
//
// Every number is one the server already sends: `goal_counts` carries `visitors` beside `count`, and the range's
// visitors arrive as the block's `totals`, filtered as its rows are, so a conversion is a division inside one answer.
// Off on a customer's share link (`memberFeatures`): the property reads are not served there, so the block is the
// list alone, with nothing to press.
//
// A PRESS FILTERS once an event can filter the page (R62 of 16-11-2026, option B1 of the Events rows round): with the
// event-filters beta on (`onFilter`), a press on a row filters the page by its event, as a press on a Pages or
// Referrers row filters by its page or source, and the caret at the row's end is a button of its own (a 24 px box)
// that opens the event's properties. Without the beta the press opens the properties, as before.
// ---------------------------------------------------------------------------

type Tab = 'own' | 'automatic'
type ListKey = 'visitors' | 'events' | 'conversion'

const LIST_COLUMNS: SortColumn<ListKey>[] = [
  { key: 'visitors', label: 'visitors', className: COL },
  // `sm:inline-flex`, never NARROW_OFF's `sm:block`: a block among inline-flex names sits 8 px lower.
  { key: 'events', label: 'events', className: `${COL} hidden sm:inline-flex` },
  { key: 'conversion', label: 'conversion', className: COL_RATE },
]

/** What the list sorts a row by. Conversion is visitors over the range's visitors, so it orders as visitors do. */
const listValue = (row: GoalCountStat, key: ListKey) => (key === 'events' ? row.count : people(row))

export interface EventsBlockProps {
  goalCounts: GoalCountStat[]
  /** The goal counts' imported-history provenance (M12-f), server-said: the block's footer says when imported days are in. */
  goalsImported?: ImportedProvenance | null
  siteId: string
  dateRange: { start: string; end: string }
  /** The page's period token, for the pane's reads (All time travels as `all`). */
  period?: string
  /** Realtime mode's rolling window in minutes: the pane's reads use it instead of the dates. */
  liveMinutes?: number
  /** The range's true totals, filtered as the rows are: a conversion is an event's visitors over these visitors. */
  totals?: { pageviews: number; visitors: number }
  /** Off on a customer's share link: the property reads are not served there, so the block is the list alone. */
  memberFeatures?: boolean
  /** The page's filters. The rows already follow them; the pane's own reads send them too. */
  filters?: string
  /**
   * The event-filters beta (R45): a press on a row filters the page by its event, the row's caret opens its
   * properties (R62), and a press on one of the pane's values filters the page by it.
   */
  onFilter?: (filter: DimensionFilter) => void
}

export default function EventsBlock({ goalCounts, goalsImported, siteId, dateRange, period, liveMinutes, totals, memberFeatures = true, filters, onFilter }: EventsBlockProps) {
  // What the list and its picked event describe: one window under one set of filters.
  const windowKey = `${liveMinutes != null ? `live:${liveMinutes}` : `${dateRange.start}|${dateRange.end}`}|${filters ?? ''}`
  const [tab, setTab] = useState<Tab>('own')
  const { own, automatic } = useMemo(() => splitEvents(goalCounts ?? []), [goalCounts])
  const tabRows = tab === 'own' ? own : automatic
  const labels = useMemo(() => eventLabels(tabRows), [tabRows])
  const [sort, setSort] = useState<Sort<ListKey>>({ key: 'visitors', dir: 'desc' })
  const all = sortRows(tabRows, sort, listValue)
  const pageCount = Math.max(1, Math.ceil(all.length / LIMIT))
  const [page, setPage] = useCardPage(`${tab}|${windowKey}|${sort.key}:${sort.dir}`, pageCount)
  const list = all.slice((page - 1) * LIMIT, page * LIMIT)
  // Against the whole list's largest, so a bar means the same on every page and in either order.
  const max = all.reduce((m, row) => Math.max(m, people(row)), 0)
  const rangeVisitors = totals?.visitors ?? null

  const [pressed, setPressed] = useState<string | null>(null)
  const picked = memberFeatures ? (list.find((row) => row.event_name === pressed) ?? list[0] ?? null) : null
  // Below `lg` the block is one column, and the picked event's pane takes the list's place until "back".
  const [pane, setPane] = useState<'list' | 'detail'>('list')
  const pick = (event: string) => {
    setPressed(event)
    setPane('detail')
  }
  const nameOf = (row: GoalCountStat) => labels.get(row.event_name) ?? row.event_name

  // Two equal columns (16-11-2026): the divider, the properties pane's left border, falls on the block's centre,
  // under the gap between the two half-width blocks above it. It was split 1.15 to 1, off that line.
  return (
    <div className={`grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] ${memberFeatures ? 'lg:grid-cols-2' : ''}`} data-events-block="">
      <section className={`${pane === 'detail' && picked ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col ${memberFeatures ? 'lg:pr-5' : ''}`} data-events-pane="list">
        <div className="mb-4 flex items-center justify-between">
          <div className="min-w-0 overflow-x-auto scrollbar-hide pb-1">
            <Switcher
              size="sm"
              tone="solid"
              aria-label="Events view"
              options={[{ value: 'own', label: 'Your events' }, { value: 'automatic', label: 'Automatic' }]}
              value={tab}
              onChange={(v) => {
                setTab(v as Tab)
                setPressed(null)
              }}
            />
          </div>
          <DimensionInfoTip tab="events" className="ms-2 me-auto" />
          {all.length > 0 && (
            <span className={`inline-flex shrink-0 ${GAP}`}>
              <SortHead columns={LIST_COLUMNS} sort={sort} onSort={setSort} className={GAP} />
              {memberFeatures && <span className={COL_CUE} aria-hidden="true" />}
            </span>
          )}
        </div>

        <div className={FRAME_CARD_BODY}>
          {all.length === 0 ? (
            tab === 'own' ? (
              <CardEmptyState
                live={liveMinutes != null}
                icon={<Target />}
                kind="events"
                fresh="Events your site sends are counted here."
                docs={{ label: 'How to send events', href: docsUrl('custom-events'), whenFresh: true }}
              />
            ) : (
              <CardEmptyState
                live={liveMinutes != null}
                icon={<Target />}
                kind="automatic events"
                fresh="Outbound clicks, downloads and missing pages are counted here."
              />
            )
          ) : (
            <CascadeGroup flipKey={`${tab}-${page}`} className="space-y-2">
              {list.map((row, i) => {
                const name = nameOf(row)
                const on = picked?.event_name === row.event_name
                const did = people(row)
                // R62: with the event filter, a press filters by the event and the caret opens its properties.
                const pressFilters = memberFeatures && !!onFilter
                const filter = () => onFilter?.({ dimension: EVENT_KIND, operator: 'is', values: [row.event_name] })
                const press = pressFilters ? filter : memberFeatures ? () => pick(row.event_name) : undefined
                return (
                  <CascadeRow key={row.event_name} index={i}>
                    <div
                      className={memberFeatures ? `interactive-row ${DIMENSION_ROW} cursor-pointer${on ? ' bg-white/[0.04]' : ''}` : DIMENSION_ROW}
                      data-event={row.event_name}
                      data-picked={on ? '' : undefined}
                    >
                      {memberFeatures && (
                        // The row holds numbers that open their own exact count, so it cannot be one button: the
                        // press is an overlay, and each number takes the pointer back for its own box.
                        <button
                          type="button"
                          aria-pressed={pressFilters ? undefined : on}
                          aria-label={pressFilters ? `Filter by event: ${name}` : `Show the properties of ${name}`}
                          onClick={press}
                          data-row-press={pressFilters ? 'filter' : 'open'}
                          className="absolute inset-0 h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
                        />
                      )}
                      <div className={LABEL_BOX}>
                        <RowBar width={max > 0 ? (did / max) * 100 : 0} index={i} className={on ? 'bg-brand-orange/[0.26]' : undefined} />
                        {/* The blocks' own row name: white, at the text's normal weight. */}
                        <span className="relative truncate text-sm text-white">{name}</span>
                      </div>
                      <div className={`pointer-events-none relative ml-4 flex items-center ${GAP}`}>
                        <CompactNumber value={did} className={`${ROW_NUMBER} ${COL} pointer-events-auto`} onClick={press} />
                        <CompactNumber value={row.count} className={`${ROW_NUMBER} ${COL} ${NARROW_OFF} pointer-events-auto`} onClick={press} />
                        {/* A number like every other number of the blocks. */}
                        <span className={`${COL_RATE} ${ROW_NUMBER} tabular-nums`} data-conversion="">
                          {(rangeVisitors != null ? percent(did, rangeVisitors) : null) ?? EM_DASH}
                        </span>
                        {memberFeatures && (pressFilters ? (
                          // R62: the caret is a button of its own (its own 24 px box), and opens the properties; orange
                          // on the event the pane shows.
                          <span className={`${COL_CUE} flex justify-end`} data-cue="">
                            <button
                              type="button"
                              onClick={() => pick(row.event_name)}
                              aria-label={`Show the properties of ${name}`}
                              aria-pressed={on}
                              className="pointer-events-auto -my-1 -me-1.5 flex h-6 w-6 items-center justify-center text-neutral-500 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-orange"
                              data-row-open=""
                            >
                              <CaretRight
                                weight="bold"
                                className={`h-3 w-3 transition-colors duration-fast ease-apple ${on ? 'text-brand-ink' : ''}`}
                                aria-hidden="true"
                              />
                            </button>
                          </span>
                        ) : (
                          // The press cue: the date button's caret says a press opens something; orange on the
                          // picked row (colour in a small mark, never in a panel).
                          <span className={`${COL_CUE} flex justify-end`} data-cue="">
                            <CaretRight
                              weight="bold"
                              className={`h-3 w-3 transition-colors duration-fast ease-apple ${on ? 'text-brand-ink' : 'text-neutral-600 group-hover:text-neutral-300'}`}
                              aria-hidden="true"
                            />
                          </span>
                        ))}
                      </div>
                    </div>
                  </CascadeRow>
                )
              })}
              {Array.from({ length: Math.max(0, LIMIT - list.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="-mx-2 h-9 px-2" aria-hidden="true" />
              ))}
            </CascadeGroup>
          )}
        </div>

        <CardFooter>
          {goalsImported?.included === true && (
            <span className={FRAME_CARD_NOTE} data-testid="events-imported-word">
              {EVENTS_IMPORTED_WORD}
            </span>
          )}
          <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label="events" />
        </CardFooter>
      </section>

      {memberFeatures && (
        <section
          className={`${pane === 'detail' && picked ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col lg:border-l lg:border-white/[0.08] lg:pl-5`}
          data-events-pane="properties"
        >
          {picked ? (
            <EventProperties
              key={picked.event_name}
              siteId={siteId}
              row={picked}
              name={nameOf(picked)}
              windowKey={windowKey}
              dateRange={dateRange}
              period={period}
              liveMinutes={liveMinutes}
              filters={filters}
              onBack={() => setPane('list')}
              onFilter={onFilter}
            />
          ) : (
            <PaneLine>An event&apos;s properties show here.</PaneLine>
          )}
        </section>
      )}
    </div>
  )
}

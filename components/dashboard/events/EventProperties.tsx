'use client'

import { useMemo, useState } from 'react'
import { CaretLeft, Tag } from '@phosphor-icons/react'
import { Switcher } from '@ciphera-net/facet'
import { CardPager, useCardPage } from '@/components/dashboard/CardPager'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { DestinationIcon } from '@/components/dashboard/DestinationIcon'
import { DIMENSION_ROW, ROW_NUMBER } from '@/components/dashboard/MetricRowStat'
import { SortHead, sortRows, type Sort, type SortColumn } from '@/components/dashboard/SortHead'
import { SkeletonLine } from '@/components/skeleton/primitives'
import { CompactNumber } from '@/components/ui/compact-number'
import { EmptyState } from '@/components/ui/EmptyState'
import type { GoalCountStat } from '@/lib/api/stats'
import { eventPropertyKind, type DimensionFilter } from '@/lib/filters'
import { CardFooter, FRAME_CARD_BODY } from '@/lib/dashboard/frame'
import { orderKeys, percent, propertyName, propertyValueRows, type PropertyValueRow } from '@/lib/dashboard/events'
import { useEventPropertyKeys, useEventPropertyValues } from '@/lib/swr/dashboard'
import { EM_DASH } from '@/lib/utils/format'
import { COL, COL_SHARE, GAP, LABEL_BOX, LIMIT } from './columns'

// ---------------------------------------------------------------------------
// The Events block's right pane: the picked event's properties (components/dashboard/events/EventsBlock.tsx).
//
// Its keys are tabs, ONE property at a time, in the orange every block's tabs have (R41). Each value carries its
// events and its share of the events that carry the property, seven to a page with the blocks' pager; both
// columns sort, high to low and low to high (R41, R51). The reads follow the page's filters, so under a filter the
// values add up to the count the event's row shows. Under the event-filters beta (R45) a value is a filter: a press
// keeps the visitors who did this event with this value that day, the Pages rows' device (an overlay button).
// ---------------------------------------------------------------------------

/** The values one read asks for: the pane pages through them seven at a time. */
const VALUE_LIMIT = 100

type ValueKey = 'events' | 'share'
const VALUE_COLUMNS: SortColumn<ValueKey>[] = [
  { key: 'events', label: 'Events', className: COL },
  { key: 'share', label: 'Share', className: COL_SHARE },
]

/** One quiet line in the middle of a pane: nothing to show, and why. */
export function PaneLine({ children }: { children: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className="text-sm text-neutral-500">{children}</p>
    </div>
  )
}

/** The rows' place while a read is out: seven rows of the blocks' own height, so nothing moves when they land. */
function SkeletonRows() {
  return (
    <div className="space-y-2" aria-busy="true" data-testid="event-properties-loading">
      {[76, 62, 51, 43, 34, 27, 19].map((width) => (
        <div key={width} className="flex h-9 items-center justify-between gap-4">
          <SkeletonLine className="h-8" style={{ width: `${width}%` }} />
          <SkeletonLine className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** A value's text, and its destination's icon where it is a link. Both sit above the row's bar. */
function ValueLabel({ row }: { row: PropertyValueRow }) {
  const [failed, setFailed] = useState(false)
  return (
    <>
      {row.host !== null && (
        <span className="relative flex shrink-0">
          <DestinationIcon host={row.host} failed={failed} onFail={() => setFailed(true)} />
        </span>
      )}
      <span className="relative truncate" title={row.value}>{row.label}</span>
    </>
  )
}

interface EventPropertiesProps {
  siteId: string
  row: GoalCountStat
  /** The event's name as its row reads it. */
  name: string
  /** What the list describes: one window under one set of filters. The pager starts again when it changes. */
  windowKey: string
  dateRange: { start: string; end: string }
  /** The page's period token: All time travels as `all`, which a history past 366 days needs (its dates are refused). */
  period?: string
  liveMinutes?: number
  filters?: string
  /** Below `lg` the pane takes the list's place: back to the list. */
  onBack: () => void
  /**
   * The event-filters beta (R45; design 15-11-2026-event-and-outbound-link-filter-design.md, section 8: "a property
   * value by its value"): a press on a value filters the page by it, every stored value a merged row stands for.
   * Without it the rows are not controls.
   */
  onFilter?: (filter: DimensionFilter) => void
}

export function EventProperties({ siteId, row, name, windowKey, dateRange, period, liveMinutes, filters, onBack, onFilter }: EventPropertiesProps) {
  const event = row.event_name
  // Imported days carry no properties (an export has none), and the server says which rows those are.
  const readable = row.instrument !== 'imported'
  const { data: rawKeys, error: keysError } = useEventPropertyKeys(siteId, readable ? event : null, dateRange.start, dateRange.end, filters, liveMinutes, period)
  const keys = useMemo(() => (rawKeys ? orderKeys(event, rawKeys) : rawKeys), [event, rawKeys])
  const [chosen, setChosen] = useState<string | null>(null)
  // The pressed tab while the event still carries that property, else its first.
  const activeKey = keys?.find((k) => k.key === chosen)?.key ?? keys?.[0]?.key ?? null
  const { data: values, error: valuesError } = useEventPropertyValues(siteId, event, activeKey, dateRange.start, dateRange.end, VALUE_LIMIT, filters, liveMinutes, period)
  const rows = useMemo(() => (values ? propertyValueRows(values) : undefined), [values])
  // A share is of the events that carry this property, which is what the values add up to.
  const carrying = keys?.find((k) => k.key === activeKey)?.count ?? row.count
  // Events and share order alike (a share is its events over one total); each is a column on screen, so each sorts.
  const [sort, setSort] = useState<Sort<ValueKey>>({ key: 'events', dir: 'desc' })
  const ordered = rows ? sortRows(rows, sort, (value) => value.count) : undefined
  const pageCount = Math.max(1, Math.ceil((ordered?.length ?? 0) / LIMIT))
  const [page, setPage] = useCardPage(`${event}|${activeKey ?? ''}|${windowKey}|${sort.key}:${sort.dir}`, pageCount)
  const shown = ordered?.slice((page - 1) * LIMIT, page * LIMIT) ?? []
  // Against the largest of all, whatever the order: low to high puts the smallest first.
  const max = rows ? rows.reduce((m, value) => Math.max(m, value.count), 0) : 0
  // Under the event-filters beta a value filters the page: the visitors who did this event with it that day.
  const filterBy = onFilter && activeKey
    ? (value: PropertyValueRow) => onFilter({ dimension: eventPropertyKind(event, activeKey), operator: 'is', values: value.values })
    : null

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the events"
          className="-ms-1 mb-1 inline-flex h-[34px] shrink-0 items-center text-neutral-500 hover:text-white lg:hidden"
        >
          <CaretLeft className="h-4 w-4" weight="bold" aria-hidden="true" />
        </button>
        <h3 className="mb-1 flex h-[34px] min-w-0 max-w-[46%] shrink-0 items-center text-sm font-medium text-white" title={name} data-event-title="">
          <span className="truncate">{name}</span>
        </h3>
        {keys && activeKey && (
          <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide pb-1">
            <Switcher
              size="sm"
              // Orange, as every block's tabs are (R41).
              tone="solid"
              aria-label={`Properties of ${name}`}
              options={keys.map((k) => ({ value: k.key, label: propertyName(event, k.key) }))}
              value={activeKey}
              onChange={setChosen}
            />
          </div>
        )}
        {keys && keys.length > 0 && <SortHead columns={VALUE_COLUMNS} sort={sort} onSort={setSort} className={`${GAP} ms-auto`} />}
      </div>

      <div className={FRAME_CARD_BODY}>
        {!readable ? (
          // An empty pane is Pulse's one empty state (R57); the prompt and the error stay quiet lines.
          <EmptyState icon={<Tag />} title="Imported days carry no properties" className="h-full py-6" />
        ) : keysError || valuesError ? (
          <PaneLine>The properties of this event could not be loaded. Reload the page to try again.</PaneLine>
        ) : !keys ? (
          <SkeletonRows />
        ) : keys.length === 0 ? (
          <EmptyState icon={<Tag />} title="No properties were sent with this event" className="h-full py-6" />
        ) : !rows ? (
          <SkeletonRows />
        ) : (
          <CascadeGroup flipKey={`${event}-${activeKey}-${page}`} className="space-y-2">
            {shown.map((value, i) => (
              <CascadeRow key={value.value} index={i}>
                <div className={filterBy ? `interactive-row ${DIMENSION_ROW} cursor-pointer` : DIMENSION_ROW} data-event-value="">
                  {filterBy && activeKey && (
                    // The Pages rows' device: the press is an overlay, and the number takes the pointer back for its
                    // exact count and hands the press on.
                    <button
                      type="button"
                      aria-label={`Filter by ${name}: ${propertyName(event, activeKey)} is ${value.label}`}
                      onClick={() => filterBy(value)}
                      className="absolute inset-0 h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
                      data-testid="event-value-filter"
                    />
                  )}
                  <div className={`${LABEL_BOX} gap-3 text-sm text-white`}>
                    {/* A row that is not a control keeps its bar under the pointer; a filter's deepens, as every row's does. */}
                    <RowBar width={max > 0 ? (value.count / max) * 100 : 0} index={i} className={filterBy ? undefined : 'md:group-hover:bg-brand-orange/[0.16]'} />
                    <ValueLabel row={value} />
                  </div>
                  <div className={`relative ml-4 flex items-center ${GAP}${filterBy ? ' pointer-events-none' : ''}`}>
                    <CompactNumber
                      value={value.count}
                      className={`${ROW_NUMBER} ${COL}${filterBy ? ' pointer-events-auto' : ''}`}
                      onClick={filterBy ? () => filterBy(value) : undefined}
                    />
                    <span className={`${ROW_NUMBER} ${COL_SHARE} tabular-nums`}>{percent(value.count, carrying) ?? EM_DASH}</span>
                  </div>
                </div>
              </CascadeRow>
            ))}
            {Array.from({ length: Math.max(0, LIMIT - shown.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="-mx-2 h-9 px-2" aria-hidden="true" />
            ))}
          </CascadeGroup>
        )}
      </div>

      <CardFooter>
        <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label="values" />
      </CardFooter>
    </>
  )
}

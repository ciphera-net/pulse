'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQueryParamsWriter } from '@/lib/hooks/useQueryParamsWriter'
import { motion, AnimatePresence } from 'framer-motion'
import { CaretDown, MagnifyingGlass, FileText, GlobeHemisphereWest, Monitor, CalendarBlank, Target } from '@phosphor-icons/react'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useGSCTopQueries, useGSCTopPages, useGSCDailyTotals } from '@/lib/swr/dashboard'
import { Segmented, type SegmentedOption } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/EmptyState'
import { NewQueriesChip } from './NewQueriesChip'
import { QueryExpansion, PageExpansion } from './SearchExpansion'
import { CountriesView, DevicesView, OpportunitiesView } from './SearchSimpleViews'
import {
  RowBar,
  StandardMetrics,
  StandardHeader,
  Pagination,
  ViewBody,
  stripProtocol,
  parseSort,
  serializeSort,
  sortRows,
  SortHorizonNote,
  SORT_FETCH,
  type SortCol,
  type SortState,
} from './rowPrimitives'

// ---------------------------------------------------------------------------
// Six views, one table system. Queries · Pages · Countries · Devices · Days ·
// Opportunities behind a single Segmented control, URL-synced (?view=/?p=/
// ?expand=/?s=). Queries/Pages rows expand (aria-expanded, Enter/Space, ↑/↓,
// focus ring); each expanded row's drill-down is SWR-keyed on its own key so
// the old shared-state race is gone. ?p= and ?expand= drop on any range or
// view change; ?s= (column sort) survives view switches since every view
// shares the metric columns.
//
// Sorting is client-side over the top SORT_FETCH rows (the API caps limit at
// 200 and only orders by clicks) — an active sort switches the fetch to one
// 200-row page and paginates the sorted slice locally.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50

const VIEWS = ['queries', 'pages', 'countries', 'devices', 'days', 'opportunities'] as const
type View = (typeof VIEWS)[number]

const VIEW_OPTIONS: SegmentedOption<View>[] = [
  { value: 'queries', label: 'Queries', icon: <MagnifyingGlass className="h-4 w-4" /> },
  { value: 'pages', label: 'Pages', icon: <FileText className="h-4 w-4" /> },
  { value: 'countries', label: 'Countries', icon: <GlobeHemisphereWest className="h-4 w-4" /> },
  { value: 'devices', label: 'Devices', icon: <Monitor className="h-4 w-4" /> },
  { value: 'days', label: 'Days', icon: <CalendarBlank className="h-4 w-4" /> },
  { value: 'opportunities', label: 'Opportunities', icon: <Target className="h-4 w-4" /> },
]

function parseView(raw: string | null): View {
  return VIEWS.includes(raw as View) ? (raw as View) : 'queries'
}

function parsePageIndex(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

interface RangeProps {
  siteId: string
  dateRange: { start: string; end: string }
}
export interface SortProps {
  sort: SortState | null
  onSort: (col: SortCol) => void
}
interface ExpandableProps extends RangeProps, SortProps {
  page: number
  setPage: (p: number) => void
  expand: string | null
  toggleExpand: (key: string) => void
}

// ─── Expandable rows (Queries / Pages) ───────────────────────────

interface ExpRow {
  key: string
  label: string
  title: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

function ExpandableRows({
  rows,
  expand,
  toggleExpand,
  renderExpansion,
}: {
  rows: ExpRow[]
  expand: string | null
  toggleExpand: (key: string) => void
  renderExpansion: (row: ExpRow) => React.ReactNode
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const maxImpr = Math.max(...rows.map((r) => r.impressions), 0)

  // ↑/↓ move focus between row buttons; the native <button> handles Enter/Space.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const idxRaw = (e.target as HTMLElement).dataset?.rowIndex
    if (idxRaw === undefined) return
    e.preventDefault()
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-row-index]')
    if (!buttons || buttons.length === 0) return
    let idx = Number.parseInt(idxRaw, 10) + (e.key === 'ArrowDown' ? 1 : -1)
    idx = Math.max(0, Math.min(buttons.length - 1, idx))
    buttons[idx]?.focus()
  }

  return (
    <div ref={listRef} onKeyDown={onKeyDown}>
      {rows.map((row, i) => {
        const isExpanded = expand === row.key
        return (
          <div key={row.key} className="border-b border-border/60 last:border-b-0">
            <button
              type="button"
              data-row-index={i}
              aria-expanded={isExpanded}
              onClick={() => toggleExpand(row.key)}
              className="relative flex h-9 w-full items-center px-3 text-left transition-colors duration-fast ease-apple hover:bg-neutral-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
            >
              <RowBar share={maxImpr > 0 ? row.impressions / maxImpr : 0} />
              <CaretDown
                className={cn(
                  'relative mr-2 h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform duration-fast ease-apple',
                  isExpanded ? 'rotate-0' : '-rotate-90',
                )}
              />
              <span className="relative min-w-0 flex-1 truncate text-sm text-white" title={row.title}>
                {row.label}
              </span>
              <StandardMetrics clicks={row.clicks} impressions={row.impressions} ctr={row.ctr} position={row.position} />
            </button>
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  key="exp"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
                  className="overflow-hidden"
                >
                  {renderExpansion(row)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

function QueriesView({ siteId, dateRange, page, setPage, expand, toggleExpand, sort, onSort }: ExpandableProps) {
  const sorted = sort != null
  const { data, error, isLoading, mutate } = useGSCTopQueries(
    siteId, dateRange.start, dateRange.end,
    sorted ? SORT_FETCH : PAGE_SIZE,
    sorted ? 0 : page * PAGE_SIZE,
  )
  const allRows: ExpRow[] = (data?.queries ?? []).map((r) => ({
    key: r.query, label: r.query, title: r.query, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
  }))
  const rows = sorted ? sortRows(allRows, sort).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : allRows
  const total = data?.total ?? 0
  return (
    <>
      <StandardHeader label="Query" sort={sort} onSort={onSort} />
      <ViewBody
        isLoading={isLoading}
        hasData={!!data}
        error={error}
        isEmpty={rows.length === 0}
        emptyNode={<EmptyState icon={<MagnifyingGlass />} title="No queries in this period" description="Try a wider date range once Search Console has synced more data." className="py-10" />}
        footer={
          <>
            {sorted && <SortHorizonNote total={total} label="queries" />}
            <Pagination page={page} pageSize={PAGE_SIZE} total={sorted ? Math.min(total, SORT_FETCH) : total} onPage={setPage} />
          </>
        }
        onRetry={() => { void mutate() }}
      >
        <ExpandableRows
          rows={rows}
          expand={expand}
          toggleExpand={toggleExpand}
          renderExpansion={(row) => <QueryExpansion siteId={siteId} start={dateRange.start} end={dateRange.end} query={row.key} />}
        />
      </ViewBody>
    </>
  )
}

function PagesView({ siteId, dateRange, page, setPage, expand, toggleExpand, sort, onSort }: ExpandableProps) {
  const sorted = sort != null
  const { data, error, isLoading, mutate } = useGSCTopPages(
    siteId, dateRange.start, dateRange.end,
    sorted ? SORT_FETCH : PAGE_SIZE,
    sorted ? 0 : page * PAGE_SIZE,
  )
  const allRows: ExpRow[] = (data?.pages ?? []).map((r) => ({
    key: r.page, label: stripProtocol(r.page), title: stripProtocol(r.page), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
  }))
  const rows = sorted ? sortRows(allRows, sort).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : allRows
  const total = data?.total ?? 0
  return (
    <>
      <StandardHeader label="Page" sort={sort} onSort={onSort} />
      <ViewBody
        isLoading={isLoading}
        hasData={!!data}
        error={error}
        isEmpty={rows.length === 0}
        emptyNode={<EmptyState icon={<FileText />} title="No pages in this period" description="Try a wider date range once Search Console has synced more data." className="py-10" />}
        footer={
          <>
            {sorted && <SortHorizonNote total={total} label="pages" />}
            <Pagination page={page} pageSize={PAGE_SIZE} total={sorted ? Math.min(total, SORT_FETCH) : total} onPage={setPage} />
          </>
        }
        onRetry={() => { void mutate() }}
      >
        <ExpandableRows
          rows={rows}
          expand={expand}
          toggleExpand={toggleExpand}
          renderExpansion={(row) => <PageExpansion siteId={siteId} start={dateRange.start} end={dateRange.end} page={row.key} />}
        />
      </ViewBody>
    </>
  )
}

// ─── Days (the per-date dimension — GSC's "Dates" table) ─────────

interface DaysProps extends RangeProps, SortProps {
  page: number
  setPage: (p: number) => void
}

function DaysView({ siteId, dateRange, page, setPage, sort, onSort }: DaysProps) {
  const { data, error, isLoading, mutate } = useGSCDailyTotals(siteId, dateRange.start, dateRange.end)

  const rows = useMemo(() => {
    // * Normalize at the boundary: CTR derives exactly from the two count
    // * fields (immune to an older backend that omits it — undefined would
    // * render NaN%), and a missing position becomes an explicit null.
    const daily = (data?.daily_totals ?? []).map((r) => ({
      ...r,
      ctr: r.impressions > 0 ? r.clicks / r.impressions : 0,
      position: r.position ?? null,
    }))
    // * Default order: most recent day first, like Search Console's own table.
    const base = [...daily].reverse()
    return sortRows(base, sort)
  }, [data, sort])

  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const maxImpr = Math.max(...rows.map((r) => r.impressions), 0)

  return (
    <>
      <StandardHeader label="Date" sort={sort} onSort={onSort} />
      <ViewBody
        isLoading={isLoading}
        hasData={!!data}
        error={error}
        isEmpty={rows.length === 0}
        emptyNode={<EmptyState icon={<CalendarBlank />} title="No days in this period" description="Google reports Search data with a ~2-day delay — try a wider range." className="py-10" />}
        footer={<Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />}
        onRetry={() => { void mutate() }}
      >
        {pageRows.map((row) => {
          const label = new Date(row.date + 'T00:00:00').toLocaleDateString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short',
          })
          return (
            <div
              key={row.date}
              className="relative flex h-9 items-center px-3 transition-colors duration-fast ease-apple hover:bg-neutral-800/60"
            >
              <RowBar share={maxImpr > 0 ? row.impressions / maxImpr : 0} />
              <span className="relative min-w-0 flex-1 truncate text-sm text-white" title={row.date}>
                {label}
              </span>
              <StandardMetrics clicks={row.clicks} impressions={row.impressions} ctr={row.ctr} position={row.position} />
            </div>
          )
        })}
      </ViewBody>
    </>
  )
}

// ─── Orchestrator ────────────────────────────────────────────────

export default function SearchViews({ siteId, dateRange }: RangeProps) {
  const searchParams = useSearchParams()
  // * Shared writer — ?view=/?p=/?expand=/?s= must not clobber the page's
  // * ?period=/?g= or the panel's ?m= when two writes race one router commit.
  const updateParams = useQueryParamsWriter()

  const view = parseView(searchParams.get('view'))
  const page = parsePageIndex(searchParams.get('p'))
  // URLSearchParams decodes on read and encodes on write, so this is the raw
  // query/page string — compared directly against a row's key.
  const expand = searchParams.get('expand')
  const sort = parseSort(searchParams.get('s'))

  const setView = useCallback((v: View) => updateParams({ view: v === 'queries' ? null : v, p: null, expand: null }), [updateParams])
  const setPage = useCallback((p: number) => updateParams({ p: p <= 0 ? null : String(p) }), [updateParams])
  const toggleExpand = useCallback((key: string) => updateParams({ expand: expand === key ? null : key }), [updateParams, expand])
  const pickNewQuery = useCallback((query: string) => updateParams({ view: null, expand: query, p: null }), [updateParams])

  // * Header click cycles a column: desc → asc → off; a different column
  // * starts fresh at desc. Sorting re-ranks the whole fetch, so ?p= resets.
  const onSort = useCallback(
    (col: SortCol) => {
      let next: SortState | null
      if (sort?.col !== col) next = { col, dir: 'desc' }
      else if (sort.dir === 'desc') next = { col, dir: 'asc' }
      else next = null
      updateParams({ s: serializeSort(next), p: null })
    },
    [sort, updateParams],
  )

  // The range is owned by the page's useUrlDateRange and preserves other params
  // on change, so drop ?p= / ?expand= here when the range actually changes.
  const rangeKey = `${dateRange.start}:${dateRange.end}`
  const prevRangeKey = useRef(rangeKey)
  useEffect(() => {
    if (prevRangeKey.current === rangeKey) return
    prevRangeKey.current = rangeKey
    if (searchParams.has('p') || searchParams.has('expand')) updateParams({ p: null, expand: null })
  }, [rangeKey, searchParams, updateParams])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto">
          <Segmented ariaLabel="Search view" value={view} onChange={setView} options={VIEW_OPTIONS} />
        </div>
        <NewQueriesChip siteId={siteId} start={dateRange.start} end={dateRange.end} onPick={pickNewQuery} />
      </div>

      <div className="overflow-hidden rounded-none border border-border bg-card">
        {view === 'queries' && <QueriesView siteId={siteId} dateRange={dateRange} page={page} setPage={setPage} expand={expand} toggleExpand={toggleExpand} sort={sort} onSort={onSort} />}
        {view === 'pages' && <PagesView siteId={siteId} dateRange={dateRange} page={page} setPage={setPage} expand={expand} toggleExpand={toggleExpand} sort={sort} onSort={onSort} />}
        {view === 'countries' && <CountriesView siteId={siteId} dateRange={dateRange} page={page} setPage={setPage} sort={sort} onSort={onSort} />}
        {view === 'devices' && <DevicesView siteId={siteId} dateRange={dateRange} sort={sort} onSort={onSort} />}
        {view === 'days' && <DaysView siteId={siteId} dateRange={dateRange} page={page} setPage={setPage} sort={sort} onSort={onSort} />}
        {view === 'opportunities' && <OpportunitiesView siteId={siteId} dateRange={dateRange} />}
      </div>
    </div>
  )
}

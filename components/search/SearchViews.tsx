'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CaretDown, MagnifyingGlass, FileText, GlobeHemisphereWest, Monitor, Target } from '@phosphor-icons/react'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useGSCTopQueries, useGSCTopPages } from '@/lib/swr/dashboard'
import { Segmented, type SegmentedOption } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/EmptyState'
import { NewQueriesChip } from './NewQueriesChip'
import { QueryExpansion, PageExpansion } from './SearchExpansion'
import { CountriesView, DevicesView, OpportunitiesView } from './SearchSimpleViews'
import { RowBar, StandardMetrics, StandardHeader, Pagination, ViewBody, stripProtocol } from './rowPrimitives'

// ---------------------------------------------------------------------------
// Five views, one table system. Queries · Pages · Countries · Devices ·
// Opportunities behind a single Segmented control, URL-synced (?view=/?p=/
// ?expand=). Queries/Pages rows expand (aria-expanded, Enter/Space, ↑/↓, focus
// ring); each expanded row's drill-down is SWR-keyed on its own key so the old
// shared-state race is gone. ?p= and ?expand= drop on any range or view change.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50

const VIEWS = ['queries', 'pages', 'countries', 'devices', 'opportunities'] as const
type View = (typeof VIEWS)[number]

const VIEW_OPTIONS: SegmentedOption<View>[] = [
  { value: 'queries', label: 'Queries', icon: <MagnifyingGlass className="h-4 w-4" /> },
  { value: 'pages', label: 'Pages', icon: <FileText className="h-4 w-4" /> },
  { value: 'countries', label: 'Countries', icon: <GlobeHemisphereWest className="h-4 w-4" /> },
  { value: 'devices', label: 'Devices', icon: <Monitor className="h-4 w-4" /> },
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
interface ExpandableProps extends RangeProps {
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

function QueriesView({ siteId, dateRange, page, setPage, expand, toggleExpand }: ExpandableProps) {
  const { data, error, isLoading, mutate } = useGSCTopQueries(siteId, dateRange.start, dateRange.end, PAGE_SIZE, page * PAGE_SIZE)
  const rows: ExpRow[] = (data?.queries ?? []).map((r) => ({
    key: r.query, label: r.query, title: r.query, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
  }))
  return (
    <>
      <StandardHeader label="Query" />
      <ViewBody
        isLoading={isLoading}
        hasData={!!data}
        error={error}
        isEmpty={rows.length === 0}
        emptyNode={<EmptyState icon={<MagnifyingGlass />} title="No queries in this period" description="Try a wider date range once Search Console has synced more data." className="py-10" />}
        footer={<Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />}
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

function PagesView({ siteId, dateRange, page, setPage, expand, toggleExpand }: ExpandableProps) {
  const { data, error, isLoading, mutate } = useGSCTopPages(siteId, dateRange.start, dateRange.end, PAGE_SIZE, page * PAGE_SIZE)
  const rows: ExpRow[] = (data?.pages ?? []).map((r) => ({
    key: r.page, label: stripProtocol(r.page), title: stripProtocol(r.page), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
  }))
  return (
    <>
      <StandardHeader label="Page" />
      <ViewBody
        isLoading={isLoading}
        hasData={!!data}
        error={error}
        isEmpty={rows.length === 0}
        emptyNode={<EmptyState icon={<FileText />} title="No pages in this period" description="Try a wider date range once Search Console has synced more data." className="py-10" />}
        footer={<Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />}
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

// ─── Orchestrator ────────────────────────────────────────────────

export default function SearchViews({ siteId, dateRange }: RangeProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const view = parseView(searchParams.get('view'))
  const page = parsePageIndex(searchParams.get('p'))
  // URLSearchParams decodes on read and encodes on write, so this is the raw
  // query/page string — compared directly against a row's key.
  const expand = searchParams.get('expand')

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const setView = useCallback((v: View) => updateParams({ view: v === 'queries' ? null : v, p: null, expand: null }), [updateParams])
  const setPage = useCallback((p: number) => updateParams({ p: p <= 0 ? null : String(p) }), [updateParams])
  const toggleExpand = useCallback((key: string) => updateParams({ expand: expand === key ? null : key }), [updateParams, expand])
  const pickNewQuery = useCallback((query: string) => updateParams({ view: null, expand: query, p: null }), [updateParams])

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
        {view === 'queries' && <QueriesView siteId={siteId} dateRange={dateRange} page={page} setPage={setPage} expand={expand} toggleExpand={toggleExpand} />}
        {view === 'pages' && <PagesView siteId={siteId} dateRange={dateRange} page={page} setPage={setPage} expand={expand} toggleExpand={toggleExpand} />}
        {view === 'countries' && <CountriesView siteId={siteId} dateRange={dateRange} page={page} setPage={setPage} />}
        {view === 'devices' && <DevicesView siteId={siteId} dateRange={dateRange} />}
        {view === 'opportunities' && <OpportunitiesView siteId={siteId} dateRange={dateRange} />}
      </div>
    </div>
  )
}

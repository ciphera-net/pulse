'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_FAST, DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import { CaretDown, CaretUp, MagnifyingGlass, ArrowSquareOut, FileText } from '@phosphor-icons/react'
import { useSite, useGSCStatus, useGSCOverview, useGSCTopQueries, useGSCTopPages, useGSCNewQueries } from '@/lib/swr/dashboard'
import { getGSCQueryPages, getGSCPageQueries } from '@/lib/api/gsc'
import type { GSCDataRow } from '@/lib/api/gsc'
import { SkeletonLine, SearchSkeleton } from '@/components/skeletons'
import SearchTrafficChart from '@/components/search/SearchTrafficChart'
import { SyncStatusLine } from '@/components/integrations/SyncStatusLine'
import { EmptyState } from '@/components/ui/EmptyState'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { guardedPctChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { formatNumber } from '@/lib/utils/format'

// ─── Helpers ────────────────────────────────────────────────────

const formatPosition = (pos: number) => pos.toFixed(1)
const formatCTR = (ctr: number) => (ctr * 100).toFixed(1) + '%'

// Strip protocol + trailing slash for cleaner page URL display
const stripProtocol = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

const cascade = (delay: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION_BASE, ease: EASE_APPLE, delay },
})

// ─── Page ───────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function SearchConsolePage() {
  const params = useParams()
  const siteId = params.id as string

  const { period, dateRange, setPeriod, shiftPeriod } = useUrlDateRange()

  // View toggle
  const [activeView, setActiveView] = useState<'queries' | 'pages'>('queries')

  // Pagination
  const [queryPage, setQueryPage] = useState(0)
  const [pagePage, setPagePage] = useState(0)

  // Drill-down expansion
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null)
  const [expandedPage, setExpandedPage] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<GSCDataRow[]>([])
  const [expandedLoading, setExpandedLoading] = useState(false)

  // Data fetching
  const { data: gscStatus } = useGSCStatus(siteId)
  const connected = gscStatus?.connected
  const { data: site } = useSite(siteId)
  const {
    data: overview,
    isLoading: overviewLoading,
    isValidating: overviewValidating,
    error: overviewError,
    mutate: retryOverview,
  } = useGSCOverview(siteId, dateRange.start, dateRange.end)
  const { data: topQueries, isLoading: queriesLoading } = useGSCTopQueries(siteId, dateRange.start, dateRange.end, PAGE_SIZE, queryPage * PAGE_SIZE)
  const { data: topPages, isLoading: pagesLoading } = useGSCTopPages(siteId, dateRange.start, dateRange.end, PAGE_SIZE, pagePage * PAGE_SIZE)
  const { data: newQueries } = useGSCNewQueries(siteId, dateRange.start, dateRange.end)

  // Document title
  useEffect(() => {
    const domain = site?.domain
    document.title = domain ? `Search Console \u00b7 ${domain} | Pulse` : 'Search Console | Pulse'
  }, [site?.domain])

  // Reset pagination when date range changes
  useEffect(() => {
    setQueryPage(0)
    setPagePage(0)
    setExpandedQuery(null)
    setExpandedPage(null)
    setExpandedData([])
  }, [dateRange.start, dateRange.end])

  // ─── Expand handlers ───────────────────────────────────────

  async function handleExpandQuery(query: string) {
    if (expandedQuery === query) {
      setExpandedQuery(null)
      setExpandedData([])
      return
    }
    setExpandedQuery(query)
    setExpandedPage(null)
    setExpandedLoading(true)
    try {
      const res = await getGSCQueryPages(siteId, query, dateRange.start, dateRange.end)
      setExpandedData(res.pages)
    } catch {
      setExpandedData([])
    } finally {
      setExpandedLoading(false)
    }
  }

  async function handleExpandPage(page: string) {
    if (expandedPage === page) {
      setExpandedPage(null)
      setExpandedData([])
      return
    }
    setExpandedPage(page)
    setExpandedQuery(null)
    setExpandedLoading(true)
    try {
      const res = await getGSCPageQueries(siteId, page, dateRange.start, dateRange.end)
      setExpandedData(res.queries)
    } catch {
      setExpandedData([])
    } finally {
      setExpandedLoading(false)
    }
  }

  // ─── Route-level state: skeleton only on the very first load ──
  if (gscStatus === undefined || (connected && overview === undefined && overviewLoading)) {
    return <SearchSkeleton />
  }

  // ─── Not connected state ──────────────────────────────────

  if (gscStatus && !gscStatus.connected) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-8">
        {/* * Same page header as the connected view — without it this tab was
         * the only one with no h1 and read as a different app. */}
        <div className="mb-8">
          <h1 className="text-lg font-semibold text-white mb-1">
            Search Console
          </h1>
          <p className="text-sm text-neutral-400">
            Google Search performance, queries, and page rankings
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-none bg-neutral-800 p-5 mb-6">
            <MagnifyingGlass size={40} className="text-neutral-500" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Connect Google Search Console
          </h2>
          <p className="text-sm text-neutral-400 max-w-md mb-6">
            See how your site performs in Google Search. View top queries, pages, click-through rates, and average position data.
          </p>
          <Link
            href="/settings/site/integrations"
            className="inline-flex h-10 items-center gap-2 rounded-none bg-brand-orange-button px-5 text-sm font-medium text-white transition-colors ease-apple hover:bg-brand-orange-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
          >
            Connect in Settings
            <ArrowSquareOut size={16} weight="bold" />
          </Link>
        </div>
      </div>
    )
  }

  // ─── Connected — main view ────────────────────────────────

  const queries = topQueries?.queries ?? []
  const queriesTotal = topQueries?.total ?? 0
  const pages = topPages?.pages ?? []
  const pagesTotal = topPages?.total ?? 0

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-white">Search Console</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Google Search performance, queries, and page rankings
          </p>
          <SyncStatusLine
            status={gscStatus.status}
            lastSyncedAt={gscStatus.last_synced_at}
            errorMessage={gscStatus.error_message}
            settingsHref="/settings/site/integrations"
          />
        </div>
        <DateRangePicker
          period={period}
          dateRange={dateRange}
          onPeriodChange={(p) => setPeriod(p as Period)}
          onDateRangeChange={(range) => setPeriod('custom', range)}
          onShift={shiftPeriod}
        />
      </div>

      {/* Content — the chip covers range changes, the ErrorCard covers failures */}
      <div className="relative">
        <UpdatingChip active={overviewValidating && !!overview} className="-top-1 right-0" />
        {overviewError ? (
          <ErrorCard
            title="Couldn't load search data"
            description="The Search Console request failed for this period. Your data is safe — this is a loading problem."
            onRetry={() => { void retryOverview() }}
          />
        ) : overview ? (
          <>
            {/* KPI band */}
            <motion.div {...cascade(0)} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="Clicks"
                value={overview.total_clicks}
                format={(v) => formatNumber(Math.round(v))}
                delta={guardedPctChange(overview.total_clicks, overview.prev_clicks, overview.prev_clicks)}
              />
              <KpiCard
                label="Impressions"
                value={overview.total_impressions}
                format={(v) => formatNumber(Math.round(v))}
                delta={guardedPctChange(overview.total_impressions, overview.prev_impressions, overview.prev_impressions)}
              />
              <KpiCard
                label="Avg CTR"
                value={overview.avg_ctr}
                format={(v) => `${(v * 100).toFixed(1)}%`}
                delta={guardedPctChange(overview.avg_ctr, overview.prev_avg_ctr, overview.prev_impressions)}
              />
              <KpiCard
                label="Avg position"
                value={overview.avg_position}
                format={(v) => v.toFixed(1)}
                delta={guardedPctChange(overview.avg_position, overview.prev_avg_position, overview.prev_impressions)}
                invert
              />
            </motion.div>

            {/* Traffic chart — dual-scale clicks (left) / impressions (right) */}
            <motion.div {...cascade(0.05)} className="mt-6">
              <SearchTrafficChart siteId={siteId} startDate={dateRange.start} endDate={dateRange.end} />
            </motion.div>

            {/* Views, tables and drill-downs (kept functional; rebuilt in T5) */}
            <div className="mt-6">

      {/* Position tracker */}
      {topQueries?.queries && topQueries.queries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6"
        >
          {topQueries.queries.slice(0, 5).map((q) => (
            <div key={q.query} className="glass-surface rounded-none p-3">
              <p className="text-xs text-neutral-400 truncate mb-1">{q.query}</p>
              <div className="flex items-baseline gap-1.5">
                <p className="text-lg font-semibold text-white">{q.position.toFixed(1)}</p>
                <p className="text-xs text-neutral-400">pos</p>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">{q.clicks} {q.clicks === 1 ? 'click' : 'clicks'}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* New queries badge */}
      {newQueries && newQueries.count > 0 && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-none bg-green-900/20 text-green-300 text-sm mb-4">
          <span className="font-medium">{newQueries.count} new {newQueries.count === 1 ? 'query' : 'queries'}</span>
          <span className="text-green-400">appeared this period</span>
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-1 mb-6">
        {(['queries', 'pages'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveView(tab)
              if (tab === 'queries') { setExpandedQuery(null); setExpandedData([]) }
              else { setExpandedPage(null); setExpandedData([]) }
            }}
            className={cn(
              'relative px-4 py-2 text-sm font-medium rounded-none transition-colors duration-fast ease-apple cursor-pointer',
              activeView === tab ? 'text-white' : 'text-neutral-400 hover:text-white'
            )}
          >
            {tab === 'queries' ? 'Top Queries' : 'Top Pages'}
            {activeView === tab && (
              <motion.div
                layoutId="search-tab-indicator"
                className="absolute inset-0 glass-surface rounded-none -z-10"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Queries table */}
      {activeView === 'queries' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: 0.15 }}
          className="glass-surface rounded-none overflow-hidden"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="text-left px-4 py-3 font-medium text-neutral-400 w-8" />
                <th className="text-left px-4 py-3 font-medium text-neutral-400">Query</th>
                <th className="text-right px-4 py-3 font-medium text-neutral-400">Clicks</th>
                <th className="text-right px-4 py-3 font-medium text-neutral-400">Impressions</th>
                <th className="text-right px-4 py-3 font-medium text-neutral-400">CTR</th>
                <th className="text-right px-4 py-3 font-medium text-neutral-400">Position</th>
              </tr>
            </thead>
            <tbody>
              {queriesLoading && queries.length === 0 ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-neutral-800/50">
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3"><SkeletonLine className="h-4 w-3/4" /></td>
                    <td className="px-4 py-3"><SkeletonLine className="h-4 w-12 ml-auto" /></td>
                    <td className="px-4 py-3"><SkeletonLine className="h-4 w-16 ml-auto" /></td>
                    <td className="px-4 py-3"><SkeletonLine className="h-4 w-12 ml-auto" /></td>
                    <td className="px-4 py-3"><SkeletonLine className="h-4 w-10 ml-auto" /></td>
                  </tr>
                ))
              ) : queries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6">
                    <EmptyState icon={<MagnifyingGlass />} title="No queries in this window" description="Try a wider date range or check back once your Search Console data has synced." className="py-6" />
                  </td>
                </tr>
              ) : (
                queries.map((row) => (
                  <QueryRow
                    key={row.query}
                    row={row}
                    isExpanded={expandedQuery === row.query}
                    expandedData={expandedQuery === row.query ? expandedData : []}
                    expandedLoading={expandedQuery === row.query && expandedLoading}
                    onToggle={() => handleExpandQuery(row.query)}
                  />
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {queriesTotal > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800">
              <p className="text-sm text-neutral-400">
                Showing {queryPage * PAGE_SIZE + 1}-{Math.min((queryPage + 1) * PAGE_SIZE, queriesTotal)} of {queriesTotal.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={queryPage === 0}
                  onClick={() => { setQueryPage((p) => p - 1); setExpandedQuery(null); setExpandedData([]) }}
                  className="px-3 py-1.5 text-sm rounded-none border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer ease-apple"
                >
                  Previous
                </button>
                <button
                  disabled={(queryPage + 1) * PAGE_SIZE >= queriesTotal}
                  onClick={() => { setQueryPage((p) => p + 1); setExpandedQuery(null); setExpandedData([]) }}
                  className="px-3 py-1.5 text-sm rounded-none border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer ease-apple"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Pages table */}
      {activeView === 'pages' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: 0.15 }}
          className="glass-surface rounded-none overflow-hidden"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="text-left px-4 py-3 font-medium text-neutral-400 w-8" />
                <th className="text-left px-4 py-3 font-medium text-neutral-400">Page</th>
                <th className="text-right px-4 py-3 font-medium text-neutral-400">Clicks</th>
                <th className="text-right px-4 py-3 font-medium text-neutral-400">Impressions</th>
                <th className="text-right px-4 py-3 font-medium text-neutral-400">CTR</th>
                <th className="text-right px-4 py-3 font-medium text-neutral-400">Position</th>
              </tr>
            </thead>
            <tbody>
              {pagesLoading && pages.length === 0 ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-neutral-800/50">
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3"><SkeletonLine className="h-4 w-3/4" /></td>
                    <td className="px-4 py-3"><SkeletonLine className="h-4 w-12 ml-auto" /></td>
                    <td className="px-4 py-3"><SkeletonLine className="h-4 w-16 ml-auto" /></td>
                    <td className="px-4 py-3"><SkeletonLine className="h-4 w-12 ml-auto" /></td>
                    <td className="px-4 py-3"><SkeletonLine className="h-4 w-10 ml-auto" /></td>
                  </tr>
                ))
              ) : pages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6">
                    <EmptyState icon={<FileText />} title="No pages in this window" description="Try a wider date range or check back once your Search Console data has synced." className="py-6" />
                  </td>
                </tr>
              ) : (
                pages.map((row) => (
                  <PageRow
                    key={row.page}
                    row={row}
                    isExpanded={expandedPage === row.page}
                    expandedData={expandedPage === row.page ? expandedData : []}
                    expandedLoading={expandedPage === row.page && expandedLoading}
                    onToggle={() => handleExpandPage(row.page)}
                  />
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {pagesTotal > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800">
              <p className="text-sm text-neutral-400">
                Showing {pagePage * PAGE_SIZE + 1}-{Math.min((pagePage + 1) * PAGE_SIZE, pagesTotal)} of {pagesTotal.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={pagePage === 0}
                  onClick={() => { setPagePage((p) => p - 1); setExpandedPage(null); setExpandedData([]) }}
                  className="px-3 py-1.5 text-sm rounded-none border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer ease-apple"
                >
                  Previous
                </button>
                <button
                  disabled={(pagePage + 1) * PAGE_SIZE >= pagesTotal}
                  onClick={() => { setPagePage((p) => p + 1); setExpandedPage(null); setExpandedData([]) }}
                  className="px-3 py-1.5 text-sm rounded-none border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer ease-apple"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────

// KPI band — dashboard KPI language (mono micro label, tabular AnimatedNumber,
// guarded delta). Position is an INVERTED metric: lower is better, so a drop is
// green. The guard (min base 10) silences noisy -100%-on-tiny-base deltas.
function DeltaBadge({ change, invert = false }: { change: PctChangeResult; invert?: boolean }) {
  if (!change || change.type !== 'pct') return null
  if (change.value === 0) {
    return <span className="font-mono text-xs tabular-nums text-neutral-500">0%</span>
  }
  const up = change.value > 0
  const good = invert ? !up : up
  return (
    <span className={`text-xs font-medium tabular-nums ${good ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(change.value)}%
    </span>
  )
}

function KpiCard({
  label,
  value,
  format,
  delta,
  invert = false,
}: {
  label: string
  value: number
  format: (v: number) => string
  delta: PctChangeResult
  invert?: boolean
}) {
  return (
    <div className="rounded-none border border-border bg-card p-4">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-neutral-500">{label}</span>
        <DeltaBadge change={delta} invert={invert} />
      </div>
      <AnimatedNumber value={value} format={format} className="text-2xl font-semibold tabular-nums text-white" />
    </div>
  )
}

function QueryRow({
  row,
  isExpanded,
  expandedData,
  expandedLoading,
  onToggle,
}: {
  row: GSCDataRow
  isExpanded: boolean
  expandedData: GSCDataRow[]
  expandedLoading: boolean
  onToggle: () => void
}) {
  const Caret = isExpanded ? CaretUp : CaretDown
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-neutral-800/50 hover:bg-neutral-800/50 cursor-pointer transition-colors ease-apple"
      >
        <td className="px-4 py-3 text-neutral-500">
          <Caret size={14} />
        </td>
        <td className="px-4 py-3 text-white font-medium">{row.query}</td>
        <td className="px-4 py-3 text-right text-neutral-300 tabular-nums">{row.clicks.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-neutral-300 tabular-nums">{row.impressions.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-neutral-300 tabular-nums">{formatCTR(row.ctr)}</td>
        <td className="px-4 py-3 text-right text-neutral-300 tabular-nums">{formatPosition(row.position)}</td>
      </tr>
      <AnimatePresence>
        {isExpanded && (
          <tr className="bg-neutral-800/30">
            <td colSpan={6} className="px-4 py-0 overflow-hidden">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: DURATION_FAST, ease: EASE_APPLE as [number, number, number, number] }}
                className="py-3"
              >
                {expandedLoading ? (
                  <div className="space-y-2 py-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <SkeletonLine key={i} className="h-4 w-full" />
                    ))}
                  </div>
                ) : expandedData.length === 0 ? (
                  <EmptyState icon={<FileText />} title="No pages for this query" className="py-3" />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left px-2 py-1.5 text-xs font-medium text-neutral-500">Page</th>
                        <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-500">Clicks</th>
                        <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-500">Impressions</th>
                        <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-500">CTR</th>
                        <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-500">Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expandedData.map((sub) => (
                        <tr key={sub.page} className="border-t border-neutral-700/50">
                          <td className="px-2 py-1.5 text-neutral-300 max-w-md truncate" title={stripProtocol(sub.page)}>{stripProtocol(sub.page)}</td>
                          <td className="px-2 py-1.5 text-right text-neutral-400 tabular-nums">{sub.clicks.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-right text-neutral-400 tabular-nums">{sub.impressions.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-right text-neutral-400 tabular-nums">{formatCTR(sub.ctr)}</td>
                          <td className="px-2 py-1.5 text-right text-neutral-400 tabular-nums">{formatPosition(sub.position)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  )
}

function PageRow({
  row,
  isExpanded,
  expandedData,
  expandedLoading,
  onToggle,
}: {
  row: GSCDataRow
  isExpanded: boolean
  expandedData: GSCDataRow[]
  expandedLoading: boolean
  onToggle: () => void
}) {
  const Caret = isExpanded ? CaretUp : CaretDown
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-neutral-800/50 hover:bg-neutral-800/50 cursor-pointer transition-colors ease-apple"
      >
        <td className="px-4 py-3 text-neutral-500">
          <Caret size={14} />
        </td>
        <td className="px-4 py-3 text-white font-medium max-w-md truncate" title={stripProtocol(row.page)}>{stripProtocol(row.page)}</td>
        <td className="px-4 py-3 text-right text-neutral-300 tabular-nums">{row.clicks.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-neutral-300 tabular-nums">{row.impressions.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-neutral-300 tabular-nums">{formatCTR(row.ctr)}</td>
        <td className="px-4 py-3 text-right text-neutral-300 tabular-nums">{formatPosition(row.position)}</td>
      </tr>
      <AnimatePresence>
        {isExpanded && (
          <tr className="bg-neutral-800/30">
            <td colSpan={6} className="px-4 py-0 overflow-hidden">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: DURATION_FAST, ease: EASE_APPLE as [number, number, number, number] }}
                className="py-3"
              >
                {expandedLoading ? (
                  <div className="space-y-2 py-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <SkeletonLine key={i} className="h-4 w-full" />
                    ))}
                  </div>
                ) : expandedData.length === 0 ? (
                  <EmptyState icon={<MagnifyingGlass />} title="No queries for this page" className="py-3" />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left px-2 py-1.5 text-xs font-medium text-neutral-500">Query</th>
                        <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-500">Clicks</th>
                        <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-500">Impressions</th>
                        <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-500">CTR</th>
                        <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-500">Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expandedData.map((sub) => (
                        <tr key={sub.query} className="border-t border-neutral-700/50">
                          <td className="px-2 py-1.5 text-neutral-300">{sub.query}</td>
                          <td className="px-2 py-1.5 text-right text-neutral-400 tabular-nums">{sub.clicks.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-right text-neutral-400 tabular-nums">{sub.impressions.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-right text-neutral-400 tabular-nums">{formatCTR(sub.ctr)}</td>
                          <td className="px-2 py-1.5 text-right text-neutral-400 tabular-nums">{formatPosition(sub.position)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  )
}

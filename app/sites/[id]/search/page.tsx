'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Select, DatePicker } from '@ciphera-net/ui'
import { getDateRange, formatDate, getThisWeekRange, getThisMonthRange } from '@/lib/utils/dateRanges'
import { CaretDown, CaretUp, MagnifyingGlass, ArrowSquareOut } from '@phosphor-icons/react'
import { useDashboard, useGSCStatus, useGSCOverview, useGSCTopQueries, useGSCTopPages, useGSCNewQueries } from '@/lib/swr/dashboard'
import { getGSCQueryPages, getGSCPageQueries } from '@/lib/api/gsc'
import type { GSCDataRow } from '@/lib/api/gsc'
import { SkeletonLine, StatCardSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import ClicksImpressionsChart from '@/components/search/ClicksImpressionsChart'

// ─── Helpers ────────────────────────────────────────────────────

const formatPosition = (pos: number) => pos.toFixed(1)
const formatCTR = (ctr: number) => (ctr * 100).toFixed(1) + '%'

function formatChange(current: number, previous: number) {
  if (previous === 0) return null
  const change = ((current - previous) / previous) * 100
  return { value: change, label: (change >= 0 ? '+' : '') + change.toFixed(1) + '%' }
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

// ─── Page ───────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function SearchConsolePage() {
  const params = useParams()
  const siteId = params.id as string

  // Date range
  const [period, setPeriod] = useState('28')
  const [dateRange, setDateRange] = useState(() => getDateRange(28))
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

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
  const { data: dashboard } = useDashboard(siteId, dateRange.start, dateRange.end)
  const { data: overview } = useGSCOverview(siteId, dateRange.start, dateRange.end)
  const { data: topQueries, isLoading: queriesLoading } = useGSCTopQueries(siteId, dateRange.start, dateRange.end, PAGE_SIZE, queryPage * PAGE_SIZE)
  const { data: topPages, isLoading: pagesLoading } = useGSCTopPages(siteId, dateRange.start, dateRange.end, PAGE_SIZE, pagePage * PAGE_SIZE)
  const { data: newQueries } = useGSCNewQueries(siteId, dateRange.start, dateRange.end)

  const showSkeleton = useMinimumLoading(!gscStatus)
  const fadeClass = useSkeletonFade(showSkeleton)

  // Document title
  useEffect(() => {
    const domain = dashboard?.site?.domain
    document.title = domain ? `Search Console \u00b7 ${domain} | Pulse` : 'Search Console | Pulse'
  }, [dashboard?.site?.domain])

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

  // ─── Loading skeleton ─────────────────────────────────────

  if (showSkeleton) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <SkeletonLine className="h-8 w-48 mb-2" />
            <SkeletonLine className="h-4 w-64" />
          </div>
          <SkeletonLine className="h-9 w-36 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
          <SkeletonLine className="h-9 w-48 rounded-lg mb-6" />
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <SkeletonLine className="h-4 w-1/3" />
              <div className="flex gap-8">
                <SkeletonLine className="h-4 w-16" />
                <SkeletonLine className="h-4 w-16" />
                <SkeletonLine className="h-4 w-12" />
                <SkeletonLine className="h-4 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── Not connected state ──────────────────────────────────

  if (gscStatus && !gscStatus.connected) {
    return (
      <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-5 mb-6">
            <MagnifyingGlass size={40} className="text-neutral-400 dark:text-neutral-500" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Connect Google Search Console
          </h2>
          <p className="text-sm text-neutral-400 max-w-md mb-6">
            See how your site performs in Google Search. View top queries, pages, click-through rates, and average position data.
          </p>
          <Link
            href={`/sites/${siteId}/settings?tab=integrations`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-orange hover:bg-brand-orange/90 text-white text-sm font-medium transition-colors"
          >
            Connect in Settings
            <ArrowSquareOut size={16} weight="bold" />
          </Link>
        </div>
      </div>
    )
  }

  // ─── Connected — main view ────────────────────────────────

  const clicksChange = overview ? formatChange(overview.total_clicks, overview.prev_clicks) : null
  const impressionsChange = overview ? formatChange(overview.total_impressions, overview.prev_impressions) : null
  const ctrChange = overview ? formatChange(overview.avg_ctr, overview.prev_avg_ctr) : null
  // For position, lower is better — invert the direction
  const positionChange = overview ? formatChange(overview.avg_position, overview.prev_avg_position) : null

  const queries = topQueries?.queries ?? []
  const queriesTotal = topQueries?.total ?? 0
  const pages = topPages?.pages ?? []
  const pagesTotal = topPages?.total ?? 0

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">
            Search Console
          </h1>
          <p className="text-sm text-neutral-400">
            Google Search performance, queries, and page rankings
          </p>
        </div>
        <Select
          variant="input"
          className="min-w-[140px]"
          value={period}
          onChange={(value) => {
            if (value === 'today') {
              const today = formatDate(new Date())
              setDateRange({ start: today, end: today })
              setPeriod('today')
            } else if (value === '7') {
              setDateRange(getDateRange(7))
              setPeriod('7')
            } else if (value === 'week') {
              setDateRange(getThisWeekRange())
              setPeriod('week')
            } else if (value === '28') {
              setDateRange(getDateRange(28))
              setPeriod('28')
            } else if (value === '30') {
              setDateRange(getDateRange(30))
              setPeriod('30')
            } else if (value === 'month') {
              setDateRange(getThisMonthRange())
              setPeriod('month')
            } else if (value === 'custom') {
              setIsDatePickerOpen(true)
            }
          }}
          options={[
            { value: 'today', label: 'Today' },
            { value: '7', label: 'Last 7 days' },
            { value: '28', label: 'Last 28 days' },
            { value: '30', label: 'Last 30 days' },
            { value: 'divider-1', label: '', divider: true },
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
            { value: 'divider-2', label: '', divider: true },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <OverviewCard
          label="Total Clicks"
          value={overview ? formatNumber(overview.total_clicks) : '-'}
          change={clicksChange}
        />
        <OverviewCard
          label="Total Impressions"
          value={overview ? formatNumber(overview.total_impressions) : '-'}
          change={impressionsChange}
        />
        <OverviewCard
          label="Average CTR"
          value={overview ? formatCTR(overview.avg_ctr) : '-'}
          change={ctrChange}
        />
        <OverviewCard
          label="Average Position"
          value={overview ? formatPosition(overview.avg_position) : '-'}
          change={positionChange}
          invertChange
        />
      </div>

      <ClicksImpressionsChart siteId={siteId} startDate={dateRange.start} endDate={dateRange.end} />

      {/* Position tracker */}
      {topQueries?.queries && topQueries.queries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
          {topQueries.queries.slice(0, 5).map((q) => (
            <div key={q.query} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
              <p className="text-xs text-neutral-400 truncate mb-1">{q.query}</p>
              <div className="flex items-baseline gap-1.5">
                <p className="text-lg font-semibold text-white">{q.position.toFixed(1)}</p>
                <p className="text-xs text-neutral-400">pos</p>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">{q.clicks} {q.clicks === 1 ? 'click' : 'clicks'}</p>
            </div>
          ))}
        </div>
      )}

      {/* New queries badge */}
      {newQueries && newQueries.count > 0 && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm mb-4">
          <span className="font-medium">{newQueries.count} new {newQueries.count === 1 ? 'query' : 'queries'}</span>
          <span className="text-green-600 dark:text-green-400">appeared this period</span>
        </div>
      )}

      {/* View toggle */}
      <div className="mb-6">
        <div className="inline-flex bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1">
          <button
            onClick={() => { setActiveView('queries'); setExpandedQuery(null); setExpandedData([]) }}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer ${
              activeView === 'queries'
                ? 'bg-white dark:bg-neutral-700 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            Top Queries
          </button>
          <button
            onClick={() => { setActiveView('pages'); setExpandedPage(null); setExpandedData([]) }}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer ${
              activeView === 'pages'
                ? 'bg-white dark:bg-neutral-700 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            Top Pages
          </button>
        </div>
      </div>

      {/* Queries table */}
      {activeView === 'queries' && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
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
                  <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800/50">
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
                  <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                    No query data available for this period.
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
              <p className="text-sm text-neutral-400">
                Showing {queryPage * PAGE_SIZE + 1}-{Math.min((queryPage + 1) * PAGE_SIZE, queriesTotal)} of {queriesTotal.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={queryPage === 0}
                  onClick={() => { setQueryPage((p) => p - 1); setExpandedQuery(null); setExpandedData([]) }}
                  className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Previous
                </button>
                <button
                  disabled={(queryPage + 1) * PAGE_SIZE >= queriesTotal}
                  onClick={() => { setQueryPage((p) => p + 1); setExpandedQuery(null); setExpandedData([]) }}
                  className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pages table */}
      {activeView === 'pages' && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
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
                  <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800/50">
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
                  <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                    No page data available for this period.
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
              <p className="text-sm text-neutral-400">
                Showing {pagePage * PAGE_SIZE + 1}-{Math.min((pagePage + 1) * PAGE_SIZE, pagesTotal)} of {pagesTotal.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={pagePage === 0}
                  onClick={() => { setPagePage((p) => p - 1); setExpandedPage(null); setExpandedData([]) }}
                  className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Previous
                </button>
                <button
                  disabled={(pagePage + 1) * PAGE_SIZE >= pagesTotal}
                  onClick={() => { setPagePage((p) => p + 1); setExpandedPage(null); setExpandedData([]) }}
                  className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <DatePicker
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        onApply={(range) => {
          setDateRange(range)
          setPeriod('custom')
          setIsDatePickerOpen(false)
        }}
        initialRange={dateRange}
      />
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────

function OverviewCard({
  label,
  value,
  change,
  invertChange = false,
}: {
  label: string
  value: string
  change: { value: number; label: string } | null
  invertChange?: boolean
}) {
  // For position, lower is better so a negative change is good
  const isPositive = change ? (invertChange ? change.value < 0 : change.value > 0) : false
  const isNegative = change ? (invertChange ? change.value > 0 : change.value < 0) : false

  return (
    <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <p className="text-xs font-medium text-neutral-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {change && (
        <p className={`text-xs mt-1 font-medium ${
          isPositive ? 'text-green-600 dark:text-green-400' :
          isNegative ? 'text-red-600 dark:text-red-400' :
          'text-neutral-400'
        }`}>
          {change.label} vs previous period
        </p>
      )}
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
        className="border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors"
      >
        <td className="px-4 py-3 text-neutral-400 dark:text-neutral-500">
          <Caret size={14} />
        </td>
        <td className="px-4 py-3 text-white font-medium">{row.query}</td>
        <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300 tabular-nums">{row.clicks.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300 tabular-nums">{row.impressions.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300 tabular-nums">{formatCTR(row.ctr)}</td>
        <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300 tabular-nums">{formatPosition(row.position)}</td>
      </tr>
      {isExpanded && (
        <tr className="bg-neutral-50 dark:bg-neutral-800/30">
          <td colSpan={6} className="px-4 py-3">
            {expandedLoading ? (
              <div className="space-y-2 py-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonLine key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : expandedData.length === 0 ? (
              <p className="text-sm text-neutral-400 py-1">No pages found for this query.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1.5 text-xs font-medium text-neutral-400 dark:text-neutral-500">Page</th>
                    <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-400 dark:text-neutral-500">Clicks</th>
                    <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-400 dark:text-neutral-500">Impressions</th>
                    <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-400 dark:text-neutral-500">CTR</th>
                    <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-400 dark:text-neutral-500">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {expandedData.map((sub) => (
                    <tr key={sub.page} className="border-t border-neutral-200/50 dark:border-neutral-700/50">
                      <td className="px-2 py-1.5 text-neutral-700 dark:text-neutral-300 max-w-md truncate" title={sub.page}>{sub.page}</td>
                      <td className="px-2 py-1.5 text-right text-neutral-600 dark:text-neutral-400 tabular-nums">{sub.clicks.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right text-neutral-600 dark:text-neutral-400 tabular-nums">{sub.impressions.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right text-neutral-600 dark:text-neutral-400 tabular-nums">{formatCTR(sub.ctr)}</td>
                      <td className="px-2 py-1.5 text-right text-neutral-600 dark:text-neutral-400 tabular-nums">{formatPosition(sub.position)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
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
        className="border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors"
      >
        <td className="px-4 py-3 text-neutral-400 dark:text-neutral-500">
          <Caret size={14} />
        </td>
        <td className="px-4 py-3 text-white font-medium max-w-md truncate" title={row.page}>{row.page}</td>
        <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300 tabular-nums">{row.clicks.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300 tabular-nums">{row.impressions.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300 tabular-nums">{formatCTR(row.ctr)}</td>
        <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300 tabular-nums">{formatPosition(row.position)}</td>
      </tr>
      {isExpanded && (
        <tr className="bg-neutral-50 dark:bg-neutral-800/30">
          <td colSpan={6} className="px-4 py-3">
            {expandedLoading ? (
              <div className="space-y-2 py-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonLine key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : expandedData.length === 0 ? (
              <p className="text-sm text-neutral-400 py-1">No queries found for this page.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1.5 text-xs font-medium text-neutral-400 dark:text-neutral-500">Query</th>
                    <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-400 dark:text-neutral-500">Clicks</th>
                    <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-400 dark:text-neutral-500">Impressions</th>
                    <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-400 dark:text-neutral-500">CTR</th>
                    <th className="text-right px-2 py-1.5 text-xs font-medium text-neutral-400 dark:text-neutral-500">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {expandedData.map((sub) => (
                    <tr key={sub.query} className="border-t border-neutral-200/50 dark:border-neutral-700/50">
                      <td className="px-2 py-1.5 text-neutral-700 dark:text-neutral-300">{sub.query}</td>
                      <td className="px-2 py-1.5 text-right text-neutral-600 dark:text-neutral-400 tabular-nums">{sub.clicks.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right text-neutral-600 dark:text-neutral-400 tabular-nums">{sub.impressions.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right text-neutral-600 dark:text-neutral-400 tabular-nums">{formatCTR(sub.ctr)}</td>
                      <td className="px-2 py-1.5 text-right text-neutral-600 dark:text-neutral-400 tabular-nums">{formatPosition(sub.position)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

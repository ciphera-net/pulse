'use client'


import { useCallback, useEffect, useState, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import {
  getEngagementPercentiles,
  type Stats,
  type DailyStat,
  type EngagementPercentilesData,
} from '@/lib/api/stats'
import { useFilterSuggestions } from '@/lib/hooks/useFilterSuggestions'
import { toast } from '@ciphera-net/facet'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { PERIOD_TO_API } from '@/lib/constants/periods'
import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import dynamic from 'next/dynamic'
import { DashboardSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import FilterButton from '@/components/dashboard/FilterButton'
import RealtimeVisitorsPopover from '@/components/dashboard/RealtimeVisitorsPopover'
import FilterPills from '@/components/dashboard/FilterPills'
import FilterBuilder from '@/components/dashboard/filter/FilterBuilder'
import { useFilterBuilder } from '@/components/dashboard/filter/useFilterBuilder'
const CommandDeck = dynamic(() => import('@/components/dashboard/CommandDeck'), { ssr: false })
import { DashboardStatusLine } from '@/components/dashboard/DashboardStatusLine'
import ContentStats from '@/components/dashboard/ContentStats'
import ScrollDepthBars from '@/components/dashboard/ScrollDepthBars'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'

const GoalStats = dynamic(() => import('@/components/dashboard/GoalStats'))
const Campaigns = dynamic(() => import('@/components/dashboard/Campaigns'))
const PeakHours = dynamic(() => import('@/components/dashboard/PeakHours'))
const ExportModal = dynamic(() => import('@/components/dashboard/ExportModal'))
import { type DimensionFilter, serializeFilters, parseFiltersFromURL } from '@/lib/filters'
import {
  useDashboard,
  useRealtime,
  useStats,
  useDailyStats,
  useCampaigns,
} from '@/lib/swr/dashboard'
import { useLiveIndicator } from '@/lib/live-indicator-context'
import { useCan } from '@/lib/auth/permissions'


export default function SiteDashboardPage() {



  const params = useParams()
  const siteId = params.id as string

  // Range state lives in the URL (?period=&start=&end=), the estate grammar
  // every other date-ranged page already uses (F12): a shared link carries the
  // range, back/forward works, and nothing is silently rewritten to a frozen
  // custom range on reload. The chart intervals are view state, not identity —
  // plain React state, no persistence.
  const { period, dateRange, setPeriod, shiftPeriod } = useUrlDateRange()
  const [todayInterval, setTodayInterval] = useState<'minute' | 'hour'>('hour')
  const [multiDayInterval, setMultiDayInterval] = useState<'hour' | 'day'>('day')
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)

  // Dimension filters state
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<DimensionFilter[]>(() => {
    const raw = searchParams.get('filters')
    return raw ? parseFiltersFromURL(raw) : []
  })
  const filtersParam = useMemo(() => serializeFilters(filters), [filters])

  // For relative periods send the period name; for custom ranges send dates
  const apiPeriod = period !== 'custom' ? (PERIOD_TO_API[period] || undefined) : undefined

  // '1h' narrows to minutes; '24h' narrows to hours — the server resolves 24h as
  // a genuine rolling window (D3), and drawing it as two daily bars split the
  // window mid-bar (F5). Other multi-day ranges keep the user's interval choice.
  const interval = period === '1h' ? 'minute' : period === '24h' ? 'hour' : (dateRange.start === dateRange.end ? todayInterval : multiDayInterval)

  // Single dashboard request replaces focused hooks (overview, pages, locations,
  // devices, referrers, goals). The backend runs all queries in parallel
  // and caches the result in Redis for efficient data loading.
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } = useDashboard(siteId, dateRange?.start || '', dateRange?.end || '', interval, filtersParam || undefined, apiPeriod)

  // Server-resolved date range is the single source of truth for period-based queries.
  // null while loading — all downstream consumers must gate on this being non-null.
  // Custom ranges use client-computed dateRange immediately (no server resolution needed).
  const resolvedDateRange: { start: string; end: string } | null =
    dashboard?.date_range ?? (apiPeriod ? null : dateRange)

  // Engagement percentile data
  const [engagementData, setEngagementData] = useState<EngagementPercentilesData | null>(null)

  const handleAddFilter = useCallback((filter: DimensionFilter) => {
    setFilters(prev => {
      const isDuplicate = prev.some(
        f => f.dimension === filter.dimension && f.operator === filter.operator && f.values.join(';') === filter.values.join(';')
      )
      if (isDuplicate) return prev
      return [...prev, filter]
    })
  }, [])

  const handleRemoveFilter = useCallback((index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilters([])
  }, [])

  // * Commit a draft from the filter popover — replaces the filter at its
  // * index when editing, appends (via the duplicate-guarded add) otherwise.
  const handleFilterApply = useCallback((filter: DimensionFilter, editingIndex: number | null) => {
    if (editingIndex !== null) {
      setFilters(prev => prev.map((f, i) => i === editingIndex ? filter : f))
    } else {
      handleAddFilter(filter)
    }
  }, [handleAddFilter])

  // Fetch full suggestion list (up to 100) when a dimension is selected in the filter dropdown
  const handleFetchSuggestions = useFilterSuggestions(siteId, resolvedDateRange, filtersParam || undefined)

  // Sync filters to URL
  useEffect(() => {
    const url = new URL(window.location.href)
    if (filtersParam) {
      url.searchParams.set('filters', filtersParam)
    } else {
      url.searchParams.delete('filters')
    }
    window.history.replaceState({}, '', url.toString())
  }, [filtersParam])

  // Single-surface filter popover (create anchored to the Filter button,
  // edit anchored to the clicked pill).
  const filterBuilder = useFilterBuilder(handleFetchSuggestions)

  // Previous period date range for comparison.
  // Returns null when the previous range would be invalid for the backend:
  //   - current duration exceeds the backend's 366-day query cap
  //   - previous start would fall before Pulse's data-collection floor (2020-01-01)
  // Hooks below gate on prevRange via empty-string fallthrough so SWR skips the fetch.
  const prevRange = useMemo((): { start: string; end: string } | null => {
    if (!resolvedDateRange) return null
    const startDate = new Date(resolvedDateRange.start)
    const endDate = new Date(resolvedDateRange.end)
    const duration = endDate.getTime() - startDate.getTime()
    const DAY_MS = 24 * 60 * 60 * 1000
    const MAX_DURATION_MS = 366 * DAY_MS
    const DATA_FLOOR = new Date('2020-01-01').getTime()

    if (duration === 0) {
      const prevEnd = new Date(startDate.getTime() - DAY_MS)
      if (prevEnd.getTime() < DATA_FLOOR) return null
      const d = prevEnd.toISOString().split('T')[0]
      return { start: d, end: d }
    }
    if (duration > MAX_DURATION_MS) return null
    const prevEnd = new Date(startDate.getTime() - DAY_MS)
    const prevStart = new Date(prevEnd.getTime() - duration)
    if (prevStart.getTime() < DATA_FLOOR) return null
    return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] }
  }, [resolvedDateRange])
  const { data: realtimeData } = useRealtime(siteId, 15_000)
  // The previous-period comparison carries the SAME filters as the current
  // period. Omitting them compared a filtered current window against an
  // unfiltered previous one — every KPI delta was garbage under any active
  // filter, measured as a true +13% rendered −46% red (F4).
  const { data: prevStats } = useStats(siteId, prevRange?.start ?? '', prevRange?.end ?? '', filtersParam || undefined)
  const { data: prevDailyStats } = useDailyStats(siteId, prevRange?.start ?? '', prevRange?.end ?? '', interval, filtersParam || undefined)
  const { data: campaigns } = useCampaigns(siteId, resolvedDateRange?.start ?? '', resolvedDateRange?.end ?? '', 100, apiPeriod)
  // Fetch engagement percentiles in parallel with dashboard data
  useEffect(() => {
    if (!resolvedDateRange) return
    getEngagementPercentiles(siteId, resolvedDateRange.start, resolvedDateRange.end)
      .then(setEngagementData)
      .catch(() => setEngagementData(null))
  }, [siteId, resolvedDateRange?.start, resolvedDateRange?.end])

  // Derive typed values from single dashboard response
  const site = dashboard?.site ?? null
  // The four averages default to null ("not measured"), never 0 — a fabricated
  // zero is indistinguishable from a measured one (F11).
  const stats: Stats = dashboard?.stats ?? { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null, avg_scroll_depth: null, avg_visible_duration: null }
  const realtime = realtimeData?.visitors ?? dashboard?.realtime_visitors ?? 0
  const dailyStats: DailyStat[] = dashboard?.daily_stats ?? []



  // Show error toast on fetch failure
  useEffect(() => {
    if (dashboardError) {
      toast.error('Failed to load dashboard analytics')
    }
  }, [dashboardError])

  const canExport = useCan('analytics.export')

  // Track when dashboard data was last updated (drives the Live indicator in
  // GlassTopBar and the provenance strip's freshness stamp)
  const { markUpdated } = useLiveIndicator()
  useEffect(() => {
    if (dashboard) {
      setLastUpdatedAt(Date.now())
      markUpdated()
    }
  }, [dashboard, markUpdated])

  useEffect(() => {
    if (site?.domain) document.title = `${site.domain} | Pulse`
  }, [site?.domain])

  // Skip the minimum-loading skeleton when SWR already has cached data
  // (prevents the 300ms flash when navigating back to the dashboard)
  const showSkeleton = useMinimumLoading(dashboardLoading && !dashboard)
  const fadeClass = useSkeletonFade(showSkeleton)


  if (showSkeleton) {
    return <DashboardSkeleton />
  }

  if (!site) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <p className="text-neutral-400">Site not found</p>
      </div>
    )
  }

  const toolbarControls = () => (
    <>
      <RealtimeVisitorsPopover
        siteId={siteId}
        count={realtime}
        onFilterPage={(path) => handleAddFilter({ dimension: 'page', operator: 'is', values: [path] })}
      />
      {/* The spacer pushes the filter/date cluster to the right edge on desktop.
          In a wrapped mobile row a flex-1 spacer would claim a whole line and
          strand the controls, so it only exists at sm+. */}
      <div className="hidden flex-1 sm:block" />
      <FilterPills
        filters={filters}
        onEdit={(index, anchor) => filterBuilder.openEdit(filters[index], index, anchor)}
        onRemove={handleRemoveFilter}
        onClear={handleClearFilters}
      />
      <FilterButton
        hasActiveFilters={filters.length > 0}
        active={filterBuilder.open}
        onClick={anchor => filterBuilder.openCreate(anchor)}
      />
      <DateRangePicker
        period={period}
        dateRange={dateRange}
        onPeriodChange={(p) => setPeriod(p as Period)}
        onDateRangeChange={(range) => setPeriod('custom', range)}
        onShift={shiftPeriod}
      />
    </>
  )

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      <div className="mb-3">
        {/* flex-wrap, not a single row: the five controls measure ~414px of
            intrinsic width, so on a 390px phone the row overflowed and the
            content panel's overflow-x-hidden SLICED the date picker in half —
            its forward-shift arrow was unreachable. Wrapping costs desktop
            nothing (there the row has ~1100px and never wraps). */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {toolbarControls()}
        </div>
      </div>

      {/* The command deck: provenance strip + KPI rail + full-height chart */}
      {resolvedDateRange && <><div className="mb-3 space-y-2">
        <DashboardStatusLine
          timezone={site.timezone}
          lastUpdatedAt={lastUpdatedAt}
          filterCount={filters.length}
        />
        <CommandDeck
          data={dailyStats}
          stats={stats}
          prevStats={prevStats}
          interval={interval}
          dateRange={resolvedDateRange}
          period={period}
          todayInterval={todayInterval}
          setTodayInterval={setTodayInterval}
          multiDayInterval={multiDayInterval}
          setMultiDayInterval={setMultiDayInterval}
          engagementData={engagementData}
          onExport={canExport ? () => setIsExportModalOpen(true) : undefined}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2 mb-3 [&>*]:min-w-0">
        <ContentStats
          topPages={dashboard?.top_pages ?? []}
          entryPages={dashboard?.entry_pages ?? []}
          exitPages={dashboard?.exit_pages ?? []}
          domain={site.domain}
          collectPagePaths={site.collect_page_paths ?? true}
          siteId={siteId}
          dateRange={resolvedDateRange}
          onFilter={handleAddFilter}
        />
        <TopReferrers
          referrers={dashboard?.top_referrers ?? []}
          channels={dashboard?.channels ?? []}
          collectReferrers={site.collect_referrers ?? true}
          siteId={siteId}
          dateRange={resolvedDateRange}
          onFilter={handleAddFilter}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2 mb-3 [&>*]:min-w-0">
        <Audience
          countries={dashboard?.countries ?? []}
          cities={dashboard?.cities ?? []}
          regions={dashboard?.regions ?? []}
          languages={dashboard?.languages ?? []}
          timezones={dashboard?.timezones ?? []}
          geoDataLevel={site.collect_geo_data || 'full'}
          collectAudienceData={site.collect_audience_data ?? true}
          siteId={siteId}
          dateRange={resolvedDateRange}
          onFilter={handleAddFilter}
        />
        <TechSpecs
          browsers={dashboard?.browsers ?? []}
          os={dashboard?.os ?? []}
          devices={dashboard?.devices ?? []}
          screenResolutions={dashboard?.screen_resolutions ?? []}
          collectDeviceInfo={site.collect_device_info ?? true}
          collectScreenResolution={site.collect_screen_resolution ?? true}
          siteId={siteId}
          dateRange={resolvedDateRange}
          onFilter={handleAddFilter}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2 mb-3 [&>*]:min-w-0">
        <Campaigns siteId={siteId} dateRange={resolvedDateRange} filters={filtersParam || undefined} onFilter={handleAddFilter} />
        <PeakHours siteId={siteId} dateRange={resolvedDateRange} />
        <GoalStats
          goalCounts={dashboard?.goal_counts ?? []}
          siteId={siteId}
          dateRange={resolvedDateRange}
        />
        {/* Scroll depth moved here when the Behavior page was retired. The
            distribution has always arrived on the dashboard payload — the
            backend computes it in GetDashboardHandler's query fan-out and it
            rides on `dashboard.scroll_depth` — it simply was not rendered
            anywhere but that page. No extra request. */}
        <ScrollDepthBars scrollDepth={dashboard?.scroll_depth} />
      </div></>}

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        data={dailyStats}
        stats={stats}
        topPages={dashboard?.top_pages}
        topReferrers={dashboard?.top_referrers}
        campaigns={campaigns}
      />

      <FilterBuilder
        builder={filterBuilder}
        filters={filters}
        onApply={handleFilterApply}
      />
    </div>
  )
}

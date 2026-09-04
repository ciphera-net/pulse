'use client'


import { useCallback, useEffect, useState, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import {
  type Stats,
  type DailyStat,
} from '@/lib/api/stats'
import { useFilterSuggestions } from '@/lib/hooks/useFilterSuggestions'
import { toast } from '@ciphera-net/facet'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { PERIOD_TO_API } from '@/lib/constants/periods'
import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import { resolveDashboardRange } from '@/lib/dashboard/resolveRange'
import dynamic from 'next/dynamic'
import { DashboardSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import FilterButton from '@/components/dashboard/FilterButton'
import RealtimeVisitorsPopover from '@/components/dashboard/RealtimeVisitorsPopover'
import FilterPills from '@/components/dashboard/FilterPills'
import FilterBuilder from '@/components/dashboard/filter/FilterBuilder'
import { useFilterBuilder } from '@/components/dashboard/filter/useFilterBuilder'
const CommandDeck = dynamic(() => import('@/components/dashboard/CommandDeck'), { ssr: false })
import ContentStats from '@/components/dashboard/ContentStats'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import SectionHeader from '@/components/dashboard/SectionHeader'

const ContentSignals = dynamic(() => import('@/components/dashboard/ContentSignals'))
const Campaigns = dynamic(() => import('@/components/dashboard/Campaigns'))
const PeakHours = dynamic(() => import('@/components/dashboard/PeakHours'))
const ExportModal = dynamic(() => import('@/components/dashboard/ExportModal'))
// Client-only and off the critical path: driver.js only matters once the
// dashboard is interactive, and the controller waits for the anchors anyway.
const TourController = dynamic(() => import('@/lib/tour/TourController'), { ssr: false })
import { type DimensionFilter, serializeFilters, parseFiltersFromURL } from '@/lib/filters'
import {
  useDashboard,
  useRealtime,
  useStats,
  useCampaigns,
} from '@/lib/swr/dashboard'
import { ErrorCard } from '@/components/ui/ErrorCard'
import InstallBanner from '@/components/dashboard/InstallBanner'
import { useLiveIndicator } from '@/lib/live-indicator-context'
import { type MetricType, isMetricType } from '@/lib/dashboard/metrics'
import { useCan } from '@/lib/auth/permissions'


export default function SiteDashboardPage() {



  const params = useParams()
  const siteId = params.id as string

  // Range state lives in the URL (?period=&start=&end=), the estate grammar
  // every other date-ranged page already uses (F12): a shared link carries the
  // range, back/forward works, and nothing is silently rewritten to a frozen
  // custom range on reload. The chart intervals are view state, not identity —
  // plain React state, no persistence.
  const { period, dateRange, periodReady, setPeriod, shiftPeriod, pickerProps } = useUrlDateRange({ pageKey: 'dashboard' })
  const [multiDayInterval, setMultiDayInterval] = useState<'hour' | 'day'>('day')
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)

  // Dimension filters state
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<DimensionFilter[]>(() => {
    const raw = searchParams.get('filters')
    return raw ? parseFiltersFromURL(raw) : []
  })
  const filtersParam = useMemo(() => serializeFilters(filters), [filters])

  // Deck metric selection lives in the URL (?metric=) like ?period= — a shared
  // link carries it and a reload keeps it. DECOUPLED (owner decision,
  // 01-09-2026): the selection drives ONLY the hero chart. The dimension
  // blocks hold fixed columns (visitors; the Pages card adds views) and never
  // re-render on a KPI click.
  const [metric, setMetric] = useState<MetricType>(() => {
    const raw = searchParams.get('metric')
    return isMetricType(raw) ? raw : 'visitors'
  })
  const handleMetricChange = useCallback((m: MetricType) => {
    setMetric(m)
  }, [])
  useEffect(() => {
    const url = new URL(window.location.href)
    if (metric !== 'visitors') {
      url.searchParams.set('metric', metric)
    } else {
      url.searchParams.delete('metric')
    }
    window.history.replaceState({}, '', url.toString())
  }, [metric])

  // For relative periods send the period name; for custom ranges send dates.
  //
  // 🔴 GATED ON periodReady. Until the range memory has been read, `period` is
  // DEFAULT_PERIOD ('30') — a placeholder, not a choice — and firing on it is
  // not free: it mints a real SWR cache entry for period=30d. On the NEXT
  // navigation to this page that entry is warm, so `dashboard` resolves
  // instantly to a 30-day range and every card below renders 30 days of data
  // for one render, under whatever label the picker settles on. That is the
  // themodestyhouse.com report of 20-08-2026: Campaigns showing `reddit`
  // (9 days stale) and `copilot.com` (6 days stale) while the range said Today.
  // Suppressing the request is what stops the poisoned cache entry existing.
  const apiPeriod = !periodReady
    ? undefined
    : period !== 'custom' ? (PERIOD_TO_API[period] || undefined) : undefined

  // '1h' narrows to minutes; '24h' narrows to hours — the server resolves 24h as
  // a genuine rolling window (D3), and drawing it as two daily bars split the
  // window mid-bar (F5). Other multi-day ranges keep the user's interval choice.
  const [firstHourOfDay, setFirstHourOfDay] = useState(false)

  // A young day cannot draw an hourly line worth reading — until THREE hours
  // of data exist, Today renders MINUTE buckets instead, the Last-1-hour
  // instrument (owner rulings 04-09 and 05-09-2026, widened from 1h after the
  // 01:02 two-bucket diagonal; supersedes the rejected full-day-axis attempt).
  // The signal is the series' own span: first→last bucket under EITHER
  // interval is < 3h exactly while the day is that young, so the rule cannot
  // oscillate. It rides one render behind the fetch by design.
  const interval = period === '1h' ? 'minute' : period === '24h' ? 'hour' : (dateRange.start === dateRange.end ? (firstHourOfDay ? 'minute' : 'hour') : multiDayInterval)

  // Single dashboard request replaces focused hooks (overview, pages, locations,
  // devices, referrers, goals). The backend runs all queries in parallel
  // and caches the result in Redis for efficient data loading.
  // While the period is unresolved BOTH the dates and the period token are
  // withheld, which makes useDashboard's SWR key null and issues no request at
  // all. Withholding only the token would fall through to the client-computed
  // dateRange for the placeholder period — the same 30-day window by another
  // route.
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError, mutate: refetchDashboard } = useDashboard(
    siteId,
    periodReady ? (dateRange?.start || '') : '',
    periodReady ? (dateRange?.end || '') : '',
    interval,
    filtersParam || undefined,
    apiPeriod,
  )

  // Server-resolved date range is the single source of truth for period-based queries.
  // null while loading — all downstream consumers must gate on this being non-null.
  // Custom ranges use client-computed dateRange immediately (no server resolution needed).
  //
  // 🔴 `!periodReady` MUST short-circuit to null, and this line is where the
  // first attempt at this fix leaked. Suppressing the REQUEST is not enough:
  // with no apiPeriod the expression falls through to `dateRange`, which for
  // the placeholder period is the client-computed THIRTY-DAY window — the very
  // range being kept off the screen, arriving by the fallback instead of the
  // cache. Gate the value, not just the fetch.
  const resolvedDateRange = resolveDashboardRange(periodReady, dashboard?.date_range, apiPeriod, dateRange)


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
  // NOTE: the page-level campaigns fetch is NOT a duplicate of the Campaigns
  // card's own — it feeds the ExportModal's campaigns sheet. (The audit's
  // "duplicate fetch" was prevDailyStats, deleted with the old sparklines.)
  const { data: campaigns } = useCampaigns(siteId, resolvedDateRange?.start ?? '', resolvedDateRange?.end ?? '', 100, apiPeriod)
  // Derive typed values from single dashboard response
  const site = dashboard?.site ?? null
  // The four averages default to null ("not measured"), never 0 — a fabricated
  // zero is indistinguishable from a measured one (F11).
  const stats: Stats = dashboard?.stats ?? { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null, avg_scroll_depth: null, avg_visible_duration: null }
  const realtime = realtimeData?.visitors ?? dashboard?.realtime_visitors ?? 0
  const dailyStats: DailyStat[] = dashboard?.daily_stats ?? []

  // Span of the returned series (offset-safe: both ends carry the same site
  // offset). < 3h ⇔ the site day is still too young for an hourly line.
  useEffect(() => {
    if (dateRange.start !== dateRange.end || dailyStats.length === 0) {
      setFirstHourOfDay(false)
      return
    }
    const first = new Date(dailyStats[0].date).getTime()
    const last = new Date(dailyStats[dailyStats.length - 1].date).getTime()
    setFirstHourOfDay(last - first < 3 * 3_600_000)
  }, [dateRange.start, dateRange.end, dailyStats])



  // Show error toast on fetch failure
  useEffect(() => {
    if (dashboardError) {
      toast.error('Failed to load dashboard analytics')
    }
  }, [dashboardError])

  const canExport = useCan('analytics.export')

  // Track when dashboard data was last updated (drives the Live indicator in
  // GlassTopBar)
  const { markUpdated } = useLiveIndicator()
  useEffect(() => {
    if (dashboard) {
      markUpdated()
    }
  }, [dashboard, markUpdated])

  useEffect(() => {
    if (site?.domain) document.title = `${site.domain} | Pulse`
  }, [site?.domain])

  // Skip the minimum-loading skeleton when SWR already has cached data
  // (prevents the 300ms flash when navigating back to the dashboard)
  // `!periodReady` counts as loading. With the request suppressed SWR reports
  // isLoading:false for a null key, so without this the page would drop
  // straight past the skeleton into a body with no range — a blank dashboard
  // instead of an honest loading state.
  const showSkeleton = useMinimumLoading(!periodReady || (dashboardLoading && !dashboard))
  const fadeClass = useSkeletonFade(showSkeleton)


  if (showSkeleton) {
    return <DashboardSkeleton />
  }

  // F8: a failed request is a FAILURE, stated as one. "Site not found" used to
  // render for ANY error with no cached data — a 500 from the fan-out, a 400
  // from interval validation, an expired session — confidently wrong about a
  // site that exists. Only an actual 404 earns that sentence.
  if (dashboardError && !dashboard) {
    const status = (dashboardError as { status?: number })?.status
    if (status === 404) {
      return (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
          <p className="text-neutral-400">Site not found</p>
        </div>
      )
    }
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <ErrorCard
          title="Couldn’t load the dashboard"
          description={status ? `The analytics request failed (HTTP ${status}). Your data is intact — this is a loading problem, not a data problem.` : 'The analytics request failed. Your data is intact — this is a loading problem, not a data problem.'}
          onRetry={() => refetchDashboard()}
        />
      </div>
    )
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
        {...pickerProps}
      />
    </>
  )

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      <TourController />
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

      {/* Install health — a fact about the SITE, above the deck, distinct from
          the chart's own "no data in this range" (a fact about the RANGE).
          Renders nothing when the site is reporting normally. */}
      <InstallBanner siteId={siteId} />

      {/* The command deck: provenance strip + KPI rail + full-height chart,
          then the sectioned briefing IA (Acquisition · Audience · Content ·
          Behaviour) — each section header states which population its cards
          describe (F14). */}
      {resolvedDateRange && (() => {
        // One denominator for every card % (F9): the range's true totals,
        // filtered exactly as the rows are.
        const totals = { pageviews: stats.pageviews, visitors: stats.visitors }
        const hasFilters = filters.length > 0
        // The note states filter SCOPE only — each card states its own unit
        // ("share of N pageviews/visitors"). Naming a unit here contradicted
        // the cards (review finding: "events" above a pageview-share card).
        const sectionNote = hasFilters ? 'filtered with the page' : 'whole site'
        return <><div className="mb-3 space-y-2">
        <CommandDeck
          data={dailyStats}
          stats={stats}
          prevStats={prevStats}
          metric={metric}
          onMetricChange={handleMetricChange}
          interval={interval}
          dateRange={resolvedDateRange}
          period={period}
          multiDayInterval={multiDayInterval}
          setMultiDayInterval={setMultiDayInterval}
          onExport={canExport ? () => setIsExportModalOpen(true) : undefined}
        />
      </div>

      <SectionHeader title="Acquisition" note={sectionNote} />
      <div className="grid gap-3 lg:grid-cols-2 mb-3 [&>*]:min-w-0">
        <TopReferrers
          referrers={dashboard?.top_referrers ?? []}
          channels={dashboard?.channels ?? []}
          collectReferrers={site.collect_referrers ?? true}
          siteId={siteId}
          dateRange={resolvedDateRange}
          totals={totals}
          filters={filtersParam || undefined}
          onFilter={handleAddFilter}
        />
        <Campaigns siteId={siteId} dateRange={resolvedDateRange} period={apiPeriod || undefined} totals={totals} filters={filtersParam || undefined} onFilter={handleAddFilter} />
      </div>

      <SectionHeader title="Audience" note={sectionNote} />
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
          totals={totals}
          filters={filtersParam || undefined}
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
          totals={totals}
          filters={filtersParam || undefined}
          onFilter={handleAddFilter}
        />
      </div>

      <SectionHeader title="Content" note={sectionNote} />
      <div className="grid gap-3 lg:grid-cols-2 mb-3 [&>*]:min-w-0">
        <ContentStats
          topPages={dashboard?.top_pages ?? []}
          entryPages={dashboard?.entry_pages ?? []}
          exitPages={dashboard?.exit_pages ?? []}
          domain={site.domain}
          collectPagePaths={site.collect_page_paths ?? true}
          siteId={siteId}
          dateRange={resolvedDateRange}
          totals={totals}
          filters={filtersParam || undefined}
          onFilter={handleAddFilter}
        />
        {/* Scroll depth arrives on the dashboard payload (computed in
            GetDashboardHandler's fan-out); events likewise. One tabbed card,
            per the approved C mockup. */}
        <ContentSignals
          scrollDepth={dashboard?.scroll_depth}
          goalCounts={dashboard?.goal_counts ?? []}
          siteId={siteId}
          dateRange={resolvedDateRange}
        />
      </div>

      <SectionHeader title="Behaviour" note={`${sectionNote} · site timezone`} />
      <div className="grid gap-3 mb-3 [&>*]:min-w-0">
        <PeakHours siteId={siteId} dateRange={resolvedDateRange} filters={filtersParam || undefined} />
      </div></>
      })()}

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

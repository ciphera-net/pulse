'use client'


import { siteDaysCaption } from '@/lib/utils/timezones'
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
import { DEFAULT_GEO_DATA_LEVEL } from '@/lib/api/sites'
import { identityWindowOf } from '@/lib/visitors/identityWindow'
import { useUrlDateRange } from '@/lib/hooks/useUrlDateRange'
import { useRealtimeToggle } from '@/lib/hooks/useRealtimeToggle'
import { previousDateRange } from '@/lib/hooks/periodUrl'
import { resolveDashboardRange, serverResolvedPeriod } from '@/lib/dashboard/resolveRange'
import dynamic from 'next/dynamic'
import { DashboardSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import FilterButton from '@/components/dashboard/FilterButton'
import RealtimeOrb from '@/components/dashboard/RealtimeOrb'
import {
  REALTIME_MODES,
  REALTIME_ROLLING_MINUTES,
  isRealtimePeriod,
} from '@/lib/dashboard/realtimeRange'
import { useRealtimeSync } from '@/lib/hooks/useRealtimeSync'
import FilterPills from '@/components/dashboard/FilterPills'
import FilterBuilder from '@/components/dashboard/filter/FilterBuilder'
import { useFilterBuilder } from '@/components/dashboard/filter/useFilterBuilder'
const CommandDeck = dynamic(() => import('@/components/dashboard/CommandDeck'), { ssr: false })
import ContentStats from '@/components/dashboard/ContentStats'
import Sources from '@/components/dashboard/Sources'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import Outbound from '@/components/dashboard/Outbound'
import SectionHeader from '@/components/dashboard/SectionHeader'

const ContentSignals = dynamic(() => import('@/components/dashboard/ContentSignals'))
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
  useSite,
  useDataWindow,
} from '@/lib/swr/dashboard'
import { ErrorCard } from '@/components/ui/ErrorCard'
import InstallBanner from '@/components/dashboard/InstallBanner'
import { useLiveIndicator } from '@/lib/live-indicator-context'
import { type MetricType, isMetricType } from '@/lib/dashboard/metrics'
import { useCan } from '@/lib/auth/permissions'
import { displayDomain } from '@/lib/utils/displayDomain'


export default function SiteDashboardPage() {



  const params = useParams()
  const siteId = params.id as string

  // Independent of the dashboard's own combined fetch ON PURPOSE: the
  // dashboard request itself needs a resolved date range before it can fire,
  // and the range needs the site's timezone before IT can resolve — reading
  // the zone off `dashboard.site` would be circular. This is the same
  // siteId-only fetch the sidebar already dedupes against.
  const { data: siteRecord, error: siteError, mutate: refetchSite } = useSite(siteId)

  // Range state lives in the URL (?period=&start=&end=), the estate grammar
  // every other date-ranged page already uses (F12): a shared link carries the
  // range, back/forward works, and nothing is silently rewritten to a frozen
  // custom range on reload. The chart intervals are view state, not identity —
  // plain React state, no persistence. The view itself is the ONE memory shared by
  // every page (PULSE-20), answered against this page's data window.
  // Realtime is a MODE entered from the orb — never a menu row, never remembered;
  // `rollingMinutes` turns it into a `minutes=` fetch instead of a date span.
  const dataWindow = useDataWindow(siteId, 'dashboard')
  const urlRange = useUrlDateRange({
    surface: 'dashboard',
    window: dataWindow,
    timezone: siteRecord?.timezone,
    modes: REALTIME_MODES,
    rollingMinutes: REALTIME_ROLLING_MINUTES,
    retentionMonths: siteRecord?.data_retention_months,
    daysCaption: siteDaysCaption(siteRecord?.timezone),
  })
  const { period, dateRange, periodReady, rollingMinutes, picker } = urlRange
  const isLive = isRealtimePeriod(period)
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
  // Realtime is always minute buckets: a live window drawn at day granularity is
  // one bar, which is not a chart.
  const interval = isLive ? 'minute' : period === '1h' ? 'minute' : period === '24h' ? 'hour' : (dateRange.start === dateRange.end ? (firstHourOfDay ? 'minute' : 'hour') : multiDayInterval)

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
    // In realtime mode the window is sent as rolling minutes, not as dates or a
    // period token: "the last 30 minutes" is not expressible as two YYYY-MM-DD
    // strings without losing the thing that makes it live.
    rollingMinutes ?? undefined,
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
  // All time travels as the `all` token here too (as on Funnels and Journeys): sent as
  // the window's dates it would 400 once the window passes the 366-day cap.
  const handleFetchSuggestions = useFilterSuggestions(
    siteId,
    resolvedDateRange,
    filtersParam || undefined,
    serverResolvedPeriod(periodReady, period),
  )

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

  // Previous period date range for comparison — the shared, tested helper
  // (periodUrl.ts), not ad-hoc arithmetic. It applies the exact same two
  // rules this used to hand-roll (span > 366 days → null; previous start
  // before Pulse's 2020-01-01 data floor → null) via LOCAL date parts, never
  // toISOString() — a UTC round-trip shifts a day near midnight outside UTC,
  // and resolvedDateRange is already a SITE-local "YYYY-MM-DD" pair (either
  // the server's own echoed range, or the client range resolved against the
  // site's wall clock), so it must be read as local parts, not re-UTC'd.
  // Hooks below gate on prevRange via empty-string fallthrough so SWR skips the fetch.
  // "All time" has no previous period — there is no history before the whole of it —
  // so it carries no comparison rather than one against days with no data. Nor does
  // realtime: the server echoes a live window as the day it falls in, so the "previous
  // period" was all of yesterday, and every rail delta compared five minutes with a
  // whole day (a red −99% under a live view).
  const prevRange = useMemo(
    (): { start: string; end: string } | null =>
      resolvedDateRange && period !== 'all' && !isLive ? previousDateRange(resolvedDateRange) : null,
    [resolvedDateRange, period, isLive],
  )
  const { data: realtimeData } = useRealtime(siteId, 15_000)

  // THE transport seam. Everything else on this page is transport-agnostic: the
  // socket says "something changed" and the page refetches over HTTP, reading
  // the same endpoints every other period reads. Only wired while live, so a
  // historical view holds no connection.
  useRealtimeSync({
    enabled: isLive,
    siteId,
    onChanged: useCallback(() => {
      void refetchDashboard()
    }, [refetchDashboard]),
  })

  // The orb is the one switch into realtime; leaving returns to the view the reader
  // was on (useRealtimeToggle — shared with Visitors, so the two cannot drift).
  const { toggle: toggleRealtime } = useRealtimeToggle(urlRange)
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
  // 🔴 `dashboard.site` IS THE SANITIZED PUBLIC SHAPE — the backend builds it
  // with NewPublicSiteResponse, the same whitelist the share surface gets — so
  // it does not carry identity_window_days, and the deck rendered the
  // window-NEUTRAL visitors sentence on a site set to 7 days (measured on
  // staging, 11-09-2026). The authed site record does carry it; SWR dedupes
  // the read with the sidebar's (and now with the range hook's own fetch
  // above), and the deck says what "Unique visitors" means on THIS site.
  // The four averages default to null ("not measured"), never 0 — a fabricated
  // zero is indistinguishable from a measured one (F11).
  const stats: Stats = dashboard?.stats ?? { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null, avg_scroll_depth: null, avg_visible_duration: null }
  const realtime = realtimeData?.visitors ?? dashboard?.realtime_visitors ?? 0
  // In realtime the rail's headline visitors IS the orb's count — the tracker's
  // presence over the same five minutes. Read from events instead, a reader still on
  // one page past five minutes without a new pageview is on the site (orb) but not in
  // the window (rail): both correct, contradictory side by side, which is exactly what
  // the owner saw (plan §11.10). One source, one number.
  const deckStats: Stats = isLive ? { ...stats, visitors: realtime } : stats
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
    if (site?.domain) document.title = `${displayDomain(site)} | Pulse`
  }, [site?.domain])

  // Skip the minimum-loading skeleton when SWR already has cached data
  // (prevents the 300ms flash when navigating back to the dashboard)
  // `!periodReady` counts as loading. With the request suppressed SWR reports
  // isLoading:false for a null key, so without this the page would drop
  // straight past the skeleton into a body with no range — a blank dashboard
  // instead of an honest loading state.
  const showSkeleton = useMinimumLoading(!periodReady || (dashboardLoading && !dashboard))
  const fadeClass = useSkeletonFade(showSkeleton)

  // F8: a failed request is a FAILURE, stated as one. "Site not found" used to
  // render for ANY error with no cached data — a 500 from the fan-out, a 400
  // from interval validation, an expired session — confidently wrong about a
  // site that exists. Only an actual 404 earns that sentence.
  const failureState = (failure: unknown, retry: () => void) => {
    const status = (failure as { status?: number })?.status
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
          onRetry={retry}
        />
      </div>
    )
  }

  // PULSE-87: the view waits for the SITE's timezone before it can resolve a
  // range, and a site that failed to load never supplies one — so that failure
  // is stated BEFORE the skeleton gate, or the skeleton wins forever. (A 403 does
  // not reach this page: the site layout shows the other-team state instead.)
  if (!siteRecord && siteError) {
    return failureState(siteError, () => { void refetchSite() })
  }

  if (showSkeleton) {
    return <DashboardSkeleton />
  }

  if (dashboardError && !dashboard) {
    return failureState(dashboardError, () => refetchDashboard())
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
      <RealtimeOrb count={realtime} live={isLive} onToggle={toggleRealtime} />
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
      <DateRangePicker {...picker} />
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
        return <><div className="mb-3 space-y-2">
        <CommandDeck
          data={dailyStats}
          stats={deckStats}
          prevStats={prevStats}
          metric={metric}
          onMetricChange={handleMetricChange}
          // The bucket the series is IN: past a year of All time the server picks it.
          interval={dashboard?.interval ?? interval}
          live={isLive}
          dateRange={resolvedDateRange}
          period={period}
          multiDayInterval={multiDayInterval}
          setMultiDayInterval={setMultiDayInterval}
          onExport={canExport ? () => setIsExportModalOpen(true) : undefined}
          identityWindowDays={identityWindowOf(siteRecord)}
        />
      </div>

      <SectionHeader title="Acquisition" />
      {/* One Sources card (owner pick BH, 06-09-2026): Referrers · Channels ·
          Campaigns, the UTM dimension behind a Select. The Locations card moved
          up to fill the row the Campaigns card left. */}
      <div className="grid gap-3 lg:grid-cols-2 mb-3 [&>*]:min-w-0">
        <Sources
          referrers={dashboard?.top_referrers ?? []}
          channels={dashboard?.channels ?? []}
          collectReferrers={site.collect_referrers ?? true}
          siteId={siteId}
          live={isLive}
          dateRange={resolvedDateRange}
          period={apiPeriod || undefined}
          totals={totals}
          filters={filtersParam || undefined}
          onFilter={handleAddFilter}
        />
        <Audience
          countries={dashboard?.countries ?? []}
          cities={dashboard?.cities ?? []}
          regions={dashboard?.regions ?? []}
          languages={dashboard?.languages ?? []}
          timezones={dashboard?.timezones ?? []}
          geoDataLevel={site.collect_geo_data || DEFAULT_GEO_DATA_LEVEL}
          collectAudienceData={site.collect_audience_data ?? true}
          siteId={siteId}
          live={isLive}
          dateRange={resolvedDateRange}
          totals={totals}
          filters={filtersParam || undefined}
          onFilter={handleAddFilter}
        />
      </div>

      {/* 🔑 THE ONLY ROW WITH A HEADER PER COLUMN (owner, 10-09-2026).
          Everywhere else the two cards in a row genuinely share one heading —
          Sources and Locations are both Acquisition, Pages and Content signals
          are both Content. Technology and Outbound do not: one is who visited,
          the other is where they went. So this row carries "Audience" over the
          left card and "Outbound" over the right.

          It got there the long way. Outbound first became a section of its own,
          which named it but left both rows half empty (seen on staging); then
          the titles were nearly moved INSIDE the cards. The owner's answer is
          better than either: keep the full row, and put the two titles outside
          the cards, each above its own column.

          ⚠️ The header lives INSIDE the grid cell, not in a header row of its
          own. Below `lg` this grid collapses to one column, and a separate
          two-title row would then stack both titles above both cards — every
          title detached from the card it names. This way each title stays glued
          to its own card at every width.

          The card is wrapped in `flex-1 min-h-0` because it sets `h-full`: with
          the header as a sibling, 100% of the cell would overflow by exactly the
          header's height. */}
      <div className="grid gap-3 lg:grid-cols-2 mb-3 [&>*]:min-w-0">
        <div className="flex flex-col">
          <SectionHeader title="Audience" />
          <div className="flex-1 min-h-0">
            <TechSpecs
              browsers={dashboard?.browsers ?? []}
              os={dashboard?.os ?? []}
              devices={dashboard?.devices ?? []}
              screenResolutions={dashboard?.screen_resolutions ?? []}
              collectDeviceInfo={site.collect_device_info ?? true}
              collectScreenResolution={site.collect_screen_resolution ?? true}
              siteId={siteId}
          live={isLive}
              dateRange={resolvedDateRange}
              totals={totals}
              filters={filtersParam || undefined}
              onFilter={handleAddFilter}
            />
          </div>
        </div>
        <div className="flex flex-col">
          <SectionHeader title="Outbound" />
          <div className="flex-1 min-h-0">
            <Outbound
              siteId={siteId}
          live={isLive}
              dateRange={resolvedDateRange}
              period={apiPeriod || undefined}
              goalCounts={dashboard?.goal_counts ?? []}
              filters={filtersParam || undefined}
              onFilter={handleAddFilter}
            />
          </div>
        </div>
      </div>

      <SectionHeader title="Content" />
      <div className="grid gap-3 lg:grid-cols-2 mb-3 [&>*]:min-w-0">
        <ContentStats
          topPages={dashboard?.top_pages ?? []}
          entryPages={dashboard?.entry_pages ?? []}
          exitPages={dashboard?.exit_pages ?? []}
          domain={site.domain}
          collectPagePaths={site.collect_page_paths ?? true}
          siteId={siteId}
          live={isLive}
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

      {/* Peak hours is a weekly hour-of-day heatmap: a single live instant has no
          day-of-week distribution to draw, so it is HIDDEN in realtime rather
          than rendered as an almost-empty grid that looks like missing data. */}
      {!isLive && (<>
      <SectionHeader title="Behaviour" />
      <div className="grid gap-3 mb-3 [&>*]:min-w-0">
        <PeakHours siteId={siteId} dateRange={resolvedDateRange} filters={filtersParam || undefined} />
      </div></>)}</>
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

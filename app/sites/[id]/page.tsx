'use client'


import { logger } from '@/lib/utils/logger'
import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  getTopPages,
  getTopReferrers,
  getCountries,
  getCities,
  getRegions,
  getBrowsers,
  getOS,
  getDevices,
  getCampaigns,
  getEngagementPercentiles,
  type Stats,
  type DailyStat,
  type EngagementPercentilesData,
} from '@/lib/api/stats'
import { getDateRange, formatDate, getThisWeekRange, getThisMonthRange, getYesterdayRange, getLast24HoursRange, getLast1HourRange, getThisYearRange } from '@/lib/utils/dateRanges'
import { toast } from '@ciphera-net/ui'
import { Button } from '@ciphera-net/ui'
import { Select, DatePicker, DownloadIcon, ChevronLeftIcon, ChevronRightIcon } from '@ciphera-net/ui'
import dynamic from 'next/dynamic'
import { DashboardSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import FilterButton from '@/components/dashboard/FilterButton'
import FilterPills from '@/components/dashboard/FilterPills'
import FilterModal, { type FilterSuggestion } from '@/components/dashboard/FilterModal'
const Chart = dynamic(() => import('@/components/dashboard/Chart'), { ssr: false })
import ContentStats from '@/components/dashboard/ContentStats'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'

const GoalStats = dynamic(() => import('@/components/dashboard/GoalStats'))
const Campaigns = dynamic(() => import('@/components/dashboard/Campaigns'))
const PeakHours = dynamic(() => import('@/components/dashboard/PeakHours'))
const SearchPerformance = dynamic(() => import('@/components/dashboard/SearchPerformance'))
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

function loadSavedSettings(): {
  type?: string
  dateRange?: { start: string; end: string }
  todayInterval?: 'minute' | 'hour'
  multiDayInterval?: 'hour' | 'day'
} | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = localStorage.getItem('pulse_dashboard_settings')
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}


function getInitialDateRange(): { start: string; end: string } {
  const settings = loadSavedSettings()
  if (settings?.type === 'today') {
    const today = formatDate(new Date())
    return { start: today, end: today }
  }
  if (settings?.type === 'yesterday') return getYesterdayRange()
  if (settings?.type === '1h') return getLast1HourRange()
  if (settings?.type === '24h') return getLast24HoursRange()
  if (settings?.type === '7') return getDateRange(7)
  if (settings?.type === '30') return getDateRange(30)
  if (settings?.type === 'week') return getThisWeekRange()
  if (settings?.type === 'month') return getThisMonthRange()
  if (settings?.type === 'year') return getThisYearRange()
  if (settings?.type === 'custom' && settings.dateRange) return settings.dateRange
  return getDateRange(30)
}

function getInitialPeriod(): string {
  const saved = loadSavedSettings()?.type
  // Migrate removed 'alltime' option → default 30 days (backend caps queries at 366 days)
  if (saved === 'alltime') return '30'
  return saved || '30'
}

export default function SiteDashboardPage() {



  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  // UI state - initialized from localStorage synchronously to avoid double-fetch
  const [period, setPeriod] = useState(getInitialPeriod)
  const [dateRange, setDateRange] = useState(getInitialDateRange)
  const [todayInterval, setTodayInterval] = useState<'minute' | 'hour'>(
    () => loadSavedSettings()?.todayInterval || 'hour'
  )
  const [multiDayInterval, setMultiDayInterval] = useState<'hour' | 'day'>(
    () => loadSavedSettings()?.multiDayInterval || 'day'
  )
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)

  const shiftPeriod = useCallback((direction: -1 | 1) => {
    const shift = (date: string, days: number) => {
      const d = new Date(date + 'T00:00:00')
      d.setDate(d.getDate() + days)
      return formatDate(d)
    }
    const startDate = new Date(dateRange.start + 'T00:00:00')
    const endDate = new Date(dateRange.end + 'T00:00:00')
    const spanDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1
    const offsetDays = spanDays * direction
    const newRange = { start: shift(dateRange.start, offsetDays), end: shift(dateRange.end, offsetDays) }
    const today = formatDate(new Date())
    if (newRange.end > today) return
    setDateRange(newRange)
    setPeriod('custom')
    saveSettings('custom', newRange)
  }, [dateRange])
  const lastUpdatedAtRef = useRef<number | null>(null)

  // Dimension filters state
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<DimensionFilter[]>(() => {
    const raw = searchParams.get('filters')
    return raw ? parseFiltersFromURL(raw) : []
  })
  const filtersParam = useMemo(() => serializeFilters(filters), [filters])

  // Map frontend period values to backend period names
  const PERIOD_TO_API: Record<string, string> = {
    'today': 'today',
    'yesterday': 'yesterday',
    '1h': '1h',
    '24h': '24h',
    '7': '7d',
    '30': '30d',
    'week': 'week',
    'month': 'month',
    'year': 'year',
  }

  // For relative periods send the period name; for custom ranges send dates
  const apiPeriod = period !== 'custom' ? (PERIOD_TO_API[period] || undefined) : undefined

  const interval = dateRange.start === dateRange.end ? todayInterval : multiDayInterval

  // Single dashboard request replaces focused hooks (overview, pages, locations,
  // devices, referrers, goals). The backend runs all queries in parallel
  // and caches the result in Redis for efficient data loading.
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } = useDashboard(siteId, dateRange?.start || '', dateRange?.end || '', interval, filtersParam || undefined, apiPeriod)

  // Server-resolved date range is the single source of truth for period-based queries.
  // null while loading — all downstream consumers must gate on this being non-null.
  // Custom ranges use client-computed dateRange immediately (no server resolution needed).
  const resolvedDateRange: { start: string; end: string } | null =
    dashboard?.date_range ?? (apiPeriod ? null : dateRange)

  // Filter modal state
  const [editingFilterIndex, setEditingFilterIndex] = useState<number | null>(null)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [filterModalDimension, setFilterModalDimension] = useState<string | null>(null)

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

  const handleApplyFilters = useCallback((newFilters: DimensionFilter[]) => {
    setFilters(newFilters)
  }, [])

  const handleOpenFilterForDimension = useCallback((dimension: string) => {
    setFilterModalDimension(dimension)
    setEditingFilterIndex(null)
    setIsFilterModalOpen(true)
  }, [])

  const handleEditFilter = useCallback((index: number) => {
    setEditingFilterIndex(index)
    setFilterModalDimension(filters[index]?.dimension || null)
    setIsFilterModalOpen(true)
  }, [filters])

  const handleFilterModalSave = useCallback((filter: DimensionFilter) => {
    if (editingFilterIndex !== null) {
      setFilters(prev => prev.map((f, i) => i === editingFilterIndex ? filter : f))
    } else {
      setFilters(prev => [...prev, filter])
    }
    setIsFilterModalOpen(false)
    setEditingFilterIndex(null)
  }, [editingFilterIndex])

  const handleFilterModalClose = useCallback(() => {
    setIsFilterModalOpen(false)
    setEditingFilterIndex(null)
  }, [])

  // Fetch full suggestion list (up to 100) when a dimension is selected in the filter dropdown
  const handleFetchSuggestions = useCallback(async (dimension: string): Promise<FilterSuggestion[]> => {
    if (!resolvedDateRange) return []
    const start = resolvedDateRange.start
    const end = resolvedDateRange.end
    const f = filtersParam || undefined
    const limit = 100

    try {
      const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }) } catch { return null } })()

      switch (dimension) {
        case 'page': {
          const data = await getTopPages(siteId, start, end, limit, f)
          return data.map(p => ({ value: p.path, label: p.path, count: p.pageviews }))
        }
        case 'referrer': {
          const data = await getTopReferrers(siteId, start, end, limit, f)
          return data.filter(r => r.referrer && r.referrer !== '').map(r => ({ value: r.referrer, label: r.referrer, count: r.pageviews }))
        }
        case 'country': {
          const data = await getCountries(siteId, start, end, limit, f)
          return data.filter(c => c.country && c.country !== 'Unknown').map(c => ({ value: c.country, label: regionNames?.of(c.country) ?? c.country, count: c.pageviews }))
        }
        case 'city': {
          const data = await getCities(siteId, start, end, limit, f)
          return data.filter(c => c.city && c.city !== 'Unknown').map(c => ({ value: c.city, label: c.city, count: c.pageviews }))
        }
        case 'region': {
          const data = await getRegions(siteId, start, end, limit, f)
          return data.filter(r => r.region && r.region !== 'Unknown').map(r => ({ value: r.region, label: r.region, count: r.pageviews }))
        }
        case 'browser': {
          const data = await getBrowsers(siteId, start, end, limit, f)
          return data.filter(b => b.browser && b.browser !== 'Unknown').map(b => ({ value: b.browser, label: b.browser, count: b.pageviews }))
        }
        case 'os': {
          const data = await getOS(siteId, start, end, limit, f)
          return data.filter(o => o.os && o.os !== 'Unknown').map(o => ({ value: o.os, label: o.os, count: o.pageviews }))
        }
        case 'device': {
          const data = await getDevices(siteId, start, end, limit, f)
          return data.filter(d => d.device && d.device !== 'Unknown').map(d => ({ value: d.device, label: d.device, count: d.pageviews }))
        }
        case 'utm_source':
        case 'utm_medium':
        case 'utm_campaign': {
          const data = await getCampaigns(siteId, start, end, limit, f)
          const map = new Map<string, number>()
          const field = dimension === 'utm_source' ? 'source' : dimension === 'utm_medium' ? 'medium' : 'campaign'
          data.forEach(c => {
            const val = c[field]
            if (val) map.set(val, (map.get(val) ?? 0) + c.pageviews)
          })
          return [...map.entries()].map(([v, count]) => ({ value: v, label: v, count }))
        }
        default:
          return []
      }
    } catch {
      return []
    }
  }, [siteId, resolvedDateRange?.start, resolvedDateRange?.end, filtersParam])

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
  const { data: prevStats } = useStats(siteId, prevRange?.start ?? '', prevRange?.end ?? '')
  const { data: prevDailyStats } = useDailyStats(siteId, prevRange?.start ?? '', prevRange?.end ?? '', interval)
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
  const stats: Stats = dashboard?.stats ?? { pageviews: 0, visitors: 0, bounce_rate: 0, avg_duration: 0, avg_scroll_depth: 0, avg_visible_duration: 0 }
  const realtime = realtimeData?.visitors ?? dashboard?.realtime_visitors ?? 0
  const dailyStats: DailyStat[] = dashboard?.daily_stats ?? []



  // Show error toast on fetch failure
  useEffect(() => {
    if (dashboardError) {
      toast.error('Failed to load dashboard analytics')
    }
  }, [dashboardError])

  // Track when dashboard data was last updated (drives the Live indicator in GlassTopBar)
  const { markUpdated } = useLiveIndicator()
  useEffect(() => {
    if (dashboard) {
      lastUpdatedAtRef.current = Date.now()
      markUpdated()
    }
  }, [dashboard, markUpdated])

  // Save settings to localStorage
  const saveSettings = (type: string, newDateRange?: { start: string; end: string }) => {
    try {
      const settings = {
        type,
        dateRange: newDateRange || dateRange,
        todayInterval,
        multiDayInterval,
        lastUpdated: Date.now()
      }
      localStorage.setItem('pulse_dashboard_settings', JSON.stringify(settings))
    } catch (e) {
      logger.error('Failed to save dashboard settings', e)
    }
  }

  // Save intervals when they change
  useEffect(() => {
    let type = 'custom'
    const today = formatDate(new Date())
    if (dateRange.start === today && dateRange.end === today) type = 'today'
    else if (dateRange.start === getDateRange(7).start) type = '7'
    else if (dateRange.start === getDateRange(30).start) type = '30'

    const settings = {
      type,
      dateRange,
      todayInterval,
      multiDayInterval,
      lastUpdated: Date.now()
    }
    localStorage.setItem('pulse_dashboard_settings', JSON.stringify(settings))
  }, [todayInterval, multiDayInterval]) // eslint-disable-line react-hooks/exhaustive-deps -- dateRange saved via saveSettings

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
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-sm text-neutral-400 tabular-nums">{realtime} current visitors</span>
      </div>
      <div className="flex-1" />
      <FilterPills filters={filters} onEdit={handleEditFilter} onRemove={handleRemoveFilter} onClear={handleClearFilters} />
      <FilterButton hasActiveFilters={filters.length > 0} onSelectDimension={handleOpenFilterForDimension} />
      <div className="flex items-center h-10 rounded-lg border border-white/[0.08] bg-neutral-900/80 shadow-sm">
        <button onClick={() => shiftPeriod(-1)} className="px-2 h-full text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors rounded-l-lg ease-apple" aria-label="Previous period">
          <ChevronLeftIcon className="w-4 h-4" weight="bold" />
        </button>
        <div className="w-px h-5 bg-white/[0.08]" />
        <Select
          variant="ghost"
          className="min-w-[130px]"
          value={period}
          onChange={(value) => {
            if (value === 'today') {
              const today = formatDate(new Date())
              const range = { start: today, end: today }
              setDateRange(range)
              setPeriod('today')
              saveSettings('today', range)
            } else if (value === 'yesterday') {
              const range = getYesterdayRange()
              setDateRange(range)
              setPeriod('yesterday')
              saveSettings('yesterday', range)
            } else if (value === '1h') {
              const range = getLast1HourRange()
              setDateRange(range)
              setTodayInterval('minute')
              setPeriod('1h')
              saveSettings('1h', range)
            } else if (value === '24h') {
              const range = getLast24HoursRange()
              setDateRange(range)
              setPeriod('24h')
              saveSettings('24h', range)
            } else if (value === '7') {
              const range = getDateRange(7)
              setDateRange(range)
              setPeriod('7')
              saveSettings('7', range)
            } else if (value === 'week') {
              const range = getThisWeekRange()
              setDateRange(range)
              setPeriod('week')
              saveSettings('week', range)
            } else if (value === '30') {
              const range = getDateRange(30)
              setDateRange(range)
              setPeriod('30')
              saveSettings('30', range)
            } else if (value === 'month') {
              const range = getThisMonthRange()
              setDateRange(range)
              setPeriod('month')
              saveSettings('month', range)
            } else if (value === 'year') {
              const range = getThisYearRange()
              setDateRange(range)
              setPeriod('year')
              saveSettings('year', range)
            } else if (value === 'custom') {
              setIsDatePickerOpen(true)
            }
          }}
          options={[
            { value: '1h', label: 'Last 1 hour' },
            { value: '24h', label: 'Last 24 hours' },
            { value: 'divider-0', label: '', divider: true },
            { value: 'today', label: 'Today' },
            { value: 'yesterday', label: 'Yesterday' },
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
            { value: 'divider-1', label: '', divider: true },
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
            { value: 'year', label: 'This year' },
            { value: 'divider-2', label: '', divider: true },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        <div className="w-px h-5 bg-white/[0.08]" />
        <button onClick={() => shiftPeriod(1)} className="px-2 h-full text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors rounded-r-lg ease-apple" aria-label="Next period">
          <ChevronRightIcon className="w-4 h-4" weight="bold" />
        </button>
      </div>
    </>
  )

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      <div className="mb-3">
        <div className="flex items-center gap-3">
          {toolbarControls()}
        </div>
      </div>

      {/* Advanced Chart with Integrated Stats */}
      {resolvedDateRange && <><div className="mb-3">
        <Chart
          data={dailyStats}
          stats={stats}
          prevStats={prevStats}
          interval={resolvedDateRange.start === resolvedDateRange.end ? todayInterval : multiDayInterval}
          dateRange={resolvedDateRange}
          period={period}
          todayInterval={todayInterval}
          setTodayInterval={setTodayInterval}
          multiDayInterval={multiDayInterval}
          setMultiDayInterval={setMultiDayInterval}
          lastUpdatedAt={lastUpdatedAtRef.current}
          engagementData={engagementData}
          onExport={() => setIsExportModalOpen(true)}
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
      </div>
      <div className="grid gap-3 lg:grid-cols-2 mb-3 [&>*]:min-w-0">
        <SearchPerformance siteId={siteId} dateRange={resolvedDateRange} />
        <GoalStats
          goalCounts={dashboard?.goal_counts ?? []}
          siteId={siteId}
          dateRange={resolvedDateRange}
        />
      </div></>}

      <DatePicker
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        onApply={(range) => {
          setDateRange(range)
          setPeriod('custom')
          saveSettings('custom', range)
          setIsDatePickerOpen(false)
        }}
        initialRange={dateRange}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        data={dailyStats}
        stats={stats}
        topPages={dashboard?.top_pages}
        topReferrers={dashboard?.top_referrers}
        campaigns={campaigns}
      />

      <FilterModal
        open={isFilterModalOpen}
        initialDimension={filterModalDimension}
        initialFilter={editingFilterIndex !== null ? filters[editingFilterIndex] : null}
        onSave={handleFilterModalSave}
        onClose={handleFilterModalClose}
        onFetchSuggestions={handleFetchSuggestions}
      />
    </div>
  )
}

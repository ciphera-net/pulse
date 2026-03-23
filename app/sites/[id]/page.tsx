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
  type Stats,
  type DailyStat,
} from '@/lib/api/stats'
import { getDateRange, formatDate, getThisWeekRange, getThisMonthRange } from '@/lib/utils/dateRanges'
import { toast } from '@ciphera-net/ui'
import { Button } from '@ciphera-net/ui'
import { Select, DatePicker, DownloadIcon } from '@ciphera-net/ui'
import dynamic from 'next/dynamic'
import { DashboardSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import FilterBar from '@/components/dashboard/FilterBar'
import AddFilterDropdown, { type FilterSuggestion, type FilterSuggestions } from '@/components/dashboard/AddFilterDropdown'
import Chart from '@/components/dashboard/Chart'
import ContentStats from '@/components/dashboard/ContentStats'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Locations from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'

const GoalStats = dynamic(() => import('@/components/dashboard/GoalStats'))
const Campaigns = dynamic(() => import('@/components/dashboard/Campaigns'))
const PeakHours = dynamic(() => import('@/components/dashboard/PeakHours'))
const SearchPerformance = dynamic(() => import('@/components/dashboard/SearchPerformance'))
const EventProperties = dynamic(() => import('@/components/dashboard/EventProperties'))
const ExportModal = dynamic(() => import('@/components/dashboard/ExportModal'))
import { type DimensionFilter, serializeFilters, parseFiltersFromURL } from '@/lib/filters'
import {
  useDashboard,
  useRealtime,
  useStats,
  useDailyStats,
  useCampaigns,
  useAnnotations,
} from '@/lib/swr/dashboard'
import { createAnnotation, updateAnnotation, deleteAnnotation, type AnnotationCategory } from '@/lib/api/annotations'

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
  if (settings?.type === '7') return getDateRange(7)
  if (settings?.type === 'week') return getThisWeekRange()
  if (settings?.type === 'month') return getThisMonthRange()
  if (settings?.type === 'custom' && settings.dateRange) return settings.dateRange
  return getDateRange(30)
}

function getInitialPeriod(): string {
  return loadSavedSettings()?.type || '30'
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
  const lastUpdatedAtRef = useRef<number | null>(null)

  // Dimension filters state
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<DimensionFilter[]>(() => {
    const raw = searchParams.get('filters')
    return raw ? parseFiltersFromURL(raw) : []
  })
  const filtersParam = useMemo(() => serializeFilters(filters), [filters])

  // Selected event for property breakdown
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)

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

  // Fetch full suggestion list (up to 100) when a dimension is selected in the filter dropdown
  const handleFetchSuggestions = useCallback(async (dimension: string): Promise<FilterSuggestion[]> => {
    const start = dateRange.start
    const end = dateRange.end
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
  }, [siteId, dateRange.start, dateRange.end, filtersParam])

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

  const interval = dateRange.start === dateRange.end ? todayInterval : multiDayInterval

  // Previous period date range for comparison
  const prevRange = useMemo(() => {
    const startDate = new Date(dateRange.start)
    const endDate = new Date(dateRange.end)
    const duration = endDate.getTime() - startDate.getTime()
    if (duration === 0) {
      const prevEnd = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
      return { start: prevEnd.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] }
    }
    const prevEnd = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
    const prevStart = new Date(prevEnd.getTime() - duration)
    return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] }
  }, [dateRange])

  // Single dashboard request replaces focused hooks (overview, pages, locations,
  // devices, referrers, goals). The backend runs all queries in parallel
  // and caches the result in Redis for efficient data loading.
  const { data: dashboard, isLoading: dashboardLoading, isValidating: dashboardValidating, error: dashboardError } = useDashboard(siteId, dateRange.start, dateRange.end, interval, filtersParam || undefined)
  const { data: realtimeData } = useRealtime(siteId)
  const { data: prevStats } = useStats(siteId, prevRange.start, prevRange.end)
  const { data: prevDailyStats } = useDailyStats(siteId, prevRange.start, prevRange.end, interval)
  const { data: campaigns } = useCampaigns(siteId, dateRange.start, dateRange.end)
  const { data: annotations, mutate: mutateAnnotations } = useAnnotations(siteId, dateRange.start, dateRange.end)

  // Annotation mutation handlers
  const handleCreateAnnotation = async (data: { date: string; time?: string; text: string; category: string }) => {
    await createAnnotation(siteId, { ...data, category: data.category as AnnotationCategory })
    mutateAnnotations()
    toast.success('Annotation added')
  }

  const handleUpdateAnnotation = async (id: string, data: { date: string; time?: string; text: string; category: string }) => {
    await updateAnnotation(siteId, id, { ...data, category: data.category as AnnotationCategory })
    mutateAnnotations()
    toast.success('Annotation updated')
  }

  const handleDeleteAnnotation = async (id: string) => {
    await deleteAnnotation(siteId, id)
    mutateAnnotations()
    toast.success('Annotation deleted')
  }

  // Derive typed values from single dashboard response
  const site = dashboard?.site ?? null
  const stats: Stats = dashboard?.stats ?? { pageviews: 0, visitors: 0, bounce_rate: 0, avg_duration: 0 }
  const realtime = realtimeData?.visitors ?? dashboard?.realtime_visitors ?? 0
  const dailyStats: DailyStat[] = dashboard?.daily_stats ?? []

  // Build filter suggestions from current dashboard data
  const filterSuggestions = useMemo<FilterSuggestions>(() => {
    const s: FilterSuggestions = {}

    // Pages
    const topPages = dashboard?.top_pages ?? []
    if (topPages.length > 0) {
      s.page = topPages.map(p => ({ value: p.path, label: p.path, count: p.pageviews }))
    }

    // Referrers
    const refs = dashboard?.top_referrers ?? []
    if (refs.length > 0) {
      s.referrer = refs.filter(r => r.referrer && r.referrer !== '').map(r => ({
        value: r.referrer,
        label: r.referrer,
        count: r.pageviews,
      }))
    }

    // Countries
    const ctrs = dashboard?.countries ?? []
    if (ctrs.length > 0) {
      const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }) } catch { return null } })()
      s.country = ctrs.filter(c => c.country && c.country !== 'Unknown').map(c => ({
        value: c.country,
        label: regionNames?.of(c.country) ?? c.country,
        count: c.pageviews,
      }))
    }

    // Regions
    const regs = dashboard?.regions ?? []
    if (regs.length > 0) {
      s.region = regs.filter(r => r.region && r.region !== 'Unknown').map(r => ({
        value: r.region,
        label: r.region,
        count: r.pageviews,
      }))
    }

    // Cities
    const cts = dashboard?.cities ?? []
    if (cts.length > 0) {
      s.city = cts.filter(c => c.city && c.city !== 'Unknown').map(c => ({
        value: c.city,
        label: c.city,
        count: c.pageviews,
      }))
    }

    // Browsers
    const brs = dashboard?.browsers ?? []
    if (brs.length > 0) {
      s.browser = brs.filter(b => b.browser && b.browser !== 'Unknown').map(b => ({
        value: b.browser,
        label: b.browser,
        count: b.pageviews,
      }))
    }

    // OS
    const oses = dashboard?.os ?? []
    if (oses.length > 0) {
      s.os = oses.filter(o => o.os && o.os !== 'Unknown').map(o => ({
        value: o.os,
        label: o.os,
        count: o.pageviews,
      }))
    }

    // Devices
    const devs = dashboard?.devices ?? []
    if (devs.length > 0) {
      s.device = devs.filter(d => d.device && d.device !== 'Unknown').map(d => ({
        value: d.device,
        label: d.device,
        count: d.pageviews,
      }))
    }

    // UTM from campaigns
    const camps = campaigns ?? []
    if (camps.length > 0) {
      const sources = new Map<string, number>()
      const mediums = new Map<string, number>()
      const campNames = new Map<string, number>()
      camps.forEach(c => {
        if (c.source) sources.set(c.source, (sources.get(c.source) ?? 0) + c.pageviews)
        if (c.medium) mediums.set(c.medium, (mediums.get(c.medium) ?? 0) + c.pageviews)
        if (c.campaign) campNames.set(c.campaign, (campNames.get(c.campaign) ?? 0) + c.pageviews)
      })
      if (sources.size > 0) s.utm_source = [...sources.entries()].map(([v, c]) => ({ value: v, label: v, count: c }))
      if (mediums.size > 0) s.utm_medium = [...mediums.entries()].map(([v, c]) => ({ value: v, label: v, count: c }))
      if (campNames.size > 0) s.utm_campaign = [...campNames.entries()].map(([v, c]) => ({ value: v, label: v, count: c }))
    }

    return s
  }, [dashboard, campaigns])

  // Show error toast on fetch failure
  useEffect(() => {
    if (dashboardError) {
      toast.error('Failed to load dashboard analytics')
    }
  }, [dashboardError])

  // Track when data was last updated (for "Live · Xs ago" display)
  useEffect(() => {
    if (dashboard) lastUpdatedAtRef.current = Date.now()
  }, [dashboard])

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
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8">
        <p className="text-neutral-600 dark:text-neutral-400">Site not found</p>
      </div>
    )
  }

  return (
    <div className={`w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">
                {site.name}
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400">
                {site.domain}
              </p>
            </div>

            {/* Realtime Indicator */}
            <div
              className="flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                {realtime} current visitors
              </span>
            </div>
          </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setIsExportModalOpen(true)}
                  variant="primary"
                  className="hidden md:inline-flex gap-2 text-sm"
                >
                  <DownloadIcon className="w-4 h-4" />
                  Export
                </Button>
                <Select
                  variant="input"
                  className="min-w-[140px]"
                  value={period}
                  onChange={(value) => {
                    if (value === 'today') {
                      const today = formatDate(new Date())
                      const range = { start: today, end: today }
                      setDateRange(range)
                      setPeriod('today')
                      saveSettings('today', range)
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
                    } else if (value === 'custom') {
                      setIsDatePickerOpen(true)
                    }
                  }}
                  options={[
                    { value: 'today', label: 'Today' },
                    { value: '7', label: 'Last 7 days' },
                    { value: '30', label: 'Last 30 days' },
                    { value: 'divider-1', label: '', divider: true },
                    { value: 'week', label: 'This week' },
                    { value: 'month', label: 'This month' },
                    { value: 'divider-2', label: '', divider: true },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
              </div>
            </div>
        </div>
      </div>

      {/* Dimension Filters */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <AddFilterDropdown onAdd={handleAddFilter} suggestions={filterSuggestions} onFetchSuggestions={handleFetchSuggestions} />
        <FilterBar filters={filters} onRemove={handleRemoveFilter} onClear={handleClearFilters} />
      </div>

      {/* Refetch indicator — visible when SWR is revalidating with stale data on screen */}
      {dashboardValidating && !dashboardLoading && (
        <div className="h-0.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden mb-2">
          <div className="h-full w-1/3 rounded-full bg-brand-orange animate-[shimmer_1.2s_ease-in-out_infinite]" />
        </div>
      )}

      {/* Advanced Chart with Integrated Stats */}
      <div className="mb-6">
        <Chart
          data={dailyStats}
          prevData={prevDailyStats}
          stats={stats}
          prevStats={prevStats}
          interval={dateRange.start === dateRange.end ? todayInterval : multiDayInterval}
          dateRange={dateRange}
          period={period}
          todayInterval={todayInterval}
          setTodayInterval={setTodayInterval}
          multiDayInterval={multiDayInterval}
          setMultiDayInterval={setMultiDayInterval}
          lastUpdatedAt={lastUpdatedAtRef.current}
          annotations={annotations}
          canManageAnnotations={true}
          onCreateAnnotation={handleCreateAnnotation}
          onUpdateAnnotation={handleUpdateAnnotation}
          onDeleteAnnotation={handleDeleteAnnotation}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6 [&>*]:min-w-0">
        <ContentStats
          topPages={dashboard?.top_pages ?? []}
          entryPages={dashboard?.entry_pages ?? []}
          exitPages={dashboard?.exit_pages ?? []}
          domain={site.domain}
          collectPagePaths={site.collect_page_paths ?? true}
          siteId={siteId}
          dateRange={dateRange}
          onFilter={handleAddFilter}
        />
        <TopReferrers
          referrers={dashboard?.top_referrers ?? []}
          collectReferrers={site.collect_referrers ?? true}
          siteId={siteId}
          dateRange={dateRange}
          onFilter={handleAddFilter}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6 [&>*]:min-w-0">
        <Locations
          countries={dashboard?.countries ?? []}
          cities={dashboard?.cities ?? []}
          regions={dashboard?.regions ?? []}
          geoDataLevel={site.collect_geo_data || 'full'}
          siteId={siteId}
          dateRange={dateRange}
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
          dateRange={dateRange}
          onFilter={handleAddFilter}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6 [&>*]:min-w-0">
        <Campaigns siteId={siteId} dateRange={dateRange} filters={filtersParam || undefined} onFilter={handleAddFilter} />
        <PeakHours siteId={siteId} dateRange={dateRange} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2 mb-6 [&>*]:min-w-0">
        <SearchPerformance siteId={siteId} dateRange={dateRange} />
        <GoalStats
          goalCounts={(dashboard?.goal_counts ?? []).filter(g => !/^scroll_\d+$/.test(g.event_name))}
          onSelectEvent={setSelectedEvent}
        />
      </div>

      {/* Event Properties Breakdown */}
      {selectedEvent && (
        <div className="mb-8">
          <EventProperties
            siteId={siteId}
            eventName={selectedEvent}
            dateRange={dateRange}
            onClose={() => setSelectedEvent(null)}
          />
        </div>
      )}

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
    </div>
  )
}

'use client'

import { useAuth } from '@/lib/auth/context'
import { logger } from '@/lib/utils/logger'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { getPerformanceByPage, type Stats, type DailyStat } from '@/lib/api/stats'
import { getDateRange } from '@ciphera-net/ui'
import { toast } from '@ciphera-net/ui'
import { Button } from '@ciphera-net/ui'
import { Select, DatePicker, DownloadIcon } from '@ciphera-net/ui'
import { DashboardSkeleton, useMinimumLoading } from '@/components/skeletons'
import ExportModal from '@/components/dashboard/ExportModal'
import ContentStats from '@/components/dashboard/ContentStats'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Locations from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import Chart from '@/components/dashboard/Chart'
import PerformanceStats from '@/components/dashboard/PerformanceStats'
import GoalStats from '@/components/dashboard/GoalStats'
import ScrollDepth from '@/components/dashboard/ScrollDepth'
import Campaigns from '@/components/dashboard/Campaigns'
import FilterBar from '@/components/dashboard/FilterBar'
import AddFilterDropdown from '@/components/dashboard/AddFilterDropdown'
import EventProperties from '@/components/dashboard/EventProperties'
import { type DimensionFilter, serializeFilters, parseFiltersFromURL } from '@/lib/filters'
import {
  useDashboardOverview,
  useDashboardPages,
  useDashboardLocations,
  useDashboardDevices,
  useDashboardReferrers,
  useDashboardPerformance,
  useDashboardGoals,
  useRealtime,
  useStats,
  useDailyStats,
  useCampaigns,
} from '@/lib/swr/dashboard'

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
    const today = new Date().toISOString().split('T')[0]
    return { start: today, end: today }
  }
  if (settings?.type === '7') return getDateRange(7)
  if (settings?.type === 'custom' && settings.dateRange) return settings.dateRange
  return getDateRange(30)
}

export default function SiteDashboardPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'owner' || user?.role === 'admin'

  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  // UI state - initialized from localStorage synchronously to avoid double-fetch
  const [dateRange, setDateRange] = useState(getInitialDateRange)
  const [todayInterval, setTodayInterval] = useState<'minute' | 'hour'>(
    () => loadSavedSettings()?.todayInterval || 'hour'
  )
  const [multiDayInterval, setMultiDayInterval] = useState<'hour' | 'day'>(
    () => loadSavedSettings()?.multiDayInterval || 'day'
  )
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [, setTick] = useState(0)

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
    setFilters(prev => [...prev, filter])
  }, [])

  const handleRemoveFilter = useCallback((index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilters([])
  }, [])

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

  // SWR hooks - replace manual useState + useEffect + setInterval polling
  // Each hook handles its own refresh interval, deduplication, and error retry
  // Filters are included in cache keys so changing filters auto-refetches
  const { data: overview, isLoading: overviewLoading, error: overviewError } = useDashboardOverview(siteId, dateRange.start, dateRange.end, interval, filtersParam || undefined)
  const { data: pages } = useDashboardPages(siteId, dateRange.start, dateRange.end, filtersParam || undefined)
  const { data: locations } = useDashboardLocations(siteId, dateRange.start, dateRange.end, filtersParam || undefined)
  const { data: devicesData } = useDashboardDevices(siteId, dateRange.start, dateRange.end, filtersParam || undefined)
  const { data: referrers } = useDashboardReferrers(siteId, dateRange.start, dateRange.end, filtersParam || undefined)
  const { data: performanceData } = useDashboardPerformance(siteId, dateRange.start, dateRange.end, filtersParam || undefined)
  const { data: goalsData } = useDashboardGoals(siteId, dateRange.start, dateRange.end, filtersParam || undefined)
  const { data: realtimeData } = useRealtime(siteId)
  const { data: prevStats } = useStats(siteId, prevRange.start, prevRange.end)
  const { data: prevDailyStats } = useDailyStats(siteId, prevRange.start, prevRange.end, interval)
  const { data: campaigns } = useCampaigns(siteId, dateRange.start, dateRange.end)

  // Derive typed values from SWR data
  const site = overview?.site ?? null
  const stats: Stats = overview?.stats ?? { pageviews: 0, visitors: 0, bounce_rate: 0, avg_duration: 0 }
  const realtime = realtimeData?.visitors ?? overview?.realtime_visitors ?? 0
  const dailyStats: DailyStat[] = overview?.daily_stats ?? []

  // Show error toast on fetch failure
  useEffect(() => {
    if (overviewError) {
      toast.error('Failed to load dashboard analytics')
    }
  }, [overviewError])

  // Track when data was last updated (for "Live · Xs ago" display)
  useEffect(() => {
    if (overview) setLastUpdatedAt(Date.now())
  }, [overview])

  // Tick every 1s so "Live · Xs ago" counts in real time
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

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
    const today = new Date().toISOString().split('T')[0]
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

  const showSkeleton = useMinimumLoading(overviewLoading)

  if (showSkeleton) {
    return <DashboardSkeleton />
  }

  if (!site) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-neutral-600 dark:text-neutral-400">Site not found</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8"
    >
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                {site.name}
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400">
                {site.domain}
              </p>
            </div>

            {/* Realtime Indicator */}
            <button
              onClick={() => router.push(`/sites/${siteId}/realtime`)}
              className="flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20 hover:bg-green-500/20 transition-colors cursor-pointer"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                {realtime} current visitors
              </span>
            </button>
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
                  value={
                    dateRange.start === new Date().toISOString().split('T')[0] && dateRange.end === new Date().toISOString().split('T')[0]
                      ? 'today'
                      : dateRange.start === getDateRange(7).start
                        ? '7'
                        : dateRange.start === getDateRange(30).start
                          ? '30'
                          : 'custom'
                  }
                  onChange={(value) => {
                    if (value === '7') {
                      const range = getDateRange(7)
                      setDateRange(range)
                      saveSettings('7', range)
                    }
                    else if (value === '30') {
                      const range = getDateRange(30)
                      setDateRange(range)
                      saveSettings('30', range)
                    }
                    else if (value === 'today') {
                      const today = new Date().toISOString().split('T')[0]
                      const range = { start: today, end: today }
                      setDateRange(range)
                      saveSettings('today', range)
                    }
                    else if (value === 'custom') {
                      setIsDatePickerOpen(true)
                    }
                  }}
                  options={[
                    { value: 'today', label: 'Today' },
                    { value: '7', label: 'Last 7 days' },
                    { value: '30', label: 'Last 30 days' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
              </div>
              <div
                className="h-6 w-px bg-neutral-200 dark:bg-neutral-700 flex-shrink-0"
                aria-hidden
              />
              <div className="flex items-center gap-1">
                <Button
                  onClick={() => router.push(`/sites/${siteId}/uptime`)}
                  variant="ghost"
                  className="text-sm"
                >
                  Uptime
                </Button>
                <Button
                  onClick={() => router.push(`/sites/${siteId}/funnels`)}
                  variant="ghost"
                  className="text-sm"
                >
                  Funnels
                </Button>
                {canEdit && (
                  <Button
                    onClick={() => router.push(`/sites/${siteId}/settings`)}
                    variant="ghost"
                    className="text-sm"
                  >
                    Settings
                  </Button>
                )}
              </div>
            </div>
        </div>
      </div>

      {/* Dimension Filters */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <FilterBar filters={filters} onRemove={handleRemoveFilter} onClear={handleClearFilters} />
        <AddFilterDropdown onAdd={handleAddFilter} />
      </div>

      {/* Advanced Chart with Integrated Stats */}
      <div className="mb-8">
        <Chart
          data={dailyStats}
          prevData={prevDailyStats}
          stats={stats}
          prevStats={prevStats}
          interval={dateRange.start === dateRange.end ? todayInterval : multiDayInterval}
          dateRange={dateRange}
          todayInterval={todayInterval}
          setTodayInterval={setTodayInterval}
          multiDayInterval={multiDayInterval}
          setMultiDayInterval={setMultiDayInterval}
          lastUpdatedAt={lastUpdatedAt}
        />
      </div>

      {/* Performance Stats - Only show if enabled */}
      {site.enable_performance_insights && (
        <div className="mb-8">
          <PerformanceStats
            stats={performanceData?.performance ?? { lcp: 0, cls: 0, inp: 0 }}
            performanceByPage={performanceData?.performance_by_page ?? null}
            siteId={siteId}
            startDate={dateRange.start}
            endDate={dateRange.end}
            getPerformanceByPage={getPerformanceByPage}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <ContentStats
          topPages={pages?.top_pages ?? []}
          entryPages={pages?.entry_pages ?? []}
          exitPages={pages?.exit_pages ?? []}
          domain={site.domain}
          collectPagePaths={site.collect_page_paths ?? true}
          siteId={siteId}
          dateRange={dateRange}
          onFilter={handleAddFilter}
        />
        <TopReferrers
          referrers={referrers?.top_referrers ?? []}
          collectReferrers={site.collect_referrers ?? true}
          siteId={siteId}
          dateRange={dateRange}
          onFilter={handleAddFilter}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <Locations
          countries={locations?.countries ?? []}
          cities={locations?.cities ?? []}
          regions={locations?.regions ?? []}
          geoDataLevel={site.collect_geo_data || 'full'}
          siteId={siteId}
          dateRange={dateRange}
          onFilter={handleAddFilter}
        />
        <TechSpecs
          browsers={devicesData?.browsers ?? []}
          os={devicesData?.os ?? []}
          devices={devicesData?.devices ?? []}
          screenResolutions={devicesData?.screen_resolutions ?? []}
          collectDeviceInfo={site.collect_device_info ?? true}
          collectScreenResolution={site.collect_screen_resolution ?? true}
          siteId={siteId}
          dateRange={dateRange}
          onFilter={handleAddFilter}
        />
      </div>

      {/* Campaigns Report */}
      <div className="mb-8">
        <Campaigns siteId={siteId} dateRange={dateRange} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <GoalStats
          goalCounts={(goalsData?.goal_counts ?? []).filter(g => !/^scroll_\d+$/.test(g.event_name))}
          onSelectEvent={setSelectedEvent}
        />
        <ScrollDepth goalCounts={goalsData?.goal_counts ?? []} totalPageviews={stats.pageviews} />
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
        topPages={pages?.top_pages}
        topReferrers={referrers?.top_referrers}
        campaigns={campaigns}
      />
    </motion.div>
  )
}

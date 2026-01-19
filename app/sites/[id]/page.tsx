'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSite, type Site } from '@/lib/api/sites'
import { getStats, getRealtime, getDailyStats, getTopPages, getTopReferrers, getCountries, getCities, getRegions, getBrowsers, getOS, getDevices, getScreenResolutions, getEntryPages, getExitPages, getDashboard, type Stats, type DailyStat } from '@/lib/api/stats'
import { formatNumber, formatDuration, getDateRange } from '@/lib/utils/format'
import { toast } from 'sonner'
import LoadingOverlay from '@/components/LoadingOverlay'
import Select from '@/components/ui/Select'
import DatePicker from '@/components/ui/DatePicker'
import ContentStats from '@/components/dashboard/ContentStats'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Locations from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import Chart from '@/components/dashboard/Chart'
import PerformanceStats from '@/components/dashboard/PerformanceStats'

export default function SiteDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const [site, setSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({ pageviews: 0, visitors: 0, bounce_rate: 0, avg_duration: 0 })
  const [prevStats, setPrevStats] = useState<Stats | undefined>(undefined)
  const [realtime, setRealtime] = useState(0)
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([])
  const [prevDailyStats, setPrevDailyStats] = useState<DailyStat[] | undefined>(undefined)
  const [topPages, setTopPages] = useState<any[]>([])
  const [entryPages, setEntryPages] = useState<any[]>([])
  const [exitPages, setExitPages] = useState<any[]>([])
  const [topReferrers, setTopReferrers] = useState<any[]>([])
  const [countries, setCountries] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])
  const [regions, setRegions] = useState<any[]>([])
  const [browsers, setBrowsers] = useState<any[]>([])
  const [os, setOS] = useState<any[]>([])
  const [devices, setDevices] = useState<any[]>([])
  const [screenResolutions, setScreenResolutions] = useState<any[]>([])
  const [performance, setPerformance] = useState<{ lcp: number, cls: number, inp: number }>({ lcp: 0, cls: 0, inp: 0 })
  const [dateRange, setDateRange] = useState(getDateRange(30))
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [todayInterval, setTodayInterval] = useState<'minute' | 'hour'>('hour')

  useEffect(() => {
    loadData()
    const interval = setInterval(() => {
      loadRealtime()
    }, 30000) // Update every 30 seconds
    return () => clearInterval(interval)
  }, [siteId, dateRange, todayInterval])

  const getPreviousDateRange = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    const duration = endDate.getTime() - startDate.getTime()
    
    // * If duration is 0 (Today), set previous range to yesterday
    if (duration === 0) {
      const prevEnd = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
      const prevStart = prevEnd
      return {
        start: prevStart.toISOString().split('T')[0],
        end: prevEnd.toISOString().split('T')[0]
      }
    }

    const prevEnd = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
    const prevStart = new Date(prevEnd.getTime() - duration)
    
    return {
      start: prevStart.toISOString().split('T')[0],
      end: prevEnd.toISOString().split('T')[0]
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      const interval = dateRange.start === dateRange.end ? todayInterval : 'day'
      
      const [data, prevStatsData, prevDailyStatsData] = await Promise.all([
        getDashboard(siteId, dateRange.start, dateRange.end, 10, interval),
        (async () => {
          const prevRange = getPreviousDateRange(dateRange.start, dateRange.end)
          return getStats(siteId, prevRange.start, prevRange.end)
        })(),
        (async () => {
          const prevRange = getPreviousDateRange(dateRange.start, dateRange.end)
          return getDailyStats(siteId, prevRange.start, prevRange.end, interval)
        })()
      ])

      setSite(data.site)
      setStats(data.stats || { pageviews: 0, visitors: 0, bounce_rate: 0, avg_duration: 0 })
      setRealtime(data.realtime_visitors || 0)
      setDailyStats(Array.isArray(data.daily_stats) ? data.daily_stats : [])
      
      setPrevStats(prevStatsData)
      setPrevDailyStats(prevDailyStatsData)

      setTopPages(Array.isArray(data.top_pages) ? data.top_pages : [])
      setEntryPages(Array.isArray(data.entry_pages) ? data.entry_pages : [])
      setExitPages(Array.isArray(data.exit_pages) ? data.exit_pages : [])
      setTopReferrers(Array.isArray(data.top_referrers) ? data.top_referrers : [])
      setCountries(Array.isArray(data.countries) ? data.countries : [])
      setCities(Array.isArray(data.cities) ? data.cities : [])
      setRegions(Array.isArray(data.regions) ? data.regions : [])
      setBrowsers(Array.isArray(data.browsers) ? data.browsers : [])
      setOS(Array.isArray(data.os) ? data.os : [])
      setDevices(Array.isArray(data.devices) ? data.devices : [])
      setScreenResolutions(Array.isArray(data.screen_resolutions) ? data.screen_resolutions : [])
      setPerformance(data.performance || { lcp: 0, cls: 0, inp: 0 })
    } catch (error: any) {
      toast.error('Failed to load data: ' + (error.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const loadRealtime = async () => {
    try {
      const data = await getRealtime(siteId)
      setRealtime(data.visitors)
    } catch (error) {
      // Silently fail for realtime updates
    }
  }

  if (loading) {
    return <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Ciphera Analytics" />
  }

  if (!site) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-neutral-600 dark:text-neutral-400">Site not found</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
                {site.name}
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400">
                {site.domain}
              </p>
            </div>
            
            {/* Realtime Indicator */}
            <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                {realtime} current visitors
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Select
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
                if (value === '7') setDateRange(getDateRange(7))
                else if (value === '30') setDateRange(getDateRange(30))
                else if (value === 'today') {
                  const today = new Date().toISOString().split('T')[0]
                  setDateRange({ start: today, end: today })
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
            {dateRange.start === new Date().toISOString().split('T')[0] && dateRange.end === new Date().toISOString().split('T')[0] && (
              <Select
                value={todayInterval}
                onChange={(value) => setTodayInterval(value as 'minute' | 'hour')}
                options={[
                  { value: 'minute', label: '1 min' },
                  { value: 'hour', label: '1 hour' },
                ]}
                className="min-w-[100px]"
              />
            )}
            <button
              onClick={() => router.push(`/sites/${siteId}/settings`)}
              className="btn-secondary text-sm"
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Chart with Integrated Stats */}
      <div className="mb-8">
        <Chart 
          data={dailyStats} 
          prevData={prevDailyStats}
          stats={stats} 
          prevStats={prevStats}
          interval={dateRange.start === dateRange.end ? todayInterval : 'day'}
        />
      </div>

      {/* Performance Stats - Only show if enabled */}
      {site.enable_performance_insights && (
        <div className="mb-8">
          <PerformanceStats stats={performance} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <ContentStats
          topPages={topPages}
          entryPages={entryPages}
          exitPages={exitPages}
          domain={site.domain}
          collectPagePaths={site.collect_page_paths ?? true}
        />
        <TopReferrers
          referrers={topReferrers}
          collectReferrers={site.collect_referrers ?? true}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <Locations
          countries={countries}
          cities={cities}
          regions={regions}
          geoDataLevel={site.collect_geo_data || 'full'}
        />
        <TechSpecs
          browsers={browsers}
          os={os}
          devices={devices}
          screenResolutions={screenResolutions}
          collectDeviceInfo={site.collect_device_info ?? true}
          collectScreenResolution={site.collect_screen_resolution ?? true}
        />
      </div>

      <DatePicker
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        onApply={(range) => {
          setDateRange(range)
          setIsDatePickerOpen(false)
        }}
        initialRange={dateRange}
      />
    </div>
  )
}

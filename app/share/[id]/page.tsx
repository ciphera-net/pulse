'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { getPublicDashboard, getPublicStats, getPublicDailyStats, getPublicRealtime, getPublicPerformanceByPage, type DashboardData, type Stats, type DailyStat, type PerformanceByPageStat } from '@/lib/api/stats'
import { toast } from '@ciphera-net/ui'
import { getAuthErrorMessage } from '@/lib/utils/authErrors'
import { LoadingOverlay, Button } from '@ciphera-net/ui'
import Chart from '@/components/dashboard/Chart'
import TopPages from '@/components/dashboard/ContentStats'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Locations from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import PerformanceStats from '@/components/dashboard/PerformanceStats'
import { Select, DatePicker as DatePickerModal, Captcha, DownloadIcon, ZapIcon } from '@ciphera-net/ui'
import ExportModal from '@/components/dashboard/ExportModal'

// Helper to get date ranges
const getDateRange = (days: number) => {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - (days - 1)) // -1 because today counts as 1 day
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  }
}

export default function PublicDashboardPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const siteId = params.id as string
  const passwordParam = searchParams.get('password') || undefined

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)
  const [password, setPassword] = useState(passwordParam || '')
  const [isPasswordProtected, setIsPasswordProtected] = useState(false)
  
  // Captcha State
  const [captchaId, setCaptchaId] = useState('')
  const [captchaSolution, setCaptchaSolution] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  
  // Date range state
  const [dateRange, setDateRange] = useState(getDateRange(30))
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [todayInterval, setTodayInterval] = useState<'minute' | 'hour'>('hour')
  const [multiDayInterval, setMultiDayInterval] = useState<'hour' | 'day'>('day')

  // Previous period data
  const [prevStats, setPrevStats] = useState<Stats | undefined>(undefined)
  const [prevDailyStats, setPrevDailyStats] = useState<DailyStat[] | undefined>(undefined)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [, setTick] = useState(0)

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

  // * Auto-refresh interval: chart, KPIs, and realtime count update every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (data && !isPasswordProtected) {
        loadDashboard(true)
        loadRealtime()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [data, isPasswordProtected, dateRange, todayInterval, multiDayInterval, password])

  // * Tick every 5s to refresh "Updated X ago" display
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [siteId, dateRange, todayInterval, multiDayInterval])

  const loadRealtime = async () => {
    try {
      const auth = {
        password,
        captcha: {
          captcha_id: captchaId,
          captcha_solution: captchaSolution,
          captcha_token: captchaToken
        }
      }
      const realtimeData = await getPublicRealtime(siteId, auth)
      if (data) {
        setData({
          ...data,
          realtime_visitors: realtimeData.visitors
        })
      }
    } catch (error) {
      // Silently fail for realtime updates
    }
  }

  const loadDashboard = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      
      const interval = dateRange.start === dateRange.end ? todayInterval : multiDayInterval
      const auth = {
        password,
        captcha: {
            captcha_id: captchaId,
            captcha_solution: captchaSolution,
            captcha_token: captchaToken
        }
      }

      const [dashboardData, prevStatsData, prevDailyStatsData] = await Promise.all([
        getPublicDashboard(
            siteId,
            dateRange.start,
            dateRange.end,
            10,
            interval,
            password,
            auth.captcha
        ),
        (async () => {
            const prevRange = getPreviousDateRange(dateRange.start, dateRange.end)
            return getPublicStats(siteId, prevRange.start, prevRange.end, auth)
        })(),
        (async () => {
            const prevRange = getPreviousDateRange(dateRange.start, dateRange.end)
            return getPublicDailyStats(siteId, prevRange.start, prevRange.end, interval, auth)
        })()
      ])
      
      setData(dashboardData)
      setPrevStats(prevStatsData)
      setPrevDailyStats(prevDailyStatsData)
      setLastUpdatedAt(Date.now())

      setIsPasswordProtected(false)
      // Reset captcha
      setCaptchaId('')
      setCaptchaSolution('')
      setCaptchaToken('')
    } catch (error: any) {
      if ((error.status === 401 || error.response?.status === 401) && (error.data?.is_protected || error.response?.data?.is_protected)) {
        setIsPasswordProtected(true)
        if (password) {
          toast.error('Invalid password or captcha')
          // Reset captcha on failure
          setCaptchaId('')
          setCaptchaSolution('')
          setCaptchaToken('')
        }
      } else if (error.status === 404 || error.response?.status === 404) {
        toast.error('Site not found')
      } else if (!silent) {
        toast.error(getAuthErrorMessage(error) || 'Failed to load dashboard: ' + ((error as Error)?.message || 'Unknown error'))
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loadDashboard()
  }

  if (loading && !data && !isPasswordProtected) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" />
  }

  if (isPasswordProtected && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 shadow-lg">
          <div className="text-center mb-6">
             <div className="w-12 h-12 bg-brand-orange/10 rounded-xl flex items-center justify-center mx-auto mb-4 text-brand-orange">
              <ZapIcon className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
              Protected Dashboard
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              This dashboard is password protected. Please enter the password to view stats.
            </p>
          </div>
          
          <form onSubmit={handlePasswordSubmit}>
            <div className="mb-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                autoFocus
              />
            </div>
            <div className="mb-4">
                <Captcha
                    onVerify={(id, solution, token) => {
                        setCaptchaId(id)
                        setCaptchaSolution(solution)
                        setCaptchaToken(token || '')
                    }}
                    apiUrl={process.env.NEXT_PUBLIC_CAPTCHA_API_URL}
                />
            </div>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
            >
              Access Dashboard
            </Button>
          </form>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { site, stats, daily_stats, top_pages, entry_pages, exit_pages, top_referrers, countries, cities, regions, browsers, os, devices, screen_resolutions, performance, performance_by_page, realtime_visitors } = data

  // Provide defaults for potentially undefined data
  const safeDailyStats = daily_stats || []
  const safeStats = stats || { pageviews: 0, visitors: 0, bounce_rate: 0, avg_duration: 0 }
  const safeTopPages = top_pages || []
  const safeEntryPages = entry_pages || []
  const safeExitPages = exit_pages || []
  const safeTopReferrers = top_referrers || []
  const safeCountries = countries || []
  const safeCities = cities || []
  const safeRegions = regions || []
  const safeBrowsers = browsers || []
  const safeOS = os || []
  const safeDevices = devices || []
  const safeScreenResolutions = screen_resolutions || []

  return (
    <div className="min-h-screen">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-4 mb-2">
                 <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
                        <span className="text-sm font-medium text-brand-orange uppercase tracking-wider">Public Dashboard</span>
                    </div>
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
                    <img 
                        src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=64`}
                        alt={site.name}
                        className="w-8 h-8 rounded-lg"
                        onError={(e) => {
                        (e.target as HTMLImageElement).src = '/globe.svg'
                        }}
                    />
                    {site.domain}
                    </h1>
                 </div>

                 {/* Realtime Indicator - Desktop */}
                 <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20 self-end mb-1">
                   <span className="relative flex h-2 w-2">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                     <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                   </span>
                   <span className="text-sm font-medium text-green-700 dark:text-green-400">
                     {realtime_visitors} current visitors
                   </span>
                 </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIsExportModalOpen(true)}
                className="hidden md:flex items-center gap-2 px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
              >
                <DownloadIcon className="w-4 h-4" />
                <span>Export</span>
              </button>

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
              {/* Powered by Ciphera Badge */}
              <a 
                href="https://ciphera.net" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hidden md:flex items-center gap-2 px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
              >
                <ZapIcon className="w-4 h-4" />
                <span>Powered by Ciphera</span>
              </a>
            </div>
          </div>
          
           {/* Realtime Indicator - Mobile */}
            <div className="md:hidden flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20 w-fit mt-4">
                 <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    {realtime_visitors} current visitors
                </span>
            </div>
        </div>

        {/* Chart */}
        <div className="mb-8">
          <Chart 
            data={safeDailyStats} 
            prevData={prevDailyStats} 
            stats={safeStats} 
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
        {performance && data.site?.enable_performance_insights && (
           <div className="mb-8">
            <PerformanceStats 
                stats={performance} 
                performanceByPage={performance_by_page} 
                siteId={siteId}
                startDate={dateRange.start}
                endDate={dateRange.end}
                getPerformanceByPage={(siteId, startDate, endDate, opts) => {
                    return getPublicPerformanceByPage(siteId, startDate, endDate, opts, {
                        password,
                        captcha: {
                            captcha_id: captchaId,
                            captcha_solution: captchaSolution,
                            captcha_token: captchaToken
                        }
                    })
                }}
            />
          </div>
        )}

        {/* Details Grid */}
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <TopPages
            topPages={safeTopPages}
            entryPages={safeEntryPages}
            exitPages={safeExitPages}
            domain={site.domain}
            collectPagePaths={site.collect_page_paths ?? true}
            siteId={siteId}
            dateRange={dateRange}
          />
          <TopReferrers
            referrers={safeTopReferrers}
            collectReferrers={site.collect_referrers ?? true}
            siteId={siteId}
            dateRange={dateRange}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <Locations
            countries={safeCountries}
            cities={safeCities}
            regions={safeRegions}
            geoDataLevel={site.collect_geo_data || 'full'}
            siteId={siteId}
            dateRange={dateRange}
          />
          <TechSpecs
            browsers={safeBrowsers}
            os={safeOS}
            devices={safeDevices}
            screenResolutions={safeScreenResolutions}
            collectDeviceInfo={site.collect_device_info ?? true}
            collectScreenResolution={site.collect_screen_resolution ?? true}
            siteId={siteId}
            dateRange={dateRange}
          />
        </div>

      </div>

      <DatePickerModal
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        initialRange={dateRange}
        onApply={(range) => {
          setDateRange(range)
          setIsDatePickerOpen(false)
        }}
      />
      
      {data && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          data={data.daily_stats || []}
          stats={data.stats}
          topPages={data.top_pages}
          topReferrers={data.top_referrers}
        />
      )}
    </div>
  )
}

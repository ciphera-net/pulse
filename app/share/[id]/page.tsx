'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { getPublicDashboard, type DashboardData } from '@/lib/api/stats'
import { toast } from 'sonner'
import LoadingOverlay from '@/components/LoadingOverlay'
import StatsCard from '@/components/dashboard/StatsCard'
import Chart from '@/components/dashboard/Chart'
import TopPages from '@/components/dashboard/TopPages'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Locations from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import PerformanceStats from '@/components/dashboard/PerformanceStats'
import Select from '@/components/Select'
import { CalendarIcon } from '@heroicons/react/outline'
import { LightningBoltIcon } from '@heroicons/react/solid'
import DatePickerModal from '@/components/dashboard/DatePickerModal'

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
  
  // Date range state
  const [dateRange, setDateRange] = useState(getDateRange(30))
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  
  // Auto-refresh interval (for realtime)
  useEffect(() => {
    const interval = setInterval(() => {
      // Only refresh realtime count if we have data
      if (data && !isPasswordProtected) {
        loadDashboard(true)
      }
    }, 10000) // 10 seconds

    return () => clearInterval(interval)
  }, [data, isPasswordProtected, dateRange, password])

  useEffect(() => {
    loadDashboard()
  }, [siteId, dateRange])

  const loadDashboard = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      
      const dashboardData = await getPublicDashboard(
        siteId,
        dateRange.start,
        dateRange.end,
        10,
        dateRange.start === dateRange.end ? 'hour' : 'day',
        password
      )
      
      setData(dashboardData)
      setIsPasswordProtected(false)
    } catch (error: any) {
      if (error.response?.status === 401 && error.response?.data?.is_protected) {
        setIsPasswordProtected(true)
      } else if (error.response?.status === 404) {
        toast.error('Site not found')
      } else if (!silent) {
        toast.error('Failed to load dashboard: ' + (error.message || 'Unknown error'))
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
    return <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Ciphera Analytics" />
  }

  if (isPasswordProtected && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-black px-4">
        <div className="max-w-md w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-8 shadow-lg">
          <div className="text-center mb-6">
             <div className="w-12 h-12 bg-brand-orange/10 rounded-xl flex items-center justify-center mx-auto mb-4 text-brand-orange">
              <LightningBoltIcon className="w-6 h-6" />
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
            <button
              type="submit"
              className="w-full btn-primary"
            >
              Access Dashboard
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { site, stats, daily_stats, top_pages, entry_pages, exit_pages, top_referrers, countries, cities, regions, browsers, os, devices, screen_resolutions, performance, realtime_visitors } = data

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
    <div className="min-h-screen bg-neutral-50 dark:bg-black">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
              <span className="text-sm font-medium text-brand-orange uppercase tracking-wider">Public Dashboard</span>
            </div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
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
            {/* Powered by Ciphera Badge */}
            <a 
              href="https://ciphera.net" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-2 px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
            >
              <LightningBoltIcon className="w-4 h-4" />
              <span>Powered by Ciphera</span>
            </a>
          </div>
        </div>

        {/* Realtime & Key Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
           <div className="col-span-2 lg:col-span-4 bg-gradient-to-r from-brand-orange/10 to-transparent border border-brand-orange/20 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-3 h-3 bg-brand-orange rounded-full animate-ping absolute top-0 left-0 opacity-75"></div>
                <div className="w-3 h-3 bg-brand-orange rounded-full relative z-10"></div>
              </div>
              <span className="text-brand-orange font-medium">Current Visitors</span>
            </div>
            <span className="text-2xl font-bold text-brand-orange">{realtime_visitors}</span>
          </div>

          <StatsCard
            title="Total Visitors"
            value={safeStats.visitors}
            change={0} 
            loading={false}
          />
          <StatsCard
            title="Total Pageviews"
            value={safeStats.pageviews}
            change={0}
            loading={false}
          />
          <StatsCard
            title="Bounce Rate"
            value={`${Math.round(safeStats.bounce_rate)}%`}
            change={0}
            loading={false}
            inverse
          />
          <StatsCard
            title="Avg Duration"
            value={`${Math.round(safeStats.avg_duration)}s`}
            change={0}
            loading={false}
          />
        </div>

        {/* Chart */}
        <div className="mb-8">
          <Chart 
            data={safeDailyStats} 
            prevData={[]} // No comparison for public view yet
            stats={safeStats} 
            prevStats={{ pageviews: 0, visitors: 0, bounce_rate: 0, avg_duration: 0 }}
            interval={dateRange.start === dateRange.end ? 'hour' : 'day'}
          />
        </div>

         {/* Performance Stats */}
        {performance && (
           <div className="mb-8">
            <PerformanceStats stats={performance} />
          </div>
        )}

        {/* Details Grid */}
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <TopPages 
            pages={safeTopPages} 
            entryPages={safeEntryPages}
            exitPages={safeExitPages}
          />
          <TopReferrers referrers={safeTopReferrers} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <Locations 
            countries={safeCountries} 
            cities={safeCities} 
            regions={safeRegions} 
          />
          <TechSpecs 
            browsers={safeBrowsers} 
            os={safeOS} 
            devices={safeDevices}
            screenResolutions={safeScreenResolutions}
          />
        </div>

        <footer className="mt-12 pt-8 border-t border-neutral-200 dark:border-neutral-800 text-center text-sm text-neutral-500">
           <p>© {new Date().getFullYear()} {site.name}. Analytics by <a href="https://ciphera.net" className="text-brand-orange hover:underline">Ciphera</a>.</p>
        </footer>
      </div>

      <DatePickerModal
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        dateRange={dateRange}
        onApply={(start, end) => {
          setDateRange({ start, end })
          setIsDatePickerOpen(false)
        }}
      />
    </div>
  )
}

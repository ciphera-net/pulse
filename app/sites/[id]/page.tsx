'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSite, type Site } from '@/lib/api/sites'
import { getStats, getRealtime, getDailyStats, getTopPages, getTopReferrers, getCountries, getCities, getRegions, getBrowsers, getOS, getDevices, getScreenResolutions, getEntryPages, getExitPages, getDashboard } from '@/lib/api/stats'
import { formatNumber, formatDuration, getDateRange } from '@/lib/utils/format'
import { toast } from 'sonner'
import LoadingOverlay from '@/components/LoadingOverlay'
import StatsCard from '@/components/dashboard/StatsCard'
import RealtimeVisitors from '@/components/dashboard/RealtimeVisitors'
import ContentStats from '@/components/dashboard/ContentStats'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Locations from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import Chart from '@/components/dashboard/Chart'

export default function SiteDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const [site, setSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ pageviews: 0, visitors: 0, bounce_rate: 0, avg_duration: 0 })
  const [realtime, setRealtime] = useState(0)
  const [dailyStats, setDailyStats] = useState<any[]>([])
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
  const [dateRange, setDateRange] = useState(getDateRange(30))

  useEffect(() => {
    loadData()
    const interval = setInterval(() => {
      loadRealtime()
    }, 30000) // Update every 30 seconds
    return () => clearInterval(interval)
  }, [siteId, dateRange])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await getDashboard(siteId, dateRange.start, dateRange.end, 10)

      setSite(data.site)
      setStats(data.stats || { pageviews: 0, visitors: 0, bounce_rate: 0, avg_duration: 0 })
      setRealtime(data.realtime_visitors || 0)
      setDailyStats(Array.isArray(data.daily_stats) ? data.daily_stats : [])
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
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
              {site.name}
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              {site.domain}
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={dateRange.start === getDateRange(7).start ? '7' : dateRange.start === getDateRange(30).start ? '30' : 'custom'}
              onChange={(e) => {
                if (e.target.value === '7') setDateRange(getDateRange(7))
                else if (e.target.value === '30') setDateRange(getDateRange(30))
              }}
              className="btn-secondary text-sm"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="custom">Custom</option>
            </select>
            <button
              onClick={() => router.push(`/sites/${siteId}/settings`)}
              className="btn-secondary text-sm"
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5 mb-8">
        <StatsCard title="Pageviews" value={formatNumber(stats.pageviews)} />
        <StatsCard title="Visitors" value={formatNumber(stats.visitors)} />
        <RealtimeVisitors count={realtime} siteId={siteId} />
        <StatsCard title="Bounce Rate" value={`${Math.round(stats.bounce_rate)}%`} />
        <StatsCard title="Avg Visit Duration" value={formatDuration(stats.avg_duration)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <Chart data={dailyStats} />
        <ContentStats topPages={topPages} entryPages={entryPages} exitPages={exitPages} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <TopReferrers referrers={topReferrers} />
        <Locations countries={countries} cities={cities} regions={regions} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <TechSpecs browsers={browsers} os={os} devices={devices} screenResolutions={screenResolutions} />
      </div>
    </div>
  )
}

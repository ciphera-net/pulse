'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSite, type Site } from '@/lib/api/sites'
import { getStats, getRealtime, getDailyStats, getTopPages, getTopReferrers, getCountries, getCities } from '@/lib/api/stats'
import { formatNumber, getDateRange } from '@/lib/utils/format'
import { toast } from 'sonner'
import LoadingOverlay from '@/components/LoadingOverlay'
import StatsCard from '@/components/dashboard/StatsCard'
import RealtimeVisitors from '@/components/dashboard/RealtimeVisitors'
import TopPages from '@/components/dashboard/TopPages'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Countries from '@/components/dashboard/Countries'
import Chart from '@/components/dashboard/Chart'

export default function SiteDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const [site, setSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ pageviews: 0, visitors: 0 })
  const [realtime, setRealtime] = useState(0)
  const [dailyStats, setDailyStats] = useState<any[]>([])
  const [topPages, setTopPages] = useState<any[]>([])
  const [topReferrers, setTopReferrers] = useState<any[]>([])
  const [countries, setCountries] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])
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
      const [siteData, statsData, realtimeData, dailyData, pagesData, referrersData, countriesData, citiesData] = await Promise.all([
        getSite(siteId),
        getStats(siteId, dateRange.start, dateRange.end),
        getRealtime(siteId),
        getDailyStats(siteId, dateRange.start, dateRange.end),
        getTopPages(siteId, dateRange.start, dateRange.end, 10),
        getTopReferrers(siteId, dateRange.start, dateRange.end, 10),
        getCountries(siteId, dateRange.start, dateRange.end, 10),
        getCities(siteId, dateRange.start, dateRange.end, 10),
      ])
      setSite(siteData)
      setStats(statsData || { pageviews: 0, visitors: 0 })
      setRealtime(realtimeData?.visitors || 0)
      setDailyStats(Array.isArray(dailyData) ? dailyData : [])
      setTopPages(Array.isArray(pagesData) ? pagesData : [])
      setTopReferrers(Array.isArray(referrersData) ? referrersData : [])
      setCountries(Array.isArray(countriesData) ? countriesData : [])
      setCities(Array.isArray(citiesData) ? citiesData : [])
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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatsCard title="Pageviews" value={formatNumber(stats.pageviews)} />
        <StatsCard title="Visitors" value={formatNumber(stats.visitors)} />
        <RealtimeVisitors count={realtime} />
        <StatsCard title="Bounce Rate" value="-" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <Chart data={dailyStats} />
        <TopPages pages={topPages} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <TopReferrers referrers={topReferrers} />
        <Countries countries={countries} cities={cities} />
      </div>
    </div>
  )
}

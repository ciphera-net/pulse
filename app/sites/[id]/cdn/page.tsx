'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import * as Flags from 'country-flag-icons/react/3x2'

const DottedMap = dynamic(() => import('@/components/dashboard/DottedMap'), { ssr: false })
import { getDateRange, formatDate, Select } from '@ciphera-net/ui'
import { ArrowSquareOut, CloudArrowUp } from '@phosphor-icons/react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useDashboard, useBunnyStatus, useBunnyOverview, useBunnyDailyStats, useBunnyTopCountries } from '@/lib/swr/dashboard'
import { SkeletonLine, StatCardSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'

// ─── Helpers ────────────────────────────────────────────────────

// US state codes → map to "US" for the dotted map
const US_STATES = new Set([
  'AL','AK','AZ','AR','CO','CT','DC','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
])
// Canadian province codes → map to "CA"
const CA_PROVINCES = new Set(['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'])

/**
 * Extract ISO country code from BunnyCDN datacenter string.
 * e.g. "EU: Zurich, CH" → "CH", "NA: Chicago, IL" → "US", "NA: Toronto, CA" → "CA"
 */
function extractCountryCode(datacenter: string): string {
  const parts = datacenter.split(', ')
  const code = parts[parts.length - 1]?.trim().toUpperCase()
  if (!code || code.length !== 2) return ''
  if (US_STATES.has(code)) return 'US'
  if (CA_PROVINCES.has(code)) return 'CA'
  return code
}

/**
 * Extract the city name from a BunnyCDN datacenter string.
 * e.g. "EU: Zurich, CH" → "Zurich"
 */
function extractCity(datacenter: string): string {
  const afterColon = datacenter.split(': ')[1] || datacenter
  return afterColon.split(',')[0]?.trim() || datacenter
}

/** Get flag icon component for a country code */
function getFlagIcon(code: string) {
  if (!code) return null
  const FlagComponent = (Flags as Record<string, React.ComponentType<{ className?: string }>>)[code]
  return FlagComponent ? <FlagComponent className="w-5 h-3.5 rounded-sm shadow-sm shrink-0" /> : null
}

/**
 * Map each datacenter entry to its country's centroid for the dotted map.
 * Each datacenter gets its own dot (sized by bandwidth) at the country's position.
 */
function mapToCountryCentroids(data: Array<{ country_code: string; bandwidth: number }>): Array<{ country: string; pageviews: number }> {
  return data
    .map((row) => ({
      country: extractCountryCode(row.country_code),
      pageviews: row.bandwidth,
    }))
    .filter((d) => d.country !== '')
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return value.toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function formatDateShort(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return d.getDate() + ' ' + d.toLocaleString('en-US', { month: 'short' })
}

function changePercent(
  current: number,
  prev: number
): { value: number; positive: boolean } | null {
  if (prev === 0) return null
  const pct = ((current - prev) / prev) * 100
  return { value: pct, positive: pct >= 0 }
}

// ─── Page ───────────────────────────────────────────────────────

export default function CDNPage() {
  const params = useParams()
  const siteId = params.id as string

  // Date range
  const [period, setPeriod] = useState('7')
  const [dateRange, setDateRange] = useState(() => getDateRange(7))

  // Data fetching
  const { data: bunnyStatus } = useBunnyStatus(siteId)
  const { data: dashboard } = useDashboard(siteId, dateRange.start, dateRange.end)
  const { data: overview } = useBunnyOverview(siteId, dateRange.start, dateRange.end)
  const { data: dailyStats } = useBunnyDailyStats(siteId, dateRange.start, dateRange.end)
  const { data: topCountries } = useBunnyTopCountries(siteId, dateRange.start, dateRange.end)

  const showSkeleton = useMinimumLoading(!bunnyStatus)
  const fadeClass = useSkeletonFade(showSkeleton)

  // Document title
  useEffect(() => {
    const domain = dashboard?.site?.domain
    document.title = domain ? `CDN \u00b7 ${domain} | Pulse` : 'CDN | Pulse'
  }, [dashboard?.site?.domain])

  // ─── Loading skeleton ─────────────────────────────────────

  if (showSkeleton) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <SkeletonLine className="h-8 w-48 mb-2" />
            <SkeletonLine className="h-4 w-64" />
          </div>
          <SkeletonLine className="h-9 w-36 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 mb-6">
          <SkeletonLine className="h-6 w-40 mb-4" />
          <SkeletonLine className="h-64 w-full rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
            <SkeletonLine className="h-6 w-32 mb-4" />
            <SkeletonLine className="h-48 w-full rounded-lg" />
          </div>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
            <SkeletonLine className="h-6 w-32 mb-4" />
            <SkeletonLine className="h-48 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  // ─── Not connected state ──────────────────────────────────

  if (bunnyStatus && !bunnyStatus.connected) {
    return (
      <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-5 mb-6">
            <CloudArrowUp size={40} className="text-neutral-400 dark:text-neutral-500" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Connect BunnyCDN
          </h2>
          <p className="text-sm text-neutral-400 max-w-md mb-6">
            Monitor your CDN performance including bandwidth usage, cache hit rates, request volumes, and geographic distribution.
          </p>
          <Link
            href={`/sites/${siteId}/settings?tab=integrations`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-orange hover:bg-brand-orange/90 text-white text-sm font-medium transition-colors"
          >
            Connect in Settings
            <ArrowSquareOut size={16} weight="bold" />
          </Link>
        </div>
      </div>
    )
  }

  // ─── Connected — main view ────────────────────────────────

  const bandwidthChange = overview ? changePercent(overview.total_bandwidth, overview.prev_total_bandwidth) : null
  const requestsChange = overview ? changePercent(overview.total_requests, overview.prev_total_requests) : null
  const cacheHitChange = overview ? changePercent(overview.cache_hit_rate, overview.prev_cache_hit_rate) : null
  const originChange = overview ? changePercent(overview.avg_origin_response, overview.prev_avg_origin_response) : null
  const errorsChange = overview ? changePercent(overview.total_errors, overview.prev_total_errors) : null

  const daily = dailyStats?.daily_stats ?? []
  const countries = topCountries?.countries ?? []
  const totalBandwidth = countries.reduce((sum, row) => sum + row.bandwidth, 0)

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            CDN Analytics
          </h1>
          <p className="text-sm text-neutral-400">
            BunnyCDN performance, bandwidth, and cache metrics
          </p>
        </div>
        <Select
          variant="input"
          className="min-w-[140px]"
          value={period}
          onChange={(value) => {
            if (value === 'today') {
              const today = formatDate(new Date())
              setDateRange({ start: today, end: today })
              setPeriod('today')
            } else if (value === '7') {
              setDateRange(getDateRange(7))
              setPeriod('7')
            } else if (value === '28') {
              setDateRange(getDateRange(28))
              setPeriod('28')
            } else if (value === '30') {
              setDateRange(getDateRange(30))
              setPeriod('30')
            }
          }}
          options={[
            { value: 'today', label: 'Today' },
            { value: '7', label: 'Last 7 days' },
            { value: '28', label: 'Last 28 days' },
            { value: '30', label: 'Last 30 days' },
          ]}
        />
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <OverviewCard
          label="Bandwidth"
          value={overview ? formatBytes(overview.total_bandwidth) : '-'}
          change={bandwidthChange}
        />
        <OverviewCard
          label="Requests"
          value={overview ? formatNumber(overview.total_requests) : '-'}
          change={requestsChange}
        />
        <OverviewCard
          label="Cache Hit Rate"
          value={overview ? overview.cache_hit_rate.toFixed(1) + '%' : '-'}
          change={cacheHitChange}
        />
        <OverviewCard
          label="Origin Response"
          value={overview ? overview.avg_origin_response.toFixed(0) + 'ms' : '-'}
          change={originChange}
          invertColor
        />
        <OverviewCard
          label="Errors"
          value={overview ? formatNumber(overview.total_errors) : '-'}
          change={errorsChange}
          invertColor
        />
      </div>

      {/* Bandwidth chart */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 mb-6">
        <h2 className="text-sm font-semibold text-white mb-4">Bandwidth</h2>
        {daily.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="bandwidthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FD5E0F" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#FD5E0F" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cachedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-neutral-200 dark:text-neutral-800" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateShort}
                tick={{ fontSize: 12, fill: 'currentColor' }}
                className="text-neutral-400 dark:text-neutral-500"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatBytes(v)}
                tick={{ fontSize: 12, fill: 'currentColor' }}
                className="text-neutral-400 dark:text-neutral-500"
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 shadow-lg text-sm">
                      <p className="text-neutral-400 mb-1">{formatDateShort(label)}</p>
                      <p className="text-white font-medium">
                        Total: {formatBytes(payload[0]?.value as number)}
                      </p>
                      {payload[1] && (
                        <p className="text-green-600 dark:text-green-400">
                          Cached: {formatBytes(payload[1]?.value as number)}
                        </p>
                      )}
                    </div>
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="bandwidth_used"
                stroke="#FD5E0F"
                strokeWidth={2}
                fill="url(#bandwidthGrad)"
                name="Total"
              />
              <Area
                type="monotone"
                dataKey="bandwidth_cached"
                stroke="#22C55E"
                strokeWidth={2}
                fill="url(#cachedGrad)"
                name="Cached"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[280px] flex items-center justify-center text-neutral-400 dark:text-neutral-500 text-sm">
            No bandwidth data for this period.
          </div>
        )}
      </div>

      {/* Requests + Errors charts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Requests chart */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Requests</h2>
          {daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-neutral-200 dark:text-neutral-800" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateShort}
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  className="text-neutral-400 dark:text-neutral-500"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatNumber(v)}
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  className="text-neutral-400 dark:text-neutral-500"
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 shadow-lg text-sm">
                        <p className="text-neutral-400 mb-1">{formatDateShort(label)}</p>
                        <p className="text-white font-medium">
                          {formatNumber(payload[0]?.value as number)} requests
                        </p>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="requests_served" fill="#FD5E0F" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-neutral-400 dark:text-neutral-500 text-sm">
              No request data for this period.
            </div>
          )}
        </div>

        {/* Errors chart */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Errors</h2>
          {daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={daily.map((d) => ({
                  date: d.date,
                  '3xx': d.error_3xx,
                  '4xx': d.error_4xx,
                  '5xx': d.error_5xx,
                }))}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-neutral-200 dark:text-neutral-800" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateShort}
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  className="text-neutral-400 dark:text-neutral-500"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatNumber(v)}
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  className="text-neutral-400 dark:text-neutral-500"
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 shadow-lg text-sm">
                        <p className="text-neutral-400 mb-1">{formatDateShort(label)}</p>
                        {payload.map((entry) => (
                          <p key={entry.name} style={{ color: entry.color }} className="font-medium">
                            {entry.name}: {formatNumber(entry.value as number)}
                          </p>
                        ))}
                      </div>
                    )
                  }}
                />
                <Bar dataKey="3xx" stackId="errors" fill="#FACC15" radius={[0, 0, 0, 0]} />
                <Bar dataKey="4xx" stackId="errors" fill="#F97316" radius={[0, 0, 0, 0]} />
                <Bar dataKey="5xx" stackId="errors" fill="#EF4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-neutral-400 dark:text-neutral-500 text-sm">
              No error data for this period.
            </div>
          )}
        </div>
      </div>

      {/* Traffic Distribution */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Traffic Distribution</h2>
        {countries.length > 0 ? (
          <>
            <div className="h-[360px] mb-8">
              <DottedMap data={mapToCountryCentroids(countries)} formatValue={formatBytes} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
              {countries.map((row) => {
                const pct = totalBandwidth > 0 ? (row.bandwidth / totalBandwidth) * 100 : 0
                const cc = extractCountryCode(row.country_code)
                const city = extractCity(row.country_code)
                return (
                  <div key={row.country_code} className="group relative">
                    <div className="flex items-center gap-2.5 mb-2">
                      {cc && getFlagIcon(cc)}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-white truncate block">{city}</span>
                      </div>
                      <span className="text-sm tabular-nums text-neutral-400 shrink-0">
                        {formatBytes(row.bandwidth)}
                      </span>
                    </div>
                    <div className="relative h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-brand-orange transition-all"
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-neutral-900 dark:bg-neutral-700 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      {pct.toFixed(1)}% of total traffic
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="h-[360px] flex items-center justify-center text-neutral-400 dark:text-neutral-500 text-sm">
            No geographic data for this period.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────

function OverviewCard({
  label,
  value,
  change,
  invertColor = false,
}: {
  label: string
  value: string
  change: { value: number; positive: boolean } | null
  invertColor?: boolean
}) {
  // For Origin Response and Errors, a decrease is good (green), an increase is bad (red)
  const isGood = change ? (invertColor ? !change.positive : change.positive) : false
  const isBad = change ? (invertColor ? change.positive : !change.positive) : false
  const changeLabel = change ? (change.positive ? '+' : '') + change.value.toFixed(1) + '%' : null

  return (
    <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <p className="text-xs font-medium text-neutral-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {changeLabel && (
        <p className={`text-xs mt-1 font-medium ${
          isGood ? 'text-green-600 dark:text-green-400' :
          isBad ? 'text-red-600 dark:text-red-400' :
          'text-neutral-400'
        }`}>
          {changeLabel} vs previous period
        </p>
      )}
    </div>
  )
}

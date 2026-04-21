'use client'

import { useAuth } from '@/lib/auth/context'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSite, useUptimeStatus } from '@/lib/swr/dashboard'
import { updateSite, type Site } from '@/lib/api/sites'
import {
  getMonitorChecks,
  type UptimeStatusResponse,
  type MonitorStatus,
  type UptimeCheck,
  type UptimeDailyStat,
} from '@/lib/api/uptime'
import { toast } from '@ciphera-net/ui'
import { Button } from '@ciphera-net/ui'
import { UptimeSkeleton, ChecksSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import { formatDateFull, formatTime, formatDateTimeShort } from '@/lib/utils/formatDate'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/charts'

const responseTimeChartConfig = {
  ms: {
    label: 'Response Time',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

// * Status color mapping
function getStatusColor(status: string): string {
  switch (status) {
    case 'up':
    case 'operational':
      return 'bg-emerald-500'
    case 'degraded':
      return 'bg-amber-500'
    case 'down':
      return 'bg-red-500'
    default:
      return 'bg-neutral-600'
  }
}

function getStatusDotColor(status: string): string {
  switch (status) {
    case 'up':
    case 'operational':
      return 'bg-emerald-500'
    case 'degraded':
      return 'bg-amber-500'
    case 'down':
      return 'bg-red-500'
    default:
      return 'bg-neutral-400'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'up':
    case 'operational':
      return 'Operational'
    case 'degraded':
      return 'Degraded'
    case 'down':
      return 'Down'
    default:
      return 'Unknown'
  }
}

// * Overall status text for the top card
function getOverallStatusText(status: string): string {
  switch (status) {
    case 'up':
    case 'operational':
      return 'All Systems Operational'
    case 'degraded':
      return 'Partial Outage'
    case 'down':
      return 'Major Outage'
    default:
      return 'Unknown Status'
  }
}

function getOverallStatusTextColor(status: string): string {
  switch (status) {
    case 'up':
    case 'operational':
      return 'text-emerald-400'
    case 'degraded':
      return 'text-amber-400'
    case 'down':
      return 'text-red-400'
    default:
      return 'text-neutral-400'
  }
}

function getDayBarColor(stat: UptimeDailyStat | undefined): string {
  if (!stat || stat.total_checks === 0) return 'bg-neutral-600'
  if (stat.failed_checks > 0) return 'bg-red-500'
  if (stat.degraded_checks > 0) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function formatUptime(pct: number): string {
  return pct.toFixed(2) + '%'
}

function formatMs(ms: number | null): string {
  if (ms === null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return 'Never'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

// * Generate array of dates for the last N days
function generateDateRange(days: number): string[] {
  const dates: string[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

// * Component: Styled tooltip for status bar
function StatusBarTooltip({
  stat,
  date,
  visible,
  position,
}: {
  stat: UptimeDailyStat | undefined
  date: string
  visible: boolean
  position: { x: number; y: number }
}) {
  if (!visible) return null

  const formattedDate = formatDateFull(new Date(date + 'T00:00:00'))

  return (
    <div
      className="fixed z-[200] pointer-events-none"
      style={{ left: position.x, top: position.y - 10, transform: 'translate(-50%, -100%)' }}
    >
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl shadow-lg transition-shadow duration-slow px-3 py-2.5 text-xs min-w-40 ease-apple">
        <div className="font-semibold text-white mb-1.5">{formattedDate}</div>
        {stat && stat.total_checks > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-neutral-400">Uptime</span>
              <span className="font-medium text-white">
                {formatUptime(stat.uptime_percentage)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-neutral-400">Checks</span>
              <span className="font-medium text-white">{stat.total_checks}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-neutral-400">Avg Response</span>
              <span className="font-medium text-white">
                {formatMs(Math.round(stat.avg_response_time_ms))}
              </span>
            </div>
            {stat.failed_checks > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-red-500">Failed</span>
                <span className="font-medium text-red-500">{stat.failed_checks}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-neutral-500">No data</div>
        )}
        {/* Tooltip arrow */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[-5px] w-2.5 h-2.5 bg-neutral-800 border-r border-b border-neutral-700 rotate-45" />
      </div>
    </div>
  )
}

// * Component: Uptime status bar (the colored bars visualization)
function UptimeStatusBar({
  dailyStats,
  days = 90,
}: {
  dailyStats: UptimeDailyStat[] | null
  days?: number
}) {
  const dateRange = generateDateRange(days)
  const statsMap = new Map<string, UptimeDailyStat>()
  if (dailyStats) {
    for (const s of dailyStats) {
      statsMap.set(s.date, s)
    }
  }

  const [hoveredDay, setHoveredDay] = useState<{ date: string; stat: UptimeDailyStat | undefined } | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const handleMouseEnter = (e: React.MouseEvent, date: string, stat: UptimeDailyStat | undefined) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top })
    setHoveredDay({ date, stat })
  }

  return (
    <div
      className="relative"
      onMouseLeave={() => setHoveredDay(null)}
    >
      <div className="flex items-center gap-0.5 w-full">
        {dateRange.map((date) => {
          const stat = statsMap.get(date)
          const barColor = getDayBarColor(stat)

          return (
            <div
              key={date}
              className={`flex-1 h-8 rounded-sm ${barColor} transition-all duration-fast hover:opacity-80 cursor-pointer min-w-[3px] ease-apple`}
              onMouseEnter={(e) => handleMouseEnter(e, date, stat)}
              onMouseLeave={() => setHoveredDay(null)}
            />
          )
        })}
      </div>
      <StatusBarTooltip
        stat={hoveredDay?.stat}
        date={hoveredDay?.date ?? ''}
        visible={hoveredDay !== null}
        position={tooltipPos}
      />
    </div>
  )
}

// * Component: Response time chart (Recharts area chart)
function ResponseTimeChart({ checks }: { checks: UptimeCheck[] }) {
  // * Prepare data in chronological order (oldest first)
  const data = [...checks]
    .reverse()
    .filter((c) => c.response_time_ms !== null)
    .map((c) => ({
      time: formatTime(new Date(c.checked_at)),
      ms: c.response_time_ms as number,
      status: c.status,
    }))

  if (data.length < 2) return null

  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
        Response Time
      </h4>
      <ChartContainer config={responseTimeChartConfig} className="h-40">
        <AreaChart accessibilityLayer data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="responseTimeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-ms)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-ms)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--chart-grid)"
            strokeOpacity={0.5}
            vertical={false}
          />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}ms`}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                className="text-xs"
                labelKey="time"
                formatter={(value) => <span className="font-semibold">{value}ms</span>}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="ms"
            stroke="var(--color-ms)"
            strokeWidth={2}
            fill="url(#responseTimeGradient)"
            dot={false}
            activeDot={{ r: 4, fill: 'var(--color-ms)', strokeWidth: 0 }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}

// * Main uptime page
export default function UptimePage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'owner' || user?.role === 'admin'
  const params = useParams()
  const siteId = params.id as string

  const { data: site, mutate: mutateSite } = useSite(siteId)
  const { data: uptimeData, isLoading, mutate: mutateUptime } = useUptimeStatus(siteId)
  const [toggling, setToggling] = useState(false)
  const [checks, setChecks] = useState<UptimeCheck[]>([])
  const [loadingChecks, setLoadingChecks] = useState(false)

  // * Single monitor from the auto-managed uptime system
  const monitor = uptimeData?.monitors?.[0] ?? null
  const overallUptime = uptimeData?.overall_uptime ?? 100
  const overallStatus = uptimeData?.status ?? 'operational'

  // * Fetch recent checks when we have a monitor
  useEffect(() => {
    if (!monitor) {
      setChecks([])
      return
    }
    const fetchChecks = async () => {
      setLoadingChecks(true)
      try {
        const data = await getMonitorChecks(siteId, monitor.monitor.id, 20)
        setChecks(data)
      } catch {
        // * Silent fail for check details
      } finally {
        setLoadingChecks(false)
      }
    }
    fetchChecks()
  }, [siteId, monitor?.monitor.id])

  const handleToggleUptime = async (enabled: boolean) => {
    if (!site) return
    setToggling(true)
    try {
      await updateSite(site.id, {
        name: site.name,
        timezone: site.timezone,
        is_public: site.is_public,
        excluded_paths: site.excluded_paths,
        uptime_enabled: enabled,
      })
      mutateSite()
      mutateUptime()
      toast.success(enabled ? 'Uptime monitoring enabled' : 'Uptime monitoring disabled')
    } catch {
      toast.error('Failed to update uptime monitoring')
    } finally {
      setToggling(false)
    }
  }

  useEffect(() => {
    if (site?.domain) document.title = `Uptime · ${site.domain} | Pulse`
  }, [site?.domain])

  const showSkeleton = useMinimumLoading(isLoading && !uptimeData)
  const fadeClass = useSkeletonFade(showSkeleton)

  if (showSkeleton) return <UptimeSkeleton />
  if (!site) return <div className="p-8 text-neutral-500">Site not found</div>

  const uptimeEnabled = site.uptime_enabled

  // * Disabled state — show empty state with enable toggle
  if (!uptimeEnabled) {
    return (
      <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">
            Uptime
          </h1>
          <p className="text-sm text-neutral-400">
            Monitor your site&apos;s availability and response time
          </p>
        </div>

        {/* Empty state */}
        <div className="glass-surface rounded-2xl p-12 text-center">
          <div className="rounded-full bg-neutral-800 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-white mb-2">
            Uptime monitoring is disabled
          </h3>
          <p className="text-sm text-neutral-400 mb-6 max-w-md mx-auto">
            Enable uptime monitoring to track your site&apos;s availability and response time around the clock.
          </p>
          {canEdit && (
            <Button
              onClick={() => handleToggleUptime(true)}
              disabled={toggling}
            >
              {toggling ? 'Enabling...' : 'Enable Uptime Monitoring'}
            </Button>
          )}
        </div>
      </div>
    )
  }

  // * Enabled state — show uptime dashboard
  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      {/* Header + action */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">
            Uptime
          </h1>
          <p className="text-sm text-neutral-400">
            Monitor your site&apos;s availability and response time
          </p>
        </div>
        {canEdit && (
          <Button
            variant="secondary"
            onClick={() => handleToggleUptime(false)}
            disabled={toggling}
            className="text-sm"
          >
            {toggling ? 'Disabling...' : 'Disable Monitoring'}
          </Button>
        )}
      </div>

      {/* Overall status card */}
      <div className="glass-surface rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3.5 h-3.5 rounded-full ${getStatusDotColor(overallStatus)}`} />
            <div>
              <span className="font-semibold text-white text-lg">
                {site.name}
              </span>
              <span className={`text-sm font-medium ml-3 ${getOverallStatusTextColor(overallStatus)}`}>
                {getOverallStatusText(overallStatus)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-sm font-semibold text-white">
              {formatUptime(overallUptime)} uptime
            </span>
            {monitor && (
              <div className="text-xs text-neutral-400">
                Last checked {formatTimeAgo(monitor.monitor.last_checked_at)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 90-day uptime bar */}
      {monitor && (
        <div className="glass-surface rounded-2xl p-5 mb-6">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
            90-Day Availability
          </h3>
          <UptimeStatusBar dailyStats={monitor.daily_stats} />
          <div className="flex justify-between mt-1.5 text-xs text-neutral-500">
            <span>90 days ago</span>
            <span>Today</span>
          </div>
        </div>
      )}

      {/* Response time chart + Recent checks */}
      {monitor && (
        <div className="glass-surface rounded-2xl p-5">
          {/* Monitor details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div>
              <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">
                Status
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusDotColor(monitor.monitor.last_status)}`} />
                <span className="text-sm font-medium text-white">
                  {getStatusLabel(monitor.monitor.last_status)}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">
                Response Time
              </div>
              <span className="text-sm font-medium text-white">
                {formatMs(monitor.monitor.last_response_time_ms)}
              </span>
            </div>
            <div>
              <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">
                Check Interval
              </div>
              <span className="text-sm font-medium text-white">
                {monitor.monitor.check_interval_seconds >= 60
                  ? `${Math.floor(monitor.monitor.check_interval_seconds / 60)}m`
                  : `${monitor.monitor.check_interval_seconds}s`}
              </span>
            </div>
            <div>
              <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">
                Overall Uptime
              </div>
              <span className="text-sm font-medium text-white">
                {formatUptime(monitor.overall_uptime)}
              </span>
            </div>
          </div>

          {/* Response time chart */}
          {loadingChecks ? (
            <ChecksSkeleton />
          ) : checks.length > 0 ? (
            <>
              <ResponseTimeChart checks={checks} />

              {/* Recent checks */}
              <div className="mt-5">
                <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                  Recent Checks
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {checks.slice(0, 20).map((check) => (
                    <div
                      key={check.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-neutral-800 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getStatusDotColor(check.status)}`} />
                        <span className="text-neutral-300 text-xs">
                          {formatDateTimeShort(new Date(check.checked_at))}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {check.status_code && (
                          <span className="text-xs text-neutral-400">
                            {check.status_code}
                          </span>
                        )}
                        <span className="text-xs font-medium text-neutral-300">
                          {formatMs(check.response_time_ms)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

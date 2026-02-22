'use client'

import { useAuth } from '@/lib/auth/context'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { getSite, type Site } from '@/lib/api/sites'
import {
  getUptimeStatus,
  createUptimeMonitor,
  updateUptimeMonitor,
  deleteUptimeMonitor,
  getMonitorChecks,
  type UptimeStatusResponse,
  type MonitorStatus,
  type UptimeCheck,
  type UptimeDailyStat,
  type CreateMonitorRequest,
} from '@/lib/api/uptime'
import { toast } from '@ciphera-net/ui'
import { useTheme } from '@ciphera-net/ui'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { Button, Modal } from '@ciphera-net/ui'
import { UptimeSkeleton, ChecksSkeleton } from '@/components/skeletons'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TooltipProps } from 'recharts'

// * Chart theme colors (consistent with main Pulse chart)
const CHART_COLORS_LIGHT = {
  border: 'var(--color-neutral-200)',
  text: 'var(--color-neutral-900)',
  textMuted: 'var(--color-neutral-500)',
  axis: 'var(--color-neutral-400)',
  tooltipBg: '#ffffff',
  tooltipBorder: 'var(--color-neutral-200)',
}
const CHART_COLORS_DARK = {
  border: 'var(--color-neutral-700)',
  text: 'var(--color-neutral-50)',
  textMuted: 'var(--color-neutral-400)',
  axis: 'var(--color-neutral-500)',
  tooltipBg: 'var(--color-neutral-800)',
  tooltipBorder: 'var(--color-neutral-700)',
}

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
      return 'bg-neutral-300 dark:bg-neutral-600'
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
      return 'text-emerald-600 dark:text-emerald-400'
    case 'degraded':
      return 'text-amber-600 dark:text-amber-400'
    case 'down':
      return 'text-red-600 dark:text-red-400'
    default:
      return 'text-neutral-500 dark:text-neutral-400'
  }
}

function getDayBarColor(stat: UptimeDailyStat | undefined): string {
  if (!stat || stat.total_checks === 0) return 'bg-neutral-300 dark:bg-neutral-600'
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

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: position.x, top: position.y - 10, transform: 'translate(-50%, -100%)' }}
    >
      <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg transition-shadow duration-300 px-3 py-2.5 text-xs min-w-40">
        <div className="font-semibold text-neutral-900 dark:text-white mb-1.5">{formattedDate}</div>
        {stat && stat.total_checks > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-neutral-500 dark:text-neutral-400">Uptime</span>
              <span className="font-medium text-neutral-900 dark:text-white">
                {formatUptime(stat.uptime_percentage)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-neutral-500 dark:text-neutral-400">Checks</span>
              <span className="font-medium text-neutral-900 dark:text-white">{stat.total_checks}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-neutral-500 dark:text-neutral-400">Avg Response</span>
              <span className="font-medium text-neutral-900 dark:text-white">
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
          <div className="text-neutral-400 dark:text-neutral-500">No data</div>
        )}
        {/* Tooltip arrow */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[-5px] w-2.5 h-2.5 bg-white dark:bg-neutral-800 border-r border-b border-neutral-200 dark:border-neutral-700 rotate-45" />
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
              className={`flex-1 h-8 rounded-sm ${barColor} transition-all duration-150 hover:opacity-80 cursor-pointer min-w-[3px]`}
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
  const { theme } = useTheme()
  const colors = theme === 'dark' ? CHART_COLORS_DARK : CHART_COLORS_LIGHT

  // * Prepare data in chronological order (oldest first)
  const data = [...checks]
    .reverse()
    .filter((c) => c.response_time_ms !== null)
    .map((c) => ({
      time: new Date(c.checked_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      ms: c.response_time_ms as number,
      status: c.status,
    }))

  if (data.length < 2) return null

  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null
    return (
      <div
        className="rounded-xl px-3 py-2 text-xs shadow-lg border transition-shadow duration-300"
        style={{
          background: colors.tooltipBg,
          borderColor: colors.tooltipBorder,
          color: colors.text,
        }}
      >
        <div className="font-medium mb-0.5">{label}</div>
        <div style={{ color: 'var(--color-brand-orange)' }} className="font-semibold">
          {payload[0].value}ms
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
        Response Time
      </h4>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="responseTimeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-orange)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-brand-orange)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={colors.border}
              strokeOpacity={0.5}
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: colors.axis }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: colors.axis }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}ms`}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="ms"
              stroke="var(--color-brand-orange)"
              strokeWidth={2}
              fill="url(#responseTimeGradient)"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--color-brand-orange)', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// * Component: Monitor card (matches the reference image design)
function MonitorCard({
  monitorStatus,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  canEdit,
  siteId,
}: {
  monitorStatus: MonitorStatus
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  canEdit: boolean
  siteId: string
}) {
  const { monitor, daily_stats, overall_uptime } = monitorStatus
  const [checks, setChecks] = useState<UptimeCheck[]>([])
  const [loadingChecks, setLoadingChecks] = useState(false)

  useEffect(() => {
    if (expanded && checks.length === 0) {
      const fetchChecks = async () => {
        setLoadingChecks(true)
        try {
          const data = await getMonitorChecks(siteId, monitor.id, 50)
          setChecks(data)
        } catch {
          // * Silent fail for check details
        } finally {
          setLoadingChecks(false)
        }
      }
      fetchChecks()
    }
  }, [expanded, siteId, monitor.id, checks.length])

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full p-5 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className={`w-3 h-3 rounded-full ${getStatusDotColor(monitor.last_status)} shrink-0`} />
          <span className="font-semibold text-neutral-900 dark:text-white">
            {monitor.name}
          </span>
          <span className="text-sm text-neutral-500 dark:text-neutral-400 hidden sm:inline">
            {monitor.url}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {monitor.last_response_time_ms !== null && (
            <span className="text-sm text-neutral-500 dark:text-neutral-400 hidden sm:inline">
              {formatMs(monitor.last_response_time_ms)}
            </span>
          )}
          <span className="text-sm font-semibold text-neutral-900 dark:text-white">
            {formatUptime(overall_uptime)} uptime
          </span>
          <svg
            className={`w-4 h-4 text-neutral-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Status bar */}
      <div className="px-5 pb-4">
        <UptimeStatusBar dailyStats={daily_stats} />
        <div className="flex justify-between mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">
          <span>90 days ago</span>
          <span>Today</span>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-neutral-200 dark:border-neutral-800 pt-4">
              {/* Monitor details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                <div>
                  <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">
                    Status
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusDotColor(monitor.last_status)}`} />
                    <span className="text-sm font-medium text-neutral-900 dark:text-white">
                      {getStatusLabel(monitor.last_status)}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">
                    Response Time
                  </div>
                  <span className="text-sm font-medium text-neutral-900 dark:text-white">
                    {formatMs(monitor.last_response_time_ms)}
                  </span>
                </div>
                <div>
                  <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">
                    Check Interval
                  </div>
                  <span className="text-sm font-medium text-neutral-900 dark:text-white">
                    {monitor.check_interval_seconds >= 60
                      ? `${Math.floor(monitor.check_interval_seconds / 60)}m`
                      : `${monitor.check_interval_seconds}s`}
                  </span>
                </div>
                <div>
                  <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">
                    Last Checked
                  </div>
                  <span className="text-sm font-medium text-neutral-900 dark:text-white">
                    {formatTimeAgo(monitor.last_checked_at)}
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
                    <h4 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
                      Recent Checks
                    </h4>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {checks.slice(0, 20).map((check) => (
                        <div
                          key={check.id}
                          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getStatusDotColor(check.status)}`} />
                            <span className="text-neutral-600 dark:text-neutral-300 text-xs">
                              {new Date(check.checked_at).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            {check.status_code && (
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                {check.status_code}
                              </span>
                            )}
                            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                              {formatMs(check.response_time_ms)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}

              {/* Actions */}
              {canEdit && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                  <Button
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); onEdit() }}
                    variant="secondary"
                    className="text-sm"
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete() }}
                    variant="secondary"
                    className="text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// * Main uptime page
export default function UptimePage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'owner' || user?.role === 'admin'
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const [site, setSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)
  const [uptimeData, setUptimeData] = useState<UptimeStatusResponse | null>(null)
  const [expandedMonitor, setExpandedMonitor] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingMonitor, setEditingMonitor] = useState<MonitorStatus | null>(null)
  const [formData, setFormData] = useState<CreateMonitorRequest>({
    name: '',
    url: '',
    check_interval_seconds: 300,
    expected_status_code: 200,
    timeout_seconds: 30,
  })
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [siteData, statusData] = await Promise.all([
        getSite(siteId),
        getUptimeStatus(siteId),
      ])
      setSite(siteData)
      setUptimeData(statusData)
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to load uptime data')
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // * Auto-refresh every 30 seconds; show toast on failure (e.g. network loss or auth expiry)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const statusData = await getUptimeStatus(siteId)
        setUptimeData(statusData)
      } catch {
        toast.error('Could not refresh uptime data. Check your connection or sign in again.')
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [siteId])

  const handleAddMonitor = async () => {
    if (!formData.name || !formData.url) {
      toast.error('Name and URL are required')
      return
    }
    setSaving(true)
    try {
      await createUptimeMonitor(siteId, formData)
      toast.success('Monitor created successfully')
      setShowAddModal(false)
      setFormData({ name: '', url: '', check_interval_seconds: 300, expected_status_code: 200, timeout_seconds: 30 })
      await loadData()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to create monitor')
    } finally {
      setSaving(false)
    }
  }

  const handleEditMonitor = async () => {
    if (!editingMonitor || !formData.name || !formData.url) return
    setSaving(true)
    try {
      await updateUptimeMonitor(siteId, editingMonitor.monitor.id, {
        name: formData.name,
        url: formData.url,
        check_interval_seconds: formData.check_interval_seconds,
        expected_status_code: formData.expected_status_code,
        timeout_seconds: formData.timeout_seconds,
        enabled: editingMonitor.monitor.enabled,
      })
      toast.success('Monitor updated successfully')
      setShowEditModal(false)
      setEditingMonitor(null)
      await loadData()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to update monitor')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteMonitor = async (monitorId: string) => {
    if (!window.confirm('Are you sure you want to delete this monitor? All historical data will be lost.')) return
    try {
      await deleteUptimeMonitor(siteId, monitorId)
      toast.success('Monitor deleted')
      await loadData()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to delete monitor')
    }
  }

  const openEditModal = (ms: MonitorStatus) => {
    setEditingMonitor(ms)
    setFormData({
      name: ms.monitor.name,
      url: ms.monitor.url,
      check_interval_seconds: ms.monitor.check_interval_seconds,
      expected_status_code: ms.monitor.expected_status_code,
      timeout_seconds: ms.monitor.timeout_seconds,
    })
    setShowEditModal(true)
  }

  if (loading) return <UptimeSkeleton />
  if (!site) return <div className="p-8 text-neutral-500">Site not found</div>

  const monitors = Array.isArray(uptimeData?.monitors) ? uptimeData.monitors : []
  const overallUptime = uptimeData?.overall_uptime ?? 100
  const overallStatus = uptimeData?.status ?? 'operational'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8"
    >
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => router.push(`/sites/${siteId}`)}
              className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
            >
              {site.name}
            </button>
            <span className="text-neutral-300 dark:text-neutral-600">/</span>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              Uptime
            </h1>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Monitor your endpoints and track availability over time
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setFormData({ name: '', url: '', check_interval_seconds: 300, expected_status_code: 200, timeout_seconds: 30 })
              setShowAddModal(true)
            }}
          >
            Add Monitor
          </Button>
        )}
      </div>

      {/* Overall status card */}
      {monitors.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3.5 h-3.5 rounded-full ${getStatusDotColor(overallStatus)}`} />
              <div>
                <span className="font-semibold text-neutral-900 dark:text-white text-lg">
                  {site.name}
                </span>
                <span className={`text-sm font-medium ml-3 ${getOverallStatusTextColor(overallStatus)}`}>
                  {getOverallStatusText(overallStatus)}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                {formatUptime(overallUptime)} uptime
              </span>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {monitors.length} {monitors.length === 1 ? 'component' : 'components'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monitor list */}
      {monitors.length > 0 ? (
        <div className="space-y-4">
          {monitors.map((ms) => (
            <MonitorCard
              key={ms.monitor.id}
              monitorStatus={ms}
              expanded={expandedMonitor === ms.monitor.id}
              onToggle={() => setExpandedMonitor(
                expandedMonitor === ms.monitor.id ? null : ms.monitor.id
              )}
              onEdit={() => openEditModal(ms)}
              onDelete={() => handleDeleteMonitor(ms.monitor.id)}
              canEdit={canEdit}
              siteId={siteId}
            />
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-12 text-center">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-neutral-500 dark:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-neutral-900 dark:text-white mb-2">
            No monitors yet
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 max-w-md mx-auto">
            Add a monitor to start tracking the uptime and response time of your endpoints. You can monitor APIs, websites, and any HTTP endpoint.
          </p>
          {canEdit && (
            <Button
              onClick={() => {
                setFormData({ name: '', url: '', check_interval_seconds: 300, expected_status_code: 200, timeout_seconds: 30 })
                setShowAddModal(true)
              }}
            >
              Add Your First Monitor
            </Button>
          )}
        </div>
      )}

      {/* Add Monitor Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Monitor">
        <MonitorForm
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleAddMonitor}
          onCancel={() => setShowAddModal(false)}
          saving={saving}
          submitLabel="Create Monitor"
          siteDomain={site.domain}
        />
      </Modal>

      {/* Edit Monitor Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Monitor">
        <MonitorForm
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleEditMonitor}
          onCancel={() => setShowEditModal(false)}
          saving={saving}
          submitLabel="Save Changes"
          siteDomain={site.domain}
        />
      </Modal>
    </motion.div>
  )
}

// * Monitor creation/edit form
function MonitorForm({
  formData,
  setFormData,
  onSubmit,
  onCancel,
  saving,
  submitLabel,
  siteDomain,
}: {
  formData: CreateMonitorRequest
  setFormData: (data: CreateMonitorRequest) => void
  onSubmit: () => void
  onCancel: () => void
  saving: boolean
  submitLabel: string
  siteDomain: string
}) {
  // * Derive protocol from formData.url so edit modal shows the monitor's actual scheme (no desync)
  const protocol: 'https://' | 'http://' = formData.url.startsWith('http://') ? 'http://' : 'https://'
  const [showProtocolDropdown, setShowProtocolDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // * Extract the path portion from the full URL
  const getPath = (): string => {
    const url = formData.url
    if (!url) return ''
    try {
      const parsed = new URL(url)
      const pathAndRest = parsed.pathname + parsed.search + parsed.hash
      return pathAndRest === '/' ? '' : pathAndRest
    } catch {
      // ? If not a valid full URL, try stripping the protocol prefix
      if (url.startsWith('https://')) return url.slice(8 + siteDomain.length)
      if (url.startsWith('http://')) return url.slice(7 + siteDomain.length)
      return url
    }
  }

  const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const path = e.target.value
    const safePath = path.startsWith('/') || path === '' ? path : `/${path}`
    setFormData({ ...formData, url: `${protocol}${siteDomain}${safePath}` })
  }

  const handleProtocolChange = (proto: 'https://' | 'http://') => {
    setShowProtocolDropdown(false)
    const path = getPath()
    setFormData({ ...formData, url: `${proto}${siteDomain}${path}` })
  }

  // * Initialize URL if empty
  useEffect(() => {
    if (!formData.url) {
      setFormData({ ...formData, url: `${protocol}${siteDomain}` })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // * Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowProtocolDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Name
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g. API, Website, CDN"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm"
        />
      </div>

      {/* URL with protocol dropdown + domain prefix */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          URL
        </label>
        <div className="flex rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus-within:ring-2 focus-within:ring-brand-orange focus-within:border-transparent overflow-hidden">
          {/* Protocol dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setShowProtocolDropdown(!showProtocolDropdown)}
              className="h-full px-3 flex items-center gap-1 bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm border-r border-neutral-300 dark:border-neutral-600 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors select-none whitespace-nowrap"
            >
              {protocol}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showProtocolDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg transition-shadow duration-300 z-10 min-w-[100px]">
                <button
                  type="button"
                  onClick={() => handleProtocolChange('https://')}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors rounded-t-lg ${protocol === 'https://' ? 'text-brand-orange font-medium' : 'text-neutral-700 dark:text-neutral-300'}`}
                >
                  https://
                </button>
                <button
                  type="button"
                  onClick={() => handleProtocolChange('http://')}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors rounded-b-lg ${protocol === 'http://' ? 'text-brand-orange font-medium' : 'text-neutral-700 dark:text-neutral-300'}`}
                >
                  http://
                </button>
              </div>
            )}
          </div>
          {/* Domain prefix */}
          <span className="flex items-center px-1.5 text-sm text-neutral-500 dark:text-neutral-400 select-none whitespace-nowrap bg-neutral-100 dark:bg-neutral-700 border-r border-neutral-300 dark:border-neutral-600">
            {siteDomain}
          </span>
          {/* Path input */}
          <input
            type="text"
            value={getPath()}
            onChange={handlePathChange}
            placeholder="/api/health"
            className="flex-1 min-w-0 px-3 py-2 bg-transparent text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none text-sm"
          />
        </div>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Add a specific path (e.g. /api/health) or leave empty for the root domain
        </p>
      </div>

      {/* Check interval */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Check Interval
        </label>
        <select
          value={formData.check_interval_seconds}
          onChange={(e) => setFormData({ ...formData, check_interval_seconds: parseInt(e.target.value) })}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm"
        >
          <option value={60}>Every 1 minute</option>
          <option value={120}>Every 2 minutes</option>
          <option value={300}>Every 5 minutes</option>
          <option value={600}>Every 10 minutes</option>
          <option value={900}>Every 15 minutes</option>
          <option value={1800}>Every 30 minutes</option>
          <option value={3600}>Every 1 hour</option>
        </select>
      </div>

      {/* Expected status code */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Expected Status Code
        </label>
        <input
          type="number"
          value={formData.expected_status_code}
          onChange={(e) => setFormData({ ...formData, expected_status_code: parseInt(e.target.value) || 200 })}
          min={100}
          max={599}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      {/* Timeout */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Timeout (seconds)
        </label>
        <input
          type="number"
          value={formData.timeout_seconds}
          onChange={(e) => setFormData({ ...formData, timeout_seconds: parseInt(e.target.value) || 30 })}
          min={5}
          max={60}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={saving || !formData.name || !formData.url}>
          {saving ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </div>
  )
}

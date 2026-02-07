'use client'

import { useAuth } from '@/lib/auth/context'
import { useEffect, useState, useCallback } from 'react'
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
import { getAuthErrorMessage } from '@/lib/utils/authErrors'
import { LoadingOverlay, Button, Modal } from '@ciphera-net/ui'

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

function getDayStatus(stat: UptimeDailyStat | undefined): string {
  if (!stat) return 'no_data'
  if (stat.failed_checks > 0) return 'down'
  if (stat.degraded_checks > 0) return 'degraded'
  return 'up'
}

function getDayBarColor(stat: UptimeDailyStat | undefined): string {
  if (!stat) return 'bg-neutral-200 dark:bg-neutral-700'
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

  return (
    <div className="flex items-center gap-[2px] w-full">
      {dateRange.map((date) => {
        const stat = statsMap.get(date)
        const barColor = getDayBarColor(stat)
        const dayStatus = getDayStatus(stat)
        const tooltipText = stat
          ? `${new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${formatUptime(stat.uptime_percentage)} uptime (${stat.total_checks} checks)`
          : `${new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: No data`

        return (
          <div
            key={date}
            className={`flex-1 h-8 rounded-[2px] ${barColor} transition-all duration-150 hover:opacity-80 cursor-pointer group relative min-w-[3px]`}
            title={tooltipText}
          />
        )
      })}
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
          const data = await getMonitorChecks(siteId, monitor.id, 20)
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
                  <div className="flex items-center gap-1.5">
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

              {/* Recent checks */}
              {loadingChecks ? (
                <div className="text-center py-4 text-neutral-500 dark:text-neutral-400 text-sm">
                  Loading recent checks...
                </div>
              ) : checks.length > 0 ? (
                <div>
                  <h4 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
                    Recent Checks
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {checks.map((check) => (
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

  // * Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const statusData = await getUptimeStatus(siteId)
        setUptimeData(statusData)
      } catch {
        // * Silent refresh failure
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
    if (!confirm('Are you sure you want to delete this monitor? All historical data will be lost.')) return
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

  if (loading) return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Uptime" />
  if (!site) return <div className="p-8 text-neutral-500">Site not found</div>

  const monitors = uptimeData?.monitors ?? []
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
                <span className="text-sm text-neutral-500 dark:text-neutral-400 ml-3">
                  {monitors.length} {monitors.length === 1 ? 'component' : 'components'}
                </span>
              </div>
            </div>
            <span className="text-sm font-semibold text-neutral-900 dark:text-white">
              {formatUptime(overallUptime)} uptime
            </span>
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

      {/* URL */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          URL
        </label>
        <input
          type="url"
          value={formData.url}
          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
          placeholder={`https://${siteDomain}`}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm"
        />
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Must be on <span className="font-medium">{siteDomain}</span> or a subdomain (e.g. api.{siteDomain})
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
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm"
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
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent text-sm"
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

'use client'

import { useAuth } from '@/lib/auth/context'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useSite, usePageSpeedConfig, usePageSpeedLatest, usePageSpeedHistory } from '@/lib/swr/dashboard'
import { updatePageSpeedConfig, triggerPageSpeedCheck, type PageSpeedCheck, type AuditSummary } from '@/lib/api/pagespeed'
import { toast, Button } from '@ciphera-net/ui'
import ScoreGauge from '@/components/pagespeed/ScoreGauge'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/charts'

// * Chart configuration for score trend
const chartConfig = {
  score: { label: 'Performance', color: 'var(--chart-1)' },
} satisfies ChartConfig

// * Metric status thresholds (Google's Core Web Vitals thresholds)
function getMetricStatus(metric: string, value: number | null): { label: string; color: string } {
  if (value === null) return { label: '--', color: 'text-neutral-400' }
  const thresholds: Record<string, [number, number]> = {
    lcp: [2500, 4000],
    cls: [0.1, 0.25],
    tbt: [200, 600],
    fcp: [1800, 3000],
    si: [3400, 5800],
    tti: [3800, 7300],
  }
  const [good, poor] = thresholds[metric] ?? [0, 0]
  if (value <= good) return { label: 'Good', color: 'text-emerald-600 dark:text-emerald-400' }
  if (value <= poor) return { label: 'Needs Improvement', color: 'text-amber-600 dark:text-amber-400' }
  return { label: 'Poor', color: 'text-red-600 dark:text-red-400' }
}

// * Format metric values for display
function formatMetricValue(metric: string, value: number | null): string {
  if (value === null) return '--'
  if (metric === 'cls') return value.toFixed(3)
  if (value < 1000) return `${value}ms`
  return `${(value / 1000).toFixed(1)}s`
}

// * Format time ago for last checked display
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

// * Get dot color for audit items based on score
function getAuditDotColor(score: number | null): string {
  if (score === null) return 'bg-neutral-400'
  if (score >= 0.9) return 'bg-emerald-500'
  if (score >= 0.5) return 'bg-amber-500'
  return 'bg-red-500'
}

// * Main PageSpeed page
export default function PageSpeedPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'owner' || user?.role === 'admin'
  const params = useParams()
  const siteId = params.id as string

  const { data: site } = useSite(siteId)
  const { data: config, mutate: mutateConfig } = usePageSpeedConfig(siteId)
  const { data: latestChecks, isLoading, mutate: mutateLatest } = usePageSpeedLatest(siteId)

  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile')
  const [running, setRunning] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [frequency, setFrequency] = useState<string>('weekly')

  const { data: historyChecks } = usePageSpeedHistory(siteId, strategy)

  // * Get the check for the current strategy
  const currentCheck = latestChecks?.find(c => c.strategy === strategy) ?? null

  // * Set document title
  useEffect(() => {
    if (site?.domain) document.title = `PageSpeed · ${site.domain} | Pulse`
  }, [site?.domain])

  // * Sync frequency from config when loaded
  useEffect(() => {
    if (config?.frequency) setFrequency(config.frequency)
  }, [config?.frequency])

  // * Toggle PageSpeed monitoring on/off
  const handleToggle = async (enabled: boolean) => {
    setToggling(true)
    try {
      await updatePageSpeedConfig(siteId, { enabled, frequency })
      mutateConfig()
      mutateLatest()
      toast.success(enabled ? 'PageSpeed monitoring enabled' : 'PageSpeed monitoring disabled')
    } catch {
      toast.error('Failed to update PageSpeed monitoring')
    } finally {
      setToggling(false)
    }
  }

  // * Trigger a manual PageSpeed check
  // * Poll for results after triggering an async check
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // * Clean up polling on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

  const handleRunCheck = async () => {
    setRunning(true)
    try {
      await triggerPageSpeedCheck(siteId)
      toast.success('PageSpeed check started — results will appear in 30-60 seconds')

      // * Poll every 5s for up to 2 minutes until new results appear
      const startedAt = Date.now()
      const initialCheckedAt = latestChecks?.[0]?.checked_at

      stopPolling()
      pollRef.current = setInterval(async () => {
        const elapsed = Date.now() - startedAt
        if (elapsed > 120_000) {
          stopPolling()
          setRunning(false)
          toast.error('Check is taking longer than expected. Results will appear when ready.')
          return
        }
        const freshData = await mutateLatest()
        const freshCheckedAt = freshData?.[0]?.checked_at
        if (freshCheckedAt && freshCheckedAt !== initialCheckedAt) {
          stopPolling()
          setRunning(false)
          toast.success('PageSpeed check complete')
        }
      }, 5000)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start check')
      setRunning(false)
    }
  }

  // * Loading state
  if (isLoading && !latestChecks) return <PageSpeedSkeleton />
  if (!site) return <div className="p-8 text-neutral-500">Site not found</div>

  const enabled = config?.enabled ?? false

  // * Disabled state — show empty state with enable toggle
  if (!enabled) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">
            PageSpeed
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Monitor your site&apos;s performance and Core Web Vitals
          </p>
        </div>

        {/* Empty state */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-12 text-center">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-neutral-500 dark:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-neutral-900 dark:text-white mb-2">
            PageSpeed monitoring is disabled
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 max-w-md mx-auto">
            Enable PageSpeed monitoring to track your site&apos;s performance scores, Core Web Vitals, and get actionable improvement suggestions.
          </p>

          {/* Frequency selector */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <label className="text-sm text-neutral-600 dark:text-neutral-400">Check frequency:</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="text-sm border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {canEdit && (
            <Button
              onClick={() => handleToggle(true)}
              disabled={toggling}
            >
              {toggling ? 'Enabling...' : 'Enable PageSpeed Monitoring'}
            </Button>
          )}
        </div>
      </div>
    )
  }

  // * Prepare chart data from history
  const chartData = (historyChecks ?? []).map(c => ({
    date: new Date(c.checked_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    score: c.performance_score,
  }))

  // * Parse audits into groups
  const audits = currentCheck?.audits ?? []
  const opportunities = audits
    .filter(a => a.category === 'opportunity')
    .sort((a, b) => (b.savings_ms ?? 0) - (a.savings_ms ?? 0))
  const diagnostics = audits.filter(a => a.category === 'diagnostic')
  const passed = audits.filter(a => a.category === 'passed')

  // * Core Web Vitals metrics
  const metrics = [
    { key: 'lcp', label: 'Largest Contentful Paint', value: currentCheck?.lcp_ms ?? null },
    { key: 'cls', label: 'Cumulative Layout Shift', value: currentCheck?.cls ?? null },
    { key: 'tbt', label: 'Total Blocking Time', value: currentCheck?.tbt_ms ?? null },
    { key: 'fcp', label: 'First Contentful Paint', value: currentCheck?.fcp_ms ?? null },
    { key: 'si', label: 'Speed Index', value: currentCheck?.si_ms ?? null },
    { key: 'tti', label: 'Time to Interactive', value: currentCheck?.tti_ms ?? null },
  ]

  // * Enabled state — show full PageSpeed dashboard
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">
            PageSpeed
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Performance scores and Core Web Vitals for {site.domain}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mobile / Desktop toggle */}
          <div className="flex gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1">
            <button
              onClick={() => setStrategy('mobile')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                strategy === 'mobile'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              Mobile
            </button>
            <button
              onClick={() => setStrategy('desktop')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                strategy === 'desktop'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              Desktop
            </button>
          </div>

          {canEdit && (
            <>
              <Button
                onClick={handleRunCheck}
                disabled={running}
              >
                {running ? 'Running...' : 'Run Check'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleToggle(false)}
                disabled={toggling}
                className="text-sm"
              >
                {toggling ? 'Disabling...' : 'Disable'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Section 1 — Score Overview */}
      <div className="flex flex-col lg:flex-row gap-6 mb-6">
        {/* Score gauges */}
        <div className="flex-1">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 flex justify-center">
              <ScoreGauge score={currentCheck?.performance_score ?? null} label="Performance" />
            </div>
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 flex justify-center">
              <ScoreGauge score={currentCheck?.accessibility_score ?? null} label="Accessibility" />
            </div>
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 flex justify-center">
              <ScoreGauge score={currentCheck?.best_practices_score ?? null} label="Best Practices" />
            </div>
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 flex justify-center">
              <ScoreGauge score={currentCheck?.seo_score ?? null} label="SEO" />
            </div>
          </div>
        </div>
        {/* Screenshot */}
        {currentCheck?.screenshot && (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 flex items-center justify-center lg:w-72">
            <img
              src={currentCheck.screenshot}
              alt={`${strategy} screenshot`}
              className="rounded-lg max-h-48 object-contain"
            />
          </div>
        )}
      </div>

      {/* Last checked info */}
      <div className="flex items-center gap-3 mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        {currentCheck?.checked_at && (
          <span>Last checked {formatTimeAgo(currentCheck.checked_at)}</span>
        )}
        {config?.frequency && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
            {config.frequency}
          </span>
        )}
      </div>

      {/* Section 2 — Core Web Vitals */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
          Core Web Vitals
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics.map(({ key, label, value }) => {
            const status = getMetricStatus(key, value)
            return (
              <div
                key={key}
                className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5"
              >
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                  {label}
                </div>
                <div className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">
                  {formatMetricValue(key, value)}
                </div>
                <span className={`text-xs font-medium ${status.color}`}>
                  {status.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Section 3 — Score Trend Chart */}
      {chartData.length >= 2 && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 mb-6">
          <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
            Performance Score Trend
          </h3>
          <ChartContainer config={chartConfig} className="h-48">
            <AreaChart accessibilityLayer data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-score)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-score)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--chart-grid)"
                strokeOpacity={0.5}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine y={90} stroke="#0cce6b" strokeDasharray="4 4" strokeOpacity={0.6} />
              <ReferenceLine y={50} stroke="#ff4e42" strokeDasharray="4 4" strokeOpacity={0.6} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="text-xs"
                    labelKey="date"
                    formatter={(value) => <span className="font-semibold">{value}</span>}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="var(--color-score)"
                strokeWidth={2}
                fill="url(#scoreGradient)"
                dot={false}
                activeDot={{ r: 4, fill: 'var(--color-score)', strokeWidth: 0 }}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      )}

      {/* Section 4 — Diagnostics Accordion */}
      {audits.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5">
          <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-4">
            Diagnostics
          </h3>
          <div className="space-y-4">
            {/* Opportunities */}
            {opportunities.length > 0 && (
              <details open>
                <summary className="cursor-pointer text-sm font-semibold text-neutral-900 dark:text-white select-none">
                  Opportunities ({opportunities.length})
                </summary>
                <div className="mt-2 space-y-1">
                  {opportunities.map(audit => <AuditRow key={audit.id} audit={audit} />)}
                </div>
              </details>
            )}

            {/* Diagnostics */}
            {diagnostics.length > 0 && (
              <details open>
                <summary className="cursor-pointer text-sm font-semibold text-neutral-900 dark:text-white select-none">
                  Diagnostics ({diagnostics.length})
                </summary>
                <div className="mt-2 space-y-1">
                  {diagnostics.map(audit => <AuditRow key={audit.id} audit={audit} />)}
                </div>
              </details>
            )}

            {/* Passed Audits */}
            {passed.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-neutral-900 dark:text-white select-none">
                  Passed Audits ({passed.length})
                </summary>
                <div className="mt-2 space-y-1">
                  {passed.map(audit => <AuditRow key={audit.id} audit={audit} />)}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// * Expandable audit row with description and detail items
function AuditRow({ audit }: { audit: AuditSummary }) {
  return (
    <details className="group">
      <summary className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer list-none">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getAuditDotColor(audit.score)}`} />
        <span className="font-medium text-sm text-neutral-900 dark:text-white">{audit.title}</span>
        {audit.display_value && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">{audit.display_value}</span>
        )}
        <svg className="w-4 h-4 ml-auto text-neutral-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="pl-6 pr-2 pb-2 pt-1">
        {/* Description */}
        {audit.description && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">{audit.description}</p>
        )}
        {/* Items table */}
        {audit.details && Array.isArray(audit.details) && audit.details.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {audit.details.slice(0, 10).map((item: Record<string, any>, idx: number) => (
                  <tr key={idx} className="text-neutral-600 dark:text-neutral-400">
                    {/* URL or label */}
                    <td className="py-1.5 pr-3 max-w-xs truncate">
                      {item.url ? (
                        <span className="font-mono text-xs break-all">{item.url}</span>
                      ) : item.node?.snippet ? (
                        <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded break-all">{item.node.snippet}</code>
                      ) : item.label || item.groupLabel || item.statistic || ''}
                    </td>
                    {/* Wasted bytes */}
                    {item.wastedBytes != null && (
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap text-amber-600 dark:text-amber-400">
                        {item.wastedBytes < 1024 ? `${item.wastedBytes} B` : `${(item.wastedBytes / 1024).toFixed(1)} KiB`}
                      </td>
                    )}
                    {/* Total bytes */}
                    {item.totalBytes != null && !item.wastedBytes && (
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                        {item.totalBytes < 1024 ? `${item.totalBytes} B` : `${(item.totalBytes / 1024).toFixed(1)} KiB`}
                      </td>
                    )}
                    {/* Wasted ms */}
                    {item.wastedMs != null && (
                      <td className="py-1.5 text-right whitespace-nowrap text-amber-600 dark:text-amber-400">
                        {item.wastedMs < 1000 ? `${Math.round(item.wastedMs)}ms` : `${(item.wastedMs / 1000).toFixed(1)}s`}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {audit.details.length > 10 && (
              <p className="text-xs text-neutral-400 mt-1">+ {audit.details.length - 10} more items</p>
            )}
          </div>
        )}
      </div>
    </details>
  )
}

// * Skeleton loading state
function PageSpeedSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8 space-y-6">
      <div className="animate-pulse space-y-2 mb-8">
        <div className="h-8 w-48 bg-neutral-200 dark:bg-neutral-700 rounded" />
        <div className="h-4 w-72 bg-neutral-200 dark:bg-neutral-700 rounded" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 animate-pulse">
            <div className="w-24 h-24 rounded-full bg-neutral-200 dark:bg-neutral-700 mx-auto mb-3" />
            <div className="h-4 w-20 bg-neutral-200 dark:bg-neutral-700 rounded mx-auto" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 animate-pulse">
            <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-700 rounded mb-2" />
            <div className="h-6 w-16 bg-neutral-200 dark:bg-neutral-700 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

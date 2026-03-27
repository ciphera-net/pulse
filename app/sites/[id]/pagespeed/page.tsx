'use client'

import { useAuth } from '@/lib/auth/context'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useSite, usePageSpeedConfig, usePageSpeedLatest, usePageSpeedHistory } from '@/lib/swr/dashboard'
import { updatePageSpeedConfig, triggerPageSpeedCheck, getPageSpeedLatest, getPageSpeedCheck, type PageSpeedCheck, type AuditSummary } from '@/lib/api/pagespeed'
import { toast, Button } from '@ciphera-net/ui'
import { motion } from 'framer-motion'
import ScoreGauge from '@/components/pagespeed/ScoreGauge'
import { remapLearnUrl } from '@/lib/learn-links'
import { AreaChart as VisxAreaChart, Area as VisxArea, Grid as VisxGrid, XAxis as VisxXAxis, YAxis as VisxYAxis, ChartTooltip as VisxChartTooltip } from '@/components/ui/area-chart'
import { useMinimumLoading, useSkeletonFade } from '@/components/skeletons'

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

  // * Check history navigation — build unique check timestamps from history data
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null)
  const [selectedCheckData, setSelectedCheckData] = useState<PageSpeedCheck | null>(null)
  const [loadingCheck, setLoadingCheck] = useState(false)

  // * Build unique check timestamps (each check has mobile+desktop at the same time)
  const checkTimestamps = useMemo(() => {
    if (!historyChecks?.length) return []
    const seen = new Set<string>()
    const timestamps: { id: string; checked_at: string }[] = []
    // * History is sorted ASC by checked_at, reverse for newest first
    for (let i = historyChecks.length - 1; i >= 0; i--) {
      const c = historyChecks[i]
      // * Group by minute to deduplicate mobile+desktop pairs
      const key = c.checked_at.slice(0, 16)
      if (!seen.has(key)) {
        seen.add(key)
        timestamps.push({ id: c.id, checked_at: c.checked_at })
      }
    }
    return timestamps
  }, [historyChecks])

  const selectedIndex = selectedCheckId
    ? checkTimestamps.findIndex(t => t.id === selectedCheckId)
    : 0 // * 0 = latest

  const canGoPrev = selectedIndex < checkTimestamps.length - 1
  const canGoNext = selectedIndex > 0

  const handlePrevCheck = () => {
    if (!canGoPrev) return
    const next = checkTimestamps[selectedIndex + 1]
    setSelectedCheckId(next.id)
  }

  const handleNextCheck = () => {
    if (selectedIndex <= 1) {
      // * Going back to latest
      setSelectedCheckId(null)
      setSelectedCheckData(null)
      return
    }
    const next = checkTimestamps[selectedIndex - 1]
    setSelectedCheckId(next.id)
  }

  // * Fetch full check data when navigating to a historical check
  useEffect(() => {
    if (!selectedCheckId || !siteId) {
      setSelectedCheckData(null)
      return
    }
    let cancelled = false
    setLoadingCheck(true)
    getPageSpeedCheck(siteId, selectedCheckId).then(data => {
      if (!cancelled) {
        setSelectedCheckData(data)
        setLoadingCheck(false)
      }
    }).catch(() => {
      if (!cancelled) setLoadingCheck(false)
    })
    return () => { cancelled = true }
  }, [selectedCheckId, siteId])

  // * Determine which check to display — selected historical or latest
  const displayCheck = selectedCheckId && selectedCheckData
    ? selectedCheckData
    : latestChecks?.find(c => c.strategy === strategy) ?? null

  // * When viewing a historical check, we need both strategies — fetch the other one too
  // * For simplicity, historical view shows the selected strategy's check
  const currentCheck = displayCheck

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const handleRunCheck = async () => {
    setRunning(true)
    try {
      await triggerPageSpeedCheck(siteId)
      toast.success('PageSpeed check started — results will appear in 30-60 seconds')

      // * Poll silently without triggering SWR re-renders.
      // * Fetch latest directly and only update SWR cache once when new data arrives.
      const initialCheckedAt = latestChecks?.[0]?.checked_at
      const startedAt = Date.now()

      stopPolling()
      pollRef.current = setInterval(async () => {
        if (Date.now() - startedAt > 120_000) {
          stopPolling()
          setRunning(false)
          toast.error('Check is taking longer than expected. Results will appear when ready.')
          return
        }
        try {
          const fresh = await getPageSpeedLatest(siteId)
          if (fresh?.[0]?.checked_at && fresh[0].checked_at !== initialCheckedAt) {
            stopPolling()
            setRunning(false)
            mutateLatest() // * Single SWR revalidation when new data is ready
            toast.success('PageSpeed check complete')
          }
        } catch {
          // * Silent — keep polling
        }
      }, 5000)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start check')
      setRunning(false)
    }
  }

  // * Loading state with minimum display time (consistent with other pages)
  const showSkeleton = useMinimumLoading(isLoading && !latestChecks)
  const fadeClass = useSkeletonFade(showSkeleton)
  if (showSkeleton) return <PageSpeedSkeleton />
  if (!site) return <div className="p-8 text-neutral-500">Site not found</div>

  const enabled = config?.enabled ?? false

  // * Disabled state — show empty state with enable toggle
  if (!enabled) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">
            PageSpeed
          </h1>
          <p className="text-sm text-neutral-400">
            Monitor your site&apos;s performance and Core Web Vitals
          </p>
        </div>

        {/* Empty state */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-12 text-center">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-white mb-2">
            PageSpeed monitoring is disabled
          </h3>
          <p className="text-sm text-neutral-400 mb-6 max-w-md mx-auto">
            Enable PageSpeed monitoring to track your site&apos;s performance scores, Core Web Vitals, and get actionable improvement suggestions.
          </p>

          {/* Frequency selector */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <label className="text-sm text-neutral-600 dark:text-neutral-400">Check frequency:</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="text-sm border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100"
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

  // * Prepare chart data from history (visx needs Date objects for x-axis)
  const chartData = (historyChecks ?? []).map(c => ({
    dateObj: new Date(c.checked_at),
    score: c.performance_score ?? 0,
  }))

  // * Parse audits into groups by Lighthouse category
  const audits = currentCheck?.audits ?? []
  const passed = audits.filter(a => a.category === 'passed')

  const categoryGroups = [
    { key: 'performance', label: 'Performance' },
    { key: 'accessibility', label: 'Accessibility' },
    { key: 'best-practices', label: 'Best Practices' },
    { key: 'seo', label: 'SEO' },
  ]

  // * Build per-category failing audits, sorted by impact
  const auditsByGroup: Record<string, typeof audits> = {}
  const manualByGroup: Record<string, typeof audits> = {}
  for (const group of categoryGroups) {
    auditsByGroup[group.key] = audits
      .filter(a => a.category !== 'passed' && a.category !== 'manual' && a.group === group.key)
      .sort((a, b) => {
        if (a.category === 'opportunity' && b.category !== 'opportunity') return -1
        if (a.category !== 'opportunity' && b.category === 'opportunity') return 1
        if (a.category === 'opportunity' && b.category === 'opportunity') {
          return (b.savings_ms ?? 0) - (a.savings_ms ?? 0)
        }
        return 0
      })
    manualByGroup[group.key] = audits.filter(a => a.category === 'manual' && a.group === group.key)
  }

  // * Core Web Vitals metrics
  const metrics = [
    { key: 'fcp', label: 'First Contentful Paint', value: currentCheck?.fcp_ms ?? null },
    { key: 'lcp', label: 'Largest Contentful Paint', value: currentCheck?.lcp_ms ?? null },
    { key: 'tbt', label: 'Total Blocking Time', value: currentCheck?.tbt_ms ?? null },
    { key: 'cls', label: 'Cumulative Layout Shift', value: currentCheck?.cls ?? null },
    { key: 'si', label: 'Speed Index', value: currentCheck?.si_ms ?? null },
    { key: 'tti', label: 'Time to Interactive', value: currentCheck?.tti_ms ?? null },
  ]

  // * All 4 category scores for the hero row
  const allScores = [
    { key: 'performance', label: 'Performance', score: currentCheck?.performance_score ?? null },
    { key: 'accessibility', label: 'Accessibility', score: currentCheck?.accessibility_score ?? null },
    { key: 'best-practices', label: 'Best Practices', score: currentCheck?.best_practices_score ?? null },
    { key: 'seo', label: 'SEO', score: currentCheck?.seo_score ?? null },
  ]

  // * Map category key to score for diagnostics section
  const scoreByGroup: Record<string, number | null> = {
    'performance': currentCheck?.performance_score ?? null,
    'accessibility': currentCheck?.accessibility_score ?? null,
    'best-practices': currentCheck?.best_practices_score ?? null,
    'seo': currentCheck?.seo_score ?? null,
  }

  function getMetricDotColor(metric: string, value: number | null): string {
    if (value === null) return 'bg-neutral-400'
    const status = getMetricStatus(metric, value)
    if (status.label === 'Good') return 'bg-emerald-500'
    if (status.label === 'Needs Improvement') return 'bg-amber-500'
    return 'bg-red-500'
  }

  // * Enabled state — show full PageSpeed dashboard
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">
            PageSpeed
          </h1>
          <p className="text-sm text-neutral-400">
            Performance scores and Core Web Vitals for {site.domain}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mobile / Desktop toggle */}
          <div className="flex gap-1" role="tablist" aria-label="Strategy tabs">
            {(['mobile', 'desktop'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setStrategy(tab); setSelectedCheckId(null); setSelectedCheckData(null) }}
                role="tab"
                aria-selected={strategy === tab}
                className={`relative px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded cursor-pointer ${
                  strategy === tab
                    ? 'text-white'
                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {tab === 'mobile' ? 'Mobile' : 'Desktop'}
                {strategy === tab && (
                  <motion.div
                    layoutId="pagespeedStrategyTab"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-orange"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            ))}
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

      {/* Section 1 — Score Overview: 4 equal gauges + screenshot */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 sm:p-8 mb-6">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          {/* 4 equal gauges — click to scroll to diagnostics */}
          <div className="flex-1 flex items-center justify-center gap-6 sm:gap-8 flex-wrap">
            {allScores.map(({ key, label, score }) => (
              <button
                key={key}
                onClick={() => document.getElementById(`diag-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="cursor-pointer hover:opacity-80 transition-opacity"
              >
                <ScoreGauge score={score} label={label} size={90} />
              </button>
            ))}
          </div>

          {/* Screenshot */}
          {currentCheck?.screenshot && (
            <div className="flex-shrink-0 flex items-center justify-center">
              <img
                src={currentCheck.screenshot}
                alt={`${strategy} screenshot`}
                className="rounded-lg max-h-44 w-auto border border-neutral-200 dark:border-neutral-700 object-contain"
              />
            </div>
          )}
        </div>

        {/* Check navigator + frequency + legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            {/* Prev/Next arrows */}
            {checkTimestamps.length > 1 && (
              <button
                onClick={handlePrevCheck}
                disabled={!canGoPrev}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous check"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {currentCheck?.checked_at && (
              <span className="tabular-nums">
                {selectedCheckId
                  ? new Date(currentCheck.checked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : `Last checked ${formatTimeAgo(currentCheck.checked_at)}`
                }
              </span>
            )}
            {checkTimestamps.length > 1 && (
              <button
                onClick={handleNextCheck}
                disabled={!canGoNext}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Next check"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {config?.frequency && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                {config.frequency}
              </span>
            )}
            {loadingCheck && (
              <span className="text-xs text-neutral-400 animate-pulse">Loading...</span>
            )}
          </div>
          <div className="flex items-center gap-x-3 text-[11px] text-neutral-400 dark:text-neutral-500 ml-auto">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500" />0&ndash;49</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-500" />50&ndash;89</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />90&ndash;100</span>
          </div>
        </div>
      </div>

      {/* Filmstrip — page load progression */}
      {currentCheck?.filmstrip && currentCheck.filmstrip.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 sm:p-8 mb-6 relative">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
            Page Load Timeline
          </h3>
          <div className="flex items-center overflow-x-auto gap-1 scrollbar-none">
            {currentCheck.filmstrip.map((frame, idx) => (
              <div key={idx} className="flex-shrink-0 text-center">
                <img
                  src={frame.data}
                  alt={`${frame.timing}ms`}
                  className="h-24 rounded border border-neutral-200 dark:border-neutral-700 object-contain bg-neutral-50 dark:bg-neutral-800"
                />
                <span className="text-[10px] text-neutral-400 mt-1 block">
                  {frame.timing < 1000 ? `${frame.timing}ms` : `${(frame.timing / 1000).toFixed(1)}s`}
                </span>
              </div>
            ))}
          </div>
          {/* Fade indicator for horizontal scroll */}
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white dark:from-neutral-900 to-transparent rounded-r-2xl pointer-events-none" />
        </div>
      )}

      {/* Section 2 — Metrics Card */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 sm:p-8 mb-6">
        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-5">
          Metrics
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
          {metrics.map(({ key, label, value }) => (
            <div key={key} className="flex items-start gap-3">
              <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${getMetricDotColor(key, value)}`} />
              <div>
                <div className="text-sm text-neutral-400">
                  {label}
                </div>
                <div className="text-2xl font-semibold text-white tabular-nums">
                  {formatMetricValue(key, value)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 3 — Score Trend Chart (visx) */}
      {chartData.length >= 2 && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 sm:p-8 mb-6 overflow-hidden">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
            Performance Score Trend
          </h3>
          <div>
            <VisxAreaChart
              data={chartData as Record<string, unknown>[]}
              xDataKey="dateObj"
              aspectRatio="4 / 1"
              margin={{ top: 10, right: 10, bottom: 30, left: 40 }}
            >
              <VisxGrid horizontal vertical={false} stroke="var(--chart-grid)" strokeDasharray="4,4" />
              <VisxArea
                dataKey="score"
                fill="var(--chart-line-primary)"
                fillOpacity={0.15}
                stroke="var(--chart-line-primary)"
                strokeWidth={2}
                gradientToOpacity={0}
              />
              <VisxXAxis
                numTicks={5}
                formatLabel={(d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              />
              <VisxYAxis
                numTicks={5}
                formatValue={(v: number) => String(Math.round(v))}
              />
              <VisxChartTooltip
                rows={(point: Record<string, unknown>) => [{
                  label: 'Score',
                  value: String(Math.round(point.score as number)),
                  color: 'var(--chart-line-primary)',
                }]}
              />
            </VisxAreaChart>
          </div>
        </div>
      )}

      {/* Section 4 — Diagnostics by Category */}
      {audits.length > 0 && (
        <div className="space-y-6">
          {categoryGroups.map(group => {
            const groupAudits = auditsByGroup[group.key] ?? []
            const groupPassed = passed.filter(a => a.group === group.key)
            const groupManual = manualByGroup[group.key] ?? []
            if (groupAudits.length === 0 && groupPassed.length === 0 && groupManual.length === 0) return null
            return (
              <div key={group.key} id={`diag-${group.key}`} className="scroll-mt-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 sm:p-8">
                {/* Category header with gauge */}
                <div className="flex items-center gap-5 mb-6">
                  <ScoreGauge score={scoreByGroup[group.key]} label="" size={56} />
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {group.label}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      {(() => {
                        const realIssues = groupAudits.filter(a => a.score !== null && a.score !== undefined).length
                        return realIssues === 0 ? 'No issues found' : `${realIssues} issue${realIssues !== 1 ? 's' : ''} found`
                      })()}
                    </p>
                  </div>
                </div>

                {groupAudits.length > 0 && (
                  <AuditsBySubGroup audits={groupAudits} />
                )}

                {groupManual.length > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-neutral-400 select-none hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
                      <span className="ml-1">Additional items to manually check ({groupManual.length})</span>
                    </summary>
                    <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
                      {groupManual.map(audit => <AuditRow key={audit.id} audit={audit} />)}
                    </div>
                  </details>
                )}

                {groupPassed.length > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-neutral-400 select-none hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
                      <span className="ml-1">{groupPassed.length} passed audit{groupPassed.length !== 1 ? 's' : ''}</span>
                    </summary>
                    <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
                      {groupPassed.map(audit => <AuditRow key={audit.id} audit={audit} />)}
                    </div>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// * Sort audits by severity: red (< 0.5) → orange (0.5-0.89) → empty (null) → green (>= 0.9)
function sortBySeverity(audits: AuditSummary[]): AuditSummary[] {
  return [...audits].sort((a, b) => {
    const rank = (s: number | null | undefined) => {
      if (s === null || s === undefined) return 2 // empty circle
      if (s < 0.5) return 0 // red
      if (s < 0.9) return 1 // orange
      return 3 // green
    }
    return rank(a.score) - rank(b.score)
  })
}

// * Known sub-group ordering: insights-type groups come before diagnostics-type groups
const subGroupPriority: Record<string, number> = {
  // * Performance
  'budgets': 0, 'load-opportunities': 0, 'diagnostics': 1,
  // * Accessibility
  'a11y-names-labels': 0, 'a11y-contrast': 1, 'a11y-best-practices': 2,
  'a11y-color-contrast': 1, 'a11y-aria': 3, 'a11y-navigation': 4,
  'a11y-language': 5, 'a11y-audio-video': 6, 'a11y-tables-lists': 7,
  // * SEO
  'seo-mobile': 0, 'seo-content': 1, 'seo-crawl': 2,
}

// * Group audits by sub-group within a category (e.g., "Names and Labels", "Contrast")
function AuditsBySubGroup({ audits }: { audits: AuditSummary[] }) {
  // * Collect unique sub-groups
  const bySubGroup: Record<string, AuditSummary[]> = {}

  for (const audit of audits) {
    const key = audit.sub_group || '__none__'
    if (!bySubGroup[key]) {
      bySubGroup[key] = []
    }
    bySubGroup[key].push(audit)
  }

  const subGroupOrder = Object.keys(bySubGroup).sort((a, b) => {
    const pa = subGroupPriority[a] ?? 0
    const pb = subGroupPriority[b] ?? 0
    return pa - pb
  })

  // * If no sub-groups exist, render flat list sorted by severity
  if (subGroupOrder.length === 1 && subGroupOrder[0] === '__none__') {
    return (
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {sortBySeverity(audits).map(audit => <AuditRow key={audit.id} audit={audit} />)}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {subGroupOrder.map(key => {
        const items = sortBySeverity(bySubGroup[key])
        const title = items[0]?.sub_group_title
        return (
          <div key={key}>
            {title && (
              <h4 className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-2">
                {title}
              </h4>
            )}
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {items.map(audit => <AuditRow key={audit.id} audit={audit} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// * Severity indicator based on audit score (pagespeed.web.dev style)
function AuditSeverityIcon({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-neutral-400 flex-shrink-0" aria-label="Informative" />
  }
  if (score < 0.5) {
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" aria-label="Poor" />
  }
  if (score < 0.9) {
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" aria-label="Needs Improvement" />
  }
  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" aria-label="Good" />
}

// * Expandable audit row with description and detail items
function AuditRow({ audit }: { audit: AuditSummary }) {
  return (
    <details className="group">
      <summary className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer list-none">
        <AuditSeverityIcon score={audit.score} />
        <span className="font-medium text-sm text-white flex-1 min-w-0 truncate">{audit.title}</span>
        {audit.display_value && (
          <span className="text-xs text-neutral-500 dark:text-neutral-500 flex-shrink-0 tabular-nums">{audit.display_value}</span>
        )}
        {audit.savings_ms != null && audit.savings_ms > 0 && !audit.display_value && (
          <span className="text-sm font-medium text-amber-600 dark:text-amber-400 flex-shrink-0 tabular-nums">
            {audit.savings_ms < 1000 ? `${Math.round(audit.savings_ms)}ms` : `${(audit.savings_ms / 1000).toFixed(1)}s`}
          </span>
        )}
        <svg className="w-4 h-4 text-neutral-400 transition-transform group-open:rotate-180 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="pl-8 pr-2 pb-3 pt-1">
        {/* Description with parsed markdown links */}
        {audit.description && (
          <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
            <AuditDescription text={audit.description} />
          </p>
        )}
        {/* Items list */}
        {audit.details && Array.isArray(audit.details) && audit.details.length > 0 && (
          <div className="space-y-2">
            {audit.details.slice(0, 10).map((item: Record<string, any>, idx: number) => (
              <AuditItem key={idx} item={item} />
            ))}
            {audit.details.length > 10 && (
              <p className="text-xs text-neutral-400 mt-1">+ {audit.details.length - 10} more items</p>
            )}
          </div>
        )}
      </div>
    </details>
  )
}

// * Parse markdown-style links [text](url) into clickable <a> tags
function AuditDescription({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g)
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (match) {
          const href = remapLearnUrl(match[2])
          const isCiphera = href.startsWith('https://ciphera.net')
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel={isCiphera ? 'noopener' : 'noopener noreferrer'}
              className="text-brand-orange hover:underline"
            >
              {match[1]}
            </a>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// * Render a single audit detail item — handles various field types from the PSI API
function AuditItem({ item }: { item: Record<string, any> }) {
  // * Determine the primary label
  const label = item.node?.nodeLabel || item.label || item.groupLabel || item.source?.url || null
  // * URL can be in item.url or item.href
  const url = item.url || item.href || null
  // * Text content (used by SEO audits like "link text")
  const text = item.text || item.linkText || null

  return (
    <div className="flex items-start gap-3 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0 text-xs text-neutral-600 dark:text-neutral-400">
      {/* Element screenshot */}
      {item.node?.screenshot?.data && (
        <img
          src={item.node.screenshot.data}
          alt=""
          className="w-20 h-14 object-contain rounded border border-neutral-200 dark:border-neutral-700 flex-shrink-0 bg-neutral-50 dark:bg-neutral-800"
        />
      )}
      {/* Content */}
      <div className="flex-1 min-w-0">
        {label && (
          <div className="font-medium text-white text-xs mb-0.5">
            {label}
          </div>
        )}
        {url && (
          <div className="font-mono text-xs text-neutral-400 break-all">{url}</div>
        )}
        {text && (
          <div className="text-xs text-neutral-400 mt-0.5">{text}</div>
        )}
        {item.node?.snippet && (
          <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded break-all mt-1 inline-block">{item.node.snippet}</code>
        )}
        {/* Fallback for items with only string values we haven't handled */}
        {!label && !url && !text && !item.node && item.statistic && (
          <span>{item.statistic}</span>
        )}
      </div>
      {/* Metrics on the right */}
      <div className="flex-shrink-0 text-right space-y-0.5">
        {item.wastedBytes != null && (
          <div className="text-amber-600 dark:text-amber-400 whitespace-nowrap">
            {item.wastedBytes < 1024 ? `${item.wastedBytes} B` : `${(item.wastedBytes / 1024).toFixed(1)} KiB`}
          </div>
        )}
        {item.totalBytes != null && !item.wastedBytes && (
          <div className="whitespace-nowrap">
            {item.totalBytes < 1024 ? `${item.totalBytes} B` : `${(item.totalBytes / 1024).toFixed(1)} KiB`}
          </div>
        )}
        {item.wastedMs != null && (
          <div className="text-amber-600 dark:text-amber-400 whitespace-nowrap">
            {item.wastedMs < 1000 ? `${Math.round(item.wastedMs)}ms` : `${(item.wastedMs / 1000).toFixed(1)}s`}
          </div>
        )}
      </div>
    </div>
  )
}

// * Skeleton loading state
function PageSpeedSkeleton() {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 space-y-6 animate-pulse">
      {/* Header — title + subtitle + toggle buttons */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-36 bg-neutral-700 rounded" />
          <div className="h-4 w-72 bg-neutral-700 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="h-8 w-16 bg-neutral-700 rounded" />
            <div className="h-8 w-20 bg-neutral-700 rounded" />
          </div>
          <div className="h-9 w-24 bg-neutral-700 rounded-lg" />
        </div>
      </div>

      {/* Score overview — 4 gauge circles + screenshot */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          <div className="flex-1 flex items-center justify-center gap-6 sm:gap-8 flex-wrap">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-[90px] h-[90px] rounded-full border-[6px] border-neutral-700 bg-transparent" />
                <div className="h-3 w-16 bg-neutral-700 rounded" />
              </div>
            ))}
          </div>
          <div className="w-48 h-44 bg-neutral-700 rounded-lg flex-shrink-0 hidden md:block" />
        </div>
        {/* Legend bar */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-neutral-800">
          <div className="h-3 w-32 bg-neutral-700 rounded" />
          <div className="ml-auto flex items-center gap-3">
            <div className="h-2 w-10 bg-neutral-700 rounded" />
            <div className="h-2 w-10 bg-neutral-700 rounded" />
            <div className="h-2 w-10 bg-neutral-700 rounded" />
          </div>
        </div>
      </div>

      {/* Metrics card — 6 metrics in 3-col grid */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8">
        <div className="h-3 w-16 bg-neutral-700 rounded mb-5" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-1.5 w-2.5 h-2.5 rounded-full bg-neutral-700 flex-shrink-0" />
              <div className="space-y-2">
                <div className="h-3 w-32 bg-neutral-700 rounded" />
                <div className="h-7 w-20 bg-neutral-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Score trend chart placeholder */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8">
        <div className="h-3 w-40 bg-neutral-700 rounded mb-5" />
        <div className="h-48 w-full bg-neutral-800 rounded-lg" />
      </div>
    </div>
  )
}

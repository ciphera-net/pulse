'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { useTheme } from '@ciphera-net/ui'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import { formatNumber, formatDuration, formatUpdatedAgo } from '@ciphera-net/ui'
import Sparkline from './Sparkline'
import { ArrowUpRightIcon, ArrowDownRightIcon, BarChartIcon, Select, Button, DownloadIcon } from '@ciphera-net/ui'
import { Checkbox } from '@ciphera-net/ui'

const COLORS = {
  brand: 'var(--color-brand-orange)',
  success: 'var(--color-success)',
  danger: 'var(--color-error)',
}

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

export interface DailyStat {
  date: string
  pageviews: number
  visitors: number
  bounce_rate: number
  avg_duration: number
}

interface Stats {
  pageviews: number
  visitors: number
  bounce_rate: number
  avg_duration: number
}

interface ChartProps {
  data: DailyStat[]
  prevData?: DailyStat[]
  stats: Stats
  prevStats?: Stats
  interval: 'minute' | 'hour' | 'day' | 'month'
  dateRange: { start: string, end: string }
  todayInterval: 'minute' | 'hour'
  setTodayInterval: (interval: 'minute' | 'hour') => void
  multiDayInterval: 'hour' | 'day'
  setMultiDayInterval: (interval: 'hour' | 'day') => void
  /** Optional: callback when user requests chart export (parent can open ExportModal or handle export) */
  onExportChart?: () => void
  /** Optional: timestamp of last data fetch for "Live · Xs ago" indicator */
  lastUpdatedAt?: number | null
}

type MetricType = 'pageviews' | 'visitors' | 'bounce_rate' | 'avg_duration'

// * Custom tooltip with comparison and theme-aware styling
function ChartTooltip({
  active,
  payload,
  label,
  metric,
  metricLabel,
  formatNumberFn,
  showComparison,
  prevPeriodLabel,
  colors,
}: {
  active?: boolean
  payload?: Array<{ payload: { prevPageviews?: number; prevVisitors?: number; prevBounceRate?: number; prevAvgDuration?: number }; value: number }>
  label?: string
  metric: MetricType
  metricLabel: string
  formatNumberFn: (n: number) => string
  showComparison: boolean
  prevPeriodLabel?: string
  colors: typeof CHART_COLORS_LIGHT
}) {
  if (!active || !payload?.length || !label) return null
  // * Recharts sends one payload entry per Area; order can be [prevSeries, currentSeries].
  // * Use the entry for the current metric so the tooltip shows today's value, not yesterday's.
  type PayloadItem = { dataKey?: string; value?: number; payload: { prevPageviews?: number; prevVisitors?: number; prevBounceRate?: number; prevAvgDuration?: number; visitors?: number; pageviews?: number; bounce_rate?: number; avg_duration?: number } }
  const items = payload as PayloadItem[]
  const current = items.find((p) => p.dataKey === metric) ?? items[items.length - 1]
  const value = Number(current?.value ?? (current?.payload as Record<string, number>)?.[metric] ?? 0)
  
  let prev: number | undefined
  switch (metric) {
    case 'visitors': prev = current?.payload?.prevVisitors; break;
    case 'pageviews': prev = current?.payload?.prevPageviews; break;
    case 'bounce_rate': prev = current?.payload?.prevBounceRate; break;
    case 'avg_duration': prev = current?.payload?.prevAvgDuration; break;
  }

  const hasPrev = showComparison && prev != null
  const delta =
    hasPrev && (prev as number) > 0
      ? Math.round(((value - (prev as number)) / (prev as number)) * 100)
      : null

  const formatValue = (v: number) => {
    if (metric === 'bounce_rate') return `${Math.round(v)}%`
    if (metric === 'avg_duration') return formatDuration(v)
    return formatNumberFn(v)
  }

  return (
    <div
      className="rounded-lg border px-4 py-3 shadow-lg transition-shadow duration-300"
      style={{
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
      }}
    >
      <div className="text-xs font-medium" style={{ color: colors.textMuted, marginBottom: 6 }}>
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-base font-bold" style={{ color: colors.text }}>
          {formatValue(value)}
        </span>
        <span className="text-xs" style={{ color: colors.textMuted }}>
          {metricLabel}
        </span>
      </div>
      {hasPrev && (
        <div className="mt-1.5 flex items-center gap-2 text-xs" style={{ color: colors.textMuted }}>
          <span>vs {formatValue(prev as number)} {prevPeriodLabel ? `(${prevPeriodLabel})` : 'prev'}</span>
          {delta !== null && (
            <span
              className="font-medium"
              style={{
                color: delta > 0 ? (metric === 'bounce_rate' ? COLORS.danger : COLORS.success) : delta < 0 ? (metric === 'bounce_rate' ? COLORS.success : COLORS.danger) : colors.textMuted,
              }}
            >
              {delta > 0 ? '+' : ''}{delta}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// * Compact Y-axis formatter: 1.5M, 12k, 99
function formatAxisValue(value: number): string {
  if (value >= 1e6) return `${value / 1e6}M`
  if (value >= 1000) return `${value / 1000}k`
  return String(value)
}

// * Compact duration for Y-axis ticks (avoids truncation: "5m" not "5m 0s")
function formatAxisDuration(seconds: number): string {
  if (!seconds) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}

// * Returns human-readable label for the previous comparison period (e.g. "Feb 10" or "Jan 5 – Feb 4")
function getPrevDateRangeLabel(dateRange: { start: string; end: string }): string {
  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)
  const duration = endDate.getTime() - startDate.getTime()

  if (duration === 0) {
    const prev = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
    return prev.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const prevEnd = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
  const prevStart = new Date(prevEnd.getTime() - duration)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(prevStart)} – ${fmt(prevEnd)}`
}

// * Returns short trend context (e.g. "vs yesterday", "vs previous 7 days")
function getTrendContext(dateRange: { start: string; end: string }): string {
  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)
  const duration = endDate.getTime() - startDate.getTime()

  if (duration === 0) return 'vs yesterday'
  const days = Math.round(duration / (24 * 60 * 60 * 1000))
  if (days === 1) return 'vs yesterday'
  return `vs previous ${days} days`
}

export default function Chart({ 
  data, 
  prevData, 
  stats, 
  prevStats, 
  interval,
  dateRange,
  todayInterval,
  setTodayInterval,
  multiDayInterval,
  setMultiDayInterval,
  onExportChart,
  lastUpdatedAt,
}: ChartProps) {
  const [metric, setMetric] = useState<MetricType>('visitors')
  const [showComparison, setShowComparison] = useState(false)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()

  const handleExportChart = useCallback(async () => {
    if (onExportChart) {
      onExportChart()
      return
    }
    if (!chartContainerRef.current) return
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(chartContainerRef.current, {
        cacheBust: true,
        backgroundColor: resolvedTheme === 'dark' ? 'var(--color-neutral-900)' : '#ffffff',
      })
      const link = document.createElement('a')
      link.download = `chart-${dateRange.start}-${dateRange.end}.png`
      link.href = dataUrl
      link.click()
    } catch {
      // Fallback: do nothing if export fails
    }
  }, [onExportChart, dateRange, resolvedTheme])

  const colors = useMemo(
    () => (resolvedTheme === 'dark' ? CHART_COLORS_DARK : CHART_COLORS_LIGHT),
    [resolvedTheme]
  )

  // * Align current and previous data
  const chartData = data.map((item, i) => {
    // * Try to find matching previous item (assuming same length/order)
    // * For more robustness, we could match by relative index
    const prevItem = prevData?.[i]
    
    // * Format date based on interval
    let formattedDate: string
    if (interval === 'minute') {
      formattedDate = new Date(item.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } else if (interval === 'hour') {
      const d = new Date(item.date)
      const isMidnight = d.getHours() === 0 && d.getMinutes() === 0
      // * At 12:00 AM: date only (used for X-axis ticks). Non-midnight: date + time for tooltip only.
      formattedDate = isMidnight
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' 12:00 AM'
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric' })
    } else {
      formattedDate = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    
    return {
      date: formattedDate,
      originalDate: item.date,
      pageviews: item.pageviews,
      visitors: item.visitors,
      bounce_rate: item.bounce_rate,
      avg_duration: item.avg_duration,
      prevPageviews: prevItem?.pageviews,
      prevVisitors: prevItem?.visitors,
      prevBounceRate: prevItem?.bounce_rate,
      prevAvgDuration: prevItem?.avg_duration,
    }
  })

  // * Calculate trends
  const calculateTrend = (current: number, previous?: number) => {
    if (!previous) return null
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }

  const metrics = [
    {
      id: 'visitors',
      label: 'Unique Visitors',
      value: formatNumber(stats.visitors),
      trend: calculateTrend(stats.visitors, prevStats?.visitors),
      color: COLORS.brand,
      invertTrend: false,
    },
    {
      id: 'pageviews',
      label: 'Total Pageviews',
      value: formatNumber(stats.pageviews),
      trend: calculateTrend(stats.pageviews, prevStats?.pageviews),
      color: COLORS.brand,
      invertTrend: false,
    },
    {
      id: 'bounce_rate',
      label: 'Bounce Rate',
      value: `${Math.round(stats.bounce_rate)}%`,
      trend: calculateTrend(stats.bounce_rate, prevStats?.bounce_rate),
      color: COLORS.brand,
      invertTrend: true, // Lower bounce rate is better
    },
    {
      id: 'avg_duration',
      label: 'Visit Duration',
      value: formatDuration(stats.avg_duration),
      trend: calculateTrend(stats.avg_duration, prevStats?.avg_duration),
      color: COLORS.brand,
      invertTrend: false,
    },
  ] as const

  const activeMetric = metrics.find((m) => m.id === metric) || metrics[0]
  const chartMetric = metric
  const metricLabel = metrics.find(m => m.id === metric)?.label || 'visitors'
  const prevPeriodLabel = prevData?.length ? getPrevDateRangeLabel(dateRange) : ''
  const trendContext = getTrendContext(dateRange)

  const avg = chartData.length
    ? chartData.reduce((s, d) => s + (d[chartMetric] as number), 0) / chartData.length
    : 0

  const hasPrev = !!(prevData?.length && showComparison)
  const hasData = data.length > 0
  const hasAnyNonZero = hasData && chartData.some((d) => (d[chartMetric] as number) > 0)

  // * In hourly view, only show X-axis labels at 12:00 AM (date + 12:00 AM).
  const midnightTicks =
    interval === 'hour'
      ? (() => {
          const t = chartData
            .filter((_, i) => {
              const d = new Date(data[i].date)
              return d.getHours() === 0 && d.getMinutes() === 0
            })
            .map((c) => c.date)
          return t.length > 0 ? t : undefined
        })()
      : undefined

  // * In daily view, only show the date at each day (12:00 AM / start-of-day mark), no time.
  const dayTicks = interval === 'day' && chartData.length > 0 ? chartData.map((c) => c.date) : undefined

  return (
    <div
      ref={chartContainerRef}
      className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm relative"
      role="region"
      aria-label={`Analytics chart showing ${metricLabel} over time`}
    >
      {/* * Subtle live/updated indicator in bottom-right corner */}
      {lastUpdatedAt != null && (
        <div
          className="absolute bottom-3 right-6 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 pointer-events-none"
          title="Data refreshes every 30 seconds"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
          </span>
          Live · {formatUpdatedAgo(lastUpdatedAt)}
        </div>
      )}
      {/* Stats Header (Interactive Tabs) */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-neutral-200 dark:divide-neutral-800 border-b border-neutral-200 dark:border-neutral-800">
        {metrics.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMetric(item.id as MetricType)}
            aria-pressed={metric === item.id}
            aria-label={`Show ${item.label} chart`}
            className={`
              p-4 sm:p-6 text-left transition-colors relative group
              hover:bg-neutral-50 dark:hover:bg-neutral-800/50
              ${metric === item.id ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}
              cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2
            `}
          >
            <div className={`text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-2 ${metric === item.id ? 'text-neutral-900 dark:text-white' : 'text-neutral-500'}`}>
              {item.label}
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
                {item.value}
              </span>
              <span className="flex items-center text-sm font-medium">
                {item.trend !== null ? (
                  <>
                    <span className={
                      (item.invertTrend ? -item.trend : item.trend) > 0 
                        ? 'text-emerald-600 dark:text-emerald-500' 
                        : (item.invertTrend ? -item.trend : item.trend) < 0 
                          ? 'text-red-600 dark:text-red-500' 
                          : 'text-neutral-500'
                    }>
                      {(item.invertTrend ? -item.trend : item.trend) > 0 ? (
                        <ArrowUpRightIcon className="w-3 h-3 mr-0.5 inline" />
                      ) : (item.invertTrend ? -item.trend : item.trend) < 0 ? (
                        <ArrowDownRightIcon className="w-3 h-3 mr-0.5 inline" />
                      ) : null}
                      {Math.abs(item.trend)}%
                    </span>
                  </>
                ) : (
                  <span className="text-neutral-500 dark:text-neutral-400">—</span>
                )}
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{trendContext}</p>
            {hasData && (
              <div className="mt-2">
                <Sparkline data={chartData} dataKey={item.id} color={item.color} />
              </div>
            )}
            {metric === item.id && (
               <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: item.color }} />
            )}
          </button>
        ))}
      </div>

      {/* Chart Area */}
      <div className="p-6">
        {/* Toolbar Row */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left side: Legend */}
          <div className="flex items-center">
            {hasPrev && (
              <div className="flex items-center gap-4 text-xs font-medium" style={{ color: colors.textMuted }}>
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: activeMetric.color }}
                  />
                  Current
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full border border-dashed"
                    style={{ borderColor: colors.axis }}
                  />
                  Previous{prevPeriodLabel ? ` (${prevPeriodLabel})` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Right side: Controls */}
          <div className="flex flex-wrap items-center gap-3 self-end sm:self-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Group by:</span>
              {dateRange.start === dateRange.end && (
                <Select
                  value={todayInterval}
                  onChange={(value) => setTodayInterval(value as 'minute' | 'hour')}
                  options={[
                    { value: 'minute', label: '1 min' },
                    { value: 'hour', label: '1 hour' },
                  ]}
                  className="min-w-[100px]"
                />
              )}
              {dateRange.start !== dateRange.end && (
                <Select
                  value={multiDayInterval}
                  onChange={(value) => setMultiDayInterval(value as 'hour' | 'day')}
                  options={[
                    { value: 'hour', label: '1 hour' },
                    { value: 'day', label: '1 day' },
                  ]}
                  className="min-w-[100px]"
                />
              )}
            </div>

            {prevData?.length ? (
              <div className="flex flex-col gap-1">
                <Checkbox
                  checked={showComparison}
                  onCheckedChange={setShowComparison}
                  label="Compare"
                />
                {showComparison && prevPeriodLabel && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    ({prevPeriodLabel})
                  </span>
                )}
              </div>
            ) : null}

            <Button
              variant="ghost"
              onClick={handleExportChart}
              disabled={!hasData}
              className="gap-2 py-1.5 px-3 text-sm text-neutral-600 dark:text-neutral-400"
            >
              <DownloadIcon className="w-4 h-4" />
              Export chart
            </Button>

            {/* Vertical Separator */}
            <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-800" />
          </div>
        </div>

        {!hasData ? (
          <div className="flex h-80 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30">
            <BarChartIcon className="h-12 w-12 text-neutral-300 dark:text-neutral-600" aria-hidden />
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              No data for this period
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">Try a different date range</p>
          </div>
        ) : !hasAnyNonZero ? (
          <div className="flex h-80 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30">
            <BarChartIcon className="h-12 w-12 text-neutral-300 dark:text-neutral-600" aria-hidden />
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              No {metricLabel.toLowerCase()} data for this period
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">Try selecting another metric or date range</p>
          </div>
        ) : (
          <div className="h-[360px] w-full flex flex-col">
            <div className="text-xs font-medium mb-1 flex-shrink-0" style={{ color: colors.axis }}>
              {metricLabel}
            </div>
            <div className="flex-1 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 24, bottom: 24 }}>
                <defs>
                  <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={activeMetric.color} stopOpacity={0.35} />
                    <stop offset="50%" stopColor={activeMetric.color} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={activeMetric.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.border} />
                <XAxis
                  dataKey="date"
                  stroke={colors.axis}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  ticks={midnightTicks ?? dayTicks}
                />
                <YAxis
                  stroke={colors.axis}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 'auto']}
                  width={24}
                  tickFormatter={(val) => {
                    if (metric === 'bounce_rate') return `${val}%`
                    if (metric === 'avg_duration') return formatAxisDuration(val)
                    return formatAxisValue(val)
                  }}
                />
                <Tooltip
                  content={(p: TooltipProps<number, string>) => (
                    <ChartTooltip
                      active={p.active}
                      payload={p.payload as Array<{
                        payload: { prevPageviews?: number; prevVisitors?: number }
                        value: number
                      }>}
                      label={p.label as string}
                      metric={chartMetric}
                      metricLabel={metricLabel}
                      formatNumberFn={formatNumber}
                      showComparison={hasPrev}
                      prevPeriodLabel={prevPeriodLabel}
                      colors={colors}
                    />
                  )}
                  cursor={{ stroke: activeMetric.color, strokeDasharray: '4 4', strokeWidth: 1 }}
                />

                {avg > 0 && (
                  <ReferenceLine
                    y={avg}
                    stroke={colors.axis}
                    strokeDasharray="4 4"
                    strokeOpacity={0.7}
                    label={{
                      value: `Avg: ${metric === 'bounce_rate' ? `${Math.round(avg)}%` : metric === 'avg_duration' ? formatAxisDuration(avg) : formatAxisValue(avg)}`,
                      position: 'insideTopRight',
                      fill: colors.axis,
                      fontSize: 11,
                    }}
                  />
                )}

                {hasPrev && (
                  <Area
                    type="monotone"
                    dataKey={
                      chartMetric === 'visitors' ? 'prevVisitors' : 
                      chartMetric === 'pageviews' ? 'prevPageviews' :
                      chartMetric === 'bounce_rate' ? 'prevBounceRate' :
                      'prevAvgDuration'
                    }
                    stroke={colors.axis}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    dot={false}
                    isAnimationActive
                    animationDuration={500}
                    animationEasing="ease-out"
                  />
                )}

                <Area
                  type="monotone"
                  baseValue={0}
                  dataKey={chartMetric}
                  stroke={activeMetric.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fillOpacity={1}
                  fill={`url(#gradient-${metric})`}
                  dot={false}
                  activeDot={{
                    r: 5,
                    strokeWidth: 2,
                    fill: resolvedTheme === 'dark' ? 'var(--color-neutral-800)' : '#ffffff',
                    stroke: activeMetric.color,
                  }}
                  isAnimationActive
                  animationDuration={500}
                  animationEasing="ease-out"
                />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

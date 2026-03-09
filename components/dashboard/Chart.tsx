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
import { ArrowUpRightIcon, ArrowDownRightIcon, BarChartIcon, Select, DownloadIcon, PlusIcon } from '@ciphera-net/ui'
import { Checkbox } from '@ciphera-net/ui'

const COLORS = {
  brand: 'var(--color-brand-orange)',
  success: 'var(--color-success)',
  danger: 'var(--color-error)',
}

const CHART_COLORS_LIGHT = {
  border: 'var(--color-neutral-200)',
  grid: 'var(--color-neutral-100)',
  text: 'var(--color-neutral-900)',
  textMuted: 'var(--color-neutral-500)',
  axis: 'var(--color-neutral-400)',
  tooltipBg: '#ffffff',
  tooltipBorder: 'var(--color-neutral-200)',
}

const CHART_COLORS_DARK = {
  border: 'var(--color-neutral-700)',
  grid: 'var(--color-neutral-800)',
  text: 'var(--color-neutral-50)',
  textMuted: 'var(--color-neutral-400)',
  axis: 'var(--color-neutral-500)',
  tooltipBg: 'var(--color-neutral-800)',
  tooltipBorder: 'var(--color-neutral-700)',
}

const ANNOTATION_COLORS: Record<string, string> = {
  deploy: '#3b82f6',
  campaign: '#22c55e',
  incident: '#ef4444',
  other: '#a3a3a3',
}

const ANNOTATION_LABELS: Record<string, string> = {
  deploy: 'Deploy',
  campaign: 'Campaign',
  incident: 'Incident',
  other: 'Note',
}

interface AnnotationData {
  id: string
  date: string
  text: string
  category: string
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
  onExportChart?: () => void
  lastUpdatedAt?: number | null
  annotations?: AnnotationData[]
  canManageAnnotations?: boolean
  onCreateAnnotation?: (data: { date: string; text: string; category: string }) => Promise<void>
  onUpdateAnnotation?: (id: string, data: { date: string; text: string; category: string }) => Promise<void>
  onDeleteAnnotation?: (id: string) => Promise<void>
}

type MetricType = 'pageviews' | 'visitors' | 'bounce_rate' | 'avg_duration'

// ─── Helpers ─────────────────────────────────────────────────────────

function formatAxisValue(value: number): string {
  if (value >= 1e6) return `${+(value / 1e6).toFixed(1)}M`
  if (value >= 1000) return `${+(value / 1000).toFixed(1)}k`
  if (!Number.isInteger(value)) return value.toFixed(1)
  return String(value)
}

function formatAxisDuration(seconds: number): string {
  if (!seconds) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m > 0) return s > 0 ? `${m}m${s}s` : `${m}m`
  return `${s}s`
}

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

function getTrendContext(dateRange: { start: string; end: string }): string {
  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)
  const duration = endDate.getTime() - startDate.getTime()

  if (duration === 0) return 'vs yesterday'
  const days = Math.round(duration / (24 * 60 * 60 * 1000))
  if (days === 1) return 'vs yesterday'
  return `vs previous ${days} days`
}

// ─── Tooltip ─────────────────────────────────────────────────────────

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
  payload?: Array<{ payload: Record<string, number>; value: number; dataKey?: string }>
  label?: string
  metric: MetricType
  metricLabel: string
  formatNumberFn: (n: number) => string
  showComparison: boolean
  prevPeriodLabel?: string
  colors: typeof CHART_COLORS_LIGHT
}) {
  if (!active || !payload?.length || !label) return null

  const current = payload.find((p) => p.dataKey === metric) ?? payload[payload.length - 1]
  const value = Number(current?.value ?? current?.payload?.[metric] ?? 0)

  const prevKey = metric === 'visitors' ? 'prevVisitors' : metric === 'pageviews' ? 'prevPageviews' : metric === 'bounce_rate' ? 'prevBounceRate' : 'prevAvgDuration'
  const prev = current?.payload?.[prevKey]

  const hasPrev = showComparison && prev != null
  const delta = hasPrev && prev > 0 ? Math.round(((value - prev) / prev) * 100) : null

  const formatValue = (v: number) => {
    if (metric === 'bounce_rate') return `${Math.round(v)}%`
    if (metric === 'avg_duration') return formatDuration(v)
    return formatNumberFn(v)
  }

  return (
    <div
      className="rounded-lg border px-3.5 py-2.5 shadow-lg"
      style={{ backgroundColor: colors.tooltipBg, borderColor: colors.tooltipBorder }}
    >
      <div className="text-[11px] font-medium mb-1" style={{ color: colors.textMuted }}>
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-bold" style={{ color: colors.text }}>
          {formatValue(value)}
        </span>
        <span className="text-[11px]" style={{ color: colors.textMuted }}>
          {metricLabel}
        </span>
      </div>
      {hasPrev && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: colors.textMuted }}>
          <span>vs {formatValue(prev)} {prevPeriodLabel ? `(${prevPeriodLabel})` : ''}</span>
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

// ─── Chart Component ─────────────────────────────────────────────────

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
  annotations,
  canManageAnnotations,
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: ChartProps) {
  const [metric, setMetric] = useState<MetricType>('visitors')
  const [showComparison, setShowComparison] = useState(false)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()

  const handleExportChart = useCallback(async () => {
    if (onExportChart) { onExportChart(); return }
    if (!chartContainerRef.current) return
    try {
      const { toPng } = await import('html-to-image')
      // Resolve the actual background color from the DOM (CSS vars don't work in html-to-image)
      const bg = getComputedStyle(chartContainerRef.current).backgroundColor || (resolvedTheme === 'dark' ? '#171717' : '#ffffff')
      const dataUrl = await toPng(chartContainerRef.current, {
        cacheBust: true,
        backgroundColor: bg,
      })
      const link = document.createElement('a')
      link.download = `chart-${dateRange.start}-${dateRange.end}.png`
      link.href = dataUrl
      link.click()
    } catch { /* noop */ }
  }, [onExportChart, dateRange, resolvedTheme])

  const colors = useMemo(
    () => (resolvedTheme === 'dark' ? CHART_COLORS_DARK : CHART_COLORS_LIGHT),
    [resolvedTheme]
  )

  // ─── Data ──────────────────────────────────────────────────────────

  const chartData = data.map((item, i) => {
    const prevItem = prevData?.[i]

    let formattedDate: string
    if (interval === 'minute') {
      formattedDate = new Date(item.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } else if (interval === 'hour') {
      const d = new Date(item.date)
      const isMidnight = d.getHours() === 0 && d.getMinutes() === 0
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

  const annotationMarkers = useMemo(() => {
    if (!annotations?.length) return []
    const byDate = new Map<string, AnnotationData[]>()
    for (const a of annotations) {
      const existing = byDate.get(a.date) || []
      existing.push(a)
      byDate.set(a.date, existing)
    }
    const markers: { x: string; annotations: AnnotationData[] }[] = []
    for (const [date, anns] of byDate) {
      const match = chartData.find((d) => {
        const orig = d.originalDate
        return orig.startsWith(date) || orig === date
      })
      if (match) {
        markers.push({ x: match.date, annotations: anns })
      }
    }
    return markers
  }, [annotations, chartData])

  const [annotationForm, setAnnotationForm] = useState<{ visible: boolean; editingId?: string; date: string; text: string; category: string }>({
    visible: false, date: new Date().toISOString().slice(0, 10), text: '', category: 'other'
  })

  // ─── Metrics ───────────────────────────────────────────────────────

  const calculateTrend = (current: number, previous?: number) => {
    if (!previous) return null
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }

  const metrics = [
    { id: 'visitors' as const, label: 'Unique Visitors', value: formatNumber(stats.visitors), trend: calculateTrend(stats.visitors, prevStats?.visitors), invertTrend: false },
    { id: 'pageviews' as const, label: 'Total Pageviews', value: formatNumber(stats.pageviews), trend: calculateTrend(stats.pageviews, prevStats?.pageviews), invertTrend: false },
    { id: 'bounce_rate' as const, label: 'Bounce Rate', value: `${Math.round(stats.bounce_rate)}%`, trend: calculateTrend(stats.bounce_rate, prevStats?.bounce_rate), invertTrend: true },
    { id: 'avg_duration' as const, label: 'Visit Duration', value: formatDuration(stats.avg_duration), trend: calculateTrend(stats.avg_duration, prevStats?.avg_duration), invertTrend: false },
  ]

  const activeMetric = metrics.find((m) => m.id === metric) || metrics[0]
  const metricLabel = activeMetric.label
  const prevPeriodLabel = prevData?.length ? getPrevDateRangeLabel(dateRange) : ''
  const trendContext = getTrendContext(dateRange)

  const hasPrev = !!(prevData?.length && showComparison)
  const hasData = data.length > 0
  const hasAnyNonZero = hasData && chartData.some((d) => (d[metric] as number) > 0)

  // Count metrics should never show decimal Y-axis ticks
  const isCountMetric = metric === 'visitors' || metric === 'pageviews'

  // ─── X-Axis Ticks ─────────────────────────────────────────────────

  const midnightTicks = interval === 'hour'
    ? (() => {
        const t = chartData
          .filter((_, i) => { const d = new Date(data[i].date); return d.getHours() === 0 && d.getMinutes() === 0 })
          .map((c) => c.date)
        return t.length > 0 ? t : undefined
      })()
    : undefined

  const dayTicks = interval === 'day' && chartData.length > 0 ? chartData.map((c) => c.date) : undefined

  // ─── Trend Badge ──────────────────────────────────────────────────

  function TrendBadge({ trend, invert }: { trend: number | null; invert: boolean }) {
    if (trend === null) return <span className="text-neutral-400 dark:text-neutral-500">—</span>
    const effective = invert ? -trend : trend
    const isPositive = effective > 0
    const isNegative = effective < 0
    return (
      <span className={`inline-flex items-center text-xs font-medium ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : isNegative ? 'text-red-500 dark:text-red-400' : 'text-neutral-400'}`}>
        {isPositive ? <ArrowUpRightIcon className="w-3 h-3 mr-0.5" /> : isNegative ? <ArrowDownRightIcon className="w-3 h-3 mr-0.5" /> : null}
        {Math.abs(trend)}%
      </span>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div
      ref={chartContainerRef}
      className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden relative"
      role="region"
      aria-label={`Analytics chart showing ${metricLabel} over time`}
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-neutral-200 dark:divide-neutral-800 border-b border-neutral-200 dark:border-neutral-800">
        {metrics.map((item) => {
          const isActive = metric === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setMetric(item.id)}
              aria-pressed={isActive}
              aria-label={`Show ${item.label} chart`}
              className={`p-4 sm:px-6 sm:py-5 text-left transition-colors relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 ${isActive ? 'bg-neutral-50 dark:bg-neutral-800/40' : 'hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20'}`}
            >
              <div className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isActive ? 'text-neutral-900 dark:text-white' : 'text-neutral-400 dark:text-neutral-500'}`}>
                {item.label}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
                  {item.value}
                </span>
                <TrendBadge trend={item.trend} invert={item.invertTrend} />
              </div>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">{trendContext}</p>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-brand-orange" />
              )}
            </button>
          )
        })}
      </div>

      {/* Chart Area */}
      <div className="px-4 sm:px-6 pt-4 pb-2">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 mb-4">
          {/* Left: metric label + avg badge */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {metricLabel}
            </span>
            {hasPrev && (
              <div className="hidden sm:flex items-center gap-3 text-[11px] font-medium text-neutral-400 dark:text-neutral-500 ml-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
                  Current
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full border border-dashed" style={{ borderColor: colors.axis }} />
                  Previous{prevPeriodLabel ? ` (${prevPeriodLabel})` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-2">
            {dateRange.start === dateRange.end ? (
              <Select
                value={todayInterval}
                onChange={(value) => setTodayInterval(value as 'minute' | 'hour')}
                options={[
                  { value: 'minute', label: '1 min' },
                  { value: 'hour', label: '1 hour' },
                ]}
                className="min-w-[90px]"
              />
            ) : (
              <Select
                value={multiDayInterval}
                onChange={(value) => setMultiDayInterval(value as 'hour' | 'day')}
                options={[
                  { value: 'hour', label: '1 hour' },
                  { value: 'day', label: '1 day' },
                ]}
                className="min-w-[90px]"
              />
            )}

            {prevData?.length ? (
              <Checkbox
                checked={showComparison}
                onCheckedChange={setShowComparison}
                label="Compare"
              />
            ) : null}

            <button
              onClick={handleExportChart}
              disabled={!hasData}
              className="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors disabled:opacity-30 cursor-pointer"
              title="Export chart as PNG"
            >
              <DownloadIcon className="w-4 h-4" />
            </button>

            {canManageAnnotations && (
              <button
                onClick={() => setAnnotationForm({ visible: true, date: new Date().toISOString().slice(0, 10), text: '', category: 'other' })}
                className="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer"
                title="Add annotation"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {!hasData ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2">
            <BarChartIcon className="h-10 w-10 text-neutral-200 dark:text-neutral-700" aria-hidden />
            <p className="text-sm text-neutral-400 dark:text-neutral-500">No data for this period</p>
          </div>
        ) : !hasAnyNonZero ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2">
            <BarChartIcon className="h-10 w-10 text-neutral-200 dark:text-neutral-700" aria-hidden />
            <p className="text-sm text-neutral-400 dark:text-neutral-500">No {metricLabel.toLowerCase()} recorded</p>
          </div>
        ) : (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.brand} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={COLORS.brand} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={colors.grid}
                />
                <XAxis
                  dataKey="date"
                  stroke={colors.axis}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                  ticks={midnightTicks ?? dayTicks}
                  dy={8}
                />
                <YAxis
                  stroke={colors.axis}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 'auto']}
                  width={40}
                  allowDecimals={!isCountMetric}
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
                      payload={p.payload as Array<{ payload: Record<string, number>; value: number; dataKey?: string }>}
                      label={p.label as string}
                      metric={metric}
                      metricLabel={metricLabel}
                      formatNumberFn={formatNumber}
                      showComparison={hasPrev}
                      prevPeriodLabel={prevPeriodLabel}
                      colors={colors}
                    />
                  )}
                  cursor={{ stroke: colors.axis, strokeOpacity: 0.3, strokeWidth: 1 }}
                />


                {hasPrev && (
                  <Area
                    type="monotone"
                    dataKey={metric === 'visitors' ? 'prevVisitors' : metric === 'pageviews' ? 'prevPageviews' : metric === 'bounce_rate' ? 'prevBounceRate' : 'prevAvgDuration'}
                    stroke={colors.axis}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    dot={false}
                    isAnimationActive
                    animationDuration={400}
                    animationEasing="ease-out"
                  />
                )}

                <Area
                  type="monotone"
                  baseValue={0}
                  dataKey={metric}
                  stroke={COLORS.brand}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fillOpacity={1}
                  fill={`url(#gradient-${metric})`}
                  dot={false}
                  activeDot={{
                    r: 4,
                    strokeWidth: 2,
                    fill: resolvedTheme === 'dark' ? 'var(--color-neutral-900)' : '#ffffff',
                    stroke: COLORS.brand,
                  }}
                  isAnimationActive
                  animationDuration={400}
                  animationEasing="ease-out"
                />

                {annotationMarkers.map((marker) => {
                  const primaryCategory = marker.annotations[0].category
                  const color = ANNOTATION_COLORS[primaryCategory] || ANNOTATION_COLORS.other
                  return (
                    <ReferenceLine
                      key={`ann-${marker.x}`}
                      x={marker.x}
                      stroke={color}
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      strokeOpacity={0.6}
                    />
                  )
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {annotationMarkers.length > 0 && (
        <div className="px-4 sm:px-6 flex items-center gap-1 flex-wrap py-1.5 border-t border-neutral-100 dark:border-neutral-800">
          <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mr-1">Annotations:</span>
          {annotationMarkers.map((marker) => {
            const primary = marker.annotations[0]
            const color = ANNOTATION_COLORS[primary.category] || ANNOTATION_COLORS.other
            const count = marker.annotations.length
            return (
              <button
                key={`ann-btn-${marker.x}`}
                type="button"
                className="relative group inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                onClick={() => {
                  if (canManageAnnotations) {
                    setAnnotationForm({
                      visible: true,
                      editingId: primary.id,
                      date: primary.date,
                      text: primary.text,
                      category: primary.category,
                    })
                  }
                }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="max-w-[120px] truncate">{primary.text}</span>
                {count > 1 && <span className="text-neutral-400">+{count - 1}</span>}
                {/* Hover tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50 pointer-events-none">
                  <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-2 min-w-[180px] max-w-[240px]">
                    {marker.annotations.map((a) => (
                      <div key={a.id} className="flex items-start gap-1.5 text-[11px] mb-1 last:mb-0">
                        <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: ANNOTATION_COLORS[a.category] || ANNOTATION_COLORS.other }} />
                        <div>
                          <span className="font-medium text-neutral-400 dark:text-neutral-500">{ANNOTATION_LABELS[a.category] || 'Note'} &middot; {a.date}</span>
                          <p className="text-neutral-900 dark:text-white">{a.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Live indicator */}
      {lastUpdatedAt != null && (
        <div className="px-4 sm:px-6 pb-3 flex justify-end">
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
            </span>
            Live · {formatUpdatedAgo(lastUpdatedAt)}
          </div>
        </div>
      )}

      {annotationForm.visible && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 rounded-2xl">
          <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl p-5 w-[340px] max-w-[90%]">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
              {annotationForm.editingId ? 'Edit annotation' : 'Add annotation'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Date</label>
                <input
                  type="date"
                  value={annotationForm.date}
                  onChange={(e) => setAnnotationForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Note</label>
                <input
                  type="text"
                  value={annotationForm.text}
                  onChange={(e) => setAnnotationForm((f) => ({ ...f, text: e.target.value.slice(0, 200) }))}
                  placeholder="e.g. Launched new homepage"
                  maxLength={200}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                  autoFocus
                />
                <span className="text-[10px] text-neutral-400 mt-0.5 block text-right">{annotationForm.text.length}/200</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Category</label>
                <select
                  value={annotationForm.category}
                  onChange={(e) => setAnnotationForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                >
                  <option value="deploy">Deploy</option>
                  <option value="campaign">Campaign</option>
                  <option value="incident">Incident</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <div>
                {annotationForm.editingId && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (annotationForm.editingId && onDeleteAnnotation) {
                        await onDeleteAnnotation(annotationForm.editingId)
                        setAnnotationForm({ visible: false, date: '', text: '', category: 'other' })
                      }
                    }}
                    className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium cursor-pointer"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAnnotationForm({ visible: false, date: '', text: '', category: 'other' })}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!annotationForm.text.trim() || !annotationForm.date}
                  onClick={async () => {
                    const data = { date: annotationForm.date, text: annotationForm.text.trim(), category: annotationForm.category }
                    if (annotationForm.editingId && onUpdateAnnotation) {
                      await onUpdateAnnotation(annotationForm.editingId, data)
                    } else if (onCreateAnnotation) {
                      await onCreateAnnotation(data)
                    }
                    setAnnotationForm({ visible: false, date: '', text: '', category: 'other' })
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-brand-orange hover:bg-brand-orange/90 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {annotationForm.editingId ? 'Save' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

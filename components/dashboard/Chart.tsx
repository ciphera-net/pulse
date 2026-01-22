'use client'

import { useState, useMemo } from 'react'
import { useTheme } from 'next-themes'
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
import { formatNumber, formatDuration } from '@/lib/utils/format'
import { ArrowTopRightIcon, ArrowBottomRightIcon, DownloadIcon, BarChartIcon } from '@radix-ui/react-icons'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'

const COLORS = {
  brand: '#FD5E0F',
  success: '#10B981', // Emerald-500
  danger: '#EF4444',  // Red-500
}

const CHART_COLORS_LIGHT = {
  border: '#E5E5E5',
  text: '#171717',
  textMuted: '#737373',
  axis: '#A3A3A3',
  tooltipBg: '#ffffff',
  tooltipBorder: '#E5E5E5',
}

const CHART_COLORS_DARK = {
  border: '#404040',
  text: '#fafafa',
  textMuted: '#a3a3a3',
  axis: '#737373',
  tooltipBg: '#262626',
  tooltipBorder: '#404040',
}

interface DailyStat {
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
  colors,
}: {
  active?: boolean
  payload?: Array<{ payload: { prevPageviews?: number; prevVisitors?: number; prevBounceRate?: number; prevAvgDuration?: number }; value: number }>
  label?: string
  metric: MetricType
  metricLabel: string
  formatNumberFn: (n: number) => string
  showComparison: boolean
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
      className="rounded-lg border px-4 py-3 shadow-lg"
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
        <div className="mt-1.5 flex items-center gap-1.5 text-xs" style={{ color: colors.textMuted }}>
          <span>vs {formatValue(prev as number)} prev</span>
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

export default function Chart({ data, prevData, stats, prevStats, interval }: ChartProps) {
  const [metric, setMetric] = useState<MetricType>('visitors')
  const [showComparison, setShowComparison] = useState(true)
  const { resolvedTheme } = useTheme()

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

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Date,Pageviews,Visitors\n"
      + data.map(row => `${new Date(row.date).toISOString()},${row.pageviews},${row.visitors}`).join("\n")
    
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `pulse_export_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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
      color: COLORS.danger,
      invertTrend: true, // Lower bounce rate is better
    },
    {
      id: 'avg_duration',
      label: 'Visit Duration',
      value: formatDuration(stats.avg_duration),
      trend: calculateTrend(stats.avg_duration, prevStats?.avg_duration),
      color: COLORS.success,
      invertTrend: false,
    },
  ] as const

  const activeMetric = metrics.find((m) => m.id === metric) || metrics[0]
  const chartMetric = metric
  const metricLabel = metrics.find(m => m.id === metric)?.label || 'visitors'

  const avg = chartData.length
    ? chartData.reduce((s, d) => s + (d[chartMetric] as number), 0) / chartData.length
    : 0

  const hasPrev = !!(prevData?.length && showComparison)

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
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm">
      {/* Stats Header (Interactive Tabs) */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-neutral-200 dark:divide-neutral-800 border-b border-neutral-200 dark:border-neutral-800">
        {metrics.map((item) => (
          <button
            key={item.id}
            onClick={() => setMetric(item.id as MetricType)}
            className={`
              p-6 text-left transition-colors relative group
              hover:bg-neutral-50 dark:hover:bg-neutral-800/50
              ${metric === item.id ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}
              cursor-pointer
            `}
          >
            <div className={`text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-2 ${metric === item.id ? 'text-neutral-900 dark:text-white' : 'text-neutral-500'}`}>
              {item.label}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-neutral-900 dark:text-white">
                {item.value}
              </span>
              {item.trend !== null && (
                <span className={`flex items-center text-sm font-medium ${
                  (item.invertTrend ? -item.trend : item.trend) > 0 
                    ? 'text-emerald-600 dark:text-emerald-500' 
                    : (item.invertTrend ? -item.trend : item.trend) < 0 
                      ? 'text-red-600 dark:text-red-500' 
                      : 'text-neutral-500'
                }`}>
                  {(item.invertTrend ? -item.trend : item.trend) > 0 ? (
                     <ArrowTopRightIcon className="w-3 h-3 mr-0.5" />
                  ) : (item.invertTrend ? -item.trend : item.trend) < 0 ? (
                     <ArrowBottomRightIcon className="w-3 h-3 mr-0.5" />
                  ) : null}
                  {Math.abs(item.trend)}%
                </span>
              )}
            </div>
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
                  Previous
                </span>
              </div>
            )}
          </div>

          {/* Right side: Controls */}
          <div className="flex items-center gap-3 self-end sm:self-auto">
            {prevData?.length ? (
              <Checkbox
                checked={showComparison}
                onCheckedChange={setShowComparison}
                label="Compare"
              />
            ) : null}

            {/* Vertical Separator */}
            <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-800" />

            <Button
              variant="secondary"
              onClick={handleExport}
              className="h-8 px-3 text-xs gap-2"
              title="Export to CSV"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              Export
            </Button>
          </div>
        </div>

        {data.length === 0 ? (
          <div className="flex h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30">
            <BarChartIcon className="h-12 w-12 text-neutral-300 dark:text-neutral-600" aria-hidden />
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              No data for this period
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">Try a different date range</p>
          </div>
        ) : (
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
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
                  tickFormatter={(val) => {
                    if (metric === 'bounce_rate') return `${val}%`
                    if (metric === 'avg_duration') return formatDuration(val)
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
                    fill: resolvedTheme === 'dark' ? '#262626' : '#ffffff',
                    stroke: activeMetric.color,
                  }}
                  isAnimationActive
                  animationDuration={500}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useTheme } from '@ciphera-net/ui'
import { AreaChart as VisxAreaChart, Area as VisxArea, Grid as VisxGrid, XAxis as VisxXAxis, YAxis as VisxYAxis, ChartTooltip as VisxChartTooltip, type TooltipRow } from '@/components/ui/area-chart'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { EngagementPercentilesData } from '@/lib/api/stats'
import { formatNumber, formatDuration } from '@ciphera-net/ui'
import { Select, DownloadIcon } from '@ciphera-net/ui'
import { ArrowUpRight, ArrowDownRight, ChartLine } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { SPRING, EASE_APPLE } from '@/lib/motion'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { cn } from '@/lib/utils'
import { formatTime, formatDateShort } from '@/lib/utils/formatDate'
import { EmptyState } from '@/components/ui/EmptyState'

export interface DailyStat {
  date: string
  pageviews: number
  visitors: number
  bounce_rate: number
  avg_duration: number
  avg_scroll_depth: number
  avg_visible_duration: number
}

interface Stats {
  pageviews: number
  visitors: number
  bounce_rate: number
  avg_duration: number
  avg_scroll_depth: number
  avg_visible_duration: number
}

interface ChartProps {
  data: DailyStat[]
  stats: Stats
  prevStats?: Stats
  interval: 'minute' | 'hour' | 'day' | 'month'
  dateRange: { start: string, end: string }
  period?: string
  todayInterval: 'minute' | 'hour'
  setTodayInterval: (interval: 'minute' | 'hour') => void
  multiDayInterval: 'hour' | 'day'
  setMultiDayInterval: (interval: 'hour' | 'day') => void
  lastUpdatedAt?: number | null
  engagementData?: EngagementPercentilesData | null
  onExport?: () => void
}

type MetricType = 'pageviews' | 'visitors' | 'pages_per_visit' | 'bounce_rate' | 'avg_duration' | 'engagement'

// ─── Sparkline ───────────────────────────────────────────────────────

function smoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length < 2) return ''
  let d = `M${coords[0].x},${coords[0].y}`
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)]
    const p1 = coords[i]
    const p2 = coords[i + 1]
    const p3 = coords[Math.min(coords.length - 1, i + 2)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return d
}

function Sparkline({ data, dataKey, active, engagementDaily }: { data: { pageviews: number; visitors: number; bounce_rate: number; avg_duration: number; engagement?: number }[]; dataKey: MetricType; active: boolean; engagementDaily?: { date: string; score: number }[] }) {
  // Engagement sparkline always uses daily data (not hourly-mapped) to show real variation
  const sourceValues = dataKey === 'engagement' && engagementDaily?.length
    ? engagementDaily.map(d => d.score)
    : null
  if (!sourceValues && data.length < 2) return null
  if (sourceValues && sourceValues.length < 2) return null
  const values = sourceValues ?? data.map((d) =>
    dataKey === 'pages_per_visit'
      ? (d.visitors > 0 ? d.pageviews / d.visitors : 0)
      : d[dataKey] as number
  )
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const h = 52
  const padBottom = 2
  const padTop = 16

  const coords = values.map((v, i) => ({
    x: (i / (values.length - 1)) * 100,
    y: h - padBottom - ((v - min) / range) * (h - padBottom - padTop),
  }))

  const linePath = smoothPath(coords)
  const fillPath = linePath + ` L100,${h} L0,${h} Z`

  return (
    <svg viewBox={`0 0 100 ${h}`} className="absolute bottom-0 left-0 right-0 w-full z-0 transition-opacity duration-base opacity-30 group-hover:opacity-60 ease-apple" style={{ height: h }} preserveAspectRatio="none">
      <path d={fillPath} className={active ? "fill-brand-orange/[0.08]" : "fill-neutral-600/[0.05] group-hover:fill-brand-orange/[0.08]"} />
      <path
        d={linePath}
        fill="none"
        className={active ? "stroke-brand-orange" : "stroke-neutral-600 group-hover:stroke-brand-orange"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

// ─── Metric configurations ──────────────────────────────────────────

const METRIC_CONFIGS: {
  key: MetricType
  label: string
  format: (v: number) => string
  isNegative?: boolean
}[] = [
  { key: 'visitors', label: 'Unique visitors', format: (v) => formatNumber(Math.round(v)) },
  { key: 'pageviews', label: 'Total pageviews', format: (v) => formatNumber(Math.round(v)) },
  { key: 'pages_per_visit', label: 'Pages per visit', format: (v) => (v ?? 0).toFixed(1) },
  { key: 'bounce_rate', label: 'Bounce rate', format: (v) => `${Math.round(v)}%`, isNegative: true },
  { key: 'avg_duration', label: 'Visit duration', format: (v) => formatDuration(Math.round(v)) },
  { key: 'engagement', label: 'Engagement', format: (v) => String(Math.round(v ?? 0)) },
]

const CHART_COLORS: Record<MetricType, string> = {
  visitors: 'var(--chart-1)',       // orange (brand)
  pageviews: 'var(--chart-2)',      // blue
  pages_per_visit: 'var(--chart-3)', // green
  bounce_rate: 'var(--chart-4)',    // purple
  avg_duration: 'var(--chart-5)',   // amber
  engagement: 'var(--chart-2)',     // blue
}

// ─── Chart Component ─────────────────────────────────────────────────

export default function Chart({
  data,
  stats,
  prevStats,
  interval,
  dateRange,
  period,
  todayInterval,
  setTodayInterval,
  multiDayInterval,
  setMultiDayInterval,
  lastUpdatedAt,
  engagementData,
  onExport,
}: ChartProps) {
  const [metric, setMetric] = useState<MetricType>('visitors')
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => { setHasMounted(true) }, [])

  // Tick every 1s so "Live · Xs ago" counts in real time (scoped to Chart only)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (lastUpdatedAt == null) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [lastUpdatedAt])


  // ─── Data ──────────────────────────────────────────────────────────

  const chartData = useMemo(() => data.map((item) => {
    let formattedDate: string
    if (interval === 'minute') {
      formattedDate = formatTime(new Date(item.date))
    } else if (interval === 'hour') {
      const d = new Date(item.date)
      formattedDate = formatDateShort(d) + ', ' + formatTime(d)
    } else {
      formattedDate = formatDateShort(new Date(item.date))
    }

    return {
      date: formattedDate,
      dateObj: new Date(item.date),
      originalDate: item.date,
      pageviews: item.pageviews,
      visitors: item.visitors,
      pages_per_visit: item.visitors > 0 ? item.pageviews / item.visitors : 0,
      bounce_rate: item.bounce_rate,
      avg_duration: item.avg_duration,
      engagement: (() => {
        if (!engagementData?.daily?.length) return 0
        const dateStr = typeof item.date === 'string' ? item.date.slice(0, 10) : ''
        const match = engagementData.daily.find(d => d.date === dateStr)
        return match?.score ?? 0
      })(),
    }
  }), [data, interval, engagementData])

  // ─── Metrics with trends ──────────────────────────────────────────

  const metricsWithTrends = useMemo(() => METRIC_CONFIGS.map((m) => {
    const value = m.key === 'engagement'
      ? (engagementData?.summary?.score ?? 0)
      : m.key === 'pages_per_visit'
        ? (stats.visitors > 0 ? stats.pageviews / stats.visitors : 0)
        : stats[m.key as keyof Stats]
    const previousValue = m.key === 'engagement'
      ? undefined
      : m.key === 'pages_per_visit'
        ? (prevStats && prevStats.visitors > 0 ? prevStats.pageviews / prevStats.visitors : undefined)
        : prevStats?.[m.key as keyof Stats]
    const change = previousValue != null && previousValue > 0
      ? ((value - previousValue) / previousValue) * 100
      : null
    const isPositive = change !== null ? (m.isNegative ? change < 0 : change > 0) : null

    return {
      ...m,
      value,
      previousValue,
      change,
      isPositive,
    }
  }), [stats, prevStats, engagementData])

  const hasData = data.length > 0
  const hasAnyNonZero = hasData && chartData.some((d) => (d[metric] as number) > 0
  )

  // Engagement uses daily data for the chart (not hourly-mapped duplicates)
  const isEngagementHourly = metric === 'engagement' && (interval === 'hour' || interval === 'minute')
  const engagementChartData = useMemo(() => {
    if (!engagementData?.daily?.length) return []
    return engagementData.daily.map(d => ({
      date: formatDateShort(new Date(d.date + 'T00:00:00')),
      dateObj: new Date(d.date + 'T00:00:00'),
      originalDate: d.date,
      engagement: d.score,
    }))
  }, [engagementData])

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div ref={chartContainerRef} className="relative">
      <Card className="w-full overflow-hidden rounded-2xl">
        <CardHeader className="p-0 mb-0">
          {/* Metrics Grid - 21st.dev style */}
          <div className="grid grid-cols-2 md:grid-cols-6 grow w-full">
            {metricsWithTrends.map((m, index) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={cn(
                  'group relative overflow-hidden cursor-pointer flex-1 text-start px-4 py-2.5 border-b md:border-b-0 md:border-r md:last:border-r-0 border-neutral-800 transition-all ease-apple',
                  metric === m.key && 'bg-neutral-800/40',
                )}
              >
                <Sparkline data={m.key === 'engagement' ? chartData : data} dataKey={m.key} active={metric === m.key} engagementDaily={m.key === 'engagement' ? engagementData?.daily : undefined} />
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-2">
                    <div className={cn('text-sm font-medium', metric === m.key ? 'text-brand-orange' : 'text-neutral-500 dark:text-neutral-400')}>{m.label}</div>
                    {m.change !== null && (
                      <span className={cn('flex items-center gap-0.5 text-xs font-semibold', m.isPositive ? 'text-[#10B981]' : 'text-[#EF4444]')}>
                        {m.isPositive ? <ArrowUpRight weight="bold" className="size-3" /> : <ArrowDownRight weight="bold" className="size-3" />}
                        {Math.abs(m.change).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {m.key === 'engagement' && (!engagementData || engagementData.data_days < 7)
                    ? <span className="text-xs text-neutral-500">Collecting data…</span>
                    : <AnimatedNumber value={m.value} format={m.format} className="text-2xl font-bold text-white" />
                  }
                  {m.key === 'engagement' && engagementData && engagementData.data_days >= 7 && (
                    <div className="flex items-center gap-1.5 mt-1 text-micro-label text-neutral-500">
                      <span>S P{Math.round(engagementData.summary.scroll_pctl)}</span>
                      <span>·</span>
                      <span>T P{Math.round(engagementData.summary.time_pctl)}</span>
                      <span>·</span>
                      <span>D P{Math.round(engagementData.summary.depth_pctl)}</span>
                      <span>·</span>
                      <span>B P{Math.round(engagementData.summary.bounce_pctl)}</span>
                    </div>
                  )}
                </div>
                {metric === m.key && (
                  <motion.div
                    layoutId="activeMetric"
                    className="absolute bottom-0 left-0 right-0 h-[3px] bg-brand-orange rounded-full"
                    transition={SPRING}
                  />
                )}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="px-2.5 py-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 mb-4 px-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-neutral-400">
                {METRIC_CONFIGS.find((m) => m.key === metric)?.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onExport && (
                <button
                  onClick={onExport}
                  className="w-7 h-7 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/[0.06] rounded-md transition-colors ease-apple"
                  aria-label="Export"
                >
                  <DownloadIcon className="w-3.5 h-3.5" />
                </button>
              )}
              {period === '1h' ? null : dateRange.start === dateRange.end ? (
                <Select
                  variant="input"
                  value={todayInterval}
                  onChange={(value) => setTodayInterval(value as 'minute' | 'hour')}
                  options={[
                    { value: 'minute', label: '1 min' },
                    { value: 'hour', label: '1 hour' },
                  ]}
                />
              ) : (
                <Select
                  variant="input"
                  value={multiDayInterval}
                  onChange={(value) => setMultiDayInterval(value as 'hour' | 'day')}
                  options={[
                    { value: 'hour', label: '1 hour' },
                    { value: 'day', label: '1 day' },
                  ]}
                />
              )}
            </div>
          </div>

          {!hasData ? (
            <div className="flex h-72 flex-col items-center justify-center">
              <EmptyState
                icon={<ChartLine />}
                title="No visitors yet"
                description="Your traffic chart will come alive once visitors start arriving. Share your site to get the first data point."
                className="py-0"
              />
            </div>
          ) : !hasAnyNonZero ? (
            <div className="flex h-72 flex-col items-center justify-center">
              <EmptyState
                icon={<ChartLine />}
                title={`No ${METRIC_CONFIGS.find((m) => m.key === metric)?.label.toLowerCase()} recorded`}
                description="Try expanding the time range or checking back later."
                className="py-0"
              />
            </div>
          ) : isEngagementHourly ? (
            <div className="flex flex-col items-center justify-center gap-6 py-10" style={{ aspectRatio: '2.5 / 1' }}>
              <div className="text-6xl font-bold text-white tabular-nums">
                {Math.round(engagementData?.summary?.score ?? 0)}
              </div>
              <div className="grid grid-cols-4 gap-6 w-full max-w-md">
                {[
                  { label: 'Scroll', key: 'scroll_pctl' as const, color: '#FD5E0F' },
                  { label: 'Time', key: 'time_pctl' as const, color: '#F59E0B' },
                  { label: 'Depth', key: 'depth_pctl' as const, color: '#10B981' },
                  { label: 'Bounce', key: 'bounce_pctl' as const, color: '#6366F1' },
                ].map(({ label, key, color }) => {
                  const value = Math.round(engagementData?.summary?.[key] ?? 0)
                  return (
                    <div key={key} className="flex flex-col items-center gap-2">
                      <div className="relative w-14 h-14">
                        <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-neutral-800" strokeWidth="3" />
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${value} ${100 - value}`} strokeLinecap="round" />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">{value}</span>
                      </div>
                      <span className="text-micro-label uppercase tracking-widest text-neutral-500">{label}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-neutral-500">Engagement is calculated daily</p>
            </div>
          ) : (
            <div className="relative w-full">
              {(() => {
                const isEngagementDaily = metric === 'engagement' && engagementChartData.length > 0
                const activeChartData = isEngagementDaily ? engagementChartData : chartData
                return (
                  <VisxAreaChart
                    data={activeChartData as Record<string, unknown>[]}
                    xDataKey="dateObj"
                    aspectRatio="3.5 / 1"
                    margin={{ top: 20, right: 20, bottom: 40, left: 50 }}
                    animationDuration={400}
                  >
                    <VisxGrid horizontal vertical={false} stroke="var(--chart-grid)" numTicksRows={6} />
                    <VisxArea
                      dataKey={metric}
                      fill={CHART_COLORS[metric]}
                      fillOpacity={0.15}
                      stroke={CHART_COLORS[metric]}
                      strokeWidth={2}
                      gradientToOpacity={0}
                    />
                    <VisxXAxis
                      numTicks={Math.min(activeChartData.length, 10)}
                      formatLabel={!isEngagementDaily && (interval === 'minute' || interval === 'hour')
                        ? (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
                        : (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                      }
                    />
                    <VisxYAxis
                      numTicks={6}
                      formatValue={(v) => {
                        const config = METRIC_CONFIGS.find((m) => m.key === metric)
                        return config ? config.format(v) : v.toString()
                      }}
                    />
                    <VisxChartTooltip
                      content={({ point }) => {
                        const dateObj = point.dateObj instanceof Date ? point.dateObj : new Date(point.dateObj as string || Date.now())
                        const config = METRIC_CONFIGS.find((m) => m.key === metric)
                        const value = point[metric] as number
                        const title = !isEngagementDaily && (interval === 'minute' || interval === 'hour')
                          ? `${String(dateObj.getUTCHours()).padStart(2, '0')}:${String(dateObj.getUTCMinutes()).padStart(2, '0')}`
                          : dateObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                        return (
                          <div className="px-3 py-2.5">
                            <div className="mb-2 font-medium text-neutral-400 text-xs">{title}</div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[metric] }} />
                                <span className="text-neutral-400 text-sm">{config?.label || metric}</span>
                              </div>
                              <span className="font-medium text-white text-sm tabular-nums">
                                {config ? config.format(value) : value}
                              </span>
                            </div>
                          </div>
                        )
                      }}
                    />
                  </VisxAreaChart>
                )
              })()}
            </div>
          )}
        </CardContent>

      </Card>

    </div>
  )
}

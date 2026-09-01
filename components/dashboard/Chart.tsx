'use client'

import RailSparkline from '@/components/dashboard/RailSparkline'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { AreaChart as VisxAreaChart, Area as VisxArea, Grid as VisxGrid, XAxis as VisxXAxis, YAxis as VisxYAxis, ChartTooltip as VisxChartTooltip, type TooltipRow } from '@/components/ui/area-chart'
import { curveLinear } from 'd3-shape'
import { PERIOD_ENDS_NOW } from '@/lib/constants/periods'
import { Card, CardContent, CardHeader } from '@ciphera-net/facet'
import { formatNumber, formatDuration } from '@/lib/utils/format'
import { DownloadIcon } from '@ciphera-net/facet'
import Select from '@/components/ui/select'
import { ArrowUpRight, ArrowDownRight, ChartLine } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { SPRING, EASE_APPLE } from '@/lib/motion'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { cn } from '@/lib/utils'
import { formatDateShortUTC, formatTimeUTC, formatDateFullUTC, parseSiteWallClock } from '@/lib/utils/formatDate'
import { guardedPctChange, guardedPointChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { EmptyState } from '@/components/ui/EmptyState'

// Mirrors lib/api/stats.ts: the four averages are nullable (null = not
// measured, never 0), and `date` is the site's wall clock — parse it with
// parseSiteWallClock and read UTC getters only.
export interface DailyStat {
  date: string
  pageviews: number
  visitors: number
  bounce_rate: number | null
  avg_duration: number | null
  avg_scroll_depth: number | null
  avg_visible_duration: number | null
}

interface Stats {
  pageviews: number
  visitors: number
  bounce_rate: number | null
  avg_duration: number | null
  avg_scroll_depth: number | null
  avg_visible_duration: number | null
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
  onExport?: () => void
  // * Show the minute/hour/day interval selector. Default true. The public share
  // * dashboard passes false: it is day-only (a sub-day bucket on a public link is
  // * one visitor's arrival timeline), so a selector that changed nothing but its own
  // * label would be a control that lies.
  intervalPicker?: boolean
}

type MetricType = 'pageviews' | 'visitors' | 'pages_per_visit' | 'bounce_rate' | 'avg_duration'

// ─── Sparkline ───────────────────────────────────────────────────────
// Extracted to RailSparkline (19-08-2026) so the command deck's KPI rail
// and this share-page tile strip render the same trace from one source.

// ─── Helpers ─────────────────────────────────────────────────────────

// ─── Metric configurations ──────────────────────────────────────────

// format receives null when the value is unmeasured and renders an em dash —
// "no sessions carried this signal" and "measured zero" are different facts.
// isRate routes the delta through guardedPointChange (percentage POINTS): a
// relative % change of a percentage reads like traffic growth and is misread.
const METRIC_CONFIGS: {
  key: MetricType
  label: string
  format: (v: number | null) => string
  isNegative?: boolean
  isRate?: boolean
}[] = [
  { key: 'visitors', label: 'Unique visitors', format: (v) => v == null ? '—' : formatNumber(Math.round(v)) },
  { key: 'pageviews', label: 'Total pageviews', format: (v) => v == null ? '—' : formatNumber(Math.round(v)) },
  { key: 'pages_per_visit', label: 'Pages per visit', format: (v) => v == null ? '—' : v.toFixed(1) },
  { key: 'bounce_rate', label: 'Bounce rate', format: (v) => v == null ? '—' : `${Math.round(v)}%`, isNegative: true, isRate: true },
  { key: 'avg_duration', label: 'Visit duration', format: (v) => v == null ? '—' : formatDuration(Math.round(v)) },
]

const CHART_COLORS: Record<MetricType, string> = {
  visitors: 'var(--chart-1)',       // orange (brand)
  pageviews: 'var(--chart-2)',      // blue
  pages_per_visit: 'var(--chart-3)', // green
  bounce_rate: 'var(--chart-4)',    // purple
  avg_duration: 'var(--chart-5)',   // amber
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
  onExport,
  intervalPicker = true,
}: ChartProps) {
  const [metric, setMetric] = useState<MetricType>('visitors')
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => { setHasMounted(true) }, [])

  // ─── Data ──────────────────────────────────────────────────────────

  const chartData = useMemo(() => data.map((item) => {
    // The wire value is the site's wall clock (offset attached since 18-08-2026,
    // Z-mislabelled before). parseSiteWallClock reads the literal digits, so the
    // label is the SITE's clock for every viewer; local getters would shift it
    // by the viewer's offset (a New York reader saw each day bar a day early).
    const wallClock = parseSiteWallClock(item.date) ?? new Date(item.date)
    let formattedDate: string
    if (interval === 'minute') {
      formattedDate = formatTimeUTC(wallClock)
    } else if (interval === 'hour') {
      formattedDate = formatDateShortUTC(wallClock) + ', ' + formatTimeUTC(wallClock)
    } else {
      formattedDate = formatDateShortUTC(wallClock)
    }

    return {
      date: formattedDate,
      dateObj: wallClock,
      originalDate: item.date,
      pageviews: item.pageviews,
      visitors: item.visitors,
      pages_per_visit: item.visitors > 0 ? item.pageviews / item.visitors : 0,
      bounce_rate: item.bounce_rate,
      avg_duration: item.avg_duration,
    }
  }), [data, interval])

  // ─── Metrics with trends ──────────────────────────────────────────

  const metricsWithTrends = useMemo(() => {
    // * Deltas ride the shared estate helpers: guardedPctChange for counts and
    // * durations, guardedPointChange (percentage POINTS) for rates. Both
    // * suppress the badge when the previous window held < 10 visitors — the
    // * base guard is evaluated on the SAME (filtered) population as the
    // * comparison, which is what made the old inline version lie under a
    // * filter (F4: a true +13% rendered as −46% red).
    const prevBase = prevStats?.visitors ?? 0
    return METRIC_CONFIGS.map((m) => {
    const value: number | null = m.key === 'pages_per_visit'
        ? (stats.visitors > 0 ? stats.pageviews / stats.visitors : null)
        : stats[m.key as keyof Stats]
    const previousValue: number | null | undefined = m.key === 'pages_per_visit'
        ? (prevStats && prevStats.visitors > 0 ? prevStats.pageviews / prevStats.visitors : undefined)
        : prevStats?.[m.key as keyof Stats]
    const change: PctChangeResult = value != null && previousValue != null
      ? (m.isRate
          ? guardedPointChange(value, previousValue, prevBase)
          : guardedPctChange(value, previousValue, prevBase))
      : null
    const isPositive = change && change.type !== 'new'
      ? (m.isNegative ? change.value < 0 : change.value > 0)
      : null

    return {
      ...m,
      value,
      previousValue,
      change,
      isPositive,
    }
  })}, [stats, prevStats])

  const hasData = data.length > 0
  const hasAnyNonZero = hasData && chartData.some((d) => (d[metric] as number) > 0
  )

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div ref={chartContainerRef} className="relative">
      <Card className="w-full overflow-hidden rounded-none">
        <CardHeader className="p-0 mb-0">
          {/* Metrics Grid - 21st.dev style */}
          <div className="grid grid-cols-2 md:grid-cols-5 grow w-full">
            {metricsWithTrends.map((m, index) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={cn(
                  'group relative overflow-hidden cursor-pointer flex-1 text-start px-4 py-2.5 border-b md:border-b-0 md:border-r md:last:border-r-0 border-neutral-800 transition-all ease-apple',
                  metric === m.key && 'bg-neutral-800/40',
                )}
              >
                <RailSparkline data={data} dataKey={m.key} active={metric === m.key} dashedTail={Boolean(period && PERIOD_ENDS_NOW[period])} missingAsZero={m.key === 'bounce_rate' || m.key === 'avg_duration'} />
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-2">
                    <div className={cn('text-sm font-medium', metric === m.key ? 'text-brand-orange' : 'text-neutral-500 dark:text-neutral-400')}>{m.label}</div>
                    {m.change !== null && m.change.type !== 'new' && (
                      <span className={cn('flex items-center gap-0.5 text-xs font-semibold', m.isPositive ? 'text-[#10B981]' : 'text-[#EF4444]')}>
                        {m.isPositive ? <ArrowUpRight weight="bold" className="size-3" /> : <ArrowDownRight weight="bold" className="size-3" />}
                        {Math.abs(m.change.value)}{m.change.type === 'pp' ? 'pp' : '%'}
                      </span>
                    )}
                  </div>
                  {m.value == null
                    ? <span className="text-2xl font-bold text-neutral-600" title="Not measured in this window">—</span>
                    : <AnimatedNumber value={m.value} format={m.format as (v: number) => string} className="text-2xl font-bold text-white" />
                  }
                </div>
                {metric === m.key && (
                  <motion.div
                    layoutId="activeMetric"
                    className="absolute bottom-0 left-0 right-0 h-[3px] bg-brand-orange rounded-none"
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
                  className="h-11 w-11 sm:h-7 sm:w-7 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/[0.06] rounded-none transition-colors ease-apple"
                  aria-label="Export"
                >
                  <DownloadIcon className="w-3.5 h-3.5" />
                </button>
              )}
              {/* 1h and 24h are fixed-granularity rolling windows (minute / hour):
                  showing the selector there would render a control whose displayed
                  value disagrees with the chart. */}
              {!intervalPicker ? null : period === '1h' || period === '24h' ? null : dateRange.start === dateRange.end ? (
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
          ) : (
            <div className="relative w-full">
              {(() => {
                return (
                  <VisxAreaChart
                    data={chartData as Record<string, unknown>[]}
                    xDataKey="dateObj"
                    yCap={metric === 'bounce_rate' ? 100 : undefined}
                    aspectRatio="3.5 / 1"
                    margin={{ top: 20, right: 20, bottom: 40, left: 50 }}
                    animationDuration={400}
                  >
                    <VisxGrid horizontal vertical={false} stroke="var(--chart-grid)" numTicksRows={6} />
                    <VisxArea
                      dataKey={metric}
                      // curveLinear — sharp-chart round (01-09-2026, artifact
                      // "The Sharp Line"); supersedes the 21-08 monotone call.
                      curve={curveLinear}
                      fill={CHART_COLORS[metric]}
                      fillOpacity={0.15}
                      stroke={CHART_COLORS[metric]}
                      strokeWidth={2}
                      gradientToOpacity={0}
                      // Crisp to both edges + the dashed in-progress tail
                      // (period-token semantics; 'yesterday' never dashes).
                      fadeStrokeEdges={false}
                      dashedTailFrom={period && PERIOD_ENDS_NOW[period] && chartData.length >= 2 ? chartData.length - 2 : undefined}
                      // Rates and durations are null where unmeasured. They
                      // PLOT at zero so the line never disappears (owner
                      // decision 19-08-2026); the tooltip reads the null and
                      // shows '—'. Uptime keeps its own gap contract — this
                      // is the dashboard's rendering choice only.
                      missingAsZero={metric === 'bounce_rate' || metric === 'avg_duration'}
                    />
                    <VisxXAxis
                      numTicks={Math.min(chartData.length, 10)}
                      formatLabel={(interval === 'minute' || interval === 'hour')
                        ? (d) => formatTimeUTC(d)
                        : (d) => formatDateShortUTC(d)
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
                      // Header-strip card lives in the instrument; the date
                      // pill retires — the bucket identity (incl. hourly
                      // SPANS) lives in the strip.
                      showDatePill={false}
                      title={(point) => {
                        const dateObj = point.dateObj instanceof Date ? point.dateObj : new Date(point.dateObj as string || Date.now())
                        if (interval === 'minute') return formatTimeUTC(dateObj)
                        if (interval === 'hour') {
                          const end = new Date(dateObj.getTime() + 59 * 60_000)
                          return `${formatTimeUTC(dateObj)} – ${formatTimeUTC(end)}`
                        }
                        return formatDateFullUTC(dateObj)
                      }}
                      rows={(point) => {
                        const config = METRIC_CONFIGS.find((m) => m.key === metric)
                        const value = point[metric] as number | null
                        return [{
                          color: CHART_COLORS[metric],
                          label: config?.label || metric,
                          value: config ? config.format(value) : String(value ?? '—'),
                        }]
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

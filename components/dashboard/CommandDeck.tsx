'use client'

import { useMemo, useState } from 'react'
import { AreaChart as VisxAreaChart, Area as VisxArea, Grid as VisxGrid, XAxis as VisxXAxis, YAxis as VisxYAxis, ChartTooltip as VisxChartTooltip } from '@/components/ui/area-chart'
import { Card } from '@ciphera-net/facet'
import type { EngagementPercentilesData } from '@/lib/api/stats'
import { formatNumber, formatDuration } from '@/lib/utils/format'
import { DownloadIcon } from '@ciphera-net/facet'
import Select from '@/components/ui/select'
import { ChartLine } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { SPRING } from '@/lib/motion'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { cn } from '@/lib/utils'
import { formatDateShortUTC, formatTimeUTC, formatDateFullUTC, parseSiteWallClock } from '@/lib/utils/formatDate'
import { guardedPctChange, guardedPointChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { RailDelta } from '@/components/funnels/FunnelRail'
import { EmptyState } from '@/components/ui/EmptyState'
import type { DailyStat, Stats } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// The command deck — Direction C's headline device (dashboard overhaul Phase 2,
// design record 18-08-2026): a vertical KPI rail beside a FULL-HEIGHT hero
// chart, replacing the six-tile strip. The rail rides the funnels instrument
// grammar (RailDelta: numeric-direction arrows, good/bad colour, pp for
// rates); each row states its own semantics in a context line — "distinct
// sessions" is the D5 visitor relabel, "vs prior 90 days" the D4 engagement
// relabel. The chart is ONE ink (brand orange) — the per-metric colour
// rotation is gone, the metric is named in the toolbar.
//
// The share page deliberately keeps the old Chart component: this deck is the
// authenticated instrument; the share surface is a reduced, public-scoped view.
// ---------------------------------------------------------------------------

type MetricType = 'pageviews' | 'visitors' | 'pages_per_visit' | 'bounce_rate' | 'avg_duration' | 'engagement'

interface CommandDeckProps {
  data: DailyStat[]
  stats: Stats
  prevStats?: Stats
  interval: 'minute' | 'hour' | 'day' | 'month'
  dateRange: { start: string; end: string }
  period?: string
  todayInterval: 'minute' | 'hour'
  setTodayInterval: (interval: 'minute' | 'hour') => void
  multiDayInterval: 'hour' | 'day'
  setMultiDayInterval: (interval: 'hour' | 'day') => void
  engagementData?: EngagementPercentilesData | null
  onExport?: () => void
}

// format receives null for "not measured" and renders an em dash — never a
// fabricated zero (F11).
const METRICS: {
  key: MetricType
  label: string
  // The context line under the value: what this number actually counts.
  context: string
  // The fuller sentence, as a hover title.
  title: string
  format: (v: number | null) => string
  isNegative?: boolean
  isRate?: boolean
}[] = [
  {
    key: 'visitors', label: 'Unique visitors', context: 'distinct sessions',
    title: 'Distinct sessions, deduplicated across the range. A session lasts one UTC day, so a returning reader counts once per day they visit.',
    format: (v) => v == null ? '—' : formatNumber(Math.round(v)),
  },
  {
    key: 'pageviews', label: 'Total pageviews', context: 'across the site',
    title: 'Every pageview in the range.',
    format: (v) => v == null ? '—' : formatNumber(Math.round(v)),
  },
  {
    key: 'pages_per_visit', label: 'Pages / visit', context: 'depth',
    title: 'Pageviews divided by unique visitors.',
    format: (v) => v == null ? '—' : v.toFixed(1),
  },
  {
    key: 'bounce_rate', label: 'Bounce rate', context: 'single-page sessions',
    title: 'Share of sessions that saw exactly one page. Deltas are percentage points.',
    format: (v) => v == null ? '—' : `${Math.round(v)}%`, isNegative: true, isRate: true,
  },
  {
    key: 'avg_duration', label: 'Visit duration', context: 'average',
    title: 'Average session duration over sessions that carried a duration signal — unmeasured sessions are excluded, not counted as zero.',
    format: (v) => v == null ? '—' : formatDuration(Math.round(v)),
  },
  {
    key: 'engagement', label: 'Engagement', context: 'vs prior 90 days',
    title: 'Median daily percentile of scroll depth, time on page, visit depth and bounce rate, ranked against this site’s prior 90 days. 50 means a typical day for this site.',
    format: (v) => v == null ? '—' : String(Math.round(v)),
  },
]

export default function CommandDeck({
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
  engagementData,
  onExport,
}: CommandDeckProps) {
  const [metric, setMetric] = useState<MetricType>('visitors')

  // ─── Chart data (site wall clock, F10) ─────────────────────────────
  const chartData = useMemo(() => data.map((item) => {
    const wallClock = parseSiteWallClock(item.date) ?? new Date(item.date)
    return {
      dateObj: wallClock,
      originalDate: item.date,
      pageviews: item.pageviews,
      visitors: item.visitors,
      pages_per_visit: item.visitors > 0 ? item.pageviews / item.visitors : null,
      bounce_rate: item.bounce_rate,
      avg_duration: item.avg_duration,
      engagement: (() => {
        if (!engagementData?.daily?.length) return null
        const dateStr = typeof item.date === 'string' ? item.date.slice(0, 10) : ''
        return engagementData.daily.find(d => d.date === dateStr)?.score ?? null
      })(),
    }
  }), [data, engagementData])

  const engagementChartData = useMemo(() => {
    if (!engagementData?.daily?.length) return []
    return engagementData.daily.map(d => {
      const wallClock = parseSiteWallClock(d.date + 'T00:00') ?? new Date(d.date + 'T00:00:00Z')
      return { dateObj: wallClock, originalDate: d.date, engagement: d.score }
    })
  }, [engagementData])

  // ─── Rail rows ─────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const prevBase = prevStats?.visitors ?? 0
    return METRICS.map((m) => {
      const value: number | null = m.key === 'engagement'
        ? (engagementData && engagementData.data_days >= 7 ? engagementData.summary.score : null)
        : m.key === 'pages_per_visit'
          ? (stats.visitors > 0 ? stats.pageviews / stats.visitors : null)
          : stats[m.key as keyof Stats]
      const previousValue: number | null | undefined = m.key === 'engagement'
        ? undefined
        : m.key === 'pages_per_visit'
          ? (prevStats && prevStats.visitors > 0 ? prevStats.pageviews / prevStats.visitors : undefined)
          : prevStats?.[m.key as keyof Stats]
      const change: PctChangeResult = value != null && previousValue != null
        ? (m.isRate
            ? guardedPointChange(value, previousValue, prevBase)
            : guardedPctChange(value, previousValue, prevBase))
        : null
      return { ...m, value, change }
    })
  }, [stats, prevStats, engagementData])

  const hasData = data.length > 0
  const hasAnyNonZero = hasData && chartData.some((d) => ((d[metric] as number | null) ?? 0) > 0)
  const isEngagementSubday = metric === 'engagement' && (interval === 'hour' || interval === 'minute')
  const isEngagementDaily = metric === 'engagement' && engagementChartData.length > 0 && !isEngagementSubday
  const activeChartData = isEngagementDaily ? engagementChartData : chartData
  const activeMetric = METRICS.find((m) => m.key === metric)

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <Card className="w-full overflow-hidden rounded-none">
      <div className="grid md:grid-cols-[236px_1fr]">
        {/* KPI rail. On md+ the rows flex-stretch so the rail bottoms out level
            with the chart; on mobile it is a 2-column grid above the chart. */}
        <div className="grid grid-cols-2 border-b border-neutral-800 md:flex md:flex-col md:border-b-0 md:border-r">
          {rows.map((m, i) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              title={m.title}
              className={cn(
                'group relative flex-1 cursor-pointer px-4 py-3 text-start transition-colors ease-apple',
                'border-neutral-800 max-md:odd:border-r max-md:[&:nth-child(-n+4)]:border-b',
                i > 0 && 'md:border-t',
                metric === m.key && 'bg-neutral-800/40',
              )}
            >
              {metric === m.key && (
                <motion.span
                  layoutId="deckActiveMetric"
                  className="absolute bottom-0 left-0 top-0 w-[2px] bg-brand-orange"
                  transition={SPRING}
                />
              )}
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn('truncate text-[13px]', metric === m.key ? 'text-brand-orange' : 'text-neutral-400')}>
                  {m.label}
                </span>
                <RailDelta change={m.change} invert={m.isNegative} />
              </div>
              {m.value == null
                ? <span className="mt-0.5 block text-xl font-semibold text-neutral-600">—</span>
                : <AnimatedNumber value={m.value} format={m.format as (v: number) => string} className="mt-0.5 block text-xl font-semibold tabular-nums text-white" />}
              <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                {m.key === 'engagement' && m.value == null ? 'collecting · needs 7 days of history' : m.context}
              </span>
            </button>
          ))}
        </div>

        {/* Hero chart — fills the deck; the rail stretches to match. */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <span className="text-xs font-medium text-neutral-400">
              {metric === 'visitors' && interval === 'day' ? 'Daily unique visitors' : activeMetric?.label}
            </span>
            <div className="flex items-center gap-2">
              {onExport && (
                <button
                  onClick={onExport}
                  className="flex h-11 w-11 items-center justify-center rounded-none text-neutral-500 transition-colors ease-apple hover:bg-white/[0.06] hover:text-white sm:h-7 sm:w-7"
                  aria-label="Export"
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                </button>
              )}
              {/* 1h and 24h are fixed-granularity rolling windows — a selector
                  there would disagree with the chart it claims to control. */}
              {period === '1h' || period === '24h' ? null : dateRange.start === dateRange.end ? (
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

          <div className="flex-1 px-2.5 pb-2 pt-1">
            {!hasData ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center">
                <EmptyState
                  icon={<ChartLine />}
                  title="No visitors yet"
                  description="Your traffic chart will come alive once visitors start arriving. Share your site to get the first data point."
                  className="py-0"
                />
              </div>
            ) : !hasAnyNonZero && !isEngagementSubday ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center">
                <EmptyState
                  icon={<ChartLine />}
                  title={`No ${activeMetric?.label.toLowerCase()} recorded`}
                  description="Try expanding the time range or checking back later."
                  className="py-0"
                />
              </div>
            ) : isEngagementSubday ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center gap-6 py-8">
                <div className="text-6xl font-bold tabular-nums text-white">
                  {engagementData && engagementData.data_days >= 7 ? Math.round(engagementData.summary.score) : '—'}
                </div>
                <div className="grid w-full max-w-md grid-cols-4 gap-6">
                  {[
                    { label: 'Scroll', key: 'scroll_pctl' as const },
                    { label: 'Time', key: 'time_pctl' as const },
                    { label: 'Depth', key: 'depth_pctl' as const },
                    { label: 'Bounce', key: 'bounce_pctl' as const },
                  ].map(({ label, key }) => {
                    const value = Math.round(engagementData?.summary?.[key] ?? 0)
                    return (
                      <div key={key} className="flex flex-col items-center gap-2">
                        <div className="relative h-14 w-14">
                          <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-neutral-800" strokeWidth="3" />
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--chart-1)" strokeWidth="3" strokeDasharray={`${value} ${100 - value}`} strokeLinecap="round" />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">{value}</span>
                        </div>
                        <span className="text-micro-label uppercase tracking-widest text-neutral-500">{label}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-neutral-500">Engagement is ranked daily against the prior 90 days</p>
              </div>
            ) : (
              <VisxAreaChart
                data={activeChartData as Record<string, unknown>[]}
                xDataKey="dateObj"
                aspectRatio="2.9 / 1"
                margin={{ top: 20, right: 20, bottom: 40, left: 50 }}
                animationDuration={400}
              >
                <VisxGrid horizontal vertical={false} stroke="var(--chart-grid)" numTicksRows={6} />
                <VisxArea
                  dataKey={metric}
                  fill="var(--chart-1)"
                  fillOpacity={0.15}
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  gradientToOpacity={0}
                  // Rates/durations/ratios are null where unmeasured — a gap,
                  // never a plotted zero (F11).
                  breakAtMissing={metric === 'bounce_rate' || metric === 'avg_duration' || metric === 'pages_per_visit' || metric === 'engagement'}
                />
                <VisxXAxis
                  numTicks={Math.min(activeChartData.length, 10)}
                  formatLabel={!isEngagementDaily && (interval === 'minute' || interval === 'hour')
                    ? (d) => formatTimeUTC(d)
                    : (d) => formatDateShortUTC(d)
                  }
                />
                <VisxYAxis
                  numTicks={6}
                  formatValue={(v) => activeMetric ? activeMetric.format(v) : v.toString()}
                />
                <VisxChartTooltip
                  content={({ point }) => {
                    const dateObj = point.dateObj instanceof Date ? point.dateObj : new Date(point.dateObj as string || Date.now())
                    const value = point[metric] as number | null
                    const title = !isEngagementDaily && (interval === 'minute' || interval === 'hour')
                      ? formatTimeUTC(dateObj)
                      : formatDateFullUTC(dateObj)
                    return (
                      <div className="px-3 py-2.5">
                        <div className="mb-2 text-xs font-medium text-neutral-400">{title}</div>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--chart-1)' }} />
                            <span className="text-sm text-neutral-400">{activeMetric?.label || metric}</span>
                          </div>
                          <span className="text-sm font-medium tabular-nums text-white">
                            {activeMetric ? activeMetric.format(value) : value}
                          </span>
                        </div>
                      </div>
                    )
                  }}
                />
              </VisxAreaChart>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

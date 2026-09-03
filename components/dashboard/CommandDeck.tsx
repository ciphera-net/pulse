'use client'

import { useMemo, useState } from 'react'
import { AreaChart as VisxAreaChart, Area as VisxArea, Grid as VisxGrid, XAxis as VisxXAxis, YAxis as VisxYAxis, ChartTooltip as VisxChartTooltip } from '@/components/ui/area-chart'
import { curveLinear } from 'd3-shape'
import { PERIOD_ENDS_NOW } from '@/lib/constants/periods'
import { Card } from '@ciphera-net/facet'
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
import RailSparkline from '@/components/dashboard/RailSparkline'
import { EmptyState } from '@/components/ui/EmptyState'
import type { DailyStat, Stats } from '@/lib/api/stats'
import { METRIC_TERMS } from '@/lib/dashboard/terms'
import { MetricInfoTip, buildExample } from '@/components/dashboard/MetricInfoTip'
import type { MetricType } from '@/lib/dashboard/metrics'

// ---------------------------------------------------------------------------
// The command deck — Direction C's headline device (dashboard overhaul Phase 2,
// design record 18-08-2026): a vertical KPI rail beside a FULL-HEIGHT hero
// chart, replacing the six-tile strip. The rail rides the funnels instrument
// grammar (RailDelta: numeric-direction arrows, good/bad colour, pp for
// rates); each row states its own semantics in a context line. The chart is
// ONE ink (brand orange) — the per-metric colour rotation is gone, the metric
// is named in the toolbar. Engagement was REMOVED from the product 01-09-2026
// (Vemetric comparison audit §2a): the rail is five metrics, and selection
// affects ONLY the chart — the dimension blocks are decoupled by owner
// decision and hold fixed columns.
//
// Since 02-09-2026 the share surface mounts this deck too (the /demo
// catch-up: the authed dashboard is the spec) — with prevStats absent and
// intervalPicker=false, the two constraints the public-scoped read imposes.
// ---------------------------------------------------------------------------

interface CommandDeckProps {
  data: DailyStat[]
  stats: Stats
  prevStats?: Stats
  // Controlled metric selection (deck metric propagation, 22-08-2026): the
  // page owns the state so the dimension blocks below can follow it and the
  // URL can carry it.
  metric: MetricType
  onMetricChange: (metric: MetricType) => void
  interval: 'minute' | 'hour' | 'day' | 'month'
  dateRange: { start: string; end: string }
  period?: string
  multiDayInterval: 'hour' | 'day'
  setMultiDayInterval: (interval: 'hour' | 'day') => void
  onExport?: () => void
  // False on the public share surface, where the backend clamps every read to
  // day buckets (F2) and an interval selector would be a dead control.
  intervalPicker?: boolean
}

// The four rail metrics read straight off Stats. Named explicitly rather than
// `keyof Stats`, which also spans the InfoTip example counts — optional fields
// the rail must never plot.
type RailStatKey = 'visitors' | 'pageviews' | 'bounce_rate' | 'avg_duration'

// format receives null for "not measured" and renders an em dash — never a
// fabricated zero (F11).
//
// `label` and `title` come from lib/dashboard/terms: one registry feeds the
// rail's sentence, the toolbar's InfoTip and the glossary page, so the three
// can never drift (metric info layer, 22-08-2026).
const METRICS: {
  key: MetricType
  label: string
  // The context line under the value: what this number actually counts.
  context: string
  // The canonical sentence. Reaches the reader through aria-describedby on the
  // row (never a title= tooltip: invisible to touch and keyboard) and through
  // the toolbar InfoTip when this metric is selected.
  title: string
  format: (v: number | null) => string
  isNegative?: boolean
  isRate?: boolean
}[] = [
  {
    key: 'visitors', label: 'Unique visitors', context: 'unique people',
    title: METRIC_TERMS.visitors.definition,
    format: (v) => v == null ? '—' : formatNumber(Math.round(v)),
  },
  {
    key: 'pageviews', label: 'Total pageviews', context: 'across the site',
    title: METRIC_TERMS.pageviews.definition,
    format: (v) => v == null ? '—' : formatNumber(Math.round(v)),
  },
  {
    key: 'pages_per_visit', label: 'Pages / visit', context: 'depth',
    title: METRIC_TERMS.pages_per_visit.definition,
    format: (v) => v == null ? '—' : v.toFixed(1),
  },
  {
    key: 'bounce_rate', label: 'Bounce rate', context: 'single-page visits',
    title: METRIC_TERMS.bounce_rate.definition,
    format: (v) => v == null ? '—' : `${Math.round(v)}%`, isNegative: true, isRate: true,
  },
  {
    key: 'avg_duration', label: 'Visit duration', context: 'average',
    title: METRIC_TERMS.avg_duration.definition,
    format: (v) => v == null ? '—' : formatDuration(Math.round(v)),
  },
]

export default function CommandDeck({
  data,
  stats,
  prevStats,
  metric,
  onMetricChange,
  interval,
  intervalPicker = true,
  dateRange,
  period,
  multiDayInterval,
  setMultiDayInterval,
  onExport,
}: CommandDeckProps) {
  // ─── Chart data (site wall clock, F10) ─────────────────────────────
  const chartData = useMemo(() => data.map((item) => {
    const wallClock = parseSiteWallClock(item.date) ?? new Date(item.date)
    return {
      dateObj: wallClock,
      originalDate: item.date,
      pageviews: item.pageviews,
      visitors: item.visitors,
      // Divide by VISITS, never visitors. `visits` is null on daily_stats rows
      // frozen before migration 164 — the point plots as a gap rather than
      // silently reporting pages per PERSON under a label that says per visit.
      pages_per_visit: item.visits != null && item.visits > 0 ? item.pageviews / item.visits : null,
      bounce_rate: item.bounce_rate,
      avg_duration: item.avg_duration,
    }
  }), [data])

  // The Today/Yesterday axis is the FULL site day, not the data's extent: a
  // day 34 minutes old otherwise collapses to a single floating dot, and
  // every bucket slides left as new hours arrive (owner report 04-09-2026).
  // The first bucket IS site midnight — the server resolves the site's
  // timezone — so no client tz math; the domain ends at the 23:00 bucket,
  // where a complete day's last point sits.
  const dayDomain = useMemo<[Date, Date] | undefined>(() => {
    if (interval !== 'hour' || dateRange.start !== dateRange.end || chartData.length === 0) return undefined
    const d0 = chartData[0].dateObj
    return [d0, new Date(d0.getTime() + 23 * 3_600_000)]
  }, [interval, dateRange.start, dateRange.end, chartData])

  // ─── Rail rows ─────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const prevBase = prevStats?.visitors ?? 0
    return METRICS.map((m) => {
      const value: number | null = m.key === 'pages_per_visit'
        ? (stats.visits != null && stats.visits > 0 ? stats.pageviews / stats.visits : null)
        : stats[m.key as RailStatKey]
      const previousValue: number | null | undefined = m.key === 'pages_per_visit'
        ? (prevStats?.visits != null && prevStats.visits > 0 ? prevStats.pageviews / prevStats.visits : undefined)
        : prevStats?.[m.key as RailStatKey]
      const change: PctChangeResult = value != null && previousValue != null
        ? (m.isRate
            ? guardedPointChange(value, previousValue, prevBase)
            : guardedPctChange(value, previousValue, prevBase))
        : null
      return { ...m, value, change }
    })
  }, [stats, prevStats])

  const hasData = data.length > 0
  const hasAnyNonZero = hasData && chartData.some((d) => ((d[metric] as number | null) ?? 0) > 0)
  const activeMetric = METRICS.find((m) => m.key === metric)

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <Card className="w-full overflow-hidden rounded-none">
      <div className="grid md:grid-cols-[236px_1fr] md:grid-rows-[500px]">
        {/* KPI rail. On md+ the rows flex-stretch so the rail bottoms out level
            with the chart; on mobile it is a 2-column grid above the chart. */}
        <div data-tour="metric-rail" className="grid grid-cols-2 border-b border-neutral-800 md:flex md:flex-col md:border-b-0 md:border-r">
          {rows.map((m, i) => (
            <button
              key={m.key}
              onClick={() => onMetricChange(m.key)}
              // The canonical sentence, reachable by screen readers without a
              // control nested inside this button (metric info layer,
              // 22-08-2026). It replaces a title= attribute that no touch or
              // keyboard user could ever reach; sighted users read the same
              // sentence in the toolbar InfoTip once the row is selected.
              aria-describedby={`deck-def-${m.key}`}
              className={cn(
                'group relative flex-1 cursor-pointer overflow-hidden px-4 py-3 text-start transition-colors ease-apple',
                'border-neutral-800 max-md:odd:border-r max-md:[&:nth-child(-n+4)]:border-b',
                i > 0 && 'md:border-t',
                metric === m.key && 'bg-neutral-800/40',
              )}
            >
              {/* The ghost trace: grey at rest, orange on hover, orange while
                  active — the pre-deck tile sparkline, restored (owner pick
                  S4, 19-08-2026). Sits at z-0 under the z-10 content. */}
              <RailSparkline
                // chartData, not the raw payload: the mini must plot the SAME
                // series the big chart plots — incl. pages_per_visit divided
                // by VISITS (migration-164 rule), never re-derived per person.
                data={chartData}
                dataKey={m.key}
                active={metric === m.key}
                dashedTail={Boolean(period && PERIOD_ENDS_NOW[period])}
                // Mirror the big chart's missing-as-zero rule (its VisxArea
                // flag below) — the mini must draw the shape the chart draws.
                missingAsZero={m.key === 'bounce_rate' || m.key === 'avg_duration' || m.key === 'pages_per_visit'}
              />
              {metric === m.key && (
                <motion.span
                  layoutId="deckActiveMetric"
                  className="absolute bottom-0 left-0 top-0 z-10 w-[2px] bg-brand-orange"
                  transition={SPRING}
                />
              )}
              <div className="relative z-10">
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
                  {m.context}
                </span>
              </div>
              <span id={`deck-def-${m.key}`} className="sr-only">
                {m.title}
              </span>
            </button>
          ))}
        </div>

        {/* Hero chart — fills the deck; the rail stretches to match. */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            {/* The toolbar names the selected metric, so ONE resident glyph
                here reaches all six definitions — the rail rows stay clean
                (metric info layer, 22-08-2026). */}
            <span data-tour="chart-toolbar" className="flex items-center gap-1 text-xs font-medium text-neutral-400">
              {metric === 'visitors' && interval === 'day' ? 'Daily unique visitors' : activeMetric?.label}
              <MetricInfoTip metric={metric} example={buildExample(metric, stats)} />
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
              {/* 1h and 24h are fixed-granularity rolling windows, and a
                  single-day range is fixed HOURLY (owner ruling 02-09-2026:
                  minute granularity belongs to the 1h range alone) — a
                  selector on any of them would disagree with the chart it
                  claims to control. intervalPicker=false (the public share
                  surface) hides it entirely: the backend clamps public-scoped
                  reads to day buckets (F2 — an hourly bucket with one visitor
                  is that person's arrival time), so the selector there was a
                  control wired to nothing. */}
              {!intervalPicker || period === '1h' || period === '24h' || dateRange.start === dateRange.end ? null : (
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

          {/* The GRID ROW is the deck's height authority (H2 pick, 01-09-2026:
              500px block — the rail's natural tile height had been silently
              deciding 552). The row pin lives on the grid; the chart takes
              what flex-1 gives it and the rail tiles flex-stretch into the
              same 500. Mobile keeps its smaller floor. fillParent (not
              aspectRatio) lets the plot use all of it. */}
          <div className="min-h-[288px] flex-1 px-2.5 pb-2 pt-1">
            {!hasData ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center">
                <EmptyState
                  icon={<ChartLine />}
                  title="No visitors yet"
                  description="Your traffic chart will come alive once visitors start arriving. Share your site to get the first data point."
                  className="py-0"
                />
              </div>
            ) : !hasAnyNonZero ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center">
                <EmptyState
                  icon={<ChartLine />}
                  title={`No ${activeMetric?.label.toLowerCase()} recorded`}
                  description="Try expanding the time range or checking back later."
                  className="py-0"
                />
              </div>
            ) : (
              <VisxAreaChart
                data={chartData as Record<string, unknown>[]}
                xDataKey="dateObj"
                yCap={metric === 'bounce_rate' ? 100 : undefined}
                xDomain={dayDomain}
                integerYTicks={metric === 'visitors' || metric === 'pageviews'}
                fillParent
                margin={{ top: 20, right: 20, bottom: 40, left: 50 }}
                animationDuration={400}
              >
                <VisxGrid horizontal vertical={false} stroke="var(--chart-grid)" numTicksRows={6} />
                <VisxArea
                  dataKey={metric}
                  // curveLinear — the sharp-chart round (01-09-2026, artifact
                  // "The Sharp Line") SUPERSEDES the 21-08 revert to monotone:
                  // the owner picked the sharp instrument on mocks of their
                  // own data, three rounds deep. The overshoot argument is
                  // retired with it — linear cannot overshoot either.
                  curve={curveLinear}
                  fill="var(--chart-1)"
                  fillOpacity={0.15}
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  gradientToOpacity={0}
                  // Crisp to both edges + the dashed in-progress tail
                  // (period-token semantics; custom ranges never dash).
                  fadeStrokeEdges={false}
                  dashedTailFrom={period && PERIOD_ENDS_NOW[period] && chartData.length >= 2 ? chartData.length - 2 : undefined}
                  // Rates/durations/ratios are null where unmeasured. They
                  // PLOT at zero so the line never disappears (owner decision
                  // 19-08-2026, superseding F11's gap rendering here); the
                  // tooltip still reads the null and shows '—', so an empty
                  // hour is never claimed as a measured zero.
                  missingAsZero={metric === 'bounce_rate' || metric === 'avg_duration' || metric === 'pages_per_visit'}
                />
                <VisxXAxis
                  numTicks={dayDomain ? 9 : Math.min(chartData.length, 10)}
                  formatLabel={(interval === 'minute' || interval === 'hour')
                    ? (d) => formatTimeUTC(d)
                    : (d) => formatDateShortUTC(d)
                  }
                />
                <VisxYAxis
                  numTicks={6}
                  formatValue={(v) => activeMetric ? activeMetric.format(v) : v.toString()}
                />
                <VisxChartTooltip
                  // The instrument's header-strip card owns the markup now;
                  // the date pill retires — the bucket identity lives in the
                  // strip (hourly buckets show their SPAN, per the copied
                  // behaviour).
                  showDatePill={false}
                  title={(point) => {
                    const dateObj = point.dateObj instanceof Date ? point.dateObj : new Date(point.dateObj as string || Date.now())
                    if (interval === 'minute') return formatTimeUTC(dateObj)
                    if (interval === 'hour') {
                      // Boundary to boundary (owner ruling 02-09-2026:
                      // “19:00 – 20:00”, not the reference's literal :59).
                      const end = new Date(dateObj.getTime() + 60 * 60_000)
                      return `${formatTimeUTC(dateObj)} – ${formatTimeUTC(end)}`
                    }
                    return formatDateFullUTC(dateObj)
                  }}
                  rows={(point) => {
                    // An hour with no events measurably HAD zero visitors —
                    // counts' empty buckets read 0 (owner ruling 04-09-2026,
                    // revising the 19-08 tooltip em dash for COUNTS only).
                    // Rates keep the em dash: no visits, no denominator.
                    const raw = point[metric] as number | null
                    const v = (metric === 'visitors' || metric === 'pageviews') ? (raw ?? 0) : raw
                    return [{
                      color: 'var(--chart-1)',
                      label: activeMetric?.label || metric,
                      value: activeMetric ? activeMetric.format(v) : String(v ?? '—'),
                    }]
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

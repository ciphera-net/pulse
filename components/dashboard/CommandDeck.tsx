'use client'

import { useMemo, useState } from 'react'
import { AreaChart as VisxAreaChart, Area as VisxArea, Grid as VisxGrid, XAxis as VisxXAxis, YAxis as VisxYAxis, ChartTooltip as VisxChartTooltip, ReferenceLine as VisxReferenceLine } from '@/components/ui/area-chart'
import { curveLinear } from 'd3-shape'
import { PERIOD_ENDS_NOW } from '@/lib/constants/periods'
import { REALTIME_EMPTY_LINE } from '@/lib/dashboard/realtimeRange'
import { Card } from '@ciphera-net/facet'
import { formatCompactNumber, formatDuration } from '@/lib/utils/format'
import Select from '@/components/ui/select'
import { ChartLine } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { SPRING } from '@/lib/motion'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { CompactNumber } from '@/components/ui/compact-number'
import { cn } from '@/lib/utils'
import { formatDateShortUTC, formatTimeUTC, formatDateFullUTC, parseSiteWallClock } from '@/lib/utils/formatDate'
import { guardedPctChange, guardedPointChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { RailDelta } from '@/components/funnels/FunnelRail'
import RailSparkline from '@/components/dashboard/RailSparkline'
import { EmptyState } from '@/components/ui/EmptyState'
import type { DailyStat, ImportedProvenance, Stats } from '@/lib/api/stats'
import { importBoundaryDay, importBoundaryLabel, importBoundaryX, railIncludesImported } from '@/lib/dashboard/importBoundary'
import { METRIC_TERMS, visitorsTerm } from '@/lib/dashboard/terms'
import { MetricInfoTip, buildExample } from '@/components/dashboard/MetricInfoTip'
import { pairPreviousSeries } from '@/lib/dashboard/previousSeries'
import type { MetricType } from '@/lib/dashboard/metrics'
import type { IdentityWindowDays } from '@/lib/visitors/identityWindow'

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
  /**
   * The bucket the series is IN — the server's echo when it has one ("All time" past a
   * year arrives in weeks or months, picked by the server), else the one requested.
   */
  interval: 'minute' | 'hour' | 'day' | 'week' | 'month'
  dateRange: { start: string; end: string }
  period?: string
  /** Realtime mode: an empty window says so in one line (REALTIME_EMPTY_LINE). */
  live?: boolean
  multiDayInterval: 'hour' | 'day'
  setMultiDayInterval: (interval: 'hour' | 'day') => void
  // False on the public share surface, where the backend clamps every read to
  // day buckets (F2) and an interval selector would be a dead control.
  intervalPicker?: boolean
  // The site's identity window (Settings → Privacy → Visitor identity, since
  // 11-09-2026). It changes what "Unique visitors" MEANS — on "Session only" a
  // returning reader is never recognised — so the rail row's sentence and the
  // toolbar InfoTip say so here, where the number is shown, not only where it
  // is configured. Omitted on the share surface, whose payload lacks the
  // column; the window-neutral registry sentence is used there.
  identityWindowDays?: IdentityWindowDays
  /**
   * Imported-history provenance, as the responses said it (PULSE-118, dashboard
   * option 2): the current range's (the dashboard's `imported`) and the
   * comparison period's (`/stats`' `imported`). Absent means nothing to say.
   */
  imported?: ImportedProvenance | null
  prevImported?: ImportedProvenance | null
  /**
   * The previous period's series (PUL-19): the window before `dateRange`, same
   * interval and same filters, drawn as a dashed grey line behind this one.
   * Absent or empty: no comparison is drawn (All time, realtime, rolling
   * windows, minute buckets, the share surface).
   */
  prevData?: DailyStat[] | null
  prevRange?: { start: string; end: string } | null
  /** The first day the dashboard has data for (data window `from`): earlier previous buckets stay empty. */
  prevFloor?: string | null
}

// The previous period's ink: the established secondary-line token (grey in both
// themes), so orange stays reserved for the period being read.
const PREV_INK = 'var(--chart-line-secondary)'
const PREV_DASH = '4 4'

/** A signed change, minus sign not hyphen: "−73%", "+4.2 pp", "New", or "—". */
function formatChange(c: PctChangeResult): string {
  if (!c) return '—'
  if (c.type === 'new') return 'New'
  const sign = c.value > 0 ? '+' : c.value < 0 ? '\u2212' : ''
  return c.type === 'pp' ? `${sign}${Math.abs(c.value)} pp` : `${sign}${Math.abs(c.value)}%`
}

/** A signed whole-number difference: "+2", "−8", "0". */
function formatDiff(d: number): string {
  if (d === 0) return '0'
  return `${d > 0 ? '+' : '\u2212'}${Math.abs(Math.round(d))}`
}

function LegendLine({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="8" viewBox="0 0 16 8" className="shrink-0">
      <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth={dash ? 1.5 : 2} strokeDasharray={dash} strokeLinecap={dash ? undefined : 'round'} />
    </svg>
  )
}

/**
 * The rail rows whose numbers imported days merge into. Bounce rate and visit
 * duration stay Pulse's own on every range (D2), so "incl. imported days" under
 * them would be false.
 */
const IMPORT_MERGED_METRICS: ReadonlySet<MetricType> = new Set(['visitors', 'pageviews', 'pages_per_visit'])

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
  // A raw count (not a ratio/percentage/duration) — PULSE-190 renders these
  // compact with the exact value on hover/focus; the other three rows are
  // already-formatted strings a compact notation can't apply to.
  isCount?: boolean
}[] = [
  {
    key: 'visitors', label: 'Unique visitors', context: 'unique people',
    title: METRIC_TERMS.visitors.definition,
    format: (v) => formatCompactNumber(v == null ? null : Math.round(v)),
    isCount: true,
  },
  {
    key: 'pageviews', label: 'Total pageviews', context: 'across the site',
    title: METRIC_TERMS.pageviews.definition,
    format: (v) => formatCompactNumber(v == null ? null : Math.round(v)),
    isCount: true,
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
  live = false,
  dateRange,
  period,
  multiDayInterval,
  setMultiDayInterval,
  identityWindowDays,
  imported,
  prevImported,
  prevData,
  prevRange,
  prevFloor,
}: CommandDeckProps) {
  // On by default; the legend's "Previous period" entry hides it (PUL-19).
  const [showPrev, setShowPrev] = useState(true)
  const endsNow = Boolean(period && PERIOD_ENDS_NOW[period])
  // ─── Chart data (site wall clock, F10) ─────────────────────────────
  const chartData = useMemo(() => {
    const prev = prevData && prevData.length > 0 && prevRange
      ? pairPreviousSeries(data, prevData, dateRange.start, prevRange.start, prevFloor)
      : null
    return data.map((item, i) => {
      const wallClock = parseSiteWallClock(item.date) ?? new Date(item.date)
      const p = prev?.[i] ?? null
      return {
        // The previous period, by place in the window (lib/dashboard/previousSeries).
        prevDateObj: p ? (parseSiteWallClock(p.date) ?? new Date(p.date)) : null,
        prev_pageviews: p?.pageviews ?? null,
        prev_visitors: p?.visitors ?? null,
        prev_pages_per_visit: p?.pages_per_visit ?? null,
        prev_bounce_rate: p?.bounce_rate ?? null,
        prev_avg_duration: p?.avg_duration ?? null,
        // The in-progress bucket: its tooltip says "(so far)".
        isPartial: endsNow && i === data.length - 1,
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
    })
  }, [data, prevData, prevRange, prevFloor, dateRange.start, endsNow])
  const prevKey = `prev_${metric}`
  const hasPrevSeries = chartData.some((d) => d.prevDateObj !== null)
  const drawPrev = hasPrevSeries && showPrev

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
      // The visitors sentence follows the site's window; the other four are
      // the same on every site.
      const title = m.key === 'visitors' ? visitorsTerm(identityWindowDays).definition : m.title
      return { ...m, title, value, change }
    })
  }, [stats, prevStats, identityWindowDays])

  // Imported history (M11-h), all server-said: the boundary line on the hero
  // chart, and the rail's word when this range or its comparison includes it.
  const boundaryDay = importBoundaryDay(imported, dateRange)
  const railImported = railIncludesImported(imported, prevImported)

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
                  <span className={cn('truncate text-[13px]', metric === m.key ? 'text-brand-ink' : 'text-neutral-400')}>
                    {m.label}
                  </span>
                  <RailDelta change={m.change} invert={m.isNegative} />
                </div>
                {m.value == null
                  ? <span className="mt-0.5 block text-xl font-semibold text-neutral-600">—</span>
                  : m.isCount
                    ? (
                        <CompactNumber value={m.value} className="mt-0.5 block text-xl font-semibold tabular-nums text-white">
                          <AnimatedNumber value={m.value} format={m.format as (v: number) => string} />
                        </CompactNumber>
                      )
                    : <AnimatedNumber value={m.value} format={m.format as (v: number) => string} className="mt-0.5 block text-xl font-semibold tabular-nums text-white" />}
                <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                  {m.context}
                  {railImported && IMPORT_MERGED_METRICS.has(m.key) && ' · incl. imported days'}
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3">
            {/* The toolbar names the selected metric, so ONE resident glyph
                here reaches all six definitions — the rail rows stay clean
                (metric info layer, 22-08-2026). */}
            <span data-tour="chart-toolbar" className="flex items-center gap-1 text-xs font-medium text-neutral-400">
              {metric === 'visitors' && interval === 'day' ? 'Daily unique visitors' : activeMetric?.label}
              <MetricInfoTip metric={metric} example={buildExample(metric, stats)} identityWindowDays={identityWindowDays} />
            </span>
            {/* The legend: one entry per series, so the two inks are never a
                guess. On a phone it takes its own row under the toolbar. The
                "Previous period" entry is also the switch that hides it. The
                previous dates are not repeated here — the tooltip names the
                previous day of every bucket. */}
            {hasPrevSeries && (
              <div className="order-last flex w-full items-center gap-4 md:order-none md:ml-auto md:w-auto">
                <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-neutral-400">
                  <LegendLine color="var(--chart-1)" />
                  {activeMetric?.label}
                </span>
                <button
                  type="button"
                  aria-pressed={showPrev}
                  onClick={() => setShowPrev((v) => !v)}
                  className={cn(
                    'flex items-center gap-1.5 whitespace-nowrap text-xs font-medium transition-colors ease-apple',
                    showPrev ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-600 hover:text-neutral-400',
                  )}
                >
                  <span className={cn('flex items-center', !showPrev && 'opacity-40')}>
                    <LegendLine color={PREV_INK} dash="3 3" />
                  </span>
                  Previous period
                </button>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2 md:ml-0">
              {/* 1h and 24h are fixed-granularity rolling windows, and a
                  single-day range is fixed HOURLY (owner ruling 02-09-2026:
                  minute granularity belongs to the 1h range alone) — a
                  selector on any of them would disagree with the chart it
                  claims to control. intervalPicker=false (the public share
                  surface) hides it entirely: the backend clamps public-scoped
                  reads to day buckets (F2 — an hourly bucket with one visitor
                  is that person's arrival time), so the selector there was a
                  control wired to nothing. Past a year the SERVER picks week
                  or month buckets (All time) and echoes them in `interval`;
                  the selector then offered "1 day" over weekly points — so it
                  goes whenever the chart is not drawn in the buckets it
                  offers. */}
              {!intervalPicker || period === '1h' || period === '24h' || dateRange.start === dateRange.end || interval === 'week' || interval === 'month' ? null : (
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
            {live && !hasAnyNonZero ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center">
                <EmptyState icon={<ChartLine />} title={REALTIME_EMPTY_LINE} className="py-0" />
              </div>
            ) : !hasData ? (
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
                integerYTicks={metric === 'visitors' || metric === 'pageviews'}
                fillParent
                margin={{ top: 20, right: 20, bottom: 40, left: 50 }}
                animationDuration={400}
              >
                <VisxGrid horizontal vertical={false} stroke="var(--chart-grid)" numTicksRows={6} />
                {/* The previous period, drawn FIRST so it sits behind. A dashed
                    line with no fill (owner pick A, 12-10-2026); the chart's
                    y-domain spans both series, so a taller previous day is
                    never cut off. Gaps where a bucket has no partner or
                    predates the site's data — never a drawn zero. */}
                {drawPrev && (
                  <VisxArea
                    dataKey={prevKey}
                    curve={curveLinear}
                    fill={PREV_INK}
                    fillOpacity={0}
                    stroke={PREV_INK}
                    strokeWidth={1.5}
                    strokeDasharray={PREV_DASH}
                    fadeStrokeEdges={false}
                    breakAtMissing
                  />
                )}
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
                {/* The first day Pulse measured, when the range includes imported
                    days before it (dashboard option 2): the label reads what lies
                    to its left. Drawn by the server's provenance only. */}
                {boundaryDay && (
                  <VisxReferenceLine x={importBoundaryX(boundaryDay)} label={importBoundaryLabel(imported)} />
                )}
                <VisxXAxis
                  numTicks={Math.min(chartData.length, 10)}
                  // Time-only labels are unambiguous inside one day (or the
                  // rolling 24h window); an hourly range spanning several
                  // days repeats them ("00:00, 00:00, 00:00" — refuted 05-09),
                  // so those carry the date too.
                  formatLabel={interval === 'minute' || (interval === 'hour' && (dateRange.start === dateRange.end || period === '24h'))
                    ? (d) => formatTimeUTC(d)
                    : interval === 'hour'
                      ? (d) => `${formatDateShortUTC(d)} ${formatTimeUTC(d)}`
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
                    // Server-picked buckets for "All time" past a year: name the bucket,
                    // not one day of it.
                    if (interval === 'week') return `Week of ${formatDateFullUTC(dateObj)}`
                    if (interval === 'month') {
                      return dateObj.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
                    }
                    if (interval === 'hour') {
                      // Boundary to boundary (owner ruling 02-09-2026:
                      // “19:00 – 20:00”, not the reference's literal :59).
                      const end = new Date(dateObj.getTime() + 60 * 60_000)
                      return `${formatTimeUTC(dateObj)} – ${formatTimeUTC(end)}`
                    }
                    return point.isPartial ? `${formatDateFullUTC(dateObj)} (so far)` : formatDateFullUTC(dateObj)
                  }}
                  rows={(point) => {
                    // An hour with no events measurably HAD zero visitors —
                    // counts' empty buckets read 0 (owner ruling 04-09-2026,
                    // revising the 19-08 tooltip em dash for COUNTS only).
                    // Rates keep the em dash: no visits, no denominator.
                    const raw = point[metric] as number | null
                    const v = (metric === 'visitors' || metric === 'pageviews') ? (raw ?? 0) : raw
                    const current = {
                      color: 'var(--chart-1)',
                      label: activeMetric?.label || metric,
                      value: activeMetric ? activeMetric.format(v) : String(v ?? '—'),
                    }
                    if (!drawPrev) return [current]
                    // The previous bucket at the same place in its window,
                    // named by its own date so "previous" is never a guess.
                    const pd = point.prevDateObj instanceof Date ? point.prevDateObj : null
                    const pv = (point[prevKey] as number | null | undefined) ?? null
                    const isCount = metric === 'visitors' || metric === 'pageviews'
                    // The rail's guard (base 10): below it a percentage is noise.
                    const base = isCount ? (pv ?? 0) : ((point.prev_visitors as number | null) ?? 0)
                    const change: PctChangeResult = v != null && pv != null
                      ? (activeMetric?.isRate ? guardedPointChange(v, pv, base) : guardedPctChange(v, pv, base))
                      : null
                    const pLabel = !pd ? 'Previous period'
                      : interval === 'hour'
                        ? `${formatDateShortUTC(pd)} ${formatTimeUTC(pd)}`
                        : formatDateFullUTC(pd)
                    return [
                      current,
                      { color: PREV_INK, label: pLabel, value: pv == null ? '—' : (activeMetric ? activeMetric.format(pv) : String(pv)) },
                      {
                        color: 'transparent',
                        label: 'Change',
                        // A count's difference means something at any size; its
                        // percentage only past the base (small sites read an
                        // em dash most days otherwise — 26 of 30, measured).
                        value: isCount && v != null && pv != null
                          ? (change?.type === 'pct' ? `${formatDiff(v - pv)} (${formatChange(change)})` : formatDiff(v - pv))
                          : formatChange(change),
                      },
                    ]
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

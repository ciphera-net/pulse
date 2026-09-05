'use client'

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { curveLinear } from 'd3-shape'
import { useQueryParamsWriter } from '@/lib/hooks/useQueryParamsWriter'
import { useGSCDailyTotals } from '@/lib/swr/dashboard'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { AreaChart, Area, Grid, YAxis, ChartTooltip } from '@/components/ui/area-chart'
import { ChartStack, ChartStackAxis, useChartStack } from '@/components/ui/chart-stack'
import { guardedPctChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { formatDateFullUTC, formatDateShortUTC } from '@/lib/utils/formatDate'
import { cn } from '@/lib/utils'
import { TERMS } from '@/lib/dashboard/terms'
import type { GSCOverview } from '@/lib/api/gsc'
import {
  METRIC_ORDER,
  METRIC_LABEL,
  parseActiveMetrics,
  serializeActiveMetrics,
  rollupSeries,
  formatMetricValue,
  overviewValue,
  overviewPrev,
  type Granularity,
  type MetricKey,
  type SeriesPoint,
} from './searchMetrics'

// ---------------------------------------------------------------------------
// The Search Console instrument — a rail of KPI rows beside a stack of strips,
// every strip the dashboard's chart at strip height (chart-consistency round,
// 05-09-2026, owner pick B: keep the stack, make each strip the instrument).
//
// What changed against the hand-rolled strips this replaced: the line is
// linear and in the brand ink with the 0.15 gradient beneath it; the grid is
// the instrument's faded rows on a nice-step ladder with HTML labels in the
// left gutter (the old right-edge "max×1.12 / 0" pair is gone); ONE cursor
// runs through every strip and ONE card — the dashboard's, fixed-size,
// pinned to the top of the stack — reads every visible metric; hover snaps by
// the bisector with the identity bail, and touch works. Position keeps its
// inverted axis (lower is better) and, being nullable, draws a GAP where it is
// unknown — never `?? 0`, which on an inverted scale plotted an unknown rank
// as the best rank ever.
// ---------------------------------------------------------------------------

const STRIP_H = 92
// Compact margin: enough gutter on the left for a "544.3"/"4.2%" label, the
// crosshair's fade needs a few px top and bottom, and no bottom axis (the
// stack draws one shared row).
const STRIP_MARGIN = { top: 8, right: 16, bottom: 6, left: 48 }
const RAIL_W = 'w-40 sm:w-48'

interface InstrumentPanelProps {
  siteId: string
  dateRange: { start: string; end: string }
  overview: GSCOverview
  granularity: Granularity
}

// ─── Deltas (same guarded language as the dashboard KPIs) ────────

function DeltaBadge({ change, invert = false }: { change: PctChangeResult; invert?: boolean }) {
  if (!change || change.type !== 'pct') return null
  if (change.value === 0) {
    return <span className="text-xs tabular-nums text-neutral-500">0%</span>
  }
  const up = change.value > 0
  const good = invert ? !up : up
  return (
    <span className={`text-xs font-medium tabular-nums ${good ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(change.value)}%
    </span>
  )
}

// ─── Bucket identity ─────────────────────────────────────────────

function metricOf(p: SeriesPoint, key: MetricKey): number | null {
  if (key === 'position') return p.position
  if (key === 'ctr') return p.ctr
  return p[key]
}

/** The card header: the bucket's identity in the deck's own forms. Bucket
 *  dates are calendar days stamped as UTC — UTC getters, never local. */
function bucketTitle(p: SeriesPoint, granularity: Granularity): string {
  if (granularity === 'monthly') {
    return p.date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }
  if (granularity === 'weekly') return `Week of ${formatDateShortUTC(p.date)}`
  return formatDateFullUTC(p.date)
}

/** The shared axis label for a bucket date. */
function axisLabel(d: Date, granularity: Granularity): string {
  if (granularity === 'monthly') return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  if (granularity === 'weekly') return `wk ${formatDateShortUTC(d)}`
  return formatDateShortUTC(d)
}

/**
 * Is the LAST bucket still accumulating? Derived from the bucket's own extent
 * against the range's end date (both server-resolved), never from `now()`.
 * Daily buckets are complete by construction — Google reports whole days with
 * a lag. A week or month whose end lies past the range's last day is partial.
 */
function lastBucketPartial(series: SeriesPoint[], granularity: Granularity, rangeEnd: string): boolean {
  if (granularity === 'daily' || series.length < 2) return false
  const last = series[series.length - 1].date
  const end = new Date(`${rangeEnd}T00:00:00Z`).getTime()
  if (!Number.isFinite(end)) return false
  const bucketEnd = new Date(last)
  if (granularity === 'weekly') bucketEnd.setUTCDate(bucketEnd.getUTCDate() + 6)
  else {
    bucketEnd.setUTCMonth(bucketEnd.getUTCMonth() + 1)
    bucketEnd.setUTCDate(0)
  }
  return bucketEnd.getTime() > end
}

// ─── One strip: the instrument at strip height ───────────────────

function Strip({ series, metric, dashedTail }: { series: SeriesPoint[]; metric: MetricKey; dashedTail: boolean }) {
  const { hoverIndex, setHoverIndex } = useChartStack()
  const inverted = metric === 'position'
  const isCount = metric === 'clicks' || metric === 'impressions'
  return (
    <div style={{ height: STRIP_H }}>
      <AreaChart
        animationDuration={400}
        data={series as unknown as Record<string, unknown>[]}
        fillParent
        hoverIndex={hoverIndex}
        integerYTicks={isCount}
        invertY={inverted}
        margin={STRIP_MARGIN}
        onHoverChange={setHoverIndex}
        xDataKey="date"
      >
        <Grid horizontal numTicksRows={3} stroke="var(--chart-grid)" vertical={false} />
        <Area
          // Position is nullable (legacy rows predate the gsc_daily backfill):
          // a gap, never a fabricated 0 on an inverted axis.
          breakAtMissing={inverted}
          curve={curveLinear}
          dashedTailFrom={dashedTail && series.length >= 2 ? series.length - 2 : undefined}
          dataKey={metric}
          fadeStrokeEdges={false}
          fill="var(--chart-1)"
          // No fill under an inverted line: the area would shade the WORSE side.
          fillOpacity={inverted ? 0 : 0.15}
          gradientToOpacity={0}
          stroke="var(--chart-1)"
          strokeWidth={2}
        />
        <YAxis formatValue={(v) => formatMetricValue(metric, v)} numTicks={3} />
        <ChartTooltip showCard={false} showDatePill={false} />
      </AreaChart>
    </div>
  )
}

// ─── Core (engine-agnostic instrument) ───────────────────────────
//
// One device, two engines. The Google panel and the Bing panel render THIS —
// same rails, strips, cursor, card and x-axis — with the engine deciding only
// the metric set, the series and the delta arithmetic. The Bing view being
// smaller is honest (its API has three metrics); it being a different-looking
// instrument was not, which is why this core exists.

export interface InstrumentRow {
  key: MetricKey
  value: number
  delta: PctChangeResult
}

// * The rail row is a toggle <button> (Show / active), so its explanation
// * travels via aria-describedby + a sr-only span rather than a resident
// * glyph — the same accommodation as the uptime rail. termFor resolves a
// * row's registry key; a row with none gets no describedby at all, honestly
// * (the engine-agnostic core is shared by Google's four-metric rail and
// * Bing's three-metric one, whose source note differs).
export function InstrumentCore({
  rows,
  series,
  granularity,
  rangeEnd,
  active,
  onToggle,
  isValidating,
  isLoading,
  error,
  onRetry,
  errorTitle,
  emptyTitle,
  emptyHint,
  termFor,
}: {
  rows: InstrumentRow[]
  series: SeriesPoint[]
  granularity: Granularity
  /** The range's last day (server-resolved) — decides the dashed tail. */
  rangeEnd: string
  active: MetricKey[]
  onToggle: (key: MetricKey) => void
  isValidating: boolean
  isLoading: boolean
  error: boolean
  onRetry: () => void
  errorTitle: string
  emptyTitle: string
  emptyHint: string
  termFor?: (key: MetricKey) => string | undefined
}) {
  // * Transitional state while a site's gsc_daily backfill runs: the series
  // * exists but carries no position. The strip says so instead of plotting 0s.
  const hasPositionSeries = useMemo(() => series.some((p) => p.position != null), [series])
  const dashedTail = useMemo(() => lastBucketPartial(series, granularity, rangeEnd), [series, granularity, rangeEnd])

  const title = useCallback((p: Record<string, unknown>) => bucketTitle(p as unknown as SeriesPoint, granularity), [granularity])
  const cardRows = useCallback(
    (p: Record<string, unknown>) =>
      active.map((key) => {
        const v = metricOf(p as unknown as SeriesPoint, key)
        return { color: 'var(--chart-1)', label: METRIC_LABEL[key], value: v == null ? '—' : formatMetricValue(key, v) }
      }),
    [active],
  )
  const fmtAxis = useCallback((d: Date) => axisLabel(d, granularity), [granularity])

  return (
    <ChartStack
      className="rounded-none border border-border bg-card"
      data={series as unknown as Record<string, unknown>[]}
      margin={STRIP_MARGIN}
      rows={cardRows}
      title={title}
      xDataKey="date"
    >
      <div data-tour="search-instrument" className="relative">
        <UpdatingChip active={isValidating} className="right-2 top-2" />

        {rows.map(({ key, value, delta }, rowIndex) => {
          const isOn = active.includes(key)
          const invert = key === 'position'
          const term = termFor?.(key)
          // The first rail cell is the stack's measured rail — one is enough.
          const railProps = rowIndex === 0 ? { 'data-chart-stack-rail': '' } : {}

          if (!isOn) {
            return (
              <button
                key={key}
                type="button"
                aria-pressed={false}
                aria-describedby={term ? `search-def-${key}` : undefined}
                onClick={() => onToggle(key)}
                className="group flex h-11 w-full items-stretch border-t border-border text-left transition-colors duration-fast ease-apple first:border-t-0 hover:bg-neutral-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
              >
                <span {...railProps} className={cn(RAIL_W, 'flex shrink-0 items-center justify-between gap-2 border-r border-border px-4')}>
                  <span className="truncate text-sm text-neutral-500">{METRIC_LABEL[key]}</span>
                  <span className="text-xs tabular-nums text-neutral-500">{formatMetricValue(key, value)}</span>
                </span>
                <span className="flex items-center px-4 text-xs text-neutral-600 transition-colors duration-fast ease-apple group-hover:text-neutral-400">
                  Show
                </span>
                {term && (
                  <span id={`search-def-${key}`} className="sr-only">
                    {TERMS[term]?.definition}
                  </span>
                )}
              </button>
            )
          }

          return (
            <div key={key} className="flex items-stretch border-t border-border first:border-t-0">
              <button
                {...railProps}
                type="button"
                aria-pressed={true}
                aria-describedby={term ? `search-def-${key}` : undefined}
                onClick={() => onToggle(key)}
                className={cn(
                  RAIL_W,
                  'relative flex shrink-0 flex-col justify-center border-r border-border px-4 py-3 text-left transition-colors duration-fast ease-apple hover:bg-neutral-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange',
                )}
              >
                <span aria-hidden="true" className="absolute bottom-0 left-0 top-0 w-[2px] bg-brand-orange" />
                <span className="text-sm text-neutral-400">{METRIC_LABEL[key]}</span>
                <AnimatedNumber
                  value={value}
                  format={(v) => formatMetricValue(key, v)}
                  className="mt-0.5 text-xl font-semibold tabular-nums text-white"
                />
                <DeltaBadge change={delta} invert={invert} />
                {term && (
                  <span id={`search-def-${key}`} className="sr-only">
                    {TERMS[term]?.definition}
                  </span>
                )}
              </button>

              <div className="relative min-w-0 flex-1">
                {key === 'position' && series.length > 0 && hasPositionSeries && (
                  <span className="pointer-events-none absolute right-4 top-1.5 z-10 text-xs text-neutral-500">
                    lower is better
                  </span>
                )}
                {series.length === 0 ? null : key === 'position' && !hasPositionSeries ? (
                  <div className="flex h-full items-center px-4">
                    <p className="text-xs text-neutral-500">
                      Daily position lands with the next Search Console sync.
                    </p>
                  </div>
                ) : (
                  <Strip dashedTail={dashedTail} metric={key} series={series} />
                )}
              </div>
            </div>
          )
        })}

        {/* Shared x-axis, offset past the rail column — the instrument's chrome */}
        <div className="flex border-t border-border">
          <div className={cn(RAIL_W, 'shrink-0 border-r border-border')} />
          <div className="min-w-0 flex-1">
            {series.length > 0 && (
              <ChartStackAxis formatLabel={fmtAxis} numTicks={10} ticks={granularity === 'daily' ? 'nice' : 'buckets'} />
            )}
          </div>
        </div>

        {/* Empty / error states cover the band area, rails stay visible */}
        {error ? (
          <div className="absolute inset-y-0 left-40 right-0 flex items-center justify-center sm:left-48">
            <ErrorCard title={errorTitle} onRetry={onRetry} className="py-4" />
          </div>
        ) : !isLoading && series.length === 0 ? (
          <div className="pointer-events-none absolute inset-y-0 left-40 right-0 flex flex-col items-center justify-center sm:left-48">
            <p className="text-sm text-neutral-400">{emptyTitle}</p>
            <p className="mt-1 text-xs text-neutral-500">{emptyHint}</p>
          </div>
        ) : null}
      </div>
    </ChartStack>
  )
}

// ─── Google wrapper ──────────────────────────────────────────────

// * Google's rail carries FOUR registry entries, one per metric — each row's
// * own source/caveat, not one generic caption repeated four times.
const GOOGLE_METRIC_TERM: Record<MetricKey, string> = {
  clicks: 'search_clicks',
  impressions: 'search_impressions',
  ctr: 'search_avg_ctr',
  position: 'search_avg_position',
}

export default function InstrumentPanel({ siteId, dateRange, overview, granularity }: InstrumentPanelProps) {
  const searchParams = useSearchParams()
  const write = useQueryParamsWriter()

  const active = parseActiveMetrics(searchParams.get('m'))

  const toggleMetric = useCallback(
    (key: MetricKey) => {
      const next = active.includes(key) ? active.filter((k) => k !== key) : [...active, key]
      if (next.length === 0) return // at least one strip stays
      write({ m: serializeActiveMetrics(next) })
    },
    [active, write],
  )

  const { data, error, isLoading, isValidating, mutate } = useGSCDailyTotals(siteId, dateRange.start, dateRange.end)

  const series = useMemo(
    () => rollupSeries(data?.daily_totals ?? [], granularity),
    [data, granularity],
  )

  const rows: InstrumentRow[] = METRIC_ORDER.map((key) => {
    const value = overviewValue(overview, key)
    const prev = overviewPrev(overview, key)
    return {
      key,
      value,
      delta: guardedPctChange(value, prev, key === 'clicks' || key === 'impressions' ? prev : overview.prev_impressions),
    }
  })

  return (
    <InstrumentCore
      rows={rows}
      series={series}
      granularity={granularity}
      rangeEnd={dateRange.end}
      active={active}
      onToggle={toggleMetric}
      isValidating={isValidating && !!data}
      isLoading={isLoading}
      error={!!error}
      onRetry={() => { void mutate() }}
      errorTitle="Couldn't load search traffic"
      emptyTitle="No search data in this period."
      emptyHint="Google reports with a ~2-day delay — try a wider range."
      termFor={(key) => GOOGLE_METRIC_TERM[key]}
    />
  )
}

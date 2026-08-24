'use client'

import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQueryParamsWriter } from '@/lib/hooks/useQueryParamsWriter'
import { scaleLinear, scaleTime } from 'd3-scale'
import { curveMonotoneX } from 'd3-shape'
import { AreaClosed, LinePath, ParentSize, localPoint } from '@/lib/charts/primitives'
import { useGSCDailyTotals } from '@/lib/swr/dashboard'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { guardedPctChange, type PctChangeResult } from '@/lib/utils/pctChange'
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
// The instrument panel — the Search page's tiles and chart merged into one
// device. Each metric is a row: a rail (label, period value, delta — and the
// toggle) beside a strip chart on its own honest scale. Toggling collapses the
// strip; identity comes from position and label, so the data ink is one
// neutral colour and orange stays scarce: the active rail edge, the crosshair
// markers, nothing else. One crosshair runs through every strip.
// ---------------------------------------------------------------------------

const INK = '#b3b1ad'
const INK_FILL = 'rgba(255, 255, 255, 0.045)'
const MARKER = '#FD5E0F'
const STRIP_H = 92
const PAD = { l: 8, r: 52 }
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

// ─── One strip ───────────────────────────────────────────────────

function metricOf(p: SeriesPoint, key: MetricKey): number | null {
  if (key === 'position') return p.position
  if (key === 'ctr') return p.ctr
  return p[key]
}

function Strip({
  width,
  series,
  metric,
  hoverIdx,
  onHover,
}: {
  width: number
  series: SeriesPoint[]
  metric: MetricKey
  hoverIdx: number | null
  onHover: (i: number | null) => void
}) {
  const inverted = metric === 'position'
  const innerW = width - PAD.l - PAD.r
  const padT = 10
  const padB = 8
  const innerH = STRIP_H - padT - padB

  const values = series.map((p) => metricOf(p, metric) ?? 0)
  const max = Math.max(1e-9, ...values) * 1.12

  const xScale = useMemo(
    () => scaleTime().domain([series[0].date, series[series.length - 1].date]).range([0, innerW]),
    [series, innerW],
  )
  // * Inverted range for position: up = better, exactly like the delta colours.
  const yScale = useMemo(
    () => scaleLinear().domain([0, max]).range(inverted ? [padT, padT + innerH] : [padT + innerH, padT]),
    [max, inverted, innerH],
  )

  // * Resolve hover through the SAME scale that places the marks — buckets are
  // * not uniformly spaced (Google omits zero-impression days; months differ
  // * in length), so a uniform-index mapping puts the crosshair on the wrong
  // * bucket. Invert to a time, then take the nearest bucket by date.
  const handleMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(event)
      if (!point) return
      const t = xScale.invert(point.x - PAD.l).getTime()
      let best = 0
      let bestDist = Number.POSITIVE_INFINITY
      for (let i = 0; i < series.length; i++) {
        const d = Math.abs(series[i].date.getTime() - t)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      }
      onHover(best)
    },
    [xScale, series, onHover],
  )

  if (innerW <= 0) return null

  const fmt = (v: number) => formatMetricValue(metric, v)
  const topLabel = inverted ? fmt(0) : fmt(max)
  const bottomLabel = inverted ? fmt(max) : fmt(0)
  const hovered = hoverIdx != null ? series[hoverIdx] : null
  const hoveredValue = hovered ? metricOf(hovered, metric) : null

  return (
    <svg aria-hidden="true" width={width} height={STRIP_H} style={{ display: 'block' }}>
      <g>
        <line x1={PAD.l} x2={width - PAD.r} y1={padT} y2={padT} stroke="var(--chart-grid)" strokeWidth={1} />
        <line x1={PAD.l} x2={width - PAD.r} y1={padT + innerH} y2={padT + innerH} stroke="var(--chart-grid)" strokeWidth={1} />

        <g transform={`translate(${PAD.l},0)`}>
          {!inverted && (
            <AreaClosed
              data={series}
              x={(p) => xScale(p.date)}
              y={(p) => yScale(metricOf(p, metric) ?? 0)}
              yScale={yScale}
              curve={curveMonotoneX}
              fill={INK_FILL}
            />
          )}
          <LinePath
            data={series}
            x={(p) => xScale(p.date)}
            y={(p) => yScale(metricOf(p, metric) ?? 0)}
            curve={curveMonotoneX}
            stroke={INK}
            strokeWidth={1.5}
            strokeLinecap="round"
          />

          {hovered && hoveredValue != null && (
            <g pointerEvents="none">
              <line
                x1={xScale(hovered.date)}
                x2={xScale(hovered.date)}
                y1={padT}
                y2={padT + innerH}
                stroke="var(--chart-crosshair)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <circle
                cx={xScale(hovered.date)}
                cy={yScale(hoveredValue)}
                r={3.5}
                fill={MARKER}
                stroke="var(--chart-background)"
                strokeWidth={2}
              />
            </g>
          )}
        </g>

        <text x={width - PAD.r + 8} y={padT + 4} fontSize={10.5} fill="var(--chart-axis)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {topLabel}
        </text>
        <text x={width - PAD.r + 8} y={padT + innerH + 3} fontSize={10.5} fill="var(--chart-axis)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {bottomLabel}
        </text>

        <rect
          x={PAD.l}
          y={0}
          width={innerW}
          height={STRIP_H}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => onHover(null)}
        />
      </g>
    </svg>
  )
}

// ─── X axis (one shared row under all strips) ────────────────────

function bucketLabel(p: SeriesPoint, granularity: Granularity): string {
  if (granularity === 'monthly') {
    return p.date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  }
  const day = p.date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })
  return granularity === 'weekly' ? `wk ${day}` : day
}

function XAxis({ width, series, granularity }: { width: number; series: SeriesPoint[]; granularity: Granularity }) {
  const innerW = width - PAD.l - PAD.r
  if (innerW <= 0 || series.length === 0) return null
  // * Tick indices are chosen uniformly, but each label sits at the SAME time
  // * scale the strips draw with — sparse dates would otherwise drift the
  // * labels off the marks above them.
  const xScale = scaleTime().domain([series[0].date, series[series.length - 1].date]).range([0, innerW])
  const n = Math.min(5, series.length)
  const ticks =
    n <= 1 ? [0] : Array.from({ length: n }, (_, k) => Math.round((k * (series.length - 1)) / (n - 1)))
  return (
    <svg aria-hidden="true" width={width} height={20} style={{ display: 'block' }}>
      {ticks.map((idx) => (
        <text
          key={idx}
          x={PAD.l + xScale(series[idx].date)}
          y={13}
          textAnchor={idx === 0 ? 'start' : idx === series.length - 1 ? 'end' : 'middle'}
          fontSize={11}
          fill="var(--chart-axis)"
        >
          {bucketLabel(series[idx], granularity)}
        </text>
      ))}
    </svg>
  )
}

// ─── Core (engine-agnostic instrument) ───────────────────────────
//
// One device, two engines. The Google panel and the Bing panel render THIS —
// same rails, strips, crosshair, tooltip, scale labels and x-axis — with the
// engine deciding only the metric set, the series and the delta arithmetic.
// The Bing view being smaller is honest (its API has three metrics); it being
// a different-looking instrument was not, which is why this core exists.

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
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  // * Transitional state while a site's gsc_daily backfill runs: the series
  // * exists but carries no position. The strip says so instead of plotting 0s.
  const hasPositionSeries = useMemo(() => series.some((p) => p.position != null), [series])

  const hovered = hoverIdx != null && hoverIdx < series.length ? series[hoverIdx] : null

  return (
    <div data-tour="search-instrument" className="relative rounded-none border border-border bg-card">
      <UpdatingChip active={isValidating} className="right-2 top-2" />

      {rows.map(({ key, value, delta }) => {
        const isOn = active.includes(key)
        const invert = key === 'position'
        const term = termFor?.(key)

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
              <span className={cn(RAIL_W, 'flex shrink-0 items-center justify-between gap-2 border-r border-border px-4')}>
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
                <span className="absolute right-14 top-1.5 z-10 text-[10px] text-neutral-600">
                  inverted · up is better
                </span>
              )}
              {series.length === 0 ? null : key === 'position' && !hasPositionSeries ? (
                <div className="flex h-full items-center px-4">
                  <p className="text-xs text-neutral-500">
                    Daily position lands with the next Search Console sync.
                  </p>
                </div>
              ) : (
                <ParentSize debounceTime={10}>
                  {({ width }) =>
                    width > 0 ? (
                      <Strip width={width} series={series} metric={key} hoverIdx={hoverIdx} onHover={setHoverIdx} />
                    ) : null
                  }
                </ParentSize>
              )}
            </div>
          </div>
        )
      })}

      {/* Shared x-axis, offset past the rail column */}
      <div className="flex border-t border-border">
        <div className={cn(RAIL_W, 'shrink-0 border-r border-border')} />
        {/* Explicit height — ParentSize only renders once it can measure BOTH
            axes, and this row has no rail content to give it one. */}
        <div className="h-7 min-w-0 flex-1 py-1">
          {series.length > 0 && (
            <ParentSize debounceTime={10}>
              {({ width }) => (width > 0 ? <XAxis width={width} series={series} granularity={granularity} /> : null)}
            </ParentSize>
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

      {/* One tooltip for every strip */}
      {hovered && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <div className="min-w-[150px] rounded-none border border-border bg-popover px-3 py-2.5 text-white">
            <div className="mb-2 text-xs font-medium text-neutral-400">{bucketLabel(hovered, granularity)}</div>
            <div className="space-y-1.5">
              {active.map((key) => {
                const v = metricOf(hovered, key)
                return (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-neutral-400">{METRIC_LABEL[key]}</span>
                    <span className="text-sm font-medium tabular-nums text-white">
                      {v == null ? '—' : formatMetricValue(key, v)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
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

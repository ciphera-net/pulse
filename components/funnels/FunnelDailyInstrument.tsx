'use client'

import { useCallback, useMemo } from 'react'
import { curveLinear } from 'd3-shape'
import { useFunnelTrends } from '@/lib/swr/dashboard'
import type { FunnelStats } from '@/lib/api/funnels'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { AreaChart, Area, Grid, YAxis, ChartTooltip, ChartCrosshair } from '@/components/ui/area-chart'
import { ChartStack, ChartStackAxis, useChartStack, STRIP_INK, STRIP_MARKER } from '@/components/ui/chart-stack'
import { PERIOD_ENDS_NOW } from '@/lib/constants/periods'
import { formatNumber, formatConvertTime } from '@/lib/utils/format'
import { guardedPctChange, guardedPointChange } from '@/lib/utils/pctChange'
import { formatDateFullUTC, formatDateShortUTC } from '@/lib/utils/formatDate'
import { FunnelRail } from './FunnelRail'

// ---------------------------------------------------------------------------
// The Daily instrument — the funnel's day-by-day story as metric rows in the
// estate grammar (CDN/Search/Uptime): a rail per metric beside a strip, one
// cursor through all three, one card, one axis row. Since the chart-consistency
// round (05-09-2026, owner pick B) the LINE strips are the dashboard's chart at
// strip height and the stack carries the dashboard's card:
//
//   Conversion — the instrument with a `defined` predicate: a day is measured
//                only with ≥5 entrants AND a rate; everything else is a GAP (a
//                gap is a fact, a bridge is a guess, and a 1-visitor day plotted
//                at 100% is noise sold as measurement). The per-day dots stay —
//                they are the evidence marks — drawn where the line is defined.
//   Entered    — the instrument, every day
//   Completed  — orange bars (the funnel's own accent; zero days draw nothing),
//                a hand-rolled member on the stack's scale and cursor
//
// Days are the site's calendar days (the API's date strings), stamped as UTC
// so UTC getters print them as written — never parsed as local midnight.
// ---------------------------------------------------------------------------

const BRAND = '#FD5E0F'
const STRIP_H = 92
const STRIP_MARGIN = { top: 8, right: 16, bottom: 6, left: 48 }
const MIN_RATE_ENTRANTS = 5

interface DayPoint extends Record<string, unknown> {
  date: Date
  label: string
  rate: number | null
  entered: number
  completed: number | null
}

const measured = (d: Record<string, unknown>) => typeof d.rate === 'number' && (d.entered as number) >= MIN_RATE_ENTRANTS

export function FunnelDailyInstrument({
  siteId,
  funnelId,
  dateRange,
  filters,
  stats,
  prevStats,
  editEpoch,
  period,
}: {
  siteId: string
  funnelId: string
  dateRange: { start: string; end: string }
  filters?: string
  stats?: FunnelStats
  prevStats?: FunnelStats
  /** Bumped by the page after an edit — forces an immediate trends refetch. */
  editEpoch?: number
  /** The period token — the dashed in-progress tail follows token semantics. */
  period?: string | null
}) {
  const { data: trends, error, mutate: retry } = useFunnelTrends(
    siteId,
    funnelId,
    dateRange.start,
    dateRange.end,
    filters,
    editEpoch,
  )

  const series: DayPoint[] = useMemo(() => {
    if (!trends?.dates?.length) return []
    return trends.dates.map((d, i) => {
      const rate = trends.overall[i]
      const entered = trends.entered?.[i] ?? 0
      return {
        date: new Date(`${d}T00:00:00Z`),
        label: d,
        rate,
        // A day's completions derive from its own rate × entrants; a null
        // rate day has no measurement to derive from.
        completed: rate == null ? null : Math.round((rate / 100) * entered),
        entered,
      }
    })
  }, [trends])

  const rails = useMemo(() => {
    const last = stats?.steps.length ? stats.steps[stats.steps.length - 1] : null
    const prevLast = prevStats?.steps.length ? prevStats.steps[prevStats.steps.length - 1] : null
    const entered = stats?.steps[0]?.visitors ?? null
    const prevEntered = prevStats?.steps[0]?.visitors ?? 0
    const conversion = last?.conversion ?? null
    return {
      conversion: conversion != null ? `${Math.round(conversion)}%` : '—',
      conversionDelta:
        conversion != null && prevLast?.conversion != null
          ? guardedPointChange(conversion, prevLast.conversion, prevEntered)
          : null,
      conversionContext: entered != null && entered > 0 ? `${last?.visitors ?? 0} of ${formatNumber(entered)}` : undefined,
      entered: entered != null ? formatNumber(entered) : '—',
      enteredDelta: entered != null && prevStats ? guardedPctChange(entered, prevEntered, prevEntered) : null,
      completed: stats ? formatNumber(last?.visitors ?? 0) : '—',
      completedContext:
        stats?.median_convert_seconds != null ? `median ${formatConvertTime(stats.median_convert_seconds)}` : undefined,
    }
  }, [stats, prevStats])

  const ghost = series.length < 2
  const dashedTail = Boolean(period && PERIOD_ENDS_NOW[period])

  const cardTitle = useCallback((p: Record<string, unknown>) => formatDateFullUTC(p.date as Date), [])
  const cardRows = useCallback((p: Record<string, unknown>) => {
    const h = p as DayPoint
    return [
      { color: 'var(--chart-1)', label: 'Conversion', value: measured(h) ? `${Math.round(h.rate as number)}%` : '—' },
      { color: 'var(--chart-1)', label: 'Entered', value: formatNumber(h.entered) },
      { color: BRAND, label: 'Completed', value: h.completed != null ? formatNumber(h.completed) : '—' },
    ]
  }, [])

  const rows = [
    { key: 'rate' as const, rail: <FunnelRail label="Conversion" value={rails.conversion} delta={rails.conversionDelta} context={rails.conversionContext} className="h-full" /> },
    { key: 'entered' as const, rail: <FunnelRail label="Entered" value={rails.entered} delta={rails.enteredDelta} context="reached step 1" className="h-full" /> },
    { key: 'completed' as const, rail: <FunnelRail label="Completed" value={rails.completed} context={rails.completedContext} className="h-full" /> },
  ]

  return (
    <div className="relative rounded-none border border-border bg-card">
      {/* No UpdatingChip here — the page-level chip on the funnel panel is
          the one liveness indicator; two chips on one screen read as noise. */}
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-3">
        <span className="text-sm font-medium text-neutral-200">Daily</span>
        <span className="truncate text-xs text-neutral-500">rate marked only where ≥{MIN_RATE_ENTRANTS} entered</span>
      </div>

      {error ? (
        <div className="px-4 py-6">
          <ErrorCard title="Couldn't load the daily series" onRetry={() => { void retry() }} className="py-4" />
        </div>
      ) : (
        <ChartStack data={series} margin={STRIP_MARGIN} resetKey={trends} rows={cardRows} title={cardTitle} xDataKey="date">
          {rows.map((row, ri) => (
            <div key={row.key} className={ri > 0 ? 'flex items-stretch border-t border-border/60' : 'flex items-stretch'}>
              <div className="w-36 shrink-0 border-r border-border/60 sm:w-44" {...(ri === 0 ? { 'data-chart-stack-rail': '' } : {})}>
                {row.rail}
              </div>
              <div className="relative min-w-0 flex-1">
                {ghost ? (
                  <div className="flex items-center justify-center" style={{ height: STRIP_H }}>
                    {ri === 0 && <span className="text-xs text-neutral-600">{trends ? 'Not enough days in this range' : 'Loading…'}</span>}
                  </div>
                ) : row.key === 'completed' ? (
                  <CompletedBars series={series} />
                ) : (
                  <DayStrip dashedTail={dashedTail} kind={row.key} series={series} />
                )}
              </div>
            </div>
          ))}

          {!ghost && (
            <div className="flex border-t border-border/60">
              <div className="w-36 shrink-0 border-r border-border/60 sm:w-44" />
              <div className="min-w-0 flex-1">
                <ChartStackAxis formatLabel={(d) => formatDateShortUTC(d)} numTicks={8} />
              </div>
            </div>
          )}
        </ChartStack>
      )}
    </div>
  )
}

// ─── Line strips: the instrument at strip height ────────────────

function DayStrip({ series, kind, dashedTail }: { series: DayPoint[]; kind: 'rate' | 'entered'; dashedTail: boolean }) {
  const { hoverIndex, setHoverIndex } = useChartStack()
  const isRate = kind === 'rate'
  return (
    <div style={{ height: STRIP_H }}>
      <AreaChart
        animationDuration={400}
        data={series}
        fillParent
        hoverIndex={hoverIndex}
        integerYTicks={!isRate}
        margin={STRIP_MARGIN}
        onHoverChange={setHoverIndex}
        xDataKey="date"
        yCap={isRate ? 100 : undefined}
      >
        <Grid horizontal numTicksRows={3} stroke="var(--chart-grid)" vertical={false} />
        <Area
          curve={curveLinear}
          dashedTailFrom={dashedTail && series.length >= 2 ? series.length - 2 : undefined}
          dataKey={kind}
          // The n≥5 floor: a rate is a measurement only with enough entrants.
          defined={isRate ? measured : undefined}
          fadeStrokeEdges={false}
          fill={STRIP_INK}
          fillOpacity={isRate ? 0 : 0.15}
          gradientToOpacity={0}
          // The evidence marks: one dot per measured day on the rate strip.
          pointFill="var(--chart-1)"
          pointOpacity={0.9}
          pointRadius={2.1}
          pointsKey={isRate ? 'rate' : undefined}
          stroke={STRIP_INK}
          dotColor={STRIP_MARKER}
          strokeWidth={2}
        />
        <YAxis formatValue={(v) => (isRate ? `${Math.round(v)}%` : formatNumber(Math.round(v)))} numTicks={3} />
        <ChartTooltip showCard={false} showDatePill={false} />
      </AreaChart>
    </div>
  )
}

// ─── Completed: orange bars on the stack's scale (hand-rolled member) ─

function CompletedBars({ series }: { series: DayPoint[] }) {
  const { xScale, margin, innerWidth, hoverIndex, setHoverIndex, resolveIndex } = useChartStack()
  if (innerWidth <= 0) return null
  const padT = margin.top
  const innerH = STRIP_H - margin.top - margin.bottom
  const max = Math.max(1, ...series.map((p) => p.completed ?? 0)) * 1.12
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const barW = Math.max(2, Math.min(10, (innerWidth / series.length) * 0.55))
  const hovered = hoverIndex != null ? series[hoverIndex] : null

  return (
    <div className="relative" style={{ height: STRIP_H }}>
      <svg aria-hidden="true" height={STRIP_H} style={{ display: 'block' }} width="100%">
        <g transform={`translate(${margin.left},0)`}>
          <line stroke="var(--chart-grid)" strokeWidth={1} x1={0} x2={innerWidth} y1={padT + innerH} y2={padT + innerH} />
          {series.map((p, i) =>
            p.completed == null || p.completed === 0 ? null : (
              <rect
                key={p.label}
                fill={BRAND}
                height={padT + innerH - y(p.completed)}
                opacity={hoverIndex === null || hoverIndex === i ? 0.85 : 0.5}
                width={barW}
                x={(xScale(p.date) ?? 0) - barW / 2}
                y={y(p.completed)}
              />
            ),
          )}
          <g transform={`translate(0,${padT})`}>
            <ChartCrosshair height={innerH} visible={hovered != null} x={hovered ? (xScale(hovered.date) ?? 0) : 0} />
          </g>
          <rect
            fill="transparent"
            height={STRIP_H}
            onMouseLeave={() => setHoverIndex(null)}
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setHoverIndex(resolveIndex(event.clientX - rect.left))
            }}
            style={{ cursor: 'crosshair' }}
            width={innerWidth}
            x={0}
            y={0}
          />
        </g>
      </svg>
      {[max, 0].map((v) => (
        <div className="pointer-events-none absolute flex justify-end" key={v} style={{ left: 0, top: y(v), width: margin.left - 8, transform: 'translateY(-50%)' }}>
          <span className="whitespace-nowrap text-neutral-500 text-xs tabular-nums">{formatNumber(Math.round(v))}</span>
        </div>
      ))}
    </div>
  )
}

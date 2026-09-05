'use client'

import { useCallback, useMemo, useState } from 'react'
import { scaleLinear, scaleTime } from 'd3-scale'
import { curveMonotoneX } from 'd3-shape'
import { AreaClosed, LinePath, ParentSize, localPoint } from '@/lib/charts/primitives'
import { useFunnelTrends } from '@/lib/swr/dashboard'
import type { FunnelStats } from '@/lib/api/funnels'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { formatNumber, formatConvertTime } from '@/lib/utils/format'
import { guardedPctChange, guardedPointChange } from '@/lib/utils/pctChange'
import { formatDateShort } from '@/lib/utils/formatDate'
import { FunnelRail } from './FunnelRail'

// ---------------------------------------------------------------------------
// The Daily instrument — the funnel's day-by-day story as metric rows in the
// estate grammar (CDN/Search): a rail per metric beside a strip chart on its
// own honest scale, one crosshair through all three, one axis row.
//
//   Conversion — dots/line only on days with ≥5 entrants AND a measured rate;
//                everything else is a GAP (a gap is a fact, a bridge is a
//                guess, and a 1-visitor day plotted at 100% is noise sold as
//                measurement)
//   Entered    — neutral-ink area, every day
//   Completed  — orange bars (the funnel's own accent; zero days draw nothing)
//
// Replaces the single overall-conversion area chart, which plotted exactly
// the artifacts the rules above exist to prevent.
// ---------------------------------------------------------------------------

const INK = '#b3b1ad'
const INK_FILL = 'rgba(255, 255, 255, 0.045)'
const BRAND = '#FD5E0F'
const STRIP_H = 72
const PAD = { l: 8, r: 12 }
const MIN_RATE_ENTRANTS = 5

interface DayPoint {
  date: Date
  label: string
  rate: number | null
  entered: number
  completed: number | null
}

export function FunnelDailyInstrument({
  siteId,
  funnelId,
  dateRange,
  filters,
  stats,
  prevStats,
  editEpoch,
}: {
  siteId: string
  funnelId: string
  dateRange: { start: string; end: string }
  filters?: string
  stats?: FunnelStats
  prevStats?: FunnelStats
  /** Bumped by the page after an edit — forces an immediate trends refetch. */
  editEpoch?: number
}) {
  const { data: trends, error, mutate: retry } = useFunnelTrends(
    siteId,
    funnelId,
    dateRange.start,
    dateRange.end,
    filters,
    editEpoch,
  )
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const series: DayPoint[] = useMemo(() => {
    if (!trends?.dates?.length) return []
    return trends.dates.map((d, i) => {
      const rate = trends.overall[i]
      const entered = trends.entered?.[i] ?? 0
      return {
        date: new Date(d + 'T00:00:00'),
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

  const hovered = hoverIdx != null && hoverIdx < series.length ? series[hoverIdx] : null
  const ghost = series.length < 2

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
        <div className="relative" onMouseLeave={() => setHoverIdx(null)}>
          {[
            { key: 'rate' as const, rail: <FunnelRail label="Conversion" value={rails.conversion} delta={rails.conversionDelta} context={rails.conversionContext} className="h-full" /> },
            { key: 'entered' as const, rail: <FunnelRail label="Entered" value={rails.entered} delta={rails.enteredDelta} context="reached step 1" className="h-full" /> },
            { key: 'completed' as const, rail: <FunnelRail label="Completed" value={rails.completed} context={rails.completedContext} className="h-full" /> },
          ].map((row, ri) => (
            <div key={row.key} className={ri > 0 ? 'flex items-stretch border-t border-border/60' : 'flex items-stretch'}>
              <div className="w-36 shrink-0 border-r border-border/60 sm:w-44">{row.rail}</div>
              <div className="relative min-w-0 flex-1">
                {ghost ? (
                  <div className="flex items-center justify-center" style={{ height: STRIP_H }}>
                    {ri === 0 && <span className="text-xs text-neutral-600">{trends ? 'Not enough days in this range' : 'Loading…'}</span>}
                  </div>
                ) : (
                  <ParentSize debounceTime={10}>
                    {({ width }) =>
                      width > 0 ? (
                        <DayStrip width={width} series={series} kind={row.key} hoverIdx={hoverIdx} onHover={setHoverIdx} />
                      ) : null
                    }
                  </ParentSize>
                )}
              </div>
            </div>
          ))}

          {hovered && (
            <div className="pointer-events-none absolute right-3 top-2 z-10 rounded-none border border-border bg-popover px-3 py-2">
              <div className="mb-1 text-xs font-medium text-neutral-400">{formatDateShort(hovered.date)}</div>
              <div className="space-y-0.5 text-xs tabular-nums">
                <div className="flex justify-between gap-4"><span className="text-neutral-400">Conversion</span><span className="text-white">{hovered.rate != null && hovered.entered >= MIN_RATE_ENTRANTS ? `${Math.round(hovered.rate)}%` : '—'}</span></div>
                <div className="flex justify-between gap-4"><span className="text-neutral-400">Entered</span><span className="text-white">{formatNumber(hovered.entered)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-neutral-400">Completed</span><span className="text-white">{hovered.completed != null ? formatNumber(hovered.completed) : '—'}</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {!error && !ghost && (
        <div className="flex justify-between border-t border-border/60 py-1.5 pl-40 pr-4 text-[10.5px] text-neutral-500 sm:pl-48">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const i = Math.round(f * (series.length - 1))
            return <span key={f}>{formatDateShort(series[i].date)}</span>
          })}
        </div>
      )}
    </div>
  )
}

function DayStrip({
  width,
  series,
  kind,
  hoverIdx,
  onHover,
}: {
  width: number
  series: DayPoint[]
  kind: 'rate' | 'entered' | 'completed'
  hoverIdx: number | null
  onHover: (i: number | null) => void
}) {
  const innerW = width - PAD.l - PAD.r
  const padT = 10
  const padB = 8
  const innerH = STRIP_H - padT - padB

  const xScale = useMemo(
    () => scaleTime().domain([series[0].date, series[series.length - 1].date]).range([0, innerW]),
    [series, innerW],
  )
  const max = useMemo(() => {
    if (kind === 'rate') return Math.max(1e-9, ...series.map((p) => (p.entered >= MIN_RATE_ENTRANTS ? p.rate ?? 0 : 0))) * 1.12
    if (kind === 'entered') return Math.max(1, ...series.map((p) => p.entered)) * 1.12
    return Math.max(1, ...series.map((p) => p.completed ?? 0)) * 1.12
  }, [series, kind])
  const yScale = useMemo(() => scaleLinear().domain([0, max]).range([padT + innerH, padT]), [max, innerH])

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

  // Rate: days under the entrant floor or without a measurement BREAK the
  // line — a gap is a fact, a bridge is a guess.
  const segments: DayPoint[][] = []
  if (kind === 'rate') {
    let cur: DayPoint[] = []
    for (const p of series) {
      if (p.rate == null || p.entered < MIN_RATE_ENTRANTS) {
        if (cur.length > 0) segments.push(cur)
        cur = []
      } else {
        cur.push(p)
      }
    }
    if (cur.length > 0) segments.push(cur)
  }

  const barW = Math.max(2, Math.min(10, (innerW / series.length) * 0.55))
  const crossX = hoverIdx != null ? PAD.l + xScale(series[hoverIdx].date) : null

  return (
    <svg aria-hidden="true" width={width} height={STRIP_H} style={{ display: 'block' }}>
      <line x1={PAD.l} x2={width - PAD.r} y1={padT + innerH} y2={padT + innerH} stroke="var(--chart-grid, #242424)" strokeWidth={1} />
      <g transform={`translate(${PAD.l},0)`}>
        {kind === 'rate' &&
          segments.map((seg, si) => (
            <g key={si}>
              {seg.length > 1 && (
                <LinePath data={seg} x={(p) => xScale(p.date)} y={(p) => yScale(p.rate ?? 0)} curve={curveMonotoneX} stroke={INK} strokeWidth={1.3} strokeLinecap="round" />
              )}
              {seg.map((p) => (
                <circle key={p.label} cx={xScale(p.date)} cy={yScale(p.rate ?? 0)} r={2.1} fill={INK} />
              ))}
            </g>
          ))}
        {kind === 'entered' && (
          <>
            <AreaClosed data={series} x={(p) => xScale(p.date)} y={(p) => yScale(p.entered)} yScale={yScale} curve={curveMonotoneX} fill={INK_FILL} />
            <LinePath data={series} x={(p) => xScale(p.date)} y={(p) => yScale(p.entered)} curve={curveMonotoneX} stroke={INK} strokeWidth={1.3} strokeLinecap="round" />
          </>
        )}
        {kind === 'completed' &&
          series.map((p) =>
            p.completed == null || p.completed === 0 ? null : (
              <rect key={p.label} x={xScale(p.date) - barW / 2} y={yScale(p.completed)} width={barW} height={padT + innerH - yScale(p.completed)} fill={BRAND} opacity={0.85} />
            ),
          )}
      </g>
      {crossX != null && <line x1={crossX} x2={crossX} y1={padT - 4} y2={padT + innerH} stroke="#525252" strokeWidth={1} />}
      <rect x={PAD.l} y={0} width={Math.max(0, innerW)} height={STRIP_H} fill="transparent" onMouseMove={handleMove} />
    </svg>
  )
}

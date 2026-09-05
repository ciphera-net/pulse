'use client'

import { useCallback, useMemo, useState } from 'react'
import { scaleLinear, scaleTime } from 'd3-scale'
import { curveMonotoneX } from 'd3-shape'

import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils/format'
import { extractCountryCode, extractCity } from '@/lib/utils/bunnyDatacenter'
import { guardedPctChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { AreaClosed, LinePath, ParentSize, localPoint } from '@/lib/charts/primitives'
import type { BunnyOverview, BunnyRegionEntry } from '@/lib/api/bunny'

import { AnimatedNumber } from '@/components/ui/animated-number'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import {
  type CdnPoint,
  type StatusMix,
  fmtBytes,
  fmtHitRate,
  fmtOriginMs,
  cdnDayLabel,
  cdnDayLabelLong,
} from './cdnMetrics'


// * Same instrument constants as Search/Uptime — the pages are one family.
const INK = '#b3b1ad'
const INK_FILL = 'rgba(255, 255, 255, 0.045)'
const MARKER = '#FD5E0F'
const STRIP_H = 92
const PAD = { l: 8, r: 52 }
const RAIL_W = 'w-40 sm:w-48'
// * The one semantic colour on this page: errors are bad. Cache hit vs miss is
// * NOT semantic state — both draw in the neutral ink.
const NEG = '#F8836B'
const NEG_MUTED = 'rgba(248, 131, 107, 0.45)'

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

/** Hit rate compares in POINTS, not percent-of-percent. */
function PointsDelta({ cur, prev, prevBase }: { cur: number; prev: number; prevBase: number }) {
  if (prevBase < 10) return null
  const diff = cur - prev
  if (Math.abs(diff) < 0.05) {
    return <span className="text-xs tabular-nums text-neutral-500">0 pt</span>
  }
  const up = diff > 0
  return (
    <span className={`text-xs font-medium tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(diff).toFixed(1)} pt
    </span>
  )}

// ─── Metric model ────────────────────────────────────────────────

export type CdnMetricKey = 'cachedBw' | 'hitRate' | 'originBw' | 'originMs' | 'errors'

function metricOf(p: CdnPoint, key: CdnMetricKey): number | null {
  switch (key) {
    case 'cachedBw':
      return p.bandwidthCached
    case 'hitRate':
      return p.hitRate
    case 'originBw':
      return p.bandwidthOrigin
    case 'originMs':
      return p.originMs
    case 'errors':
      return p.e4xx + p.e5xx
  }
}

function fmtMetric(key: CdnMetricKey, v: number | null): string {
  if (v == null) return '—'
  switch (key) {
    case 'cachedBw':
    case 'originBw':
      return fmtBytes(v)
    case 'hitRate':
      return fmtHitRate(v)
    case 'originMs':
      return fmtOriginMs(v)
    case 'errors':
      return formatNumber(Math.round(v))
  }
}

// ─── Hover resolution (shared by both strip kinds) ───────────────

function useNearestByDate(series: CdnPoint[], innerW: number, onHover: (i: number | null) => void) {
  const xScale = useMemo(
    () =>
      series.length > 1
        ? scaleTime().domain([series[0].date, series[series.length - 1].date]).range([0, innerW])
        : null,
    [series, innerW],
  )
  const handleMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      if (!xScale) return
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
  return { xScale, handleMove }
}

// ─── Line strip (bandwidth / hit rate / latency) ─────────────────

function CdnStrip({
  width,
  series,
  metric,
  hoverIdx,
  onHover,
}: {
  width: number
  series: CdnPoint[]
  metric: CdnMetricKey
  hoverIdx: number | null
  onHover: (i: number | null) => void
}) {
  const innerW = width - PAD.l - PAD.r
  const padT = 10
  const padB = 8
  const innerH = STRIP_H - padT - padB

  const values = series.map((p) => metricOf(p, metric) ?? 0)
  const max = Math.max(1e-9, ...values) * 1.12

  const { xScale, handleMove } = useNearestByDate(series, innerW, onHover)
  const yScale = useMemo(
    () => scaleLinear().domain([0, max]).range([padT + innerH, padT]),
    [max, innerH],
  )

  if (innerW <= 0 || !xScale || series.length < 2) return null

  // * Days without a value (no requests → no hit rate; no pulls → no latency)
  // * BREAK the line — a gap is a fact, a bridge is a guess.
  const segments: CdnPoint[][] = []
  let cur: CdnPoint[] = []
  for (const p of series) {
    if (metricOf(p, metric) == null) {
      if (cur.length > 0) segments.push(cur)
      cur = []
    } else {
      cur.push(p)
    }
  }
  if (cur.length > 0) segments.push(cur)

  const hovered = hoverIdx != null ? series[hoverIdx] : null
  const hoveredValue = hovered ? metricOf(hovered, metric) : null

  return (
    <svg aria-hidden="true" width={width} height={STRIP_H} style={{ display: 'block' }}>
      <g>
        <line x1={PAD.l} x2={width - PAD.r} y1={padT} y2={padT} stroke="var(--chart-grid)" strokeWidth={1} />
        <line x1={PAD.l} x2={width - PAD.r} y1={padT + innerH} y2={padT + innerH} stroke="var(--chart-grid)" strokeWidth={1} />

        <g transform={`translate(${PAD.l},0)`}>
          {segments.map((seg, si) => (
            <g key={si}>
              {seg.length > 1 && (
                <AreaClosed
                  data={seg}
                  x={(p) => xScale(p.date)}
                  y={(p) => yScale(metricOf(p, metric) ?? 0)}
                  yScale={yScale}
                  curve={curveMonotoneX}
                  fill={INK_FILL}
                />
              )}
              {seg.length > 1 ? (
                <LinePath
                  data={seg}
                  x={(p) => xScale(p.date)}
                  y={(p) => yScale(metricOf(p, metric) ?? 0)}
                  curve={curveMonotoneX}
                  stroke={INK}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              ) : (
                // * An isolated measured day between gaps still deserves a mark.
                <circle cx={xScale(seg[0].date)} cy={yScale(metricOf(seg[0], metric) ?? 0)} r={2} fill={INK} />
              )}
            </g>
          ))}

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
          {fmtMetric(metric, max)}
        </text>
        <text x={width - PAD.r + 8} y={padT + innerH + 3} fontSize={10.5} fill="var(--chart-axis)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtMetric(metric, 0)}
        </text>

        <rect x={PAD.l} y={0} width={innerW} height={STRIP_H} fill="transparent" onMouseMove={handleMove} onMouseLeave={() => onHover(null)} />
      </g>
    </svg>
  )
}

// ─── Error bars strip (4xx muted, 5xx full — the semantic colour) ─

function CdnErrorBars({
  width,
  series,
  hoverIdx,
  onHover,
}: {
  width: number
  series: CdnPoint[]
  hoverIdx: number | null
  onHover: (i: number | null) => void
}) {
  const innerW = width - PAD.l - PAD.r
  const padT = 10
  const padB = 8
  const innerH = STRIP_H - padT - padB

  const totals = series.map((p) => p.e4xx + p.e5xx)
  const max = Math.max(1, ...totals)
  const { xScale, handleMove } = useNearestByDate(series, innerW, onHover)
  const yScale = useMemo(
    () => scaleLinear().domain([0, max * 1.12]).range([padT + innerH, padT]),
    [max, innerH],
  )

  if (innerW <= 0 || !xScale || series.length === 0) return null

  const slot = innerW / Math.max(1, series.length)
  const barW = Math.max(2, Math.min(18, slot * 0.6))
  const hovered = hoverIdx != null ? series[hoverIdx] : null

  return (
    <svg aria-hidden="true" width={width} height={STRIP_H} style={{ display: 'block' }}>
      <g>
        <line x1={PAD.l} x2={width - PAD.r} y1={padT + innerH} y2={padT + innerH} stroke="var(--chart-grid)" strokeWidth={1} />
        <g transform={`translate(${PAD.l},0)`}>
          {series.map((p, i) => {
            const x = xScale(p.date) - barW / 2
            const y4 = yScale(p.e4xx)
            const y5 = yScale(p.e4xx + p.e5xx)
            return (
              <g key={i}>
                {p.e5xx > 0 && <rect x={x} y={y5} width={barW} height={Math.max(1, y4 - y5)} fill={NEG} />}
                {p.e4xx > 0 && <rect x={x} y={y4} width={barW} height={Math.max(1, padT + innerH - y4)} fill={NEG_MUTED} />}
              </g>
            )
          })}
          {hovered && (
            <line
              x1={xScale(hovered.date)}
              x2={xScale(hovered.date)}
              y1={padT}
              y2={padT + innerH}
              stroke="var(--chart-crosshair)"
              strokeWidth={1}
              strokeDasharray="3,3"
              pointerEvents="none"
            />
          )}
        </g>
        <text x={width - PAD.r + 8} y={padT + 4} fontSize={10.5} fill="var(--chart-axis)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(max)}
        </text>
        <text x={width - PAD.r + 8} y={padT + innerH + 3} fontSize={10.5} fill="var(--chart-axis)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          0
        </text>
        <rect x={PAD.l} y={0} width={innerW} height={STRIP_H} fill="transparent" onMouseMove={handleMove} onMouseLeave={() => onHover(null)} />
      </g>
    </svg>
  )
}

// ─── Shared axis row ─────────────────────────────────────────────

function CdnXAxis({ width, series }: { width: number; series: CdnPoint[] }) {
  const innerW = width - PAD.l - PAD.r
  if (innerW <= 0 || series.length === 0) return null
  const xScale = scaleTime().domain([series[0].date, series[series.length - 1].date]).range([0, innerW])
  const n = Math.min(5, series.length)
  const ticks = n <= 1 ? [0] : Array.from({ length: n }, (_, k) => Math.round((k * (series.length - 1)) / (n - 1)))
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
          {cdnDayLabel(series[idx].date)}
        </text>
      ))}
    </svg>
  )
}

// ─── Rail (fixed rows — no toggling in the split layout) ─────────

// * Shared with CdnLiveCard — the live card's rails are the same device.
// * widthClass overrides the fixed rail width for layouts where the rails
// * must shrink (the live card's 3-across mobile grid; three fixed rails
// * would overflow the shell's overflow-x-hidden clip and be DELETED, not
// * scrolled — the 08-08 mobile-audit failure mode).
export function Rail({
  label,
  value,
  delta,
  context,
  ghost = false,
  widthClass,
  infoTip,
}: {
  label: string
  value: string | number
  delta?: React.ReactNode
  context?: React.ReactNode
  ghost?: boolean
  widthClass?: string
  /** The rail's own glyph (never inside a control — Rail is a plain div, not
   *  a toggle button, so it sits right beside the label, not behind
   *  aria-describedby). */
  infoTip?: React.ReactNode
}) {
  // * A rail showing an em dash has NO measurement this window — a delta or
  // * context line beside it would grade something that does not exist
  // * (an outage would read as a green improvement).
  const isDash = ghost || value === '—'
  return (
    <div className={cn(widthClass ?? RAIL_W, 'relative flex shrink-0 flex-col justify-center border-r border-border px-4 py-3')}>
      {!ghost && <span aria-hidden="true" className="absolute bottom-0 left-0 top-0 w-[2px] bg-brand-orange" />}
      <span className="flex items-center gap-1 text-sm text-neutral-400">
        {label}
        {infoTip}
      </span>
      {ghost ? (
        <span className="mt-0.5 text-xl font-semibold tabular-nums text-neutral-600">—</span>
      ) : typeof value === 'number' ? (
        <AnimatedNumber value={value} format={(v) => formatNumber(Math.round(v))} className="mt-0.5 text-xl font-semibold tabular-nums text-white" />
      ) : (
        <span className="mt-0.5 text-xl font-semibold tabular-nums text-white">{value}</span>
      )}
      {!isDash && delta}
      {!isDash && context && <span className="mt-0.5 text-xs text-neutral-500">{context}</span>}
    </div>
  )
}

interface RowSpec {
  key: CdnMetricKey
  rail: React.ReactNode
  kind: 'line' | 'bars'
}

function MetricRows({
  rows,
  series,
  hoverIdx,
  setHoverIdx,
  ghost,
  emptyText,
}: {
  rows: RowSpec[]
  series: CdnPoint[]
  hoverIdx: number | null
  setHoverIdx: (i: number | null) => void
  ghost: boolean
  emptyText?: string
}) {
  return (
    <>
      {rows.map((row, ri) => (
        <div key={row.key} className={cn('flex items-stretch', ri > 0 && 'border-t border-border')}>
          {row.rail}
          <div className="relative min-w-0 flex-1">
            {ghost || series.length < 2 ? (
              <div className="flex h-full min-h-[92px] items-center justify-center">
                {ri === 0 && emptyText ? <p className="text-xs text-neutral-500">{emptyText}</p> : null}
              </div>
            ) : (
              <ParentSize debounceTime={10}>
                {({ width }) =>
                  width > 0 ? (
                    row.kind === 'bars' ? (
                      <CdnErrorBars width={width} series={series} hoverIdx={hoverIdx} onHover={setHoverIdx} />
                    ) : (
                      <CdnStrip width={width} series={series} metric={row.key} hoverIdx={hoverIdx} onHover={setHoverIdx} />
                    )
                  ) : null
                }
              </ParentSize>
            )}
          </div>
        </div>
      ))}
    </>
  )
}

// ─── Per-card tooltip ────────────────────────────────────────────

function CardTooltip({ point, rows }: { point: CdnPoint; rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
      <div className="min-w-[170px] rounded-none border border-border bg-popover px-3 py-2.5 text-white">
        <div className="mb-2 text-xs font-medium text-neutral-400">{cdnDayLabelLong(point.date)} · UTC</div>
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-4">
              <span className="text-sm text-neutral-400">{r.label}</span>
              <span className="text-sm font-medium tabular-nums text-white">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Region list + map (the Edge card's lower section) ───────────

function RegionRows({ regions, total }: { regions: BunnyRegionEntry[]; total: number }) {
  return (
    <div>
      {regions.slice(0, 6).map((r) => {
        const share = total > 0 ? r.bandwidth / total : 0
        const code = extractCountryCode(r.region)
        return (
          <div key={r.region} className="relative flex items-center justify-between px-4 py-1.5 text-sm">
            <span
              aria-hidden="true"
              className="absolute bottom-0.5 left-0 top-0.5 rounded-none bg-white/[0.04]"
              style={{ width: `${Math.min(1, share) * 100}%` }}
            />
            <span className="relative flex min-w-0 items-center gap-2 text-neutral-300">
              <CountryFlag code={code} className="h-3.5 w-5 shrink-0 rounded-none" fallback={<span className="w-5" />} />
              <span className="truncate">{extractCity(r.region)}</span>
            </span>
            <span className="relative shrink-0 tabular-nums text-neutral-400">
              {fmtBytes(r.bandwidth)} <span className="text-xs text-neutral-600">{(share * 100).toFixed(1)}%</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Status band (the rebuilt error-types block, B4c) ────────────

function StatusBand({ mix }: { mix: StatusMix }) {
  if (mix.total <= 0) return null
  const segs = [
    { k: '2xx', v: mix.c2xx, color: 'rgba(255,255,255,0.14)', text: 'text-neutral-400' },
    { k: '3xx', v: mix.c3xx, color: 'rgba(255,255,255,0.06)', text: 'text-neutral-500' },
    { k: '4xx', v: mix.c4xx, color: NEG_MUTED, text: 'text-red-400' },
    { k: '5xx', v: mix.c5xx, color: NEG, text: 'text-red-400' },
  ]
  return (
    <div className="border-t border-border px-4 py-3">
      <div className="flex h-2 w-full">
        {segs.map((s) => {
          const pct = (s.v / mix.total) * 100
          if (s.v <= 0) return null
          return <div key={s.k} style={{ width: `${Math.max(pct, 0.2)}%`, background: s.color }} />
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {segs.map((s) => {
            const pct = (s.v / mix.total) * 100
            return (
              <span key={s.k} className={s.text}>
                {s.k} <span className="tabular-nums">{pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%</span>{' '}
                <span className="tabular-nums text-neutral-600">{formatNumber(s.v)}</span>
              </span>
            )
          })}
        </div>
        <span className="flex items-center gap-1 text-neutral-600">
          of {formatNumber(mix.total)} responses
          <TermInfoTip term="cdn_status_band" />
        </span>
      </div>
    </div>
  )
}

// ─── Origin ledger (recent days, newest first) ───────────────────

function OriginLedger({ series }: { series: CdnPoint[] }) {
  const recent = useMemo(() => [...series].reverse().slice(0, 10), [series])
  if (recent.length === 0) return null
  return (
    <div className="border-t border-border">
      <div className="flex items-center px-4 pb-1 pt-3 text-xs uppercase tracking-wider text-neutral-500">
        <span className="w-[88px]">Day (UTC)</span>
        <span className="flex-1 text-right">Origin</span>
        <span className="flex-1 text-right">Latency</span>
        <span className="flex-1 text-right">Errors</span>
      </div>
      {recent.map((p) => {
        const errs = p.e4xx + p.e5xx
        return (
          <div key={p.date.toISOString()} className="flex items-center border-t border-white/[0.03] px-4 py-1.5 text-sm">
            <span className="w-[88px] tabular-nums text-neutral-400">{cdnDayLabel(p.date)}</span>
            <span className="flex-1 text-right tabular-nums text-neutral-300">{fmtBytes(p.bandwidthOrigin)}</span>
            <span className="flex-1 text-right tabular-nums text-neutral-400">{fmtOriginMs(p.originMs)}</span>
            <span className={cn('flex-1 text-right tabular-nums', errs > 0 ? 'text-red-400' : 'text-neutral-600')}>
              {formatNumber(errs)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── The two cards ───────────────────────────────────────────────

interface CardShellProps {
  title: string
  subtitle: string
  children: React.ReactNode
}

function CardShell({ title, subtitle, children }: CardShellProps) {
  return (
    <div className="relative min-w-0 flex-1 rounded-none border border-border bg-card">
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-3">
        <span className="text-sm font-medium text-neutral-200">{title}</span>
        <span className="truncate text-xs text-neutral-500">{subtitle}</span>
      </div>
      {children}
    </div>
  )
}

function AxisRow({ series, ghost }: { series: CdnPoint[]; ghost: boolean }) {
  return (
    <div className="flex border-t border-border">
      <div className={cn(RAIL_W, 'shrink-0 border-r border-border')} />
      <div className="h-7 min-w-0 flex-1 py-1">
        {!ghost && series.length > 0 && (
          <ParentSize debounceTime={10}>
            {({ width }) => (width > 0 ? <CdnXAxis width={width} series={series} /> : null)}
          </ParentSize>
        )}
      </div>
    </div>
  )
}

export interface CdnCardsProps {
  series: CdnPoint[]
  overview: BunnyOverview | undefined
  regions: BunnyRegionEntry[] | undefined
  regionsTotal: number
  regionsError: boolean
  onRetryRegions: () => void
  mix: StatusMix
  /** Ghost mode: not-connected — rails em-dash, strips blank. */
  ghost?: boolean
  /** Range loaded but holds no rows. */
  empty?: boolean
}

export function EdgeCard({ series, overview, regions, regionsTotal, regionsError, onRetryRegions, ghost = false, empty = false }: CdnCardsProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const railGhost = ghost || empty

  const sumCached = useMemo(() => series.reduce((a, p) => a + p.bandwidthCached, 0), [series])
  const sumBw = useMemo(() => series.reduce((a, p) => a + p.bandwidth, 0), [series])
  const sumReq = useMemo(() => series.reduce((a, p) => a + p.requests, 0), [series])
  const sumReqCached = useMemo(() => series.reduce((a, p) => a + p.requestsCached, 0), [series])
  const hitRate = sumReq > 0 ? (sumReqCached / sumReq) * 100 : null
  const cachedShare = sumBw > 0 ? Math.round((sumCached / sumBw) * 100) : null

  const rows: RowSpec[] = [
    {
      key: 'cachedBw',
      kind: 'line',
      rail: (
        <Rail
          label="Served from cache"
          value={fmtBytes(sumCached)}
          ghost={railGhost}
          infoTip={<TermInfoTip term="cdn_served_from_cache" />}
          delta={
            overview ? (
              <DeltaBadge change={guardedPctChange(overview.total_bandwidth_cached, overview.prev_total_bandwidth_cached, overview.prev_total_requests)} />
            ) : null
          }
          context={
            cachedShare != null ? (
              <span className="inline-flex items-center gap-1">
                {cachedShare}% of all bandwidth
                <TermInfoTip term="cdn_bandwidth_total" />
              </span>
            ) : undefined
          }
        />
      ),
    },
    {
      key: 'hitRate',
      kind: 'line',
      rail: (
        <Rail
          label="Cache hit rate"
          value={fmtHitRate(hitRate)}
          ghost={railGhost}
          infoTip={<TermInfoTip term="cdn_cache_hit_rate" />}
          delta={overview ? <PointsDelta cur={overview.cache_hit_rate} prev={overview.prev_cache_hit_rate} prevBase={overview.prev_total_requests} /> : null}
          context={sumReq > 0 ? `${formatNumber(sumReqCached)} of ${formatNumber(sumReq)} requests` : undefined}
        />
      ),
    },
  ]

  const hovered = hoverIdx != null && hoverIdx < series.length ? series[hoverIdx] : null

  return (
    <CardShell title="Edge" subtitle="what Bunny absorbed">
      <MetricRows rows={rows} series={series} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} ghost={ghost} emptyText={empty ? 'No data in this range' : undefined} />
      <AxisRow series={series} ghost={ghost} />

      {/* Served from — the live edge-region distribution. */}
      <div className="border-t border-border">
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <span className="flex items-center gap-1 text-sm font-medium text-neutral-200">
            Served from
            <TermInfoTip term="cdn_served_from_regions" />
          </span>
          <span className="truncate text-xs text-neutral-500">bandwidth by Bunny edge region · selected range</span>
        </div>
        {ghost ? (
          <div className="flex h-40 items-center justify-center">
            <span className="text-xs text-neutral-600">—</span>
          </div>
        ) : regionsError ? (
          <div className="flex items-center justify-center py-6">
            <ErrorCard title="Couldn't load edge regions" onRetry={onRetryRegions} className="py-2" />
          </div>
        ) : regions == null ? (
          <div className="flex h-40 items-center justify-center">
            <span className="text-xs text-neutral-600">Loading regions…</span>
          </div>
        ) : regions.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <span className="text-xs text-neutral-600">No traffic in this range</span>
          </div>
        ) : (
          <RegionRows regions={regions} total={regionsTotal} />
        )}
      </div>

      {hovered && (
        <CardTooltip
          point={hovered}
          rows={[
            { label: 'Served from cache', value: fmtBytes(hovered.bandwidthCached) },
            { label: 'Total bandwidth', value: fmtBytes(hovered.bandwidth) },
            { label: 'Cache hit rate', value: fmtHitRate(hovered.hitRate) },
          ]}
        />
      )}
    </CardShell>
  )
}

export function OriginCard({ series, overview, mix, ghost = false, empty = false }: CdnCardsProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const railGhost = ghost || empty

  const sumOrigin = useMemo(() => series.reduce((a, p) => a + p.bandwidthOrigin, 0), [series])
  const sumErr = useMemo(() => series.reduce((a, p) => a + p.e4xx + p.e5xx, 0), [series])
  const sum5xx = useMemo(() => series.reduce((a, p) => a + p.e5xx, 0), [series])
  const measured = series.filter((p) => p.originMs != null)
  const avgMs = measured.length > 0 ? measured.reduce((a, p) => a + (p.originMs ?? 0), 0) / measured.length : null

  const prevOrigin = overview ? Math.max(0, overview.prev_total_bandwidth - overview.prev_total_bandwidth_cached) : 0

  const rows: RowSpec[] = [
    {
      key: 'originBw',
      kind: 'line',
      rail: (
        <Rail
          label="Origin traffic"
          value={fmtBytes(sumOrigin)}
          ghost={railGhost}
          infoTip={<TermInfoTip term="cdn_origin_traffic" />}
          delta={overview ? <DeltaBadge change={guardedPctChange(sumOrigin, prevOrigin, overview.prev_total_requests)} invert /> : null}
          context="left the origin"
        />
      ),
    },
    {
      key: 'originMs',
      kind: 'line',
      rail: (
        <Rail
          label="Origin latency"
          value={fmtOriginMs(avgMs)}
          ghost={railGhost}
          infoTip={<TermInfoTip term="cdn_origin_latency" />}
          delta={
            overview ? (
              <DeltaBadge change={guardedPctChange(overview.avg_origin_response, overview.prev_avg_origin_response, overview.prev_total_requests)} invert />
            ) : null
          }
          context="daily average"
        />
      ),
    },
    {
      key: 'errors',
      kind: 'bars',
      rail: (
        <Rail
          label="Errors"
          value={railGhost ? '—' : formatNumber(sumErr)}
          ghost={railGhost}
          infoTip={<TermInfoTip term="cdn_errors" />}
          delta={overview ? <DeltaBadge change={guardedPctChange(overview.total_errors, overview.prev_total_errors, overview.prev_total_requests)} invert /> : null}
          context={sum5xx > 0 ? `${formatNumber(sum5xx)} × 5xx` : '4xx and 5xx'}
        />
      ),
    },
  ]

  const hovered = hoverIdx != null && hoverIdx < series.length ? series[hoverIdx] : null

  return (
    <CardShell title="Origin" subtitle="what got through to you">
      <MetricRows rows={rows} series={series} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} ghost={ghost} emptyText={empty ? 'No data in this range' : undefined} />
      <AxisRow series={series} ghost={ghost} />
      {!ghost && series.length > 0 && <StatusBand mix={mix} />}
      {!ghost && <OriginLedger series={series} />}

      {hovered && (
        <CardTooltip
          point={hovered}
          rows={[
            { label: 'Origin traffic', value: fmtBytes(hovered.bandwidthOrigin) },
            { label: 'Origin latency', value: fmtOriginMs(hovered.originMs) },
            { label: '4xx', value: formatNumber(hovered.e4xx) },
            { label: '5xx', value: formatNumber(hovered.e5xx) },
            { label: '3xx redirects', value: formatNumber(hovered.e3xx) },
          ]}
        />
      )}
    </CardShell>
  )
}

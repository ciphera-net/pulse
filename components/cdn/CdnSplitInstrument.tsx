'use client'

import { useCallback, useMemo } from 'react'
import { curveLinear } from 'd3-shape'

import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils/format'
import { extractCountryCode, extractCity } from '@/lib/utils/bunnyDatacenter'
import { guardedPctChange, type PctChangeResult } from '@/lib/utils/pctChange'
import type { BunnyOverview, BunnyRegionEntry } from '@/lib/api/bunny'

import { AnimatedNumber } from '@/components/ui/animated-number'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { AreaChart, Area, Grid, YAxis, ChartTooltip, ChartCrosshair } from '@/components/ui/area-chart'
import { ChartStack, ChartStackAxis, useChartStack, STRIP_INK, STRIP_MARKER } from '@/components/ui/chart-stack'
import {
  type CdnPoint,
  type StatusMix,
  fmtBytes,
  fmtHitRate,
  fmtOriginMs,
  cdnDayLabel,
  cdnDayLabelLong,
} from './cdnMetrics'

// ---------------------------------------------------------------------------
// The CDN split instrument — Edge (what Bunny absorbed) beside Origin (what got
// through), each a rail of metrics beside a stack of strips. Since the
// chart-consistency round (05-09-2026, owner pick B) every LINE strip is the
// dashboard's chart at strip height and the two cards share ONE cursor and the
// dashboard's card; the errors row keeps its stacked 4xx/5xx bars (the one
// semantic colour on the page — cache hit vs miss is NOT semantic state) and
// reads the same cursor through the stack.
//
// Data facts the strips honour: days are BUNNY's UTC days; a day without a
// value (no requests → no hit rate; no pulls → no latency) BREAKS the line — a
// gap is a fact, a bridge is a guess; there is no Today preset on this page,
// so no strip ever carries an in-progress tail.
// ---------------------------------------------------------------------------

const STRIP_H = 92
const STRIP_MARGIN = { top: 8, right: 16, bottom: 6, left: 56 }
const RAIL_W = 'w-40 sm:w-48'
// * The one semantic colour on this page: errors are bad.
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

/** The stack's members read flat keys; CdnPoint carries the metrics by name. */
type StripRow = Record<string, unknown> & { date: Date; cachedBw: number | null; hitRate: number | null; originBw: number | null; originMs: number | null }

function toStripRows(series: CdnPoint[]): StripRow[] {
  return series.map((p) => ({
    ...p,
    cachedBw: p.bandwidthCached,
    hitRate: p.hitRate,
    originBw: p.bandwidthOrigin,
    originMs: p.originMs,
  }))
}

// ─── Line strip: the instrument at strip height ──────────────────

function CdnStrip({ series, metric }: { series: StripRow[]; metric: Exclude<CdnMetricKey, 'errors'> }) {
  const { hoverIndex, setHoverIndex } = useChartStack()
  return (
    <div style={{ height: STRIP_H }}>
      <AreaChart
        animationDuration={400}
        data={series}
        fillParent
        hoverIndex={hoverIndex}
        margin={STRIP_MARGIN}
        onHoverChange={setHoverIndex}
        xDataKey="date"
        yCap={metric === 'hitRate' ? 100 : undefined}
      >
        <Grid horizontal numTicksRows={3} stroke="var(--chart-grid)" vertical={false} />
        <Area
          // A day without a value BREAKS the line — a gap is a fact, a bridge
          // is a guess. An isolated measured day between gaps keeps a mark.
          breakAtMissing
          curve={curveLinear}
          dataKey={metric}
          fadeStrokeEdges={false}
          fill={STRIP_INK}
          fillOpacity={0.15}
          gradientToOpacity={0}
          stroke={STRIP_INK}
          dotColor={STRIP_MARKER}
          strokeWidth={2}
        />
        <YAxis formatValue={(v) => fmtMetric(metric, v)} numTicks={3} />
        <ChartTooltip showCard={false} showDatePill={false} />
      </AreaChart>
    </div>
  )
}

// ─── Error bars strip (4xx muted, 5xx full — the semantic colour) ─
//
// A hand-rolled member: the instrument has no bar mark, so the bars stay and
// the strip reads the stack's scale, cursor and hover — same crosshair, same
// snap, same card as every line strip.

function CdnErrorBars({ series }: { series: CdnPoint[] }) {
  const { xScale, margin, innerWidth, hoverIndex, setHoverIndex, resolveIndex } = useChartStack()
  const padT = margin.top
  const innerH = STRIP_H - margin.top - margin.bottom

  const totals = series.map((p) => p.e4xx + p.e5xx)
  const max = Math.max(1, ...totals)
  const top = max * 1.12
  const y = (v: number) => padT + innerH - (v / top) * innerH

  const handleMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      setHoverIndex(resolveIndex(event.clientX - rect.left))
    },
    [resolveIndex, setHoverIndex],
  )

  if (innerWidth <= 0 || series.length === 0) return null

  const slot = innerWidth / Math.max(1, series.length)
  const barW = Math.max(2, Math.min(18, slot * 0.6))
  const hovered = hoverIndex != null ? series[hoverIndex] : null

  return (
    <div className="relative" style={{ height: STRIP_H }}>
      <svg aria-hidden="true" height={STRIP_H} style={{ display: 'block' }} width="100%">
        <g transform={`translate(${margin.left},0)`}>
          <line stroke="var(--chart-grid)" strokeWidth={1} x1={0} x2={innerWidth} y1={padT + innerH} y2={padT + innerH} />
          {series.map((p, i) => {
            const x = (xScale(p.date) ?? 0) - barW / 2
            const y4 = y(p.e4xx)
            const y5 = y(p.e4xx + p.e5xx)
            const lit = hoverIndex === null || hoverIndex === i
            return (
              <g key={i} opacity={lit ? 1 : 0.6}>
                {p.e5xx > 0 && <rect fill={NEG} height={Math.max(1, y4 - y5)} width={barW} x={x} y={y5} />}
                {p.e4xx > 0 && <rect fill={NEG_MUTED} height={Math.max(1, padT + innerH - y4)} width={barW} x={x} y={y4} />}
              </g>
            )
          })}
          <g transform={`translate(0,${padT})`}>
            <ChartCrosshair height={innerH} visible={hovered != null} x={hovered ? (xScale(hovered.date) ?? 0) : 0} />
          </g>
          <rect
            fill="transparent"
            style={{ cursor: 'none' }}
            height={STRIP_H}
            onMouseLeave={() => setHoverIndex(null)}
            onMouseMove={handleMove}
            width={innerWidth}
            x={0}
            y={-padT}
          />
        </g>
      </svg>
      {/* y labels in the instrument's chrome, same gutter as the line strips */}
      {[top, 0].map((v) => (
        <div
          className="pointer-events-none absolute flex justify-end"
          key={v}
          style={{ left: 0, top: y(v), width: margin.left - 8, transform: 'translateY(-50%)' }}
        >
          <span className="whitespace-nowrap text-neutral-500 text-xs tabular-nums">{formatNumber(Math.round(v))}</span>
        </div>
      ))}
    </div>
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

function MetricRows({ rows, series, stripRows, ghost, emptyText }: { rows: RowSpec[]; series: CdnPoint[]; stripRows: StripRow[]; ghost: boolean; emptyText?: string }) {
  return (
    <>
      {rows.map((row, ri) => (
        <div key={row.key} className={cn('flex items-stretch', ri > 0 && 'border-t border-border')}>
          {/* The first rail is the stack's measured rail column. */}
          <div className="flex shrink-0" {...(ri === 0 ? { 'data-chart-stack-rail': '' } : {})}>
            {row.rail}
          </div>
          <div className="relative min-w-0 flex-1">
            {ghost || series.length < 2 ? (
              <div className="flex h-full min-h-[92px] items-center justify-center">
                {ri === 0 && emptyText ? <p className="text-xs text-neutral-500">{emptyText}</p> : null}
              </div>
            ) : row.kind === 'bars' ? (
              <CdnErrorBars series={series} />
            ) : (
              <CdnStrip metric={row.key as Exclude<CdnMetricKey, 'errors'>} series={stripRows} />
            )}
          </div>
        </div>
      ))}
    </>
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
      <div className="min-w-0 flex-1">
        {!ghost && series.length > 0 && <ChartStackAxis formatLabel={cdnDayLabel} numTicks={8} />}
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

// * Edge and Origin are INDEPENDENT instruments (owner ruling 06-09-2026, reversing
// * Train 5's "one cursor for both cards"): hovering one card lights nothing on the
// * other. Each card's ChartStack owns its own hover index.

const cardTitle = (p: Record<string, unknown>) => `${cdnDayLabelLong(p.date as Date)} · UTC`

export function EdgeCard({ series, overview, regions, regionsTotal, regionsError, onRetryRegions, ghost = false, empty = false }: CdnCardsProps) {
  const railGhost = ghost || empty
  const stripRows = useMemo(() => toStripRows(series), [series])

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

  const cardRows = useCallback((p: Record<string, unknown>) => {
    const h = p as unknown as CdnPoint
    return [
      { color: 'var(--chart-1)', label: 'Served from cache', value: fmtBytes(h.bandwidthCached) },
      { color: 'var(--chart-1)', label: 'Total bandwidth', value: fmtBytes(h.bandwidth) },
      { color: 'var(--chart-1)', label: 'Cache hit rate', value: fmtHitRate(h.hitRate) },
    ]
  }, [])

  return (
    <CardShell title="Edge" subtitle="what Bunny absorbed">
      <ChartStack data={stripRows} margin={STRIP_MARGIN} resetKey={series} rows={cardRows} title={cardTitle} xDataKey="date">
        <MetricRows rows={rows} series={series} stripRows={stripRows} ghost={ghost} emptyText={empty ? 'No data in this range' : undefined} />
        <AxisRow series={series} ghost={ghost} />
      </ChartStack>

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
    </CardShell>
  )
}

export function OriginCard({ series, overview, mix, ghost = false, empty = false }: CdnCardsProps) {
  const railGhost = ghost || empty
  const stripRows = useMemo(() => toStripRows(series), [series])

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

  const cardRows = useCallback((p: Record<string, unknown>) => {
    const h = p as unknown as CdnPoint
    return [
      { color: 'var(--chart-1)', label: 'Origin traffic', value: fmtBytes(h.bandwidthOrigin) },
      { color: 'var(--chart-1)', label: 'Origin latency', value: fmtOriginMs(h.originMs) },
      { color: NEG_MUTED, label: '4xx', value: formatNumber(h.e4xx) },
      { color: NEG, label: '5xx', value: formatNumber(h.e5xx) },
      { color: 'var(--chart-foreground-muted)', label: '3xx redirects', value: formatNumber(h.e3xx) },
    ]
  }, [])

  return (
    <CardShell title="Origin" subtitle="what got through to you">
      <ChartStack data={stripRows} margin={STRIP_MARGIN} resetKey={series} rows={cardRows} title={cardTitle} xDataKey="date">
        <MetricRows rows={rows} series={series} stripRows={stripRows} ghost={ghost} emptyText={empty ? 'No data in this range' : undefined} />
        <AxisRow series={series} ghost={ghost} />
      </ChartStack>
      {!ghost && series.length > 0 && <StatusBand mix={mix} />}
      {!ghost && <OriginLedger series={series} />}
    </CardShell>
  )
}

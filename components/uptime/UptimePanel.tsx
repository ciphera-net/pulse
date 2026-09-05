'use client'

import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQueryParamsWriter } from '@/lib/hooks/useQueryParamsWriter'
import { shiftDayKey } from '@/lib/utils/siteTime'
import { scaleLinear, scaleTime } from 'd3-scale'
import { curveMonotoneX } from 'd3-shape'
import { AreaClosed, LinePath, ParentSize, localPoint } from '@/lib/charts/primitives'
import { useUptimeResponseTimes } from '@/lib/swr/dashboard'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { cn } from '@/lib/utils'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { TERMS, UPTIME_TERM } from '@/lib/dashboard/terms'
import type { UptimeIncident, UptimeMonitor } from '@/lib/api/uptime'
import {
  UPTIME_METRIC_ORDER,
  UPTIME_METRIC_LABEL,
  UPTIME_POS,
  UPTIME_NEG,
  UPTIME_DEGRADED,
  parseUptimeMetrics,
  serializeUptimeMetrics,
  toUptimeSeries,
  seriesUptimePct,
  seriesSpansMultipleDays,
  totalDowntimeSeconds,
  rangeWindowMs,
  fmtMs,
  fmtUptimePct,
  fmtDurationSeconds,
  bucketLabel,
  type UptimeMetricKey,
  type UptimePoint,
} from './uptimeMetrics'

// ---------------------------------------------------------------------------
// The uptime instrument — the Search panel grammar applied to availability.
// Each metric is a row: rail (label + period value) beside a strip on its own
// honest scale. Availability draws as per-bucket state bars — pos/neg is
// SEMANTIC here (up/down state), not decoration — while response time and
// checks stay in the one neutral ink. One crosshair runs through every strip.
// All bucketing is the server's (hour or day, echoed); days/hours are the
// SITE's timezone (22-08-2026 alignment, superseding decision D5).
// ---------------------------------------------------------------------------

const INK = '#b3b1ad'
const INK_FILL = 'rgba(255, 255, 255, 0.045)'
const MARKER = '#FD5E0F'
const POS = UPTIME_POS
const NEG = UPTIME_NEG
const DEGRADED = UPTIME_DEGRADED
const STRIP_H = 92
const PAD = { l: 8, r: 52 }
const RAIL_W = 'w-40 sm:w-48'

interface UptimePanelProps {
  siteId: string
  monitor: UptimeMonitor
  dateRange: { start: string; end: string }
  incidents: UptimeIncident[] | undefined
  /** The SITE's IANA timezone — every bucket, label and clip window speaks it. */
  timezone: string | null
  /** Newest 'utc'-basis rollup date in range (pre-conversion days whose raw
   * checks are purged), or null when the whole range is site-day rows. */
  utcDaysBefore?: string | null
}

// ─── Shared x placement ──────────────────────────────────────────

function useXScale(series: UptimePoint[], innerW: number) {
  return useMemo(
    () => scaleTime().domain([series[0].date, series[series.length - 1].date]).range([0, innerW]),
    [series, innerW],
  )
}

function nearestIdx(series: UptimePoint[], t: number): number {
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < series.length; i++) {
    const d = Math.abs(series[i].date.getTime() - t)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

// ─── Availability strip: one state bar per bucket ────────────────

function AvailabilityStrip({
  width,
  series,
  hoverIdx,
  onHover,
}: {
  width: number
  series: UptimePoint[]
  hoverIdx: number | null
  onHover: (i: number | null) => void
}) {
  const innerW = width - PAD.l - PAD.r
  const xScale = useXScale(series, innerW)
  if (innerW <= 0) return null

  const barH = 56
  const barY = (STRIP_H - barH) / 2
  // * Bars sit at the same time positions the line strips use, so the shared
  // * crosshair lands on the same bucket in every strip. The width cap scales
  // * with bucket count: 91 day-slots stay slim, 24 hour-slots read solid.
  const slot = series.length > 1 ? innerW / (series.length - 1) : innerW
  const barW = Math.max(2, Math.min(series.length <= 40 ? 22 : 10, slot * 0.72))

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const point = localPoint(event)
    if (!point) return
    onHover(nearestIdx(series, xScale.invert(point.x - PAD.l).getTime()))
  }

  return (
    <svg aria-hidden="true" width={width} height={STRIP_H} style={{ display: 'block' }}>
      <line x1={PAD.l} x2={width - PAD.r} y1={barY + barH} y2={barY + barH} stroke="var(--chart-grid)" strokeWidth={1} />
      <g transform={`translate(${PAD.l},0)`}>
        {series.map((p, i) => {
          const color = p.samples === 0 ? 'var(--chart-grid)' : p.failed > 0 ? NEG : p.degraded > 0 ? DEGRADED : POS
          const opacity = p.samples === 0 ? 1 : p.failed > 0 || p.degraded > 0 ? 1 : 0.75
          return (
            <rect
              key={p.date.getTime()}
              x={xScale(p.date) - barW / 2}
              y={barY}
              width={barW}
              height={barH}
              fill={color}
              opacity={hoverIdx === i ? 1 : opacity}
            />
          )
        })}
        {hoverIdx != null && series[hoverIdx] && (
          <line
            x1={xScale(series[hoverIdx].date)}
            x2={xScale(series[hoverIdx].date)}
            y1={barY - 6}
            y2={barY + barH + 6}
            stroke="var(--chart-crosshair)"
            strokeWidth={1}
            strokeDasharray="3,3"
            pointerEvents="none"
          />
        )}
      </g>
      <rect x={PAD.l} y={0} width={innerW} height={STRIP_H} fill="transparent" onMouseMove={handleMove} onMouseLeave={() => onHover(null)} />
    </svg>
  )
}

// ─── Response-time strip: neutral ink line, optional p95 trace ───

function ResponseStrip({
  width,
  series,
  hoverIdx,
  onHover,
}: {
  width: number
  series: UptimePoint[]
  hoverIdx: number | null
  onHover: (i: number | null) => void
}) {
  const innerW = width - PAD.l - PAD.r
  const padT = 10
  const padB = 8
  const innerH = STRIP_H - padT - padB
  const xScale = useXScale(series, innerW)

  // * The line breaks over buckets with no timed samples (a full-outage hour)
  // * instead of bridging them — a straight stroke across an outage is drawn
  // * data that never existed. Consecutive timed points form segments.
  const segments = useMemo(() => {
    const out: UptimePoint[][] = []
    let run: UptimePoint[] = []
    for (const p of series) {
      if (p.avgMs != null) {
        run.push(p)
      } else if (run.length > 0) {
        out.push(run)
        run = []
      }
    }
    if (run.length > 0) out.push(run)
    return out
  }, [series])
  const hasP95 = series.some((p) => p.p95Ms != null)
  const max = Math.max(1e-9, ...series.map((p) => Math.max(p.avgMs ?? 0, p.p95Ms ?? 0))) * 1.12
  const yScale = useMemo(() => scaleLinear().domain([0, max]).range([padT + innerH, padT]), [max, innerH])

  const handleMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(event)
      if (!point) return
      onHover(nearestIdx(series, xScale.invert(point.x - PAD.l).getTime()))
    },
    [xScale, series, onHover],
  )

  if (innerW <= 0) return null
  const hovered = hoverIdx != null ? series[hoverIdx] : null

  return (
    <svg aria-hidden="true" width={width} height={STRIP_H} style={{ display: 'block' }}>
      <line x1={PAD.l} x2={width - PAD.r} y1={padT} y2={padT} stroke="var(--chart-grid)" strokeWidth={1} />
      <line x1={PAD.l} x2={width - PAD.r} y1={padT + innerH} y2={padT + innerH} stroke="var(--chart-grid)" strokeWidth={1} />
      <g transform={`translate(${PAD.l},0)`}>
        {segments.map((seg) =>
          seg.length > 1 ? (
            <g key={seg[0].date.getTime()}>
              <AreaClosed
                data={seg}
                x={(p) => xScale(p.date)}
                y={(p) => yScale(p.avgMs as number)}
                yScale={yScale}
                curve={curveMonotoneX}
                fill={INK_FILL}
              />
              <LinePath
                data={seg}
                x={(p) => xScale(p.date)}
                y={(p) => yScale(p.avgMs as number)}
                curve={curveMonotoneX}
                stroke={INK}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            </g>
          ) : (
            // * An isolated timed bucket between gaps still deserves a mark.
            <circle
              key={seg[0].date.getTime()}
              cx={xScale(seg[0].date)}
              cy={yScale(seg[0].avgMs as number)}
              r={1.5}
              fill={INK}
            />
          ),
        )}
        {/* p95 as a second, quieter trace — only where the server has it */}
        {hasP95 && (
          <LinePath
            data={series.filter((p) => p.p95Ms != null)}
            x={(p) => xScale(p.date)}
            y={(p) => yScale(p.p95Ms as number)}
            curve={curveMonotoneX}
            stroke={INK}
            strokeWidth={1}
            strokeOpacity={0.35}
            strokeDasharray="2,3"
          />
        )}
        {hovered && hovered.avgMs != null && (
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
            <circle cx={xScale(hovered.date)} cy={yScale(hovered.avgMs)} r={3.5} fill={MARKER} stroke="var(--chart-background)" strokeWidth={2} />
          </g>
        )}
      </g>
      <text x={width - PAD.r + 8} y={padT + 4} fontSize={10.5} fill="var(--chart-axis)" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {fmtMs(max)}
      </text>
      <text x={width - PAD.r + 8} y={padT + innerH + 3} fontSize={10.5} fill="var(--chart-axis)" style={{ fontVariantNumeric: 'tabular-nums' }}>
        0
      </text>
      <rect x={PAD.l} y={0} width={innerW} height={STRIP_H} fill="transparent" onMouseMove={handleMove} onMouseLeave={() => onHover(null)} />
    </svg>
  )
}

// ─── Checks strip: sample-count bars in neutral ink ──────────────

function ChecksStrip({
  width,
  series,
  hoverIdx,
  onHover,
}: {
  width: number
  series: UptimePoint[]
  hoverIdx: number | null
  onHover: (i: number | null) => void
}) {
  const innerW = width - PAD.l - PAD.r
  const padT = 10
  const padB = 8
  const innerH = STRIP_H - padT - padB
  const xScale = useXScale(series, innerW)
  if (innerW <= 0) return null

  const max = Math.max(1, ...series.map((p) => p.samples))
  const slot = series.length > 1 ? innerW / (series.length - 1) : innerW
  const barW = Math.max(2, Math.min(10, slot * 0.72))

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const point = localPoint(event)
    if (!point) return
    onHover(nearestIdx(series, xScale.invert(point.x - PAD.l).getTime()))
  }

  return (
    <svg aria-hidden="true" width={width} height={STRIP_H} style={{ display: 'block' }}>
      <line x1={PAD.l} x2={width - PAD.r} y1={padT + innerH} y2={padT + innerH} stroke="var(--chart-grid)" strokeWidth={1} />
      <g transform={`translate(${PAD.l},0)`}>
        {series.map((p, i) => {
          const h = (p.samples / max) * innerH
          return (
            <rect
              key={p.date.getTime()}
              x={xScale(p.date) - barW / 2}
              y={padT + innerH - h}
              width={barW}
              height={h}
              fill={INK}
              opacity={hoverIdx === i ? 0.7 : 0.35}
            />
          )
        })}
        {hoverIdx != null && series[hoverIdx] && (
          <line
            x1={xScale(series[hoverIdx].date)}
            x2={xScale(series[hoverIdx].date)}
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
        {max}
      </text>
      <rect x={PAD.l} y={0} width={innerW} height={STRIP_H} fill="transparent" onMouseMove={handleMove} onMouseLeave={() => onHover(null)} />
    </svg>
  )
}

// ─── X axis (one shared row under all strips) ────────────────────

function XAxis({ width, series, granularity, timezone }: { width: number; series: UptimePoint[]; granularity: 'hour' | 'day'; timezone: string | null }) {
  const innerW = width - PAD.l - PAD.r
  if (innerW <= 0 || series.length === 0) return null
  const xScale = scaleTime().domain([series[0].date, series[series.length - 1].date]).range([0, innerW])
  const n = Math.min(5, series.length)
  const ticks = n <= 1 ? [0] : Array.from({ length: n }, (_, k) => Math.round((k * (series.length - 1)) / (n - 1)))
  // * A 7-day range serves ~168 HOURLY buckets — a bare "14:00" axis would be
  // * seven identical days of labels, so multi-day hourly axes carry the day.
  const withDay = granularity === 'hour' && seriesSpansMultipleDays(series, timezone)
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
          {bucketLabel(series[idx].date, granularity, timezone, withDay)}
        </text>
      ))}
    </svg>
  )
}

// ─── Spec-plate certificate note ─────────────────────────────────

function TLSNote({ monitor }: { monitor: UptimeMonitor }) {
  // * Day-precision snapshot; drifting across a midnight while the page sits
  // * open is not worth an impure call in render.
  const [now] = useState(() => Date.now())
  if (!monitor.tls_expires_at) return <span className="shrink-0 text-xs text-neutral-600">—</span>
  const days = Math.ceil((new Date(monitor.tls_expires_at).getTime() - now) / 86_400_000)
  if (days < 0) {
    return (
      <span className="shrink-0 text-xs tabular-nums" style={{ color: NEG }}>
        certificate expired {Math.abs(days)} d ago
      </span>
    )
  }
  const tone = days < 14 ? { color: DEGRADED } : undefined
  return (
    <span className="shrink-0 text-xs tabular-nums text-neutral-500" style={tone}>
      certificate renews in {days} d
    </span>
  )
}

// ─── Panel ───────────────────────────────────────────────────────

export default function UptimePanel({ siteId, monitor, dateRange, incidents, timezone, utcDaysBefore }: UptimePanelProps) {
  const searchParams = useSearchParams()
  const write = useQueryParamsWriter()

  // * Hover state is keyed to the series payload: a range switch replaces the
  // * buckets, and a surviving index would pin the crosshair to whatever
  // * bucket now happens to share it. Render-time adjustment (not an effect)
  // * per the React "adjusting state when props change" pattern.
  const [hoverState, setHoverState] = useState<{ key: unknown; idx: number | null }>({ key: null, idx: null })

  const active = parseUptimeMetrics(searchParams.get('m'))
  const toggleMetric = useCallback(
    (key: UptimeMetricKey) => {
      const next = active.includes(key) ? active.filter((k) => k !== key) : [...active, key]
      if (next.length === 0) return // at least one strip stays
      write({ m: serializeUptimeMetrics(next) })
    },
    [active, write],
  )

  const { data, error, isLoading, isValidating, mutate } = useUptimeResponseTimes(
    siteId,
    monitor.id,
    dateRange.start,
    dateRange.end,
  )
  const granularity = data?.granularity ?? 'day'
  const series = useMemo(() => toUptimeSeries(data?.buckets ?? []), [data])
  const summary = data?.summary ?? null

  if (hoverState.key !== data) {
    setHoverState({ key: data, idx: null })
  }
  const hoverIdx = hoverState.key === data ? hoverState.idx : null
  const setHoverIdx = useCallback((i: number | null) => setHoverState({ key: data, idx: i }), [data])

  const uptimePct = seriesUptimePct(series)
  const totalChecks = series.reduce((n, p) => n + p.samples, 0)
  // * Downtime attributed to the range is CLIPPED to it — an old multi-day
  // * episode overlapping the window must not report more downtime than the
  // * window contains.
  const { startMs, endMs } = rangeWindowMs(dateRange, timezone)
  const downtime = incidents ? totalDowntimeSeconds(incidents, startMs, endMs) : 0

  const hovered = hoverIdx != null && hoverIdx < series.length ? series[hoverIdx] : null
  const hourWithDay = granularity === 'hour' && seriesSpansMultipleDays(series, timezone)

  // * Rail primary for response time: exact p50 where the server has it
  // * (hourly source), the exact weighted avg otherwise — always labeled.
  const respValue = summary?.p50_response_time_ms ?? summary?.avg_response_time_ms ?? null
  const respLabel = summary?.p50_response_time_ms != null ? 'p50' : 'avg'

  const railValue = (key: UptimeMetricKey): { text: string; sub: string } => {
    switch (key) {
      case 'availability':
        return {
          text: uptimePct == null ? '—' : fmtUptimePct(uptimePct),
          // * undefined incidents = not loaded (or failed) — that is "unknown",
          // * never presented as the claim "no incidents".
          sub:
            incidents === undefined
              ? '—'
              : incidents.length === 0
                ? 'no incidents'
                : `${incidents.length} incident${incidents.length === 1 ? '' : 's'} · ${fmtDurationSeconds(downtime)} down`,
        }
      case 'response':
        return {
          text: respValue == null ? '—' : fmtMs(respValue),
          sub:
            summary?.p95_response_time_ms != null
              ? `${respLabel} · p95 ${fmtMs(summary.p95_response_time_ms)}`
              : 'range avg',
        }
      case 'checks':
        // * No series loaded is "—", not a fabricated hard zero.
        return {
          text: data == null ? '—' : totalChecks.toLocaleString('en-US'),
          sub: `every ${Math.round(monitor.check_interval_seconds / 60)} m`,
        }
    }
  }

  const stripFor = (key: UptimeMetricKey, width: number) => {
    switch (key) {
      case 'availability':
        return <AvailabilityStrip width={width} series={series} hoverIdx={hoverIdx} onHover={setHoverIdx} />
      case 'response':
        return <ResponseStrip width={width} series={series} hoverIdx={hoverIdx} onHover={setHoverIdx} />
      case 'checks':
        return <ChecksStrip width={width} series={series} hoverIdx={hoverIdx} onHover={setHoverIdx} />
    }
  }

  return (
    <div data-tour="uptime-panel" className="relative rounded-none border border-border bg-card">
      <UpdatingChip active={isValidating && !!data} className="right-2 top-2" />

      {UPTIME_METRIC_ORDER.map((key) => {
        const isOn = active.includes(key)
        const rail = railValue(key)

        if (!isOn) {
          return (
            <button
              key={key}
              type="button"
              aria-pressed={false}
              aria-describedby={`uptime-def-${key}`}
              onClick={() => toggleMetric(key)}
              className="group flex h-11 w-full items-stretch border-t border-border first:border-t-0 text-left transition-colors duration-fast ease-apple hover:bg-neutral-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
            >
              <span className={cn(RAIL_W, 'flex shrink-0 items-center justify-between gap-2 border-r border-border px-4')}>
                <span className="truncate text-sm text-neutral-500">{UPTIME_METRIC_LABEL[key]}</span>
                <span className="text-xs tabular-nums text-neutral-500">{rail.text}</span>
              </span>
              <span className="flex items-center px-4 text-xs text-neutral-600 transition-colors duration-fast ease-apple group-hover:text-neutral-400">
                Show
              </span>
              <span id={`uptime-def-${key}`} className="sr-only">
                {UPTIME_TERM[key] ? TERMS[UPTIME_TERM[key]]?.definition : null}
              </span>
            </button>
          )
        }

        return (
          <div key={key} className="flex items-stretch border-t border-border first:border-t-0">
            <button
              type="button"
              aria-pressed={true}
              aria-describedby={`uptime-def-${key}`}
              onClick={() => toggleMetric(key)}
              className={cn(
                RAIL_W,
                'relative flex shrink-0 flex-col justify-center border-r border-border px-4 py-3 text-left transition-colors duration-fast ease-apple hover:bg-neutral-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange',
              )}
            >
              <span aria-hidden="true" className="absolute bottom-0 left-0 top-0 w-[2px] bg-brand-orange" />
              <span className="text-sm text-neutral-400">{UPTIME_METRIC_LABEL[key]}</span>
              {key === 'availability' && uptimePct != null ? (
                <AnimatedNumber
                  value={uptimePct}
                  format={(v) => fmtUptimePct(v)}
                  className="mt-0.5 text-xl font-semibold tabular-nums text-white"
                />
              ) : (
                <span className="mt-0.5 text-xl font-semibold tabular-nums text-white">{rail.text}</span>
              )}
              <span className="mt-0.5 truncate text-xs text-neutral-500">{rail.sub}</span>
              <span id={`uptime-def-${key}`} className="sr-only">
                {UPTIME_TERM[key] ? TERMS[UPTIME_TERM[key]]?.definition : null}
              </span>
            </button>

            <div className="relative min-w-0 flex-1">
              {series.length === 0 ? null : (
                <ParentSize debounceTime={10}>
                  {({ width }) => (width > 0 ? stripFor(key, width) : null)}
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
              {({ width }) => (width > 0 ? <XAxis width={width} series={series} granularity={granularity} timezone={timezone} /> : null)}
            </ParentSize>
          )}
        </div>
        <span className="flex h-7 shrink-0 items-center pr-3 text-xs text-neutral-600">
          {/* The convention, stated once — plus the honest boundary: days at
              or before utcDaysBefore predate the site-timezone conversion and
              their raw checks are purged, so they can never be re-cut. */}
          site timezone
          {utcDaysBefore && <> · days before {shiftDayKey(utcDaysBefore, 1)} are UTC days</>}
          <TermInfoTip term="site_timezone" />
        </span>
      </div>

      {/* Spec plate — the instrument carries its own credentials (trim
          decision, 14-08): endpoint quiet-mono left, certificate state right.
          Replaces the five-cell monitor strip; interval lives in the header
          status line, expects/timeout are auto-managed constants. */}
      <div className="flex h-8 items-center justify-between gap-4 border-t border-border px-4">
        <span className="truncate font-mono text-xs text-neutral-600">{monitor.url}</span>
        <TLSNote monitor={monitor} />
      </div>

      {/* Empty / error states cover the band area, rails stay visible */}
      {error ? (
        <div className="absolute inset-y-0 left-40 right-0 flex items-center justify-center sm:left-48">
          <ErrorCard title="Couldn't load uptime data" onRetry={() => { void mutate() }} className="py-4" />
        </div>
      ) : !isLoading && series.length === 0 ? (
        <div className="pointer-events-none absolute inset-y-0 left-40 right-0 flex flex-col items-center justify-center sm:left-48">
          <p className="text-sm text-neutral-400">No checks in this period yet.</p>
          <p className="mt-1 text-xs text-neutral-500">The first check lands within a minute of enabling.</p>
        </div>
      ) : null}

      {/* One tooltip for every strip */}
      {hovered && (
        <div className="pointer-events-none absolute left-1/2 top-12 z-10 -translate-x-1/2">
          <div className="min-w-[170px] rounded-none border border-border bg-popover px-3 py-2.5 text-white">
            <div className="mb-2 text-xs font-medium text-neutral-400">
              {bucketLabel(hovered.date, granularity, timezone, hourWithDay)}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-neutral-400">Checks</span>
                <span className="text-sm font-medium tabular-nums text-white">{hovered.samples}</span>
              </div>
              {hovered.failed > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-neutral-400">Failed</span>
                  <span className="text-sm font-medium tabular-nums" style={{ color: NEG }}>{hovered.failed}</span>
                </div>
              )}
              {hovered.degraded > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-neutral-400">Degraded</span>
                  <span className="text-sm font-medium tabular-nums" style={{ color: DEGRADED }}>{hovered.degraded}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-neutral-400">Avg resp.</span>
                <span className="text-sm font-medium tabular-nums text-white">
                  {hovered.avgMs == null ? '—' : fmtMs(hovered.avgMs)}
                </span>
              </div>
              {hovered.p95Ms != null && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-neutral-400">p95</span>
                  <span className="text-sm font-medium tabular-nums text-white">{fmtMs(hovered.p95Ms)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

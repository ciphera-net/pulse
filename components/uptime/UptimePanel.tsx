'use client'

import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { curveLinear } from 'd3-shape'
import { useQueryParamsWriter } from '@/lib/hooks/useQueryParamsWriter'
import { shiftDayKey } from '@/lib/utils/siteTime'
import { useUptimeResponseTimes } from '@/lib/swr/dashboard'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { AreaChart, Area, Grid, YAxis, ChartTooltip, ChartCrosshair } from '@/components/ui/area-chart'
import { ChartStack, ChartStackAxis, useChartStack } from '@/components/ui/chart-stack'
import { PERIOD_ENDS_NOW } from '@/lib/constants/periods'
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
// The uptime instrument — a rail of metrics beside a stack of strips.
//
// Chart-consistency round (05-09-2026), owner ruling: the availability bars
// and the checks bars stay AS THEY ARE (pos/neg is SEMANTIC here — up/down
// state, not decoration); the response-time strip becomes the dashboard's
// chart at strip height; the whole stack takes the dashboard's card and its
// cursor. So: one crosshair through every strip (the panel's own intent since
// 22-08), one fixed-size card pinned to the top of the stack with a constant
// row set, hover snapped by the bisector, touch on the line strip.
//
// The response line BREAKS over buckets with no timed samples (a full-outage
// hour) instead of bridging them — a straight stroke across an outage is
// drawn data that never existed. p95 is a card row, not a second trace (one
// ink). All bucketing is the server's (hour or day, echoed); days/hours are
// the SITE's timezone.
// ---------------------------------------------------------------------------

const POS = UPTIME_POS
const NEG = UPTIME_NEG
const DEGRADED = UPTIME_DEGRADED
const INK = '#b3b1ad'
const STRIP_H = 92
const STRIP_MARGIN = { top: 8, right: 16, bottom: 6, left: 56 }
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
  /** The period token — decides the dashed in-progress tail (token
   * semantics, never client date math). Optional: custom ranges never dash. */
  period?: string | null
}

// ─── Availability strip: one state bar per bucket (unchanged marks) ──

function AvailabilityStrip({ series }: { series: UptimePoint[] }) {
  const { xScale, margin, innerWidth, hoverIndex, setHoverIndex, resolveIndex } = useChartStack()
  if (innerWidth <= 0) return null

  const barH = 56
  const barY = (STRIP_H - barH) / 2
  // * Bars sit at the same time positions the line strip uses, so the shared
  // * crosshair lands on the same bucket in every strip. The width cap scales
  // * with bucket count: 91 day-slots stay slim, 24 hour-slots read solid.
  const slot = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth
  const barW = Math.max(2, Math.min(series.length <= 40 ? 22 : 10, slot * 0.72))
  const hovered = hoverIndex != null ? series[hoverIndex] : null

  return (
    <svg aria-hidden="true" height={STRIP_H} style={{ display: 'block' }} width="100%">
      <g transform={`translate(${margin.left},0)`}>
        <line stroke="var(--chart-grid)" strokeWidth={1} x1={0} x2={innerWidth} y1={barY + barH} y2={barY + barH} />
        {series.map((p, i) => {
          const color = p.samples === 0 ? 'var(--chart-grid)' : p.failed > 0 ? NEG : p.degraded > 0 ? DEGRADED : POS
          const opacity = p.samples === 0 ? 1 : p.failed > 0 || p.degraded > 0 ? 1 : 0.75
          return (
            <rect
              key={p.date.getTime()}
              fill={color}
              height={barH}
              opacity={hoverIndex === i ? 1 : opacity}
              width={barW}
              x={(xScale(p.date) ?? 0) - barW / 2}
              y={barY}
            />
          )
        })}
        <g transform={`translate(0,${barY - 6})`}>
          <ChartCrosshair height={barH + 12} visible={hovered != null} x={hovered ? (xScale(hovered.date) ?? 0) : 0} />
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
  )
}

// ─── Response-time strip: the instrument at strip height ──────────

function ResponseStrip({ series, dashedTail }: { series: UptimePoint[]; dashedTail: boolean }) {
  const { hoverIndex, setHoverIndex } = useChartStack()
  return (
    <div style={{ height: STRIP_H }}>
      <AreaChart
        animationDuration={400}
        data={series as unknown as Record<string, unknown>[]}
        fillParent
        hoverIndex={hoverIndex}
        margin={STRIP_MARGIN}
        onHoverChange={setHoverIndex}
        xDataKey="date"
      >
        <Grid horizontal numTicksRows={3} stroke="var(--chart-grid)" vertical={false} />
        <Area
          // NULL-gap contract: no timed samples → a gap, never a bridge.
          breakAtMissing
          curve={curveLinear}
          dashedTailFrom={dashedTail && series.length >= 2 ? series.length - 2 : undefined}
          dataKey="avgMs"
          fadeStrokeEdges={false}
          fill="var(--chart-1)"
          fillOpacity={0.15}
          gradientToOpacity={0}
          stroke="var(--chart-1)"
          strokeWidth={2}
        />
        <YAxis formatValue={(v) => fmtMs(v)} numTicks={3} />
        <ChartTooltip showCard={false} showDatePill={false} />
      </AreaChart>
    </div>
  )
}

// ─── Checks strip: sample-count bars in neutral ink (unchanged marks) ─

function ChecksStrip({ series }: { series: UptimePoint[] }) {
  const { xScale, margin, innerWidth, hoverIndex, setHoverIndex, resolveIndex } = useChartStack()
  if (innerWidth <= 0) return null
  const padT = 10
  const padB = 8
  const innerH = STRIP_H - padT - padB

  const max = Math.max(1, ...series.map((p) => p.samples))
  const slot = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth
  const barW = Math.max(2, Math.min(10, slot * 0.72))
  const hovered = hoverIndex != null ? series[hoverIndex] : null

  return (
    <div className="relative" style={{ height: STRIP_H }}>
      <svg aria-hidden="true" height={STRIP_H} style={{ display: 'block' }} width="100%">
        <g transform={`translate(${margin.left},0)`}>
          <line stroke="var(--chart-grid)" strokeWidth={1} x1={0} x2={innerWidth} y1={padT + innerH} y2={padT + innerH} />
          {series.map((p, i) => {
            const h = (p.samples / max) * innerH
            return (
              <rect
                key={p.date.getTime()}
                fill={INK}
                height={h}
                opacity={hoverIndex === i ? 0.7 : 0.35}
                width={barW}
                x={(xScale(p.date) ?? 0) - barW / 2}
                y={padT + innerH - h}
              />
            )
          })}
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
      <div className="pointer-events-none absolute flex justify-end" style={{ left: 0, top: padT, width: margin.left - 8, transform: 'translateY(-50%)' }}>
        <span className="whitespace-nowrap text-neutral-500 text-xs tabular-nums">{max}</span>
      </div>
    </div>
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

export default function UptimePanel({ siteId, monitor, dateRange, incidents, timezone, utcDaysBefore, period }: UptimePanelProps) {
  const searchParams = useSearchParams()
  const write = useQueryParamsWriter()

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

  const uptimePct = seriesUptimePct(series)
  const totalChecks = series.reduce((n, p) => n + p.samples, 0)
  // * Downtime attributed to the range is CLIPPED to it — an old multi-day
  // * episode overlapping the window must not report more downtime than the
  // * window contains.
  const { startMs, endMs } = rangeWindowMs(dateRange, timezone)
  const downtime = incidents ? totalDowntimeSeconds(incidents, startMs, endMs) : 0

  const hourWithDay = granularity === 'hour' && seriesSpansMultipleDays(series, timezone)
  // The in-progress bucket dashes on period-token semantics, like the deck.
  const dashedTail = Boolean(period && PERIOD_ENDS_NOW[period])

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

  const stripFor = (key: UptimeMetricKey) => {
    switch (key) {
      case 'availability':
        return <AvailabilityStrip series={series} />
      case 'response':
        return <ResponseStrip dashedTail={dashedTail} series={series} />
      case 'checks':
        return <ChecksStrip series={series} />
    }
  }

  // The card: the bucket's identity in the header, a CONSTANT row set below
  // (owner ruling 01-09-2026: the box never resizes while hovering — absent
  // values read 0 or an em dash rather than dropping their row).
  const cardTitle = useCallback(
    (p: Record<string, unknown>) => bucketLabel(p.date as Date, granularity, timezone, hourWithDay),
    [granularity, timezone, hourWithDay],
  )
  const cardRows = useCallback((p: Record<string, unknown>) => {
    const h = p as unknown as UptimePoint
    return [
      { color: 'var(--chart-foreground-muted)', label: 'Checks', value: String(h.samples) },
      { color: NEG, label: 'Failed', value: String(h.failed) },
      { color: DEGRADED, label: 'Degraded', value: String(h.degraded) },
      { color: 'var(--chart-1)', label: 'Response time', value: h.avgMs == null ? '—' : fmtMs(h.avgMs) },
      { color: 'var(--chart-1)', label: 'p95', value: h.p95Ms == null ? '—' : fmtMs(h.p95Ms) },
    ]
  }, [])
  const fmtAxis = useCallback((d: Date) => bucketLabel(d, granularity, timezone, hourWithDay), [granularity, timezone, hourWithDay])

  return (
    <ChartStack
      className="rounded-none border border-border bg-card"
      data={series as unknown as Record<string, unknown>[]}
      margin={STRIP_MARGIN}
      // * A range switch replaces the buckets: reset the hover so a surviving
      // * index cannot pin the crosshair to whatever bucket now shares it.
      resetKey={data}
      rows={cardRows}
      title={cardTitle}
      xDataKey="date"
    >
      <div data-tour="uptime-panel" className="relative">
        <UpdatingChip active={isValidating && !!data} className="right-2 top-2" />

        {UPTIME_METRIC_ORDER.map((key, rowIndex) => {
          const isOn = active.includes(key)
          const rail = railValue(key)
          const railProps = rowIndex === 0 ? { 'data-chart-stack-rail': '' } : {}

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
                <span {...railProps} className={cn(RAIL_W, 'flex shrink-0 items-center justify-between gap-2 border-r border-border px-4')}>
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
                {...railProps}
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

              <div className="relative min-w-0 flex-1">{series.length === 0 ? null : stripFor(key)}</div>
            </div>
          )
        })}

        {/* Shared x-axis, offset past the rail column — the instrument's chrome.
            Ticks sit ON bucket starts: the buckets are the site's hours/days,
            and a calendar step in UTC would label instants no bucket starts on. */}
        <div className="flex border-t border-border">
          <div className={cn(RAIL_W, 'shrink-0 border-r border-border')} />
          <div className="min-w-0 flex-1">
            {series.length > 0 && <ChartStackAxis formatLabel={fmtAxis} numTicks={8} ticks="buckets" />}
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
      </div>
    </ChartStack>
  )
}

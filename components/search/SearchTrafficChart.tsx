'use client'

import { useCallback, useMemo, useState } from 'react'
import { scaleLinear, scaleTime } from 'd3-scale'
import { curveMonotoneX } from 'd3-shape'
import { bisector } from 'd3-array'
import { AreaClosed, LinePath, LinearGradient, ParentSize, localPoint } from '@/lib/charts/primitives'
import { useGSCDailyTotals } from '@/lib/swr/dashboard'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { formatNumber } from '@/lib/utils/format'
import { formatDate, formatDateShort } from '@/lib/utils/formatDate'

// ---------------------------------------------------------------------------
// Search traffic — clicks and impressions per day on INDEPENDENT linear scales
// (clicks left / orange area + line, impressions right / neutral line) so both
// shapes stay readable across a 10–100× magnitude gap.
//
// Chart approach (design D6): SELF-CONTAINED. The shared <AreaChart> derives a
// single yScale from the max across all its <Area> children and exposes only
// that one scale through its context (tooltip, dots, grid and axes all read
// it) — it is single-scale by design and cannot express a second independent
// axis. So this composes the same low-level primitives (AreaClosed / LinePath /
// LinearGradient / ParentSize) and the same tokens (--chart-grid /
// --chart-axis / --chart-crosshair, bg-popover tooltip, DD/MM ticks) as the
// shared chart, with two scales it owns. Fallback (two synced panels) unneeded.
// ---------------------------------------------------------------------------

const CLICKS = '#FD5E0F'
const IMPRESSIONS = '#737373'
const Y_TICKS = 5
const X_TICKS = 5
const MARGIN = { top: 8, right: 56, bottom: 28, left: 52 }

interface SearchTrafficChartProps {
  siteId: string
  startDate: string
  endDate: string
}

interface Point {
  date: Date
  clicks: number
  impressions: number
}

const evenTicks = (min: number, max: number, count: number) =>
  Array.from({ length: count }, (_, i) => min + (max - min) * (i / (count - 1)))

// * Tick positions must stay (both axes share one grid), but small integer
// * domains round several fractions to the same label — keep the first only.
const dedupeTickLabels = (ticks: number[]) => {
  const seen = new Set<string>()
  return ticks.map((t) => {
    const label = formatNumber(Math.round(t))
    if (seen.has(label)) return { t, label: null }
    seen.add(label)
    return { t, label }
  })
}

function ChartBody({ width, height, data }: { width: number; height: number; data: Point[] }) {
  const innerWidth = width - MARGIN.left - MARGIN.right
  const innerHeight = height - MARGIN.top - MARGIN.bottom
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const xScale = useMemo(
    () => scaleTime().domain([data[0].date, data[data.length - 1].date]).range([0, innerWidth]),
    [data, innerWidth],
  )
  const clicksScale = useMemo(
    () =>
      scaleLinear()
        .domain([0, Math.max(1, ...data.map((d) => d.clicks)) * 1.1])
        .range([innerHeight, 0])
        .nice(),
    [data, innerHeight],
  )
  const imprScale = useMemo(
    () =>
      scaleLinear()
        .domain([0, Math.max(1, ...data.map((d) => d.impressions)) * 1.1])
        .range([innerHeight, 0])
        .nice(),
    [data, innerHeight],
  )

  // * Both scales share the pixel range, so evenly-spaced domain fractions land
  // * on the same rows — one grid, two aligned axes.
  const [clicksMin, clicksMax] = clicksScale.domain()
  const [imprMin, imprMax] = imprScale.domain()
  const leftTicks = useMemo(() => evenTicks(clicksMin, clicksMax, Y_TICKS), [clicksMin, clicksMax])
  const rightTicks = useMemo(() => evenTicks(imprMin, imprMax, Y_TICKS), [imprMin, imprMax])

  const xTicks = useMemo(() => {
    const n = Math.min(X_TICKS, data.length)
    if (n <= 1) return data.map((_, i) => i)
    return Array.from({ length: n }, (_, k) => Math.round((k * (data.length - 1)) / (n - 1)))
  }, [data])

  const bisectDate = useMemo(() => bisector<Point, Date>((d) => d.date).left, [])

  const handleMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(event)
      if (!point) return
      const x0 = xScale.invert(point.x - MARGIN.left)
      const i = bisectDate(data, x0, 1)
      const d0 = data[i - 1]
      const d1 = data[i]
      let idx = i - 1
      if (d0 && d1) {
        idx = x0.getTime() - d0.date.getTime() > d1.date.getTime() - x0.getTime() ? i : i - 1
      }
      setHoverIndex(Math.max(0, Math.min(data.length - 1, idx)))
    },
    [xScale, data, bisectDate],
  )

  if (innerWidth <= 0 || innerHeight <= 0) return null

  const hovered = hoverIndex != null ? data[hoverIndex] : null
  const hoverX = hovered ? xScale(hovered.date) : 0
  const tooltipX = hoverX + MARGIN.left
  const flip = tooltipX > width * 0.66

  return (
    <>
      <svg aria-hidden="true" width={width} height={height}>
        <LinearGradient id="search-clicks-area" from={CLICKS} to={CLICKS} fromOpacity={0.18} toOpacity={0} />
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Grid */}
          {leftTicks.map((t, i) => {
            const y = clicksScale(t)
            return <line key={i} x1={0} x2={innerWidth} y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
          })}

          {/* Left axis — clicks */}
          {dedupeTickLabels(leftTicks).map(({ t, label }, i) =>
            label === null ? null : (
              <text
                key={i}
                x={-8}
                y={clicksScale(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill={CLICKS}
                fillOpacity={0.75}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {label}
              </text>
            ),
          )}

          {/* Right axis — impressions */}
          {dedupeTickLabels(rightTicks).map(({ t, label }, i) =>
            label === null ? null : (
              <text
                key={i}
                x={innerWidth + 8}
                y={imprScale(t)}
                textAnchor="start"
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--chart-axis)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {label}
              </text>
            ),
          )}

          {/* X axis — DD/MM */}
          {xTicks.map((idx) => (
            <text
              key={idx}
              x={xScale(data[idx].date)}
              y={innerHeight + 18}
              textAnchor="middle"
              fontSize={11}
              fill="var(--chart-axis)"
            >
              {formatDateShort(data[idx].date)}
            </text>
          ))}

          {/* Clicks — orange area + line (left scale) */}
          <AreaClosed
            data={data}
            x={(d) => xScale(d.date)}
            y={(d) => clicksScale(d.clicks)}
            yScale={clicksScale}
            curve={curveMonotoneX}
            fill="url(#search-clicks-area)"
          />
          <LinePath
            data={data}
            x={(d) => xScale(d.date)}
            y={(d) => clicksScale(d.clicks)}
            curve={curveMonotoneX}
            stroke={CLICKS}
            strokeWidth={2}
            strokeLinecap="round"
          />

          {/* Impressions — neutral line, no fill (right scale) */}
          <LinePath
            data={data}
            x={(d) => xScale(d.date)}
            y={(d) => imprScale(d.impressions)}
            curve={curveMonotoneX}
            stroke={IMPRESSIONS}
            strokeWidth={2}
            strokeLinecap="round"
          />

          {/* Hover crosshair + point markers */}
          {hovered && (
            <g pointerEvents="none">
              <line x1={hoverX} x2={hoverX} y1={0} y2={innerHeight} stroke="var(--chart-crosshair)" strokeWidth={1} />
              <circle cx={hoverX} cy={clicksScale(hovered.clicks)} r={3.5} fill={CLICKS} stroke="var(--chart-background)" strokeWidth={2} />
              <circle cx={hoverX} cy={imprScale(hovered.impressions)} r={3.5} fill={IMPRESSIONS} stroke="var(--chart-background)" strokeWidth={2} />
            </g>
          )}

          {/* Interaction surface */}
          <rect
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIndex(null)}
          />
        </g>
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 z-10"
          style={flip ? { right: width - tooltipX + 12 } : { left: tooltipX + 12 }}
        >
          <div className="min-w-[140px] rounded-none border border-border bg-popover px-3 py-2.5 text-white">
            <div className="mb-2 text-xs font-medium text-neutral-400">{formatDate(hovered.date)}</div>
            <div className="space-y-1.5">
              <TooltipRow color={CLICKS} label="Clicks" value={formatNumber(hovered.clicks)} />
              <TooltipRow color={IMPRESSIONS} label="Impressions" value={formatNumber(hovered.impressions)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-none" style={{ backgroundColor: color }} />
        <span className="text-sm text-neutral-400">{label}</span>
      </div>
      <span className="text-sm font-medium tabular-nums text-white">{value}</span>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-neutral-500">
      <span className="h-2 w-2 rounded-none" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

export default function SearchTrafficChart({ siteId, startDate, endDate }: SearchTrafficChartProps) {
  const { data, error, isLoading, isValidating, mutate } = useGSCDailyTotals(siteId, startDate, endDate)

  const points = useMemo<Point[]>(() => {
    if (!data?.daily_totals?.length) return []
    return data.daily_totals.map((t) => ({
      date: new Date(t.date + 'T00:00:00'),
      clicks: t.clicks,
      impressions: t.impressions,
    }))
  }, [data])

  return (
    <div className="relative rounded-none border border-border bg-card p-4">
      <UpdatingChip active={isValidating && !!data} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-500">Search traffic</span>
        <div className="flex items-center gap-4">
          <LegendDot color={CLICKS} label="Clicks" />
          <LegendDot color={IMPRESSIONS} label="Impressions" />
        </div>
      </div>

      {/* Stable-height region — no unmount flash on range change (keepPreviousData) */}
      <div className="relative h-64">
        {error ? (
          <ErrorCard title="Couldn't load search traffic" onRetry={() => { void mutate() }} className="py-8" />
        ) : isLoading && !data ? null : points.length > 0 ? (
          <ParentSize debounceTime={10}>
            {({ width, height }) => (width > 0 && height > 0 ? <ChartBody width={width} height={height} data={points} /> : null)}
          </ParentSize>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-neutral-500">No search traffic in this period.</p>
          </div>
        )}
      </div>
    </div>
  )
}

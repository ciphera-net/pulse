'use client'

import { useEffect, useMemo, useState } from 'react'
import { Switcher } from '@ciphera-net/facet'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { SkeletonLine } from '@/components/skeleton/primitives'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { FRAME_CARD, FRAME_CARD_BODY, FRAME_CARD_NOTE } from '@/lib/dashboard/frame'
import { useDailyStats } from '@/lib/swr/dashboard'
import { formatCompactNumber } from '@/lib/utils/format'
import { parseSiteWallClock } from '@/lib/utils/formatDate'
import { addDays, spanDays } from '@/lib/view/view'
import { HEAT_STEPS } from '@/lib/dashboard/heatmapGrid'

// ---------------------------------------------------------------------------
// WHEN PEOPLE COME, at half width (the new dashboard frame's bottom, owner ruling R35 of 15-11-2026: the heat map
// "Headline" beside the conversion block).
//
// The week as 7 weekdays by 12 two-hour blocks: at half the page an hourly cell would be 19 px wide. Over the grid
// stands one figure and its line, the map's own device: at rest the week's busiest two hours, under the pointer the
// two hours pointed at.
//
// It reads what today's heat map reads (components/dashboard/PeakHours.tsx, which stays the heat map of today's
// arrangement): the hourly series on the SITE's clock, the page's filters, at most the last 366 days (an hourly
// series is capped at a year), and a failed read is an error with a retry, never an empty week.
//
// The cells behave as the status page's days do (the owner's note of 15-11-2026): there is no gap a pointer can be
// in, and the square under the pointer grows.
// ---------------------------------------------------------------------------

/** The hourly series' ceiling, in days (pulse-backend MaxDaysPerInterval["hour"]). */
const HOURLY_MAX_DAYS = 366

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_FULL = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
const COLUMNS = 12

export type HeatMetric = 'pageviews' | 'visitors' | 'avg_duration' | 'bounce_rate'
const METRICS: { value: HeatMetric; label: string }[] = [
  { value: 'pageviews', label: 'Pageviews' },
  { value: 'visitors', label: 'Visitors' },
  { value: 'avg_duration', label: 'Duration' },
  { value: 'bounce_rate', label: 'Bounce' },
]
// The line under the figure while nothing is pointed at: what makes these two hours the week's first.
const LEAD: Record<HeatMetric, string> = {
  pageviews: 'Busiest two hours',
  visitors: 'Most visits in two hours',
  avg_duration: 'Longest visits in two hours',
  bounce_rate: 'Highest bounce in two hours',
}

// The app's own five steps of orange, and the ink at 8% for a cell with nothing in it.
const NOTHING = 'rgb(var(--neutral-400) / 0.08)'
// Today's heat map's own five steps (lib/dashboard/heatmapGrid.ts), its first (no colour) left out: NOTHING draws that.
const STEPS = HEAT_STEPS.slice(1)
const tint = (value: number, max: number) =>
  value <= 0 || max <= 0 ? NOTHING : value === max ? STEPS[4] : STEPS[Math.min(3, Math.floor((value / max) * 4))]

const two = (n: number) => String(n).padStart(2, '0')
const summed = (metric: HeatMetric) => metric === 'pageviews' || metric === 'visitors'

/** What a cell counts, said in words. "visits", not "visitors": an hour's visitors added over hours and days are not unique people. */
export function sayHeatValue(value: number, metric: HeatMetric): string {
  if (metric === 'pageviews') return `${formatCompactNumber(Math.round(value))} pageviews`
  if (metric === 'visitors') return `${formatCompactNumber(Math.round(value))} visits`
  if (metric === 'avg_duration') {
    const minutes = Math.floor(value / 60)
    const seconds = Math.round(value % 60)
    return minutes > 0 ? `${minutes}m ${seconds}s a visit` : `${seconds}s a visit`
  }
  return `${Math.round(value)}% bounce`
}

export interface HeatWeek {
  /** [weekday, Monday first][two-hour block] of the measure. */
  grid: number[][]
  max: number
  /** The busiest cell, or null when no cell carries a measured value. */
  best: { day: number; column: number } | null
}

interface HourRow { date: string; pageviews: number; visitors: number; avg_duration?: number | null; bounce_rate?: number | null }

/**
 * The week out of the hourly series. Counts add up. A rate (duration, bounce) is the mean of its hours weighted by
 * their visitors, and an hour with no measurement adds neither value nor weight, so it cannot pull a cell toward
 * zero. Pure, so the arithmetic is tested without a block around it.
 */
export function heatWeek(rows: readonly HourRow[], metric: HeatMetric): HeatWeek {
  const make = () => Array.from({ length: 7 }, () => Array<number>(COLUMNS).fill(0))
  const grid = make()
  const weight = make()
  for (const row of rows) {
    // The wire value is the site's wall clock: read with UTC getters, as today's heat map does.
    const at = parseSiteWallClock(row.date) ?? new Date(row.date)
    const day = (at.getUTCDay() + 6) % 7
    const column = Math.floor(at.getUTCHours() / 2)
    if (metric === 'pageviews') grid[day][column] += row.pageviews
    else if (metric === 'visitors') grid[day][column] += row.visitors
    else {
      const value = metric === 'avg_duration' ? row.avg_duration : row.bounce_rate
      if (value == null) continue
      grid[day][column] += value * row.visitors
      weight[day][column] += row.visitors
    }
  }
  if (!summed(metric)) {
    for (let d = 0; d < 7; d++) for (let c = 0; c < COLUMNS; c++) grid[d][c] = weight[d][c] > 0 ? grid[d][c] / weight[d][c] : 0
  }
  let max = 0
  let best: HeatWeek['best'] = null
  for (let d = 0; d < 7; d++) {
    for (let c = 0; c < COLUMNS; c++) {
      if (grid[d][c] > max) { max = grid[d][c]; best = { day: d, column: c } }
    }
  }
  return { grid, max, best }
}

function Legend() {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[10px] text-neutral-500" aria-hidden="true">
      Less
      {[NOTHING, ...STEPS].map((color) => <span key={color} className="h-2.5 w-2.5" style={{ backgroundColor: color }} />)}
      More
    </span>
  )
}

type Cell = { day: number; column: number }

/**
 * The 7 by 12 grid, as tall as it is given.
 *
 *   no gap     A gap belongs to no cell, so a pointer crossing one was on nothing. Each cell owns half the gap on
 *              every side instead (its padding), and the square a reader sees is the box inside. The grid reaches
 *              half a gap past its edges, so every square sits where it would with a gap.
 *   it grows   The square under the pointer grows, over the gap and a little over its neighbours. Only the square
 *              moves and it takes no pointer events, so what the pointer hits never changes under it. The steps of
 *              orange are see-through, so the grown square stands on the block's own ground, or its neighbours
 *              would show through it as a band along each shared edge.
 */
const HALF_GAP = 1.5
function Grid({ week, over, onOver, label }: { week: HeatWeek; over: Cell | null; onOver: (at: Cell | null) => void; label: string }) {
  const columns = { gridTemplateColumns: `${32 + HALF_GAP}px repeat(${COLUMNS}, minmax(0, 1fr))`, marginRight: -HALF_GAP }
  return (
    <>
      <div className="grid shrink-0 pb-1.5 text-[10px] text-neutral-500" style={columns} aria-hidden="true">
        <span />
        {Array.from({ length: COLUMNS }).map((_, c) => (
          <span key={c} style={{ paddingLeft: HALF_GAP }}>{c % 3 === 0 ? `${two(c * 2)}:00` : ''}</span>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1 grid-rows-7"
        style={{ ...columns, marginBlock: -HALF_GAP }}
        onPointerLeave={() => onOver(null)}
        role="img"
        aria-label={label}
        data-heat-grid=""
      >
        {DAYS.map((name, d) => (
          <div key={name} className="contents">
            <span className="flex items-center text-[11px] text-neutral-500">{name}</span>
            {week.grid[d].map((value, c) => {
              const on = over?.day === d && over.column === c
              return (
                <div
                  key={c}
                  // A mouse points; a finger presses. Either names the cell, and nothing stays named once the
                  // pointer has left the grid (a finger: once it presses anywhere else, see WeekHeat).
                  onPointerEnter={(e) => { if (e.pointerType !== 'touch') onOver({ day: d, column: c }) }}
                  onPointerDown={(e) => { if (e.pointerType === 'touch') onOver({ day: d, column: c }) }}
                  className="min-h-0"
                  style={{ padding: HALF_GAP }}
                  data-heat-cell={`${d}-${c}`}
                >
                  <div
                    className={`pointer-events-none relative h-full w-full outline outline-1 transition-[transform,outline-color] duration-150 ease-apple ${on ? 'z-10 outline-white/60' : 'outline-transparent'}`}
                    style={{
                      backgroundColor: on ? 'rgb(var(--card))' : undefined,
                      backgroundImage: `linear-gradient(${tint(value, week.max)}, ${tint(value, week.max)})`,
                      transform: `scale(${on ? 1.3 : 1})`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}

interface WeekHeatProps {
  siteId: string
  dateRange: { start: string; end: string }
  /** The page's filters: the week describes the same visitors as the rest of the page. */
  filters?: string
}

export default function WeekHeat({ siteId, dateRange, filters }: WeekHeatProps) {
  const [metric, setMetric] = useState<HeatMetric>('pageviews')
  const [over, setOver] = useState<Cell | null>(null)

  // Past a year the week is read from the most recent 366 days, and the block says so.
  const recentYearOnly = spanDays(dateRange) > HOURLY_MAX_DAYS
  const hourly = recentYearOnly ? { start: addDays(dateRange.end, -(HOURLY_MAX_DAYS - 1)), end: dateRange.end } : dateRange
  const { data, error, isLoading, mutate: retry } = useDailyStats(siteId, hourly.start, hourly.end, 'hour', filters)
  const week = useMemo(() => heatWeek(data ?? [], metric), [data, metric])

  // A cell named by a finger stays named until the finger presses outside the grid: there is no "leave" on touch.
  useEffect(() => {
    if (!over) return
    const clear = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && !(e.target instanceof Element && e.target.closest('[data-heat-grid]'))) setOver(null)
    }
    document.addEventListener('pointerdown', clear)
    return () => document.removeEventListener('pointerdown', clear)
  }, [over])

  const shown = over ?? week.best
  const measured = shown !== null && week.max > 0
  const label = `${METRICS.find((m) => m.value === metric)?.label} by weekday and two-hour block`

  return (
    <div data-bottom-block="week" className={FRAME_CARD}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 overflow-x-auto scrollbar-hide pb-1">
            <Switcher size="sm" tone="solid" aria-label="When people come, by" options={METRICS} value={metric} onChange={(v) => setMetric(v as HeatMetric)} />
          </div>
          <TermInfoTip term="peak_hours" />
        </div>
        {recentYearOnly && <span className="shrink-0 text-xs text-muted-foreground">Last 12 months</span>}
      </div>

      <div className={`${FRAME_CARD_BODY} flex flex-col`}>
        {isLoading && !data ? (
          // The loaded body's own parts, so nothing moves when the week arrives: the figure and its line, then the grid.
          <div className="flex h-full flex-col" aria-busy="true" data-testid="week-heat-loading">
            <div className="mb-3 flex min-h-[3.25rem] shrink-0 flex-col justify-center gap-2">
              <SkeletonLine className="h-6 w-44 max-w-full" />
              <SkeletonLine className="h-3 w-56 max-w-full" />
            </div>
            <SkeletonLine className="min-h-0 w-full flex-1" />
          </div>
        ) : error && !data ? (
          // A failed read is an error with a retry, never a week with nothing in it.
          <div className="flex h-full flex-col justify-center">
            <ErrorCard title="Couldn't load the week" description="The rest of the dashboard is unaffected." onRetry={() => retry()} />
          </div>
        ) : (
          <>
            <div className="mb-3 min-h-[3.25rem] shrink-0" aria-live="polite" data-testid="week-heat-headline">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-white">
                  {measured ? `${DAYS_FULL[shown.day]}, ${two(shown.column * 2)}:00` : '—'}
                </span>
              </div>
              <p className="truncate text-xs text-neutral-400">
                {measured
                  ? `${over ? 'Two hours from then' : LEAD[metric]} · ${sayHeatValue(week.grid[shown.day][shown.column], metric)}`
                  : 'This range has no visits yet.'}
              </p>
            </div>
            <Grid week={week} over={over} onOver={setOver} label={label} />
          </>
        )}
      </div>

      <div className="mt-3.5 flex h-6 shrink-0 items-center gap-3">
        <span className={FRAME_CARD_NOTE} />
        <Legend />
      </div>
    </div>
  )
}

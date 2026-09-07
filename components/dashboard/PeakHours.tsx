'use client'

import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { Clock } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_FAST, DURATION_SLOW, EASE_APPLE } from '@/lib/motion'
import { useDailyStats } from '@/lib/swr/dashboard'
import { parseSiteWallClock } from '@/lib/utils/formatDate'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { Switcher } from '@ciphera-net/facet'

interface PeakHoursProps {
  // The page's selected metric. PeakHours keeps its own 4-way control as an
  // override, but follows the page whenever the page picks one of its four.
  siteId: string
  dateRange: { start: string, end: string }
  // Active page filters (F14): the heatmap describes the same population as
  // the rest of the page, and the Behaviour section header says so.
  filters?: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_FULL = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
// 24 hourly columns — the approved mockup's full-width grid. The old 12
// two-hour buckets were sized for a HALF-width card; full width doubled the
// square cells and the whole block with them.
const BUCKETS = 24
// Label at bucket index 0=00:00, 6=06:00, 12=12:00, 18=18:00
const BUCKET_LABELS: Record<number, string> = { 0: '00:00', 6: '06:00', 12: '12:00', 18: '18:00' }

const HIGHLIGHT_COLORS = [
  'transparent',
  'rgba(253,94,15,0.15)',
  'rgba(253,94,15,0.35)',
  'rgba(253,94,15,0.60)',
  'rgba(253,94,15,0.82)',
  '#FD5E0F',
]

type Metric = 'pageviews' | 'visitors' | 'avg_duration' | 'bounce_rate'

const METRICS: { key: Metric; label: string }[] = [
  { key: 'pageviews', label: 'Pageviews' },
  { key: 'visitors', label: 'Unique Visitors' },
  { key: 'avg_duration', label: 'Avg Duration' },
  { key: 'bounce_rate', label: 'Bounce Rate' },
]

const BEST_TIME_LABELS: Record<Metric, string> = {
  pageviews: 'Your busiest time is',
  visitors: 'Your peak visitor time is',
  avg_duration: 'Your most engaging time is',
  bounce_rate: 'Your highest bounce time is',
}

function isSummable(metric: Metric): boolean {
  return metric === 'pageviews' || metric === 'visitors'
}

function formatMetricValue(value: number, metric: Metric): string {
  if (metric === 'pageviews') return `${value.toLocaleString()} pageviews`
  if (metric === 'visitors') return `${value.toLocaleString()} visits`
  if (metric === 'avg_duration') {
    const mins = Math.floor(value / 60)
    const secs = Math.round(value % 60)
    return mins > 0 ? `${mins}m ${secs}s avg duration` : `${secs}s avg duration`
  }
  return `${Math.round(value)}% bounce rate`
}

function formatBucket(bucket: number): string {
  return `${String(bucket).padStart(2, '0')}:00–${String(bucket + 1).padStart(2, '0')}:00`
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

function getHighlightColor(value: number, max: number): string {
  if (value === 0) return HIGHLIGHT_COLORS[0]
  if (value === max) return HIGHLIGHT_COLORS[5]
  const ratio = value / max
  if (ratio <= 0.25) return HIGHLIGHT_COLORS[1]
  if (ratio <= 0.50) return HIGHLIGHT_COLORS[2]
  if (ratio <= 0.75) return HIGHLIGHT_COLORS[3]
  return HIGHLIGHT_COLORS[4]
}

export default function PeakHours({ siteId, dateRange, filters }: PeakHoursProps) {
  const [animKey, setAnimKey] = useState(0)
  const [hovered, setHovered] = useState<{ day: number; bucket: number } | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [metric, setMetric] = useState<Metric>('pageviews')
  const gridRef = useRef<HTMLDivElement>(null)

  // SWR instead of the imperative fetch (F17): a failed request renders an
  // error with a retry, not an empty heatmap explained as "too early to tell".
  // Filters ride the key (F14).
  const {
    data: swrData,
    error,
    isLoading,
    mutate: refetch,
  } = useDailyStats(siteId, dateRange?.start ?? '', dateRange?.end ?? '', 'hour', filters)
  const data = useMemo(() => swrData ?? [], [swrData])

  // Re-trigger the cell cascade whenever a fresh payload arrives.
  useEffect(() => {
    if (swrData) setAnimKey(k => k + 1)
  }, [swrData])

  const { grid, max, weekTotal } = useMemo(() => {
    // grid[day][bucket] — aggregate 2-hour buckets per selected metric.
    // Summable metrics (pageviews/visitors) sum. Average metrics
    // (avg_duration/bounce_rate) weight-average by visitors so busy
    // hours dominate.
    const grid: number[][] = Array.from({ length: 7 }, () => Array(BUCKETS).fill(0))
    const weights: number[][] = Array.from({ length: 7 }, () => Array(BUCKETS).fill(0))
    for (const d of data) {
      // The wire value is the SITE's wall clock — read it with UTC getters.
      // Local getters re-applied the VIEWER's offset: the heatmap was +2h off
      // for a Brussels owner and a whole weekday off in Auckland, and the
      // "busiest time" callout stated the shifted hour as fact (F10).
      const date = parseSiteWallClock(d.date) ?? new Date(d.date)
      const day = date.getUTCDay()
      const hour = date.getUTCHours()
      const adjustedDay = day === 0 ? 6 : day - 1
      const bucket = hour
      if (metric === 'pageviews') {
        grid[adjustedDay][bucket] += d.pageviews
      } else if (metric === 'visitors') {
        grid[adjustedDay][bucket] += d.visitors
      } else {
        const v = metric === 'avg_duration' ? d.avg_duration : d.bounce_rate
        // null = unmeasured: the bucket contributes no value and no weight,
        // instead of dragging the average down as a fabricated zero (F11).
        if (v == null) continue
        const w = d.visitors
        grid[adjustedDay][bucket] += v * w
        weights[adjustedDay][bucket] += w
      }
    }
    if (!isSummable(metric)) {
      for (let d = 0; d < 7; d++) {
        for (let b = 0; b < BUCKETS; b++) {
          grid[d][b] = weights[d][b] > 0 ? grid[d][b] / weights[d][b] : 0
        }
      }
    }
    const max = Math.max(...grid.flat(), 1)
    const weekTotal = isSummable(metric) ? grid.flat().reduce((a, b) => a + b, 0) : 0
    return { grid, max, weekTotal }
  }, [data, metric])

  const hasData = data.some(d => d.pageviews > 0)

  const bestTime = useMemo(() => {
    if (!hasData) return null
    let bestDay = 0, bestBucket = 0, bestVal = 0
    for (let d = 0; d < 7; d++) {
      for (let b = 0; b < BUCKETS; b++) {
        if (grid[d][b] > bestVal) {
          bestVal = grid[d][b]
          bestDay = d
          bestBucket = b
        }
      }
    }
    // An all-zero grid means NO bucket carried a measured value for this metric
    // (every bucket null-skipped under F11) — the loop never fired and
    // {day:0,bucket:0} would state "Mondays at 00:00" as a fact backed by zero
    // measurements. No measurement, no callout.
    if (bestVal === 0) return null
    return { day: bestDay, bucket: bestBucket }
  }, [grid, hasData])

  const tooltipData = useMemo(() => {
    if (!hovered) return null
    const { day, bucket } = hovered
    const value = grid[day][bucket]
    const pct = weekTotal > 0 ? Math.round((value / weekTotal) * 100) : 0
    return { value, pct }
  }, [hovered, grid, weekTotal])

  const handleCellMouseEnter = (
    e: React.MouseEvent<HTMLDivElement>,
    dayIdx: number,
    bucket: number
  ) => {
    setHovered({ day: dayIdx, bucket })
    if (gridRef.current) {
      const gridRect = gridRef.current.getBoundingClientRect()
      const cellRect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
      setTooltipPos({
        x: cellRect.left - gridRect.left + cellRect.width / 2,
        y: cellRect.top - gridRect.top,
      })
    }
  }

  return (
    <div className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 flex-wrap">
          {/* One Facet Switcher for every dimension card (owner pick C0, 06-09-2026). */}
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Peak hours metric"
            options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
            value={metric}
            onChange={(v) => setMetric(v as Metric)}
          />
          {/* Glyph closes the tab row — the dimension-card device (P2). The
              entry existed registry-complete but unwired (closeout C1). */}
          <TermInfoTip term="peak_hours" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 min-h-[270px] flex flex-col justify-center gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-7 h-3 rounded-none bg-neutral-800 animate-skeleton-fade" />
              <div className="flex-1 h-5 rounded-none bg-neutral-800 animate-skeleton-fade" />
            </div>
          ))}
        </div>
      ) : error && !swrData ? (
        <div className="flex-1 min-h-[270px] flex flex-col justify-center">
          <ErrorCard
            title="Couldn’t load peak hours"
            description="The rest of the dashboard is unaffected."
            onRetry={() => refetch()}
          />
        </div>
      ) : hasData ? (
        <>
          <div className="flex-1 min-h-[270px] flex flex-col justify-center gap-[3px] relative" ref={gridRef}>
            {/* Hour axis on TOP, per the approved mockup. */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-7 flex-shrink-0" />
              <div className="flex-1 relative h-3">
                {Object.entries(BUCKET_LABELS).map(([b, label]) => (
                  <span
                    key={b}
                    className="absolute text-micro-label text-neutral-600"
                    style={{ left: `${(Number(b) / BUCKETS) * 100}%` }}
                  >
                    {label}
                  </span>
                ))}
                <span
                  className="absolute text-micro-label text-neutral-600 -translate-x-full"
                  style={{ left: '100%' }}
                >
                  24:00
                </span>
              </div>
            </div>
            {grid.map((buckets, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-1.5">
                <span className="text-caption text-neutral-500 w-7 flex-shrink-0 text-right leading-none">
                  {DAYS[dayIdx]}
                </span>
                <div
                  className="flex-1"
                  style={{ display: 'grid', gridTemplateColumns: `repeat(${BUCKETS}, 1fr)`, gap: '3px' }}
                >
                  {buckets.map((value, bucket) => {
                    const isHoveredCell = hovered?.day === dayIdx && hovered?.bucket === bucket
                    const isBestCell = bestTime?.day === dayIdx && bestTime?.bucket === bucket
                    const isActive = value > 0
                    const highlightColor = getHighlightColor(value, max)

                    return (
                      <div
                        key={`${animKey}-${dayIdx}-${bucket}`}
                        className={[
                          'aspect-square w-full rounded-none border cursor-default transition-transform ease-apple duration-fast',
                          'border-neutral-800',
                          isActive ? 'animate-cell-highlight' : '',
                          isHoveredCell ? 'scale-110 z-10 relative' : '',
                          isBestCell && !isHoveredCell ? 'ring-1 ring-brand-orange/40' : '',
                        ].join(' ')}
                        style={{
                          animationDelay: isActive
                            ? `${((dayIdx * BUCKETS + bucket) * 0.008).toFixed(3)}s`
                            : undefined,
                          '--highlight': highlightColor,
                        } as CSSProperties}
                        onMouseEnter={(e) => handleCellMouseEnter(e, dayIdx, bucket)}
                        onMouseLeave={() => { setHovered(null); setTooltipPos(null) }}
                      />
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Intensity legend */}
            <div className="flex items-center justify-end gap-1.5 mt-2">
              <span className="text-micro-label text-neutral-500">Less</span>
              {HIGHLIGHT_COLORS.map((color, i) => (
                <div
                  key={i}
                  className="w-[10px] h-[10px] rounded-none border border-neutral-800"
                  style={{ backgroundColor: color }}
                />
              ))}
              <span className="text-micro-label text-neutral-500">More</span>
            </div>

            {/* Cell-anchored tooltip */}
            <AnimatePresence>
              {hovered && tooltipData && tooltipPos && (
                <motion.div
                  key="tooltip"
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: tooltipPos.x,
                    top: tooltipPos.y - 20,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <div className="bg-neutral-950 border border-neutral-800/60 text-white text-sm font-medium px-3 py-2 rounded-none whitespace-nowrap">
                    <div className="mb-1">
                      {DAYS[hovered.day]} {formatBucket(hovered.bucket)}
                    </div>
                    <div className="flex flex-col gap-0.5 text-xs text-neutral-400 font-normal">
                      <span>{formatMetricValue(tooltipData.value, metric)}</span>
                      {isSummable(metric) && tooltipData.value > 0 && (
                        // * "activity", not "visitors": the cells sum per-bucket session
                        // * counts, so a person active in two buckets is two units of this
                        // * denominator — it is a share of activity, never of people.
                        <span>{metric === 'visitors' ? `${tooltipData.pct}% of weekly activity` : `${tooltipData.pct}% of week's traffic`}</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Best time callout */}
          {bestTime && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION_SLOW, delay: 0.6, ease: EASE_APPLE }}
              className="mt-4 text-xs text-neutral-400 text-center"
            >
              {BEST_TIME_LABELS[metric]}{' '}
              <span className="text-brand-orange font-medium">
                {DAYS_FULL[bestTime.day]} at {formatHour(bestTime.bucket)}
              </span>
            </motion.p>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Clock />}
          title="Too early to tell"
          description="This heatmap needs a few days of traffic to reveal when your visitors are most active. Check back soon."
        />
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { Clock } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_FAST, DURATION_SLOW, EASE_APPLE } from '@/lib/motion'
import { logger } from '@/lib/utils/logger'
import { getDailyStats } from '@/lib/api/stats'
import type { DailyStat } from '@/lib/api/stats'

interface PeakHoursProps {
  siteId: string
  dateRange: { start: string, end: string }
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_FULL = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
const BUCKETS = 12 // 2-hour buckets
// Label at bucket index 0=00:00, 3=06:00, 6=12:00, 9=18:00
const BUCKET_LABELS: Record<number, string> = { 0: '00:00', 3: '06:00', 6: '12:00', 9: '18:00' }

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
  if (metric === 'visitors') return `${value.toLocaleString()} unique visitors`
  if (metric === 'avg_duration') {
    const mins = Math.floor(value / 60)
    const secs = Math.round(value % 60)
    return mins > 0 ? `${mins}m ${secs}s avg duration` : `${secs}s avg duration`
  }
  return `${Math.round(value)}% bounce rate`
}

function formatBucket(bucket: number): string {
  const hour = bucket * 2
  const end = hour + 2
  return `${String(hour).padStart(2, '0')}:00–${String(end).padStart(2, '0')}:00`
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

export default function PeakHours({ siteId, dateRange }: PeakHoursProps) {
  const [data, setData] = useState<DailyStat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [animKey, setAnimKey] = useState(0)
  const [hovered, setHovered] = useState<{ day: number; bucket: number } | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [metric, setMetric] = useState<Metric>('pageviews')
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const result = await getDailyStats(siteId, dateRange.start, dateRange.end, 'hour')
        setData(result)
        setAnimKey(k => k + 1)
      } catch (e) {
        logger.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [siteId, dateRange])

  const { grid, max, weekTotal } = useMemo(() => {
    // grid[day][bucket] — aggregate 2-hour buckets per selected metric.
    // Summable metrics (pageviews/visitors) sum. Average metrics
    // (avg_duration/bounce_rate) weight-average by visitors so busy
    // hours dominate.
    const grid: number[][] = Array.from({ length: 7 }, () => Array(BUCKETS).fill(0))
    const weights: number[][] = Array.from({ length: 7 }, () => Array(BUCKETS).fill(0))
    for (const d of data) {
      const date = new Date(d.date)
      const day = date.getDay()
      const hour = date.getHours()
      const adjustedDay = day === 0 ? 6 : day - 1
      const bucket = Math.floor(hour / 2)
      if (metric === 'pageviews') {
        grid[adjustedDay][bucket] += d.pageviews
      } else if (metric === 'visitors') {
        grid[adjustedDay][bucket] += d.visitors
      } else {
        const w = d.visitors
        const v = metric === 'avg_duration' ? d.avg_duration : d.bounce_rate
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
    <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 flex-wrap">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={`relative px-2.5 py-1 text-xs font-medium transition-colors duration-fast rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ${
                metric === m.key ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
              } ease-apple`}
            >
              {m.label}
              <span
                className={`absolute inset-x-0 -bottom-px h-[3px] rounded-full transition-all duration-base ease-apple ${
                  metric === m.key ? 'bg-brand-orange scale-x-100' : 'bg-transparent scale-x-0'
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 min-h-[270px] flex flex-col justify-center gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-7 h-3 rounded bg-neutral-800 animate-pulse" />
              <div className="flex-1 h-5 rounded bg-neutral-800 animate-pulse" />
            </div>
          ))}
        </div>
      ) : hasData ? (
        <>
          <div className="flex-1 min-h-[270px] flex flex-col justify-center gap-[5px] relative" ref={gridRef}>
            {grid.map((buckets, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-1.5">
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500 w-7 flex-shrink-0 text-right leading-none">
                  {DAYS[dayIdx]}
                </span>
                <div
                  className="flex-1"
                  style={{ display: 'grid', gridTemplateColumns: `repeat(${BUCKETS}, 1fr)`, gap: '5px' }}
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
                          'aspect-square w-full rounded-[4px] border cursor-default transition-transform ease-apple duration-fast',
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

            {/* Hour axis labels */}
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-7 flex-shrink-0" />
              <div className="flex-1 relative h-3">
                {Object.entries(BUCKET_LABELS).map(([b, label]) => (
                  <span
                    key={b}
                    className="absolute text-[10px] text-neutral-600 -translate-x-1/2"
                    style={{ left: `${(Number(b) / BUCKETS) * 100}%` }}
                  >
                    {label}
                  </span>
                ))}
                <span
                  className="absolute text-[10px] text-neutral-600 -translate-x-full"
                  style={{ left: '100%' }}
                >
                  24:00
                </span>
              </div>
            </div>

            {/* Intensity legend */}
            <div className="flex items-center justify-end gap-1.5 mt-2">
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">Less</span>
              {HIGHLIGHT_COLORS.map((color, i) => (
                <div
                  key={i}
                  className="w-[10px] h-[10px] rounded-[2px] border border-neutral-800"
                  style={{ backgroundColor: color }}
                />
              ))}
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">More</span>
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
                  <div className="bg-neutral-950 border border-neutral-800/60 text-white text-sm font-medium px-3 py-2 rounded-lg shadow-lg shadow-black/20 whitespace-nowrap">
                    <div className="mb-1">
                      {DAYS[hovered.day]} {formatBucket(hovered.bucket)}
                    </div>
                    <div className="flex flex-col gap-0.5 text-xs text-neutral-400 font-normal">
                      <span>{formatMetricValue(tooltipData.value, metric)}</span>
                      {isSummable(metric) && tooltipData.value > 0 && (
                        <span>{tooltipData.pct}% of week&apos;s {metric === 'visitors' ? 'visitors' : 'traffic'}</span>
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
                {DAYS_FULL[bestTime.day]} at {formatHour(bestTime.bucket * 2)}
              </span>
            </motion.p>
          )}
        </>
      ) : (
        <div className="flex-1 min-h-[270px] flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
          <div className="rounded-full bg-neutral-800 p-4">
            <Clock className="w-8 h-8 text-neutral-400" />
          </div>
          <h4 className="font-semibold text-white">
            No peak hours yet
          </h4>
          <p className="text-sm text-neutral-400 max-w-xs">
            Once your site receives traffic, this heatmap will show when your visitors are most active.
          </p>
        </div>
      )}
    </div>
  )
}

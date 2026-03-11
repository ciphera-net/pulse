'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { logger } from '@/lib/utils/logger'
import { getDailyStats } from '@/lib/api/stats'
import type { DailyStat } from '@/lib/api/stats'

interface PeakHoursProps {
  siteId: string
  dateRange: { start: string, end: string }
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_LABELS: Record<number, string> = { 0: '12am', 6: '6am', 12: '12pm', 18: '6pm' }

function formatHour(hour: number): string {
  if (hour === 0) return '12am'
  if (hour === 12) return '12pm'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

export default function PeakHours({ siteId, dateRange }: PeakHoursProps) {
  const [data, setData] = useState<DailyStat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [animKey, setAnimKey] = useState(0)
  const [hovered, setHovered] = useState<{ day: number; hour: number } | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
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

  const { grid, max, dayTotals, hourTotals, weekTotal } = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    for (const d of data) {
      const date = new Date(d.date)
      const day = date.getDay()
      const hour = date.getHours()
      const adjustedDay = day === 0 ? 6 : day - 1
      grid[adjustedDay][hour] += d.pageviews
    }
    const max = Math.max(...grid.flat(), 1)
    const dayTotals = grid.map(hours => hours.reduce((a, b) => a + b, 0))
    const hourTotals = Array.from({ length: 24 }, (_, h) => grid.reduce((a, row) => a + row[h], 0))
    const weekTotal = dayTotals.reduce((a, b) => a + b, 0)
    return { grid, max, dayTotals, hourTotals, weekTotal }
  }, [data])

  const hasData = data.some(d => d.pageviews > 0)

  const bestTime = useMemo(() => {
    if (!hasData) return null
    let bestDay = 0, bestHour = 0, bestVal = 0
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (grid[d][h] > bestVal) {
          bestVal = grid[d][h]
          bestDay = d
          bestHour = h
        }
      }
    }
    return { day: bestDay, hour: bestHour }
  }, [grid, hasData])

  const tooltipData = useMemo(() => {
    if (!hovered) return null
    const { day, hour } = hovered
    const value = grid[day][hour]
    const dayTotal = dayTotals[day]
    const hourTotal = hourTotals[hour]
    const pct = weekTotal > 0 ? Math.round((value / weekTotal) * 100) : 0
    return { value, dayTotal, hourTotal, pct }
  }, [hovered, grid, dayTotals, hourTotals, weekTotal])

  const handleCellMouseEnter = (
    e: React.MouseEvent<HTMLDivElement>,
    dayIdx: number,
    hour: number
  ) => {
    setHovered({ day: dayIdx, hour })
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
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Peak Hours</h3>
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
        When your visitors are most active
      </p>

      {isLoading ? (
        <div className="flex-1 min-h-[270px] flex flex-col justify-center gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-7 h-3 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
              <div className="flex-1 h-5 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
            </div>
          ))}
        </div>
      ) : hasData ? (
        <>
          <div className="flex-1 min-h-[270px] flex flex-col justify-center gap-1 relative" ref={gridRef}>
            {grid.map((hours, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-1.5">
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500 w-7 flex-shrink-0 text-right leading-none">
                  {DAYS[dayIdx]}
                </span>
                <div className="flex flex-1 gap-[2px]">
                  {hours.map((value, hour) => {
                    const isHoveredCell = hovered?.day === dayIdx && hovered?.hour === hour
                    const inRow = hovered?.day === dayIdx
                    const inCol = hovered?.hour === hour
                    const highlight = inRow || inCol
                    const dimmed = hovered !== null && !highlight

                    return (
                      <motion.div
                        key={`${animKey}-${dayIdx}-${hour}`}
                        className="flex-1 rounded-[2px] cursor-default"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{
                          opacity: dimmed ? 0.3 : 1,
                          scale: isHoveredCell ? 1.3 : 1,
                        }}
                        transition={
                          dimmed || isHoveredCell || highlight
                            ? { duration: 0.12 }
                            : {
                                opacity: { duration: 0.3, delay: (dayIdx * 24 + hour) * 0.003 },
                                scale: { duration: 0.3, delay: (dayIdx * 24 + hour) * 0.003, type: 'spring', stiffness: 300 },
                              }
                        }
                        style={{
                          aspectRatio: '1',
                          backgroundColor: value === 0
                            ? 'rgba(253,94,15,0.07)'
                            : `rgba(253,94,15,${Math.max(0.15, (value / max) * 0.92)})`,
                          zIndex: isHoveredCell ? 2 : 'auto',
                        }}
                        onMouseEnter={(e) => handleCellMouseEnter(e, dayIdx, hour)}
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
                {Object.entries(HOUR_LABELS).map(([h, label]) => (
                  <span
                    key={h}
                    className="absolute text-[10px] text-neutral-400 dark:text-neutral-600 -translate-x-1/2"
                    style={{ left: `${(Number(h) / 24) * 100}%` }}
                  >
                    {label}
                  </span>
                ))}
                <span className="absolute text-[10px] text-neutral-400 dark:text-neutral-600 -translate-x-full" style={{ left: '100%' }}>
                  12am
                </span>
              </div>
            </div>

            {/* Cell-anchored tooltip */}
            <AnimatePresence>
              {hovered && tooltipData && tooltipPos && (
                <motion.div
                  key="tooltip"
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  transition={{ duration: 0.12 }}
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: tooltipPos.x,
                    top: tooltipPos.y - 8,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <div className="bg-neutral-900 dark:bg-neutral-800 border border-neutral-700 text-white text-xs px-3 py-2 rounded-lg shadow-xl whitespace-nowrap">
                    <div className="font-semibold mb-1">
                      {DAYS[hovered.day]} {formatHour(hovered.hour)}
                    </div>
                    <div className="flex flex-col gap-0.5 text-neutral-300">
                      <span>{tooltipData.value.toLocaleString()} pageviews</span>
                      <span>{tooltipData.pct}% of week&apos;s traffic</span>
                    </div>
                  </div>
                  {/* Arrow */}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full w-0 h-0"
                    style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #404040' }} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Best time callout */}
          {bestTime && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              className="mt-4 text-xs text-neutral-500 dark:text-neutral-400 text-center"
            >
              Your busiest time is{' '}
              <span className="text-brand-orange font-medium">
                {DAYS[bestTime.day]}s at {formatHour(bestTime.hour)}
              </span>
            </motion.p>
          )}
        </>
      ) : (
        <div className="flex-1 min-h-[270px] flex flex-col items-center justify-center text-center gap-3">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No data available for this period
          </p>
        </div>
      )}
    </div>
  )
}

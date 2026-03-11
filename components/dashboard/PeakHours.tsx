'use client'

import { useState, useEffect, useMemo } from 'react'
import { logger } from '@/lib/utils/logger'
import { getDailyStats } from '@/lib/api/stats'
import type { DailyStat } from '@/lib/api/stats'

interface PeakHoursProps {
  siteId: string
  dateRange: { start: string, end: string }
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_LABELS: Record<number, string> = { 0: '12am', 6: '6am', 12: '12pm', 18: '6pm' }

export default function PeakHours({ siteId, dateRange }: PeakHoursProps) {
  const [data, setData] = useState<DailyStat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tooltip, setTooltip] = useState<{ day: number; hour: number; value: number } | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const result = await getDailyStats(siteId, dateRange.start, dateRange.end, 'hour')
        setData(result)
      } catch (e) {
        logger.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [siteId, dateRange])

  const { grid, max } = useMemo(() => {
    // grid[adjustedDay][hour] where Mon=0 ... Sun=6
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    for (const d of data) {
      const date = new Date(d.date)
      const day = date.getDay() // 0=Sun
      const hour = date.getHours()
      const adjustedDay = day === 0 ? 6 : day - 1 // Mon=0 ... Sun=6
      grid[adjustedDay][hour] += d.pageviews
    }
    const max = Math.max(...grid.flat(), 1)
    return { grid, max }
  }, [data])

  const hasData = data.some(d => d.pageviews > 0)

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
        <div className="flex-1 min-h-[270px] flex flex-col justify-center gap-1 relative">
          {grid.map((hours, dayIdx) => (
            <div key={dayIdx} className="flex items-center gap-1.5">
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500 w-7 flex-shrink-0 text-right leading-none">
                {DAYS[dayIdx]}
              </span>
              <div className="flex flex-1 gap-[2px]">
                {hours.map((value, hour) => (
                  <div
                    key={hour}
                    className="flex-1 rounded-[2px] cursor-default relative"
                    style={{
                      aspectRatio: '1',
                      backgroundColor: value === 0
                        ? 'rgba(253,94,15,0.07)'
                        : `rgba(253,94,15,${Math.max(0.15, (value / max) * 0.92)})`,
                    }}
                    onMouseEnter={() => setTooltip({ day: dayIdx, hour, value })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
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

          {/* Tooltip */}
          {tooltip && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-neutral-900 dark:bg-neutral-800 border border-neutral-700 text-white text-xs px-2 py-1 rounded-lg pointer-events-none whitespace-nowrap z-10">
              {DAYS[tooltip.day]} {tooltip.hour}:00 — {tooltip.value} pageviews
            </div>
          )}
        </div>
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

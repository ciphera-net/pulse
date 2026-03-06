'use client'

import { formatNumber } from '@ciphera-net/ui'
import { BarChartIcon } from '@ciphera-net/ui'
import type { GoalCountStat } from '@/lib/api/stats'

interface ScrollDepthProps {
  goalCounts: GoalCountStat[]
  totalPageviews: number
}

const THRESHOLDS = [25, 50, 75, 100] as const

export default function ScrollDepth({ goalCounts, totalPageviews }: ScrollDepthProps) {
  const scrollCounts = new Map<number, number>()
  for (const row of goalCounts) {
    const match = row.event_name.match(/^scroll_(\d+)$/)
    if (match) {
      scrollCounts.set(Number(match[1]), row.count)
    }
  }

  const hasData = scrollCounts.size > 0 && totalPageviews > 0

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Scroll Depth
        </h3>
      </div>

      {hasData ? (
        <div className="space-y-3 flex-1 min-h-[200px]">
          {THRESHOLDS.map((threshold) => {
            const count = scrollCounts.get(threshold) ?? 0
            const pct = totalPageviews > 0 ? Math.round((count / totalPageviews) * 100) : 0
            const barWidth = Math.max(pct, 2)

            return (
              <div key={threshold} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {threshold}%
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 dark:text-neutral-400 tabular-nums">
                      {formatNumber(count)}
                    </span>
                    <span className="font-semibold text-brand-orange tabular-nums w-12 text-right">
                      {pct}%
                    </span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-orange transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center text-center px-6 py-8 gap-4">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
            <BarChartIcon className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
          </div>
          <h4 className="font-semibold text-neutral-900 dark:text-white">
            No scroll data yet
          </h4>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md">
            Scroll depth tracking is automatic — data will appear here once visitors start scrolling on your pages.
          </p>
        </div>
      )}
    </div>
  )
}

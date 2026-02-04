'use client'

import { formatNumber } from '@/lib/utils/format'
import type { GoalCountStat } from '@/lib/api/stats'

interface GoalStatsProps {
  goalCounts: GoalCountStat[]
  siteId: string
  dateRange: { start: string; end: string }
}

const LIMIT = 10

export default function GoalStats({ goalCounts, siteId, dateRange }: GoalStatsProps) {
  const list = (goalCounts || []).slice(0, LIMIT)
  const hasData = list.length > 0

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Goals & Events
        </h3>
      </div>

      <div className="space-y-2 flex-1 min-h-[200px]">
        {hasData ? (
          list.map((row) => (
            <div
              key={row.event_name}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <span className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                {row.event_name.replace(/_/g, ' ')}
              </span>
              <span className="text-sm font-semibold text-brand-orange tabular-nums">
                {formatNumber(row.count)}
              </span>
            </div>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <p className="text-neutral-500 dark:text-neutral-400 text-sm">
              No custom events in this period. Track goals with <code className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-xs">pulse.track(&apos;event_name&apos;)</code> in your snippet.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

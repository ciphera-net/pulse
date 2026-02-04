'use client'

import Link from 'next/link'
import { formatNumber } from '@/lib/utils/format'
import { BookOpenIcon, ArrowRightIcon } from '@ciphera-net/ui'
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

      {hasData ? (
        <div className="space-y-2 flex-1 min-h-[200px]">
          {list.map((row) => (
            <div
              key={row.event_name}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <span className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                {row.display_name ?? row.event_name.replace(/_/g, ' ')}
              </span>
              <span className="text-sm font-semibold text-brand-orange tabular-nums">
                {formatNumber(row.count)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center text-center px-6 py-8 gap-4">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
            <BookOpenIcon className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
          </div>
          <h4 className="font-semibold text-neutral-900 dark:text-white">
            Need help tracking goals?
          </h4>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md">
            Add <code className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-xs font-mono">pulse.track(&apos;event_name&apos;)</code> where actions happen on your site, then see counts here. Check our guide for step-by-step instructions.
          </p>
          <Link
            href="/installation"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-orange hover:text-brand-orange/90 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-orange/20 rounded"
          >
            Read documentation
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  )
}

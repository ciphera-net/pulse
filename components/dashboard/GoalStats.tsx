'use client'

import Link from 'next/link'
import { formatNumber } from '@ciphera-net/ui'
import { BookOpenIcon, ArrowRightIcon } from '@ciphera-net/ui'
import type { GoalCountStat } from '@/lib/api/stats'

interface GoalStatsProps {
  goalCounts: GoalCountStat[]
  onSelectEvent?: (eventName: string) => void
}

const LIMIT = 10

export default function GoalStats({ goalCounts, onSelectEvent }: GoalStatsProps) {
  const list = (goalCounts || []).slice(0, LIMIT)
  const hasData = list.length > 0
  const total = list.reduce((sum, r) => sum + r.count, 0)
  const emptySlots = Math.max(0, 6 - list.length)

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Goals & Events
        </h3>
      </div>

      {hasData ? (
        <div className="flex-1 min-h-[200px]">
          {list.map((row) => (
            <div
              key={row.event_name}
              onClick={() => onSelectEvent?.(row.event_name)}
              className={`flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors${onSelectEvent ? ' cursor-pointer' : ''}`}
            >
              <div className="flex items-center flex-1 min-w-0">
                <span className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                  {row.display_name ?? row.event_name.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                  {total > 0 ? `${Math.round((row.count / total) * 100)}%` : ''}
                </span>
                <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 tabular-nums">
                  {formatNumber(row.count)}
                </span>
              </div>
            </div>
          ))}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
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
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-orange hover:text-brand-orange/90 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/20 rounded"
          >
            Read documentation
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  )
}

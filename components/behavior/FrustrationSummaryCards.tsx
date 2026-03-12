'use client'

import type { FrustrationSummary } from '@/lib/api/stats'

interface FrustrationSummaryCardsProps {
  data: FrustrationSummary | null
  loading: boolean
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return 100
  return Math.round(((current - previous) / previous) * 100)
}

function ChangeIndicator({ change }: { change: number | null }) {
  if (change === null) return null
  const isUp = change > 0
  const isDown = change < 0
  return (
    <span
      className={`text-xs font-medium ${
        isUp
          ? 'text-red-600 dark:text-red-400'
          : isDown
            ? 'text-green-600 dark:text-green-400'
            : 'text-neutral-500 dark:text-neutral-400'
      }`}
    >
      {isUp ? '+' : ''}{change}%
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-700 rounded" />
        <div className="h-8 w-16 bg-neutral-200 dark:bg-neutral-700 rounded" />
        <div className="h-3 w-32 bg-neutral-200 dark:bg-neutral-700 rounded" />
      </div>
    </div>
  )
}

export default function FrustrationSummaryCards({ data, loading }: FrustrationSummaryCardsProps) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  const rageChange = pctChange(data.rage_clicks, data.prev_rage_clicks)
  const deadChange = pctChange(data.dead_clicks, data.prev_dead_clicks)
  const topPage = data.rage_top_page || data.dead_top_page
  const totalSignals = data.rage_clicks + data.dead_clicks

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      {/* Rage Clicks */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
          Rage Clicks
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">
            {data.rage_clicks.toLocaleString()}
          </span>
          <ChangeIndicator change={rageChange} />
        </div>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
          {data.rage_unique_elements} unique elements
        </p>
      </div>

      {/* Dead Clicks */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
          Dead Clicks
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">
            {data.dead_clicks.toLocaleString()}
          </span>
          <ChangeIndicator change={deadChange} />
        </div>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
          {data.dead_unique_elements} unique elements
        </p>
      </div>

      {/* Total Frustration Signals */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
          Total Signals
        </p>
        <span className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">
          {totalSignals.toLocaleString()}
        </span>
        {topPage ? (
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
            Top page: {topPage}
          </p>
        ) : (
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
            No data in this period
          </p>
        )}
      </div>
    </div>
  )
}

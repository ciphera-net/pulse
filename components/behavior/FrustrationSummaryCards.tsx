'use client'

import type { FrustrationSummary } from '@/lib/api/stats'
import { StatCardSkeleton } from '@/components/skeletons'

interface FrustrationSummaryCardsProps {
  data: FrustrationSummary | null
  loading: boolean
}

function pctChange(current: number, previous: number): { type: 'pct'; value: number } | { type: 'new' } | null {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return { type: 'new' }
  return { type: 'pct', value: Math.round(((current - previous) / previous) * 100) }
}

function ChangeIndicator({ change }: { change: ReturnType<typeof pctChange> }) {
  if (change === null) return null
  if (change.type === 'new') {
    return (
      <span className="text-xs font-medium bg-brand-orange/10 text-brand-orange px-1.5 py-0.5 rounded">
        New
      </span>
    )
  }
  const isUp = change.value > 0
  const isDown = change.value < 0
  return (
    <span
      className={`text-xs font-medium ${
        isUp
          ? 'text-red-600 dark:text-red-400'
          : isDown
            ? 'text-green-600 dark:text-green-400'
            : 'text-neutral-400'
      }`}
    >
      {isUp ? '+' : ''}{change.value}%
    </span>
  )
}

export default function FrustrationSummaryCards({ data, loading }: FrustrationSummaryCardsProps) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
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
      <div className="glass-surface rounded-2xl p-6">
        <p className="text-sm font-medium text-neutral-400 mb-1">
          Rage Clicks
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-white tabular-nums">
            {data.rage_clicks.toLocaleString()}
          </span>
          <ChangeIndicator change={rageChange} />
        </div>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
          {data.rage_unique_elements} unique elements
        </p>
      </div>

      {/* Dead Clicks */}
      <div className="glass-surface rounded-2xl p-6">
        <p className="text-sm font-medium text-neutral-400 mb-1">
          Dead Clicks
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-white tabular-nums">
            {data.dead_clicks.toLocaleString()}
          </span>
          <ChangeIndicator change={deadChange} />
        </div>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
          {data.dead_unique_elements} unique elements
        </p>
      </div>

      {/* Total Frustration Signals */}
      <div className="glass-surface rounded-2xl p-6">
        <p className="text-sm font-medium text-neutral-400 mb-1">
          Total Signals
        </p>
        <span className="text-2xl font-semibold text-white tabular-nums">
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

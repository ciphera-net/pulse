'use client'

import { TrendUp } from '@phosphor-icons/react'

import { EmptyState } from '@/components/ui/EmptyState'
import { DonutChart } from '@/components/ui/donut-chart'
import type { FrustrationSummary } from '@/lib/api/stats'
import { WidgetSkeleton } from '@/components/skeletons'

interface FrustrationTrendProps {
  summary: FrustrationSummary | null
  loading: boolean
}

const LABELS: Record<string, string> = {
  rage_clicks: 'Rage Clicks',
  dead_clicks: 'Dead Clicks',
  prev_rage_clicks: 'Prev Rage Clicks',
  prev_dead_clicks: 'Prev Dead Clicks',
}

const COLORS = {
  rage_clicks: 'rgba(253, 94, 15, 0.7)',
  dead_clicks: 'rgba(180, 83, 9, 0.7)',
  prev_rage_clicks: 'rgba(253, 94, 15, 0.35)',
  prev_dead_clicks: 'rgba(180, 83, 9, 0.35)',
} as const

export default function FrustrationTrend({ summary, loading }: FrustrationTrendProps) {
  if (loading || !summary) return <WidgetSkeleton />

  const hasData = summary.rage_clicks > 0 || summary.dead_clicks > 0 ||
    summary.prev_rage_clicks > 0 || summary.prev_dead_clicks > 0

  const totalCurrent = summary.rage_clicks + summary.dead_clicks
  const totalPrevious = summary.prev_rage_clicks + summary.prev_dead_clicks
  const totalChange = totalPrevious > 0
    ? Math.round(((totalCurrent - totalPrevious) / totalPrevious) * 100)
    : null
  const hasPrevious = totalPrevious > 0

  const chartData = [
    { label: LABELS.rage_clicks, value: summary.rage_clicks, fill: COLORS.rage_clicks },
    { label: LABELS.dead_clicks, value: summary.dead_clicks, fill: COLORS.dead_clicks },
    { label: LABELS.prev_rage_clicks, value: summary.prev_rage_clicks, fill: COLORS.prev_rage_clicks },
    { label: LABELS.prev_dead_clicks, value: summary.prev_dead_clicks, fill: COLORS.prev_dead_clicks },
  ].filter(d => d.value > 0)

  if (!hasData) {
    return (
      <div className="glass-surface rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-white">
            Frustration Trend
          </h3>
        </div>
        <p className="text-sm text-neutral-400 mb-4">
          Rage vs. dead click breakdown
        </p>
        <div className="flex-1 min-h-[270px] flex flex-col items-center justify-center">
          <EmptyState
            icon={<TrendUp />}
            title="No trend data yet"
            description="The frustration trend chart needs a few days of data before patterns emerge."
          />
        </div>
      </div>
    )
  }

  return (
    <div className="glass-surface rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-white">
          Frustration Trend
        </h3>
      </div>
      <p className="text-sm text-neutral-400 mb-4">
        {hasPrevious
          ? 'Rage and dead clicks split across current and previous period'
          : 'Rage vs. dead click breakdown'}
      </p>

      <div className="flex-1 flex items-center justify-center">
        <DonutChart
          data={chartData}
          innerRadius={0.6}
          size={220}
          centerLabel={
            <div className="text-center">
              <p className="text-lg font-semibold text-white">{totalCurrent.toLocaleString()}</p>
              <p className="text-xs text-neutral-400">total</p>
            </div>
          }
        />
      </div>

      <div className="flex items-center justify-center gap-2 text-sm font-medium pt-2">
        {totalChange !== null ? (
          <>
            {totalChange > 0 ? 'Up' : totalChange < 0 ? 'Down' : 'No change'} by {Math.abs(totalChange)}% vs previous period <TrendUp className="h-4 w-4" />
          </>
        ) : totalCurrent > 0 ? (
          <>
            {totalCurrent.toLocaleString()} new signals this period <TrendUp className="h-4 w-4" />
          </>
        ) : (
          'No frustration signals detected'
        )}
      </div>
    </div>
  )
}

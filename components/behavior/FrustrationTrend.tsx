'use client'

import { TrendUp } from '@phosphor-icons/react'
import { Pie, PieChart, Tooltip } from 'recharts'

import {
  ChartContainer,
  type ChartConfig,
} from '@/components/charts'
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

const chartConfig = {
  count: { label: 'Count' },
  rage_clicks: { label: 'Rage Clicks', color: COLORS.rage_clicks },
  dead_clicks: { label: 'Dead Clicks', color: COLORS.dead_clicks },
  prev_rage_clicks: { label: 'Prev Rage Clicks', color: COLORS.prev_rage_clicks },
  prev_dead_clicks: { label: 'Prev Dead Clicks', color: COLORS.prev_dead_clicks },
} satisfies ChartConfig

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { type: string; count: number; fill: string } }> }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div className="flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2.5 py-1.5 text-xs shadow-xl">
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: item.fill }}
      />
      <span className="text-neutral-400">
        {LABELS[item.type] ?? item.type}
      </span>
      <span className="font-mono font-medium tabular-nums text-neutral-900 dark:text-neutral-50">
        {item.count.toLocaleString()}
      </span>
    </div>
  )
}

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
    { type: 'rage_clicks', count: summary.rage_clicks, fill: COLORS.rage_clicks },
    { type: 'dead_clicks', count: summary.dead_clicks, fill: COLORS.dead_clicks },
    { type: 'prev_rage_clicks', count: summary.prev_rage_clicks, fill: COLORS.prev_rage_clicks },
    { type: 'prev_dead_clicks', count: summary.prev_dead_clicks, fill: COLORS.prev_dead_clicks },
  ].filter(d => d.count > 0)

  if (!hasData) {
    return (
      <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-white">
            Frustration Trend
          </h3>
        </div>
        <p className="text-sm text-neutral-400 mb-4">
          Rage vs. dead click breakdown
        </p>
        <div className="flex-1 min-h-[270px] flex flex-col items-center justify-center text-center px-6 py-8 gap-4">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
            <TrendUp className="w-8 h-8 text-neutral-400" />
          </div>
          <h4 className="font-semibold text-white">
            No trend data yet
          </h4>
          <p className="text-sm text-neutral-400 max-w-md">
            Frustration trend data will appear here once rage clicks or dead clicks are detected on your site.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6 h-full flex flex-col">
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

      <div className="flex-1">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart>
            <Tooltip
              cursor={false}
              content={<CustomTooltip />}
            />
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="type"
              stroke="0"
            />
          </PieChart>
        </ChartContainer>
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

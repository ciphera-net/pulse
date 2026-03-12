'use client'

import { TrendUp } from '@phosphor-icons/react'
import { Pie, PieChart } from 'recharts'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/charts'
import type { FrustrationSummary } from '@/lib/api/stats'

interface FrustrationTrendProps {
  summary: FrustrationSummary | null
  loading: boolean
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
      <div className="animate-pulse space-y-3 mb-4">
        <div className="h-5 w-36 bg-neutral-200 dark:bg-neutral-700 rounded" />
        <div className="h-4 w-48 bg-neutral-200 dark:bg-neutral-700 rounded" />
      </div>
      <div className="flex-1 min-h-[270px] animate-pulse flex items-center justify-center">
        <div className="w-[200px] h-[200px] rounded-full bg-neutral-200 dark:bg-neutral-700" />
      </div>
    </div>
  )
}

const chartConfig = {
  count: {
    label: 'Count',
  },
  rage_clicks: {
    label: 'Rage Clicks',
    color: '#FD5E0F',
  },
  dead_clicks: {
    label: 'Dead Clicks',
    color: '#F59E0B',
  },
  prev_rage_clicks: {
    label: 'Prev Rage Clicks',
    color: '#78350F',
  },
  prev_dead_clicks: {
    label: 'Prev Dead Clicks',
    color: '#92400E',
  },
} satisfies ChartConfig

export default function FrustrationTrend({ summary, loading }: FrustrationTrendProps) {
  if (loading || !summary) return <SkeletonCard />

  const hasData = summary.rage_clicks > 0 || summary.dead_clicks > 0 ||
    summary.prev_rage_clicks > 0 || summary.prev_dead_clicks > 0

  const totalCurrent = summary.rage_clicks + summary.dead_clicks
  const totalPrevious = summary.prev_rage_clicks + summary.prev_dead_clicks
  const totalChange = totalPrevious > 0
    ? Math.round(((totalCurrent - totalPrevious) / totalPrevious) * 100)
    : null

  const chartData = [
    { type: 'rage_clicks', count: summary.rage_clicks, fill: 'var(--color-rage_clicks)' },
    { type: 'dead_clicks', count: summary.dead_clicks, fill: 'var(--color-dead_clicks)' },
    { type: 'prev_rage_clicks', count: summary.prev_rage_clicks, fill: 'var(--color-prev_rage_clicks)' },
    { type: 'prev_dead_clicks', count: summary.prev_dead_clicks, fill: 'var(--color-prev_dead_clicks)' },
  ]

  if (!hasData) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Frustration Trend
          </h3>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          Current vs. previous period comparison
        </p>
        <div className="flex-1 min-h-[270px] flex flex-col items-center justify-center text-center px-6 py-8 gap-4">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
            <TrendUp className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
          </div>
          <h4 className="font-semibold text-neutral-900 dark:text-white">
            No trend data yet
          </h4>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md">
            Frustration trend data will appear here once rage clicks or dead clicks are detected across periods.
          </p>
        </div>
      </div>
    )
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="items-center pb-0">
        <CardTitle>Frustration Trend</CardTitle>
        <CardDescription>Current vs. previous period</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="type"
              stroke="0"
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center gap-2 leading-none font-medium">
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
        <div className="leading-none text-muted-foreground">
          {totalCurrent.toLocaleString()} total signals in current period
        </div>
      </CardFooter>
    </Card>
  )
}

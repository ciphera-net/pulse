'use client'

import { useMemo } from 'react'
import { useTheme } from '@ciphera-net/ui'
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/line-charts-6'
import { useGSCDailyTotals } from '@/lib/swr/dashboard'
import { SkeletonLine } from '@/components/skeletons'
import { formatDateShort } from '@/lib/utils/formatDate'

// ─── Config ─────────────────────────────────────────────────────

const chartConfig = {
  clicks: { label: 'Clicks', color: '#FD5E0F' },
  impressions: { label: 'Impressions', color: '#9CA3AF' },
} satisfies ChartConfig

// ─── Custom Tooltip ─────────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null

  const clicks = payload.find((p) => p.dataKey === 'clicks')
  const impressions = payload.find((p) => p.dataKey === 'impressions')

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3 shadow-sm shadow-black/5 min-w-[140px]">
      <div className="text-xs text-neutral-400 mb-1.5">{label}</div>
      {clicks && (
        <div className="flex items-center gap-2 text-sm">
          <div className="size-1.5 rounded-full" style={{ backgroundColor: '#FD5E0F' }} />
          <span className="text-neutral-400">Clicks:</span>
          <span className="font-semibold text-white">{clicks.value.toLocaleString()}</span>
        </div>
      )}
      {impressions && (
        <div className="flex items-center gap-2 text-sm mt-1">
          <div className="size-1.5 rounded-full" style={{ backgroundColor: '#9CA3AF' }} />
          <span className="text-neutral-400">Impressions:</span>
          <span className="font-semibold text-white">{impressions.value.toLocaleString()}</span>
        </div>
      )}
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────────

interface ClicksImpressionsChartProps {
  siteId: string
  startDate: string
  endDate: string
}

export default function ClicksImpressionsChart({ siteId, startDate, endDate }: ClicksImpressionsChartProps) {
  const { resolvedTheme } = useTheme()
  const { data, isLoading } = useGSCDailyTotals(siteId, startDate, endDate)

  const chartData = useMemo(() => {
    if (!data?.daily_totals?.length) return []
    return data.daily_totals.map((item) => ({
      date: formatDateShort(new Date(item.date + 'T00:00:00')),
      clicks: item.clicks,
      impressions: item.impressions,
    }))
  }, [data])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="glass-surface rounded-xl p-4 mb-6">
        <SkeletonLine className="h-4 w-36 mb-3" />
        <SkeletonLine className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  // No data — don't render anything
  if (!chartData.length) return null

  const gridStroke = resolvedTheme === 'dark' ? '#374151' : '#e5e7eb'

  return (
    <div className="glass-surface rounded-xl p-4 mb-6">
      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
        Clicks &amp; Impressions
      </p>
      <ChartContainer
        config={chartConfig}
        className="h-64 w-full [&_.recharts-curve.recharts-tooltip-cursor]:stroke-[initial]"
      >
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
        >
          <defs>
            <linearGradient id="clicksFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FD5E0F" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#FD5E0F" stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid
            horizontal={true}
            vertical={false}
            stroke={gridStroke}
            strokeOpacity={0.7}
          />

          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            tickMargin={8}
            minTickGap={32}
          />

          <YAxis
            yAxisId="left"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            tickMargin={8}
            tickCount={5}
            tickFormatter={(v: number) => v.toLocaleString()}
          />

          <YAxis
            yAxisId="right"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            tickMargin={8}
            tickCount={5}
            tickFormatter={(v: number) => v.toLocaleString()}
          />

          <ChartTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#9ca3af' }} />

          <Area
            yAxisId="left"
            type="bump"
            dataKey="clicks"
            fill="url(#clicksFill)"
            stroke="none"
          />
          <Line
            yAxisId="left"
            type="bump"
            dataKey="clicks"
            stroke="#FD5E0F"
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 5,
              fill: '#FD5E0F',
              stroke: 'white',
              strokeWidth: 2,
            }}
          />

          <Line
            yAxisId="right"
            type="bump"
            dataKey="impressions"
            stroke="#9CA3AF"
            strokeWidth={2}
            dot={false}
            strokeDasharray="4 3"
            activeDot={{
              r: 5,
              fill: '#9CA3AF',
              stroke: 'white',
              strokeWidth: 2,
            }}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

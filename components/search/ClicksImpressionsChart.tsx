'use client'

import { useMemo } from 'react'
import { AreaChart, Area, Grid, XAxis, YAxis, ChartTooltip } from '@/components/ui/area-chart'
import { useGSCDailyTotals } from '@/lib/swr/dashboard'
import { SkeletonLine } from '@/components/skeletons'

// ─── Component ──────────────────────────────────────────────────

interface ClicksImpressionsChartProps {
  siteId: string
  startDate: string
  endDate: string
}

export default function ClicksImpressionsChart({ siteId, startDate, endDate }: ClicksImpressionsChartProps) {
  const { data, isLoading } = useGSCDailyTotals(siteId, startDate, endDate)

  const chartData = useMemo(() => {
    if (!data?.daily_totals?.length) return []
    return data.daily_totals.map((item) => ({
      // Full ISO date string so xAccessor can parse it with new Date()
      date: item.date + 'T00:00:00',
      clicks: item.clicks,
      impressions: item.impressions,
    }))
  }, [data])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="glass-surface rounded-2xl p-4 mb-6">
        <SkeletonLine className="h-4 w-36 mb-3" />
        <SkeletonLine className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  // No data — don't render anything
  if (!chartData.length) return null

  return (
    <div className="glass-surface rounded-2xl p-4 mb-6">
      <p className="text-sm font-medium text-neutral-300 mb-3">
        Clicks &amp; Impressions
      </p>
      <AreaChart
        data={chartData}
        xDataKey="date"
        className="h-64"
        margin={{ top: 8, right: 16, bottom: 36, left: 48 }}
        aspectRatio="unset"
      >
        <Grid horizontal vertical={false} numTicksRows={5} />
        <XAxis numTicks={5} />
        <YAxis numTicks={5} />
        <ChartTooltip
          showDatePill={false}
          rows={(point) => [
            {
              color: '#FD5E0F',
              label: 'Clicks',
              value: typeof point.clicks === 'number' ? point.clicks : 0,
            },
            {
              color: '#9CA3AF',
              label: 'Impressions',
              value: typeof point.impressions === 'number' ? point.impressions : 0,
            },
          ]}
        />
        {/* Clicks: orange gradient fill + orange stroke */}
        <Area
          dataKey="clicks"
          fill="#FD5E0F"
          fillOpacity={0.15}
          stroke="#FD5E0F"
          strokeWidth={2}
          gradientToOpacity={0}
        />
        {/* Impressions: no fill, grey stroke only */}
        <Area
          dataKey="impressions"
          fill="#9CA3AF"
          fillOpacity={0}
          stroke="#9CA3AF"
          strokeWidth={2}
          gradientToOpacity={0}
          showHighlight={false}
        />
      </AreaChart>
    </div>
  )
}

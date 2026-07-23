'use client'

import { useMemo } from 'react'
import { AreaChart, Area, Grid, XAxis, YAxis, ChartTooltip } from '@/components/ui/area-chart'
import type { FunnelStepStats } from '@/lib/api/funnels'
import { useFunnelTrends } from '@/lib/swr/dashboard'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { formatDateShort } from '@/lib/utils/formatDate'

// ---------------------------------------------------------------------------
// Overall funnel conversion over time — a single orange series on the shared
// area-chart primitives, numeric DD/MM axis. (Per-step series toggles were
// removed: multi-series on this chart was glitchy and the step drill-down
// already lives in the strip above.)
// ---------------------------------------------------------------------------

const ORANGE = '#FD5E0F'

interface FunnelTrendChartProps {
  siteId: string
  funnelId: string
  /** Kept for API symmetry with the other detail surfaces; unused here. */
  steps?: FunnelStepStats[]
  dateRange: { start: string; end: string }
  filters?: string
}

export function FunnelTrendChart({ siteId, funnelId, dateRange, filters }: FunnelTrendChartProps) {
  const {
    data: trends,
    error,
    isLoading,
    isValidating,
    mutate: retry,
  } = useFunnelTrends(siteId, funnelId, dateRange.start, dateRange.end, filters)

  const chartData = useMemo(() => {
    if (!trends?.dates?.length) return []
    return trends.dates.map((date, i) => ({
      date: date + 'T00:00:00',
      overall: trends.overall[i] ?? 0,
    }))
  }, [trends])

  return (
    <div className="relative rounded-none border border-border bg-card p-4">
      <UpdatingChip active={isValidating && !!trends} />
      <div className="mb-3">
        <span className="text-xs text-neutral-500">Conversion trend</span>
      </div>

      {/* Stable-height chart region */}
      <div className="h-64">
        {error ? (
          <ErrorCard
            title="Couldn't load the trend"
            onRetry={() => { void retry() }}
            className="py-8"
          />
        ) : isLoading && !trends ? null : chartData.length > 0 ? (
          <AreaChart
            data={chartData}
            xDataKey="date"
            className="h-64"
            margin={{ top: 8, right: 16, bottom: 36, left: 44 }}
            aspectRatio="unset"
          >
            <Grid horizontal vertical={false} numTicksRows={4} />
            <XAxis numTicks={6} formatLabel={(date) => formatDateShort(date)} />
            <YAxis numTicks={4} formatValue={(v) => `${Math.round(v)}%`} />
            <ChartTooltip
              showDatePill={false}
              rows={(point) => [
                {
                  color: ORANGE,
                  label: 'Overall',
                  value: `${Math.round(typeof point.overall === 'number' ? point.overall : 0)}%`,
                },
              ]}
            />
            <Area
              dataKey="overall"
              fill={ORANGE}
              fillOpacity={0.12}
              stroke={ORANGE}
              strokeWidth={2}
              gradientToOpacity={0}
            />
          </AreaChart>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-neutral-500">No trend data for this period yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useMemo } from 'react'
import { BarChart, Bar, BarXAxis, BarValueAxis, Grid, ChartTooltip } from '@/components/ui/bar-chart'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { useFrustrationDaily } from '@/lib/swr/dashboard'
import { formatDateShort } from '@/lib/utils/formatDate'

// ---------------------------------------------------------------------------
// Daily frustration trend — stacked rage/dead bars from the additive daily
// endpoint (one hue, two weights). Replaces the current-vs-previous donut that
// was never actually a trend. Stable height, DD/MM ticks, chart-system tooltip.
// ---------------------------------------------------------------------------

const RAGE = '#FD5E0F'
const DEAD = 'rgba(253, 94, 15, 0.35)'
const TOTAL_DOT = '#737373'

const num = (v: unknown) => (typeof v === 'number' ? v : 0)

interface FrustrationTrendProps {
  siteId: string
  start: string
  end: string
}

export default function FrustrationTrend({ siteId, start, end }: FrustrationTrendProps) {
  const { data, error, isLoading, isValidating, mutate } = useFrustrationDaily(siteId, start, end)

  const days = data?.days ?? []
  const hasSignals = days.some((d) => d.rage_clicks > 0 || d.dead_clicks > 0)
  const chartData = useMemo(
    () =>
      days.map((d) => ({
        label: formatDateShort(new Date(d.date + 'T00:00:00')),
        rage: d.rage_clicks,
        dead: d.dead_clicks,
      })),
    [days],
  )

  return (
    <div className="relative flex h-full flex-col rounded-none border border-border bg-card p-4">
      <UpdatingChip active={isValidating && !!data} />
      <div className="mb-3">
        <span className="font-mono text-xs text-neutral-500">Daily frustration</span>
      </div>

      <div className="h-64 flex-1">
        {error ? (
          <ErrorCard
            title="Couldn't load the trend"
            description="The daily series failed for this period."
            onRetry={() => { void mutate() }}
            className="py-8"
          />
        ) : isLoading && !data ? null : hasSignals ? (
          <BarChart
            data={chartData}
            xDataKey="label"
            className="h-64"
            aspectRatio="unset"
            margin={{ top: 8, right: 16, bottom: 36, left: 40 }}
            barGap={0.3}
          >
            <Grid horizontal vertical={false} numTicksRows={4} />
            <BarValueAxis numTicks={4} />
            <Bar dataKey="rage" stackId="signals" fill={RAGE} radius={0} />
            <Bar dataKey="dead" stackId="signals" fill={DEAD} radius={0} />
            <BarXAxis />
            <ChartTooltip
              rows={(point) => {
                const rage = num(point.rage)
                const dead = num(point.dead)
                return [
                  { color: RAGE, label: 'Rage clicks', value: rage },
                  { color: DEAD, label: 'Dead clicks', value: dead },
                  { color: TOTAL_DOT, label: 'Total', value: rage + dead },
                ]
              }}
            />
          </BarChart>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-neutral-500">Trend appears once signals are recorded.</p>
          </div>
        )}
      </div>
    </div>
  )
}

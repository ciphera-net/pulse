'use client'

import { useMemo, useState } from 'react'
import { AreaChart, Area, Grid, XAxis, YAxis, ChartTooltip } from '@/components/ui/area-chart'
import type { FunnelStepStats } from '@/lib/api/funnels'
import { useFunnelTrends } from '@/lib/swr/dashboard'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { formatDateShort } from '@/lib/utils/formatDate'

// ---------------------------------------------------------------------------
// Conversion trend over time on the shared area-chart primitives (they
// compose cleanly for multi-series — no fallback needed): overall conversion
// is the one orange series, per-step series toggle on via quiet chips and
// draw in neutral so orange stays scarce. Axes are numeric DD/MM.
// ---------------------------------------------------------------------------

const ORANGE = '#FD5E0F'
const NEUTRAL_400 = '#a3a3a3'

interface FunnelTrendChartProps {
  siteId: string
  funnelId: string
  steps: FunnelStepStats[]
  dateRange: { start: string; end: string }
  filters?: string
}

export function FunnelTrendChart({ siteId, funnelId, steps, dateRange, filters }: FunnelTrendChartProps) {
  const {
    data: trends,
    error,
    isLoading,
    isValidating,
    mutate: retry,
  } = useFunnelTrends(siteId, funnelId, dateRange.start, dateRange.end, filters)
  // * Trend series are keyed by step NAME in the API payload
  const [activeSteps, setActiveSteps] = useState<Set<string>>(new Set())

  const chartData = useMemo(() => {
    if (!trends?.dates?.length) return []
    return trends.dates.map((date, i) => {
      const point: Record<string, string | number> = {
        date: date + 'T00:00:00',
        overall: trends.overall[i] ?? 0,
      }
      for (const name of activeSteps) {
        point[name] = trends.steps[name]?.[i] ?? 0
      }
      return point
    })
  }, [trends, activeSteps])

  const toggleStep = (name: string) => {
    setActiveSteps((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const stepLabel = (s: FunnelStepStats) =>
    /^Step \d+$/.test(s.step.name) ? s.step.value : s.step.name

  return (
    <div className="relative rounded-none border border-border bg-card p-4">
      <UpdatingChip active={isValidating && !!trends} />
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-mono text-xs text-neutral-500">Conversion trend</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {steps.map((s, i) => {
            const active = activeSteps.has(s.step.name)
            return (
              <button
                key={`${s.step.name}-${i}`}
                type="button"
                aria-pressed={active}
                title={s.step.value}
                onClick={() => toggleStep(s.step.name)}
                className={`inline-flex max-w-40 items-center gap-1 rounded-none border px-2 py-0.5 text-xs transition-colors duration-fast ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange
                  ${active ? 'border-brand-orange/40 text-brand-orange' : 'border-neutral-800 text-neutral-500 hover:text-neutral-300'}`}
              >
                <span className="tabular-nums">{i + 1}</span>
                <span className="truncate">{stepLabel(s)}</span>
              </button>
            )
          })}
        </div>
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
                ...steps
                  .filter((s) => activeSteps.has(s.step.name))
                  .map((s) => ({
                    color: NEUTRAL_400,
                    label: stepLabel(s),
                    value: `${Math.round(typeof point[s.step.name] === 'number' ? (point[s.step.name] as number) : 0)}%`,
                  })),
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
            {steps
              .filter((s) => activeSteps.has(s.step.name))
              .map((s) => (
                <Area
                  key={s.step.name}
                  dataKey={s.step.name}
                  fill={NEUTRAL_400}
                  fillOpacity={0}
                  stroke={NEUTRAL_400}
                  strokeWidth={1.5}
                  gradientToOpacity={0}
                  showHighlight={false}
                />
              ))}
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

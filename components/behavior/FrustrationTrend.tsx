'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { TrendUp } from '@phosphor-icons/react'
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
      <div className="flex-1 min-h-[270px] animate-pulse flex items-end gap-6 justify-center pb-8">
        {[120, 80, 140, 100].map((h, i) => (
          <div key={i} className="w-12 bg-neutral-200 dark:bg-neutral-700 rounded-t" style={{ height: h }} />
        ))}
      </div>
    </div>
  )
}

export default function FrustrationTrend({ summary, loading }: FrustrationTrendProps) {
  if (loading || !summary) return <SkeletonCard />

  const hasData = summary.rage_clicks > 0 || summary.dead_clicks > 0 ||
    summary.prev_rage_clicks > 0 || summary.prev_dead_clicks > 0

  const chartData = [
    {
      label: 'Rage',
      current: summary.rage_clicks,
      previous: summary.prev_rage_clicks,
    },
    {
      label: 'Dead',
      current: summary.dead_clicks,
      previous: summary.prev_dead_clicks,
    },
  ]

  const totalCurrent = summary.rage_clicks + summary.dead_clicks
  const totalPrevious = summary.prev_rage_clicks + summary.prev_dead_clicks
  const totalChange = totalPrevious > 0
    ? Math.round(((totalCurrent - totalPrevious) / totalPrevious) * 100)
    : null

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

      {hasData ? (
        <div className="flex-1 min-h-[270px] flex flex-col">
          {/* Summary line */}
          <div className="flex items-baseline gap-2 mb-6">
            <span className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">
              {totalCurrent.toLocaleString()}
            </span>
            <span className="text-sm text-neutral-400 dark:text-neutral-500">
              total signals
            </span>
            {totalChange !== null && (
              <span className={`text-xs font-medium ${
                totalChange > 0
                  ? 'text-red-600 dark:text-red-400'
                  : totalChange < 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-neutral-500 dark:text-neutral-400'
              }`}>
                {totalChange > 0 ? '+' : ''}{totalChange}%
              </span>
            )}
            {totalChange === null && totalCurrent > 0 && (
              <span className="text-xs font-medium bg-brand-orange/10 text-brand-orange px-1.5 py-0.5 rounded">
                New
              </span>
            )}
          </div>

          {/* Chart */}
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#a3a3a3', fontSize: 12 }}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{
                    backgroundColor: '#171717',
                    border: '1px solid #404040',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#fff',
                  }}
                  formatter={(value: number, name: string) => [
                    value.toLocaleString(),
                    name === 'current' ? 'Current' : 'Previous',
                  ]}
                />
                <Bar dataKey="previous" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="#404040" />
                  ))}
                </Bar>
                <Bar dataKey="current" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="#FD5E0F" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-4 text-xs text-neutral-400 dark:text-neutral-500">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-[#FD5E0F]" />
              <span>Current period</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-[#404040]" />
              <span>Previous period</span>
            </div>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  )
}

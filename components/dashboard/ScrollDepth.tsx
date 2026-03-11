'use client'

import { PolarAngleAxis, PolarGrid, Radar, RadarChart, Tooltip } from 'recharts'
import { BarChartIcon } from '@ciphera-net/ui'
import type { GoalCountStat } from '@/lib/api/stats'

interface ScrollDepthProps {
  goalCounts: GoalCountStat[]
  totalPageviews: number
}

const THRESHOLDS = [25, 50, 75, 100] as const

export default function ScrollDepth({ goalCounts, totalPageviews }: ScrollDepthProps) {
  const scrollCounts = new Map<number, number>()
  for (const row of goalCounts) {
    const match = row.event_name.match(/^scroll_(\d+)$/)
    if (match) {
      scrollCounts.set(Number(match[1]), row.count)
    }
  }

  const hasData = scrollCounts.size > 0 && totalPageviews > 0

  const chartData = THRESHOLDS.map((threshold) => ({
    label: `${threshold}%`,
    value: totalPageviews > 0 ? Math.round(((scrollCounts.get(threshold) ?? 0) / totalPageviews) * 100) : 0,
  }))

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Scroll Depth
        </h3>
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
        % of visitors who scrolled this far
      </p>

      {hasData ? (
        <div className="flex-1 min-h-[200px] flex items-center justify-center">
          <RadarChart
            width={420}
            height={380}
            data={chartData}
            margin={{ top: 20, right: 40, bottom: 20, left: 40 }}
          >
            <PolarGrid stroke="#404040" />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fill: '#a3a3a3', fontSize: 12, fontWeight: 500 }}
            />
            <Tooltip
              cursor={false}
              contentStyle={{
                backgroundColor: '#171717',
                border: '1px solid #404040',
                borderRadius: 8,
                fontSize: 12,
                color: '#fff',
              }}
              formatter={(value: number) => [`${value}%`, 'Reached']}
            />
            <Radar
              dataKey="value"
              stroke="#FD5E0F"
              fill="#FD5E0F"
              fillOpacity={0.6}
              dot={{ r: 4, fill: '#FD5E0F', fillOpacity: 1, strokeWidth: 0 }}
            />
          </RadarChart>
        </div>
      ) : (
        <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center text-center px-6 py-8 gap-4">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
            <BarChartIcon className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
          </div>
          <h4 className="font-semibold text-neutral-900 dark:text-white">
            No scroll data yet
          </h4>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md">
            Scroll depth tracking is automatic — data will appear here once visitors start scrolling on your pages.
          </p>
        </div>
      )}
    </div>
  )
}

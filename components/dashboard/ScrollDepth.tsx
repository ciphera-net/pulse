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
  // Raw counts: each event represents the MAX depth that visitor reached
  const rawCounts = new Map<number, number>()
  for (const row of goalCounts) {
    const match = row.event_name.match(/^scroll_(\d+)$/)
    if (match) {
      rawCounts.set(Number(match[1]), row.count)
    }
  }

  const hasData = rawCounts.size > 0 && totalPageviews > 0

  // Cumulative: scroll_100 implies 75, 50, 25 were also reached
  // So each threshold's count = its own count + all higher thresholds' counts
  const chartData = THRESHOLDS.map((threshold) => {
    const cumulative = THRESHOLDS
      .filter((t) => t >= threshold)
      .reduce((sum, t) => sum + (rawCounts.get(t) ?? 0), 0)
    return {
      label: `${threshold}%`,
      value: totalPageviews > 0 ? Math.round((cumulative / totalPageviews) * 100) : 0,
    }
  })

  return (
    <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-white">
          Scroll Depth
        </h3>
      </div>
      <p className="text-sm text-neutral-400 mb-4">
        % of visitors who scrolled this far
      </p>

      {hasData ? (
        <div className="flex-1 min-h-[270px] flex items-center justify-center">
          <RadarChart
            width={320}
            height={260}
            data={chartData}
            margin={{ top: 16, right: 32, bottom: 16, left: 32 }}
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
        <div className="flex-1 min-h-[270px] flex flex-col items-center justify-center text-center px-6 py-8 gap-4">
          <div className="rounded-full bg-neutral-800 p-4">
            <BarChartIcon className="w-8 h-8 text-neutral-400" />
          </div>
          <h4 className="font-semibold text-white">
            No scroll data yet
          </h4>
          <p className="text-sm text-neutral-400 max-w-md">
            Scroll depth tracking is automatic — data will appear here once visitors start scrolling on your pages.
          </p>
        </div>
      )}
    </div>
  )
}

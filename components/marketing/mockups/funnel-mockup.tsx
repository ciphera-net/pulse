'use client'

import { FunnelChart } from './funnel-chart'

const funnelData = [
  { label: 'Homepage', value: 1240 },
  { label: 'Pricing', value: 438 },
  { label: 'Signup', value: 87 },
]

export function FunnelMockup() {
  return (
    <div className="relative w-full max-w-[600px] mx-auto">
      <div className="rounded-xl border border-white/[0.08] bg-neutral-900/80 px-10 py-6 shadow-2xl">
        <h3 className="text-sm font-medium text-white mb-4">Funnel Visualization</h3>
        <FunnelChart
          data={funnelData}
          orientation="vertical"
          color="var(--chart-1, #FD5E0F)"
          layers={3}
          className="mx-auto"
        />
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-800 text-[10px] text-neutral-500">
          <span>Overall conversion: 7%</span>
          <span>7-day window</span>
        </div>
      </div>
    </div>
  )
}

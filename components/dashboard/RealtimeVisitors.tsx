'use client'

import { AnimatedNumber } from '@/components/ui/animated-number'

interface RealtimeVisitorsProps {
  count: number
}

export default function RealtimeVisitors({ count }: RealtimeVisitorsProps) {
  return (
    <div
      className="glass-surface rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-neutral-400">
          Real-time Visitors
        </div>
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
      </div>
      <div className="text-3xl font-bold tabular-nums text-white">
        <AnimatedNumber value={count} format={(v) => v.toLocaleString()} />
      </div>
    </div>
  )
}

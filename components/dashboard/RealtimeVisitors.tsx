'use client'

interface RealtimeVisitorsProps {
  count: number
}

export default function RealtimeVisitors({ count }: RealtimeVisitorsProps) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Real-time Visitors
        </div>
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
      </div>
      <div className="text-3xl font-bold text-neutral-900 dark:text-white">
        {count}
      </div>
    </div>
  )
}

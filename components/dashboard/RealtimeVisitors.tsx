'use client'

import { useRouter } from 'next/navigation'

interface RealtimeVisitorsProps {
  count: number
  siteId?: string
}

export default function RealtimeVisitors({ count, siteId }: RealtimeVisitorsProps) {
  const router = useRouter()
  
  return (
    <div 
      onClick={() => siteId && router.push(`/sites/${siteId}/realtime`)}
      className={`bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 ${siteId ? 'cursor-pointer hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors' : ''}`}
    >
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

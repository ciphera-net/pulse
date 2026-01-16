'use client'

import { formatNumber } from '@/lib/utils/format'

interface TopReferrersProps {
  referrers: Array<{ referrer: string; pageviews: number }>
}

export default function TopReferrers({ referrers }: TopReferrersProps) {
  if (!referrers || referrers.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">
          Top Referrers
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400">No data available</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">
        Top Referrers
      </h3>
      <div className="space-y-3">
        {referrers.map((ref, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex-1 truncate text-neutral-900 dark:text-white">
              {ref.referrer}
            </div>
            <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
              {formatNumber(ref.pageviews)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

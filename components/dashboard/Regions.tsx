'use client'

import { formatNumber } from '@/lib/utils/format'
import * as Flags from 'country-flag-icons/react/3x2'

interface RegionsProps {
  regions: Array<{ region: string; country: string; pageviews: number }>
}

export default function Regions({ regions }: RegionsProps) {
  if (!regions || regions.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">
          Regions
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400">No data available</p>
      </div>
    )
  }

  const getFlagComponent = (countryCode: string) => {
    if (!countryCode || countryCode === 'Unknown') return null
    const FlagComponent = (Flags as any)[countryCode]
    return FlagComponent ? <FlagComponent className="w-5 h-5 rounded-sm shadow-sm" /> : null
  }

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">
        Regions
      </h3>
      <div className="space-y-3">
        {regions.map((region, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
              <span className="shrink-0">{getFlagComponent(region.country)}</span>
              <span className="truncate">{region.region === 'Unknown' ? 'Unknown' : region.region}</span>
            </div>
            <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
              {formatNumber(region.pageviews)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

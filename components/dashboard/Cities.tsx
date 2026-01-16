'use client'

import { formatNumber } from '@/lib/utils/format'
import * as Flags from 'country-flag-icons/react/3x2'

interface CitiesProps {
  cities: Array<{ city: string; country: string; pageviews: number }>
}

export default function Cities({ cities }: CitiesProps) {
  if (!cities || cities.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">
          Cities
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
        Cities
      </h3>
      <div className="space-y-3">
        {cities.map((city, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
              <span className="shrink-0">{getFlagComponent(city.country)}</span>
              <span className="truncate">{city.city === 'Unknown' ? 'Unknown' : city.city}</span>
            </div>
            <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
              {formatNumber(city.pageviews)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

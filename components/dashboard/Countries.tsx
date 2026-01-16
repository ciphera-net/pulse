'use client'

import { formatNumber } from '@/lib/utils/format'

interface CountriesProps {
  countries: Array<{ country: string; pageviews: number }>
}

export default function Countries({ countries }: CountriesProps) {
  if (!countries || countries.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">
          Countries
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400">No data available</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">
        Countries
      </h3>
      <div className="space-y-3">
        {countries.map((country, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex-1 truncate text-neutral-900 dark:text-white">
              {country.country}
            </div>
            <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
              {formatNumber(country.pageviews)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

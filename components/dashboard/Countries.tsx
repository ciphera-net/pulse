'use client'

import { useState } from 'react'
import { formatNumber } from '@/lib/utils/format'
import * as Flags from 'country-flag-icons/react/3x2'

interface LocationProps {
  countries: Array<{ country: string; pageviews: number }>
  cities: Array<{ city: string; country: string; pageviews: number }>
  regions: Array<{ region: string; country: string; pageviews: number }>
}

type Tab = 'countries' | 'regions' | 'cities'

export default function Locations({ countries, cities, regions }: LocationProps) {
  const [activeTab, setActiveTab] = useState<Tab>('countries')

  const getFlagComponent = (countryCode: string) => {
    if (!countryCode || countryCode === 'Unknown') return null
    // * The API returns 2-letter country codes (e.g. US, DE)
    // * We cast it to the flag component name
    const FlagComponent = (Flags as any)[countryCode]
    return FlagComponent ? <FlagComponent className="w-5 h-5 rounded-sm shadow-sm" /> : null
  }

  const getCountryName = (code: string) => {
    if (!code || code === 'Unknown') return 'Unknown'
    try {
      const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
      return regionNames.of(code) || code
    } catch (e) {
      return code
    }
  }

  const renderContent = () => {
    if (activeTab === 'countries') {
      if (!countries || countries.length === 0) {
        return <p className="text-neutral-600 dark:text-neutral-400">No data available</p>
      }
      return (
        <div className="space-y-3">
          {countries.map((country, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                <span className="shrink-0">{getFlagComponent(country.country)}</span>
                <span className="truncate">{getCountryName(country.country)}</span>
              </div>
              <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
                {formatNumber(country.pageviews)}
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (activeTab === 'regions') {
      if (!regions || regions.length === 0) {
        return <p className="text-neutral-600 dark:text-neutral-400">No data available</p>
      }
      return (
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
      )
    }

    if (activeTab === 'cities') {
      if (!cities || cities.length === 0) {
        return <p className="text-neutral-600 dark:text-neutral-400">No data available</p>
      }
      return (
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
      )
    }
  }

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 h-full">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Locations
        </h3>
        <div className="flex p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
          <button
            onClick={() => setActiveTab('countries')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'countries'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Countries
          </button>
          <button
            onClick={() => setActiveTab('regions')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'regions'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Regions
          </button>
          <button
            onClick={() => setActiveTab('cities')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'cities'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Cities
          </button>
        </div>
      </div>
      {renderContent()}
    </div>
  )
}

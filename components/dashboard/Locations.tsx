'use client'

import { useState } from 'react'
import { formatNumber } from '@/lib/utils/format'
import * as Flags from 'country-flag-icons/react/3x2'
// @ts-ignore
import iso3166 from 'iso-3166-2'
import WorldMap from './WorldMap'
import { Modal } from '@ciphera-net/ui'

interface LocationProps {
  countries: Array<{ country: string; pageviews: number }>
  cities: Array<{ city: string; country: string; pageviews: number }>
  regions: Array<{ region: string; country: string; pageviews: number }>
}

type Tab = 'map' | 'countries' | 'regions' | 'cities'

const LIMIT = 7

export default function Locations({ countries, cities, regions }: LocationProps) {
  const [activeTab, setActiveTab] = useState<Tab>('map')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const getFlagComponent = (countryCode: string) => {
    if (!countryCode || countryCode === 'Unknown') return null
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

  const getRegionName = (regionCode: string, countryCode: string) => {
    if (!regionCode || regionCode === 'Unknown' || !countryCode || countryCode === 'Unknown') return 'Unknown'
    
    try {
      const countryData = iso3166.data[countryCode]
      if (!countryData || !countryData.sub) return regionCode
      
      // ISO 3166-2 structure keys are typically "US-OR"
      const fullCode = `${countryCode}-${regionCode}`
      const regionData = countryData.sub[fullCode]
      
      if (regionData && regionData.name) {
        return regionData.name
      }
      
      return regionCode
    } catch (e) {
      return regionCode
    }
  }

  const getData = () => {
    switch (activeTab) {
      case 'countries': return countries
      case 'regions': return regions
      case 'cities': return cities
      default: return []
    }
  }

  const data = activeTab === 'map' ? [] : getData()
  const hasData = activeTab === 'map' ? (countries && countries.length > 0) : (data && data.length > 0)
  const displayedData = (activeTab !== 'map' && hasData) ? (data as any[]).slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)
  const showViewAll = activeTab !== 'map' && hasData && data.length > LIMIT

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Locations
            </h3>
            {showViewAll && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
              >
                View All
              </button>
            )}
          </div>
          <div className="flex p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
            {(['map', 'countries', 'regions', 'cities'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                  activeTab === tab
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 flex-1 min-h-[270px]">
          {activeTab === 'map' ? (
            hasData ? <WorldMap data={countries} /> : (
              <div className="h-full flex flex-col items-center justify-center">
                <p className="text-neutral-600 dark:text-neutral-400">No data available</p>
              </div>
            )
          ) : (
            hasData ? (
              <>
                {displayedData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between h-7">
                    <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                      {activeTab === 'countries' && <span className="shrink-0">{getFlagComponent(item.country)}</span>}
                      {activeTab !== 'countries' && <span className="shrink-0">{getFlagComponent(item.country)}</span>}
                      
                      <span className="truncate">
                        {activeTab === 'countries' ? getCountryName(item.country) : 
                         activeTab === 'regions' ? getRegionName(item.region, item.country) :
                         (item.city === 'Unknown' ? 'Unknown' : item.city)}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
                      {formatNumber(item.pageviews)}
                    </div>
                  </div>
                ))}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-7" aria-hidden="true" />
                ))}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center">
                <p className="text-neutral-600 dark:text-neutral-400">No data available</p>
              </div>
            )
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Locations - ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`}
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {(data as any[]).map((item, index) => (
            <div key={index} className="flex items-center justify-between py-1">
              <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                <span className="shrink-0">{getFlagComponent(item.country)}</span>
                <span className="truncate">
                  {activeTab === 'countries' ? getCountryName(item.country) : 
                   activeTab === 'regions' ? getRegionName(item.region, item.country) :
                   (item.city === 'Unknown' ? 'Unknown' : item.city)}
                </span>
              </div>
              <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
                {formatNumber(item.pageviews)}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}

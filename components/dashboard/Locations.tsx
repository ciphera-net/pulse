'use client'

import { useState } from 'react'
import { formatNumber } from '@/lib/utils/format'
import * as Flags from 'country-flag-icons/react/3x2'
// @ts-ignore
import iso3166 from 'iso-3166-2'
import WorldMap from './WorldMap'
import { Modal } from '@ciphera-net/ui'
import { SiTorproject } from 'react-icons/si'

interface LocationProps {
  countries: Array<{ country: string; pageviews: number }>
  cities: Array<{ city: string; country: string; pageviews: number }>
  regions: Array<{ region: string; country: string; pageviews: number }>
  geoDataLevel?: 'full' | 'country' | 'none'
}

type Tab = 'map' | 'countries' | 'regions' | 'cities'

const LIMIT = 7

export default function Locations({ countries, cities, regions, geoDataLevel = 'full' }: LocationProps) {
  const [activeTab, setActiveTab] = useState<Tab>('map')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const getFlagComponent = (countryCode: string) => {
    if (!countryCode || countryCode === 'Unknown') return null
    
    if (countryCode === 'T1') {
      return <SiTorproject className="w-5 h-5 text-purple-600 dark:text-purple-400" />
    }

    const FlagComponent = (Flags as any)[countryCode]
    return FlagComponent ? <FlagComponent className="w-5 h-5 rounded-sm shadow-sm" /> : null
  }

  const getCountryName = (code: string) => {
    if (!code || code === 'Unknown') return 'Unknown'
    if (code === 'T1') return 'Tor Network'
    
    try {
      const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
      return regionNames.of(code) || code
    } catch (e) {
      return code
    }
  }

  const getRegionName = (regionCode: string, countryCode: string) => {
    if (regionCode === 'T1') return 'Tor Network'
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

  const getCityName = (city: string) => {
    if (city === 'T1') return 'Tor Network'
    if (!city || city === 'Unknown') return 'Unknown'
    return city
  }

  const getData = () => {
    switch (activeTab) {
      case 'countries': return countries
      case 'regions': return regions
      case 'cities': return cities
      default: return []
    }
  }

  // Check if the current tab's data is disabled by privacy settings
  const isTabDisabled = () => {
    if (geoDataLevel === 'none') return true
    if (geoDataLevel === 'country' && (activeTab === 'regions' || activeTab === 'cities')) return true
    return false
  }

  // Filter out "Unknown" entries that result from disabled collection
  const filterUnknown = (data: any[]) => {
    return data.filter(item => {
      if (activeTab === 'countries') return item.country && item.country !== 'Unknown' && item.country !== ''
      if (activeTab === 'regions') return item.region && item.region !== 'Unknown' && item.region !== ''
      if (activeTab === 'cities') return item.city && item.city !== 'Unknown' && item.city !== ''
      return true
    })
  }

  const rawData = activeTab === 'map' ? [] : getData()
  const data = filterUnknown(rawData)
  const hasData = activeTab === 'map'
    ? (countries && filterUnknown(countries).length > 0)
    : (data && data.length > 0)
  const displayedData = (activeTab !== 'map' && hasData) ? (data as any[]).slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)
  const showViewAll = activeTab !== 'map' && hasData && data.length > LIMIT

  const getDisabledMessage = () => {
    if (geoDataLevel === 'none') {
      return 'Geographic data collection is disabled in site settings'
    }
    if (geoDataLevel === 'country' && (activeTab === 'regions' || activeTab === 'cities')) {
      return `${activeTab === 'regions' ? 'Region' : 'City'} tracking is disabled. Only country-level data is collected.`
    }
    return 'No data available'
  }

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

        <div className="space-y-2 flex-1 min-h-[270px]">
          {isTabDisabled() ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-neutral-500 dark:text-neutral-400 text-sm">{getDisabledMessage()}</p>
            </div>
          ) : activeTab === 'map' ? (
            hasData ? <WorldMap data={filterUnknown(countries)} /> : (
              <div className="h-full flex flex-col items-center justify-center">
                <p className="text-neutral-600 dark:text-neutral-400">No data available</p>
              </div>
            )
          ) : (
            hasData ? (
              <>
                {displayedData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors">
                    <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                      {activeTab === 'countries' && <span className="shrink-0">{getFlagComponent(item.country)}</span>}
                      {activeTab !== 'countries' && <span className="shrink-0">{getFlagComponent(item.country)}</span>}

                      <span className="truncate">
                        {activeTab === 'countries' ? getCountryName(item.country) :
                         activeTab === 'regions' ? getRegionName(item.region, item.country) :
                         getCityName(item.city)}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
                      {formatNumber(item.pageviews)}
                    </div>
                  </div>
                ))}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
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
            <div key={index} className="flex items-center justify-between py-2 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors">
              <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                <span className="shrink-0">{getFlagComponent(item.country)}</span>
                <span className="truncate">
                  {activeTab === 'countries' ? getCountryName(item.country) : 
                   activeTab === 'regions' ? getRegionName(item.region, item.country) :
                   getCityName(item.city)}
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

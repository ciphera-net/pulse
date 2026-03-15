'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { logger } from '@/lib/utils/logger'
import { formatNumber } from '@ciphera-net/ui'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import * as Flags from 'country-flag-icons/react/3x2'
import iso3166 from 'iso-3166-2'

const DottedMap = dynamic(() => import('./DottedMap'), { ssr: false })
const Globe = dynamic(() => import('./Globe'), { ssr: false })
import Link from 'next/link'
import { Modal, GlobeIcon, ArrowRightIcon } from '@ciphera-net/ui'
import { ListSkeleton } from '@/components/skeletons'
import VirtualList from './VirtualList'
import { ShieldCheck, Detective, Broadcast, MapPin, FrameCornersIcon } from '@phosphor-icons/react'
import { getCountries, getCities, getRegions } from '@/lib/api/stats'
import { type DimensionFilter } from '@/lib/filters'

interface LocationProps {
  countries: Array<{ country: string; pageviews: number }>
  cities: Array<{ city: string; country: string; pageviews: number }>
  regions: Array<{ region: string; country: string; pageviews: number }>
  geoDataLevel?: 'full' | 'country' | 'none'
  siteId: string
  dateRange: { start: string, end: string }
  onFilter?: (filter: DimensionFilter) => void
}

type Tab = 'map' | 'globe' | 'countries' | 'regions' | 'cities'

const LIMIT = 7

const TAB_TO_DIMENSION: Record<string, string> = { countries: 'country', regions: 'region', cities: 'city' }

export default function Locations({ countries, cities, regions, geoDataLevel = 'full', siteId, dateRange, onFilter }: LocationProps) {
  const [activeTab, setActiveTab] = useState<Tab>('map')
  const handleTabKeyDown = useTabListKeyboard()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  type LocationItem = { country?: string; city?: string; region?: string; pageviews: number }
  const [fullData, setFullData] = useState<LocationItem[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true) },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (isModalOpen) {
      const fetchData = async () => {
        setIsLoadingFull(true)
        try {
          let data: LocationItem[] = []
          if (activeTab === 'countries') {
            data = await getCountries(siteId, dateRange.start, dateRange.end, 250)
          } else if (activeTab === 'regions') {
            data = await getRegions(siteId, dateRange.start, dateRange.end, 250)
          } else if (activeTab === 'cities') {
            data = await getCities(siteId, dateRange.start, dateRange.end, 250)
          }
          setFullData(data)
        } catch (e) {
          logger.error(e)
        } finally {
          setIsLoadingFull(false)
        }
      }
      fetchData()
    } else {
      setFullData([])
    }
  }, [isModalOpen, activeTab, siteId, dateRange])

  const getFlagComponent = (countryCode: string) => {
    if (!countryCode || countryCode === 'Unknown') return null
    
    switch (countryCode) {
      case 'T1':
        return <ShieldCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
      case 'A1':
        return <Detective className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
      case 'A2':
        return <Broadcast className="w-5 h-5 text-blue-500 dark:text-blue-400" />
      case 'O1':
      case 'EU':
      case 'AP':
        return <GlobeIcon className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
    }

    const FlagComponent = (Flags as Record<string, React.ComponentType<{ className?: string }>>)[countryCode]
    return FlagComponent ? <FlagComponent className="w-5 h-5 rounded-sm shadow-sm" /> : null
  }

  const getCountryName = (code: string) => {
    if (!code || code === 'Unknown') return 'Unknown'
    
    switch (code) {
      case 'T1': return 'Tor Network'
      case 'A1': return 'Anonymous Proxy'
      case 'A2': return 'Satellite Provider'
      case 'O1': return 'Other'
      case 'EU': return 'Europe'
      case 'AP': return 'Asia/Pacific'
    }
    
    try {
      const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
      return regionNames.of(code) || code
    } catch (e) {
      return code
    }
  }

  const getRegionName = (regionCode: string, countryCode: string) => {
    // Check for special country codes first
    switch (countryCode) {
      case 'T1': return 'Tor Network'
      case 'A1': return 'Anonymous Proxy'
      case 'A2': return 'Satellite Provider'
      case 'O1': return 'Other'
      case 'EU': return 'Europe'
      case 'AP': return 'Asia/Pacific'
    }

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
    // Check for special codes that might appear in city field
    switch (city) {
      case 'T1': return 'Tor Network'
      case 'A1': return 'Anonymous Proxy'
      case 'A2': return 'Satellite Provider'
      case 'O1': return 'Other'
    }
    
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
  const filterUnknown = (data: LocationItem[]) => {
    return data.filter(item => {
      if (activeTab === 'countries') return item.country && item.country !== 'Unknown' && item.country !== ''
      if (activeTab === 'regions') return item.region && item.region !== 'Unknown' && item.region !== ''
      if (activeTab === 'cities') return item.city && item.city !== 'Unknown' && item.city !== ''
      return true
    })
  }

  const isVisualTab = activeTab === 'map' || activeTab === 'globe'
  const rawData = isVisualTab ? [] : getData()
  const data = filterUnknown(rawData)
  const totalPageviews = data.reduce((sum, item) => sum + item.pageviews, 0)
  const hasData = isVisualTab
    ? (countries && filterUnknown(countries).length > 0)
    : (data && data.length > 0)
  const displayedData = (!isVisualTab && hasData) ? data.slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)
  const showViewAll = !isVisualTab && hasData && data.length > LIMIT

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
      <div ref={containerRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-neutral-400 dark:text-neutral-500" weight="bold" />
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Locations
            </h3>
            {showViewAll && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-brand-orange dark:hover:text-brand-orange hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all cursor-pointer rounded-lg"
                aria-label="View all locations"
              >
                <FrameCornersIcon className="w-4 h-4" weight="bold" />
              </button>
            )}
          </div>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide" role="tablist" aria-label="Location view tabs" onKeyDown={handleTabKeyDown}>
            {(['map', 'globe', 'countries', 'regions', 'cities'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`relative px-2.5 py-1 text-xs font-medium transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded cursor-pointer ${
                  activeTab === tab
                    ? 'text-neutral-900 dark:text-white'
                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <motion.div
                    layoutId="locationsTab"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-orange"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 flex-1 min-h-[270px]">
          {isTabDisabled() ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-neutral-500 dark:text-neutral-400 text-sm">{getDisabledMessage()}</p>
            </div>
          ) : isVisualTab ? (
            hasData ? (
              activeTab === 'globe'
                ? (inView ? <Globe data={filterUnknown(countries) as { country: string; pageviews: number }[]} /> : null)
                : (inView ? <DottedMap data={filterUnknown(countries) as { country: string; pageviews: number }[]} /> : null)
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
                <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
                  <GlobeIcon className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
                </div>
                <h4 className="font-semibold text-neutral-900 dark:text-white">
                  No location data yet
                </h4>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
                  Visitor locations will appear here based on anonymous geographic data.
                </p>
                <Link
                  href="/installation"
                  className="inline-flex items-center gap-2 text-sm font-medium text-brand-orange hover:text-brand-orange/90 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/20 rounded"
                >
                  Install tracking script
                  <ArrowRightIcon className="w-4 h-4" />
                </Link>
              </div>
            )
          ) : (
            hasData ? (
              <>
                {displayedData.map((item) => {
                  const dim = TAB_TO_DIMENSION[activeTab]
                  const filterValue = activeTab === 'countries' ? item.country : activeTab === 'regions' ? item.region : item.city
                  const canFilter = onFilter && dim && filterValue
                  const maxPv = displayedData[0]?.pageviews ?? 0
                  const barWidth = maxPv > 0 ? (item.pageviews / maxPv) * 100 : 0
                  return (
                    <div
                      key={`${item.country ?? ''}-${item.region ?? ''}-${item.city ?? ''}`}
                      onClick={() => canFilter && onFilter({ dimension: dim, operator: 'is', values: [filterValue!] })}
                      className={`relative flex items-center justify-between h-9 group hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors${canFilter ? ' cursor-pointer' : ''}`}
                    >
                      <div
                        className="absolute inset-y-0.5 left-0.5 bg-brand-orange/5 dark:bg-brand-orange/10 rounded-md transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                      <div className="relative flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                        <span className="shrink-0">{getFlagComponent(item.country ?? '')}</span>
                        <span className="truncate">
                          {activeTab === 'countries' ? getCountryName(item.country ?? '') :
                           activeTab === 'regions' ? getRegionName(item.region ?? '', item.country ?? '') :
                           getCityName(item.city ?? '')}
                        </span>
                      </div>
                      <div className="relative flex items-center gap-2 ml-4">
                        <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                          {totalPageviews > 0 ? `${Math.round((item.pageviews / totalPageviews) * 100)}%` : ''}
                        </span>
                        <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                          {formatNumber(item.pageviews)}
                        </span>
                      </div>
                    </div>
                  )
                })}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
                ))}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
              <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
                <GlobeIcon className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
              </div>
              <h4 className="font-semibold text-neutral-900 dark:text-white">
                No location data yet
              </h4>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
                Visitor locations will appear here based on anonymous geographic data.
              </p>
            </div>
          )
        )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setModalSearch('') }}
        title={activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
        className="max-w-2xl"
      >
        <div>
          <input
            type="text"
            value={modalSearch}
            onChange={(e) => setModalSearch(e.target.value)}
            placeholder="Search locations..."
            className="w-full px-3 py-2 mb-3 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50"
          />
        </div>
        <div className="max-h-[80vh]">
          {isLoadingFull ? (
            <div className="py-4">
              <ListSkeleton rows={10} />
            </div>
          ) : (() => {
            const rawModalData = fullData.length > 0 ? fullData : data
            const search = modalSearch.toLowerCase()
            const modalData = !modalSearch ? rawModalData : rawModalData.filter(item => {
              const label = activeTab === 'countries' ? getCountryName(item.country ?? '') : activeTab === 'regions' ? getRegionName(item.region ?? '', item.country ?? '') : getCityName(item.city ?? '')
              return label.toLowerCase().includes(search)
            })
            const modalTotal = modalData.reduce((sum, item) => sum + item.pageviews, 0)
            return (
              <VirtualList
                items={modalData}
                estimateSize={36}
                className="max-h-[80vh] overflow-y-auto pr-2"
                renderItem={(item) => {
                  const dim = TAB_TO_DIMENSION[activeTab]
                  const filterValue = activeTab === 'countries' ? item.country : activeTab === 'regions' ? item.region : item.city
                  const canFilter = onFilter && dim && filterValue
                  return (
                    <div
                      key={`${item.country ?? ''}-${item.region ?? ''}-${item.city ?? ''}`}
                      onClick={() => { if (canFilter) { onFilter({ dimension: dim, operator: 'is', values: [filterValue!] }); setIsModalOpen(false) } }}
                      className={`flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 transition-colors${canFilter ? ' cursor-pointer' : ''}`}
                    >
                      <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                        <span className="shrink-0">{getFlagComponent(item.country ?? '')}</span>
                        <span className="truncate">
                          {activeTab === 'countries' ? getCountryName(item.country ?? '') :
                           activeTab === 'regions' ? getRegionName(item.region ?? '', item.country ?? '') :
                           getCityName(item.city ?? '')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                          {modalTotal > 0 ? `${Math.round((item.pageviews / modalTotal) * 100)}%` : ''}
                        </span>
                        <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                          {formatNumber(item.pageviews)}
                        </span>
                      </div>
                    </div>
                  )
                }}
              />
            )
          })()}
        </div>
      </Modal>
    </>
  )
}
'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { logger } from '@/lib/utils/logger'
import { formatNumber } from '@ciphera-net/ui'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import * as Flags from 'country-flag-icons/react/3x2'
import iso3166 from 'iso-3166-2'

const DottedMap = dynamic(() => import('./DottedMap'), { ssr: false })
import Link from 'next/link'
import { Modal, GlobeIcon, ArrowRightIcon } from '@ciphera-net/ui'
import { ListSkeleton } from '@/components/skeletons'
import VirtualList from './VirtualList'
import { ShieldCheck, Detective, Broadcast, FrameCornersIcon } from '@phosphor-icons/react'
import { getCountries, getCities, getRegions, getLanguages, getTimezones } from '@/lib/api/stats'
import { type DimensionFilter } from '@/lib/filters'

interface AudienceProps {
  countries: Array<{ country: string; pageviews: number }>
  cities: Array<{ city: string; country: string; pageviews: number }>
  regions: Array<{ region: string; country: string; pageviews: number }>
  languages: Array<{ language: string; pageviews: number }>
  timezones: Array<{ timezone: string; pageviews: number }>
  geoDataLevel?: 'full' | 'country' | 'none'
  collectAudienceData?: boolean
  siteId: string
  dateRange: { start: string, end: string }
  onFilter?: (filter: DimensionFilter) => void
}

type Tab = 'map' | 'countries' | 'regions' | 'cities' | 'languages' | 'timezones'

const LIMIT = 7

const TAB_TO_DIMENSION: Record<string, string> = { countries: 'country', regions: 'region', cities: 'city', languages: 'language', timezones: 'timezone' }

function formatLanguage(locale: string): string {
  if (locale === 'Unknown') return 'Unknown'
  try {
    const parts = locale.split('-')
    const langDisplay = new Intl.DisplayNames(['en'], { type: 'language' })
    const langName = langDisplay.of(parts[0]) || parts[0]
    if (parts[1]) {
      const regionDisplay = new Intl.DisplayNames(['en'], { type: 'region' })
      const regionName = regionDisplay.of(parts[1].toUpperCase())
      if (regionName) return `${langName} (${regionName})`
    }
    return langName
  } catch {
    return locale
  }
}

// * IANA timezone → ISO country code (best-effort mapping)
const TIMEZONE_TO_COUNTRY: Record<string, string> = {}
function getTimezoneCountry(tz: string): string {
  if (!tz || tz === 'Unknown') return ''
  if (TIMEZONE_TO_COUNTRY[tz]) return TIMEZONE_TO_COUNTRY[tz]
  try {
    // Use Intl to resolve timezone to a locale, then extract region
    // Common continent/city patterns
    const parts = tz.split('/')
    const city = parts[parts.length - 1]
    // Try resolving via Intl.DateTimeFormat
    const formatter = new Intl.DateTimeFormat('en', { timeZone: tz })
    const opts = formatter.resolvedOptions()
    // Fallback: map well-known prefixes
    if (tz.startsWith('Europe/Amsterdam') || tz.startsWith('Europe/Brussels')) return 'NL'
    if (tz.startsWith('America/New_York') || tz.startsWith('America/Chicago') || tz.startsWith('America/Denver') || tz.startsWith('America/Los_Angeles')) return 'US'
    if (tz.startsWith('Europe/London')) return 'GB'
    if (tz.startsWith('Europe/Berlin')) return 'DE'
    if (tz.startsWith('Europe/Paris')) return 'FR'
    if (tz.startsWith('Europe/Rome')) return 'IT'
    if (tz.startsWith('Europe/Madrid')) return 'ES'
    if (tz.startsWith('Europe/Lisbon')) return 'PT'
    if (tz.startsWith('Europe/Dublin')) return 'IE'
    if (tz.startsWith('Europe/Vienna')) return 'AT'
    if (tz.startsWith('Europe/Zurich')) return 'CH'
    if (tz.startsWith('Europe/Stockholm')) return 'SE'
    if (tz.startsWith('Europe/Oslo')) return 'NO'
    if (tz.startsWith('Europe/Copenhagen')) return 'DK'
    if (tz.startsWith('Europe/Helsinki')) return 'FI'
    if (tz.startsWith('Europe/Warsaw')) return 'PL'
    if (tz.startsWith('Europe/Prague')) return 'CZ'
    if (tz.startsWith('Europe/Budapest')) return 'HU'
    if (tz.startsWith('Europe/Bucharest')) return 'RO'
    if (tz.startsWith('Europe/Athens')) return 'GR'
    if (tz.startsWith('Europe/Istanbul')) return 'TR'
    if (tz.startsWith('Europe/Moscow')) return 'RU'
    if (tz.startsWith('Asia/Tokyo')) return 'JP'
    if (tz.startsWith('Asia/Shanghai') || tz.startsWith('Asia/Hong_Kong')) return 'CN'
    if (tz.startsWith('Asia/Seoul')) return 'KR'
    if (tz.startsWith('Asia/Kolkata') || tz.startsWith('Asia/Calcutta')) return 'IN'
    if (tz.startsWith('Asia/Singapore')) return 'SG'
    if (tz.startsWith('Asia/Dubai')) return 'AE'
    if (tz.startsWith('Asia/Jakarta')) return 'ID'
    if (tz.startsWith('Asia/Bangkok')) return 'TH'
    if (tz.startsWith('Australia/Sydney') || tz.startsWith('Australia/Melbourne')) return 'AU'
    if (tz.startsWith('Pacific/Auckland')) return 'NZ'
    if (tz.startsWith('America/Toronto') || tz.startsWith('America/Vancouver')) return 'CA'
    if (tz.startsWith('America/Mexico_City')) return 'MX'
    if (tz.startsWith('America/Sao_Paulo')) return 'BR'
    if (tz.startsWith('America/Argentina')) return 'AR'
    if (tz.startsWith('Africa/Cairo')) return 'EG'
    if (tz.startsWith('Africa/Lagos')) return 'NG'
    if (tz.startsWith('Africa/Johannesburg')) return 'ZA'
  } catch {}
  return ''
}

// * Get the country code to show a flag for any item in any tab
function getItemFlagCode(item: { country?: string; language?: string; timezone?: string }, tab: Tab): string {
  switch (tab) {
    case 'countries':
    case 'regions':
    case 'cities':
      return item.country ?? ''
    case 'languages': {
      // Extract region from locale: en-US → US, nl-NL → NL
      const locale = item.language ?? ''
      const parts = locale.split('-')
      return parts[1]?.toUpperCase() ?? ''
    }
    case 'timezones':
      return getTimezoneCountry(item.timezone ?? '')
    default:
      return ''
  }
}

function formatTimezone(tz: string): string {
  if (tz === 'Unknown') return 'Unknown'
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
    const parts = formatter.formatToParts(now)
    const offset = parts.find(p => p.type === 'timeZoneName')?.value || ''
    return `${tz} (${offset})`
  } catch {
    return tz
  }
}

export default function Audience({ countries, cities, regions, languages, timezones, geoDataLevel = 'full', collectAudienceData = true, siteId, dateRange, onFilter }: AudienceProps) {
  const [activeTab, setActiveTab] = useState<Tab>('countries')
  const handleTabKeyDown = useTabListKeyboard()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  type AudienceItem = { country?: string; city?: string; region?: string; language?: string; timezone?: string; pageviews: number }
  const [fullData, setFullData] = useState<AudienceItem[]>([])
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
          let data: AudienceItem[] = []
          if (activeTab === 'countries') {
            data = await getCountries(siteId, dateRange.start, dateRange.end, 250)
          } else if (activeTab === 'regions') {
            data = await getRegions(siteId, dateRange.start, dateRange.end, 250)
          } else if (activeTab === 'cities') {
            data = await getCities(siteId, dateRange.start, dateRange.end, 250)
          } else if (activeTab === 'languages') {
            data = await getLanguages(siteId, dateRange.start, dateRange.end, 250)
          } else if (activeTab === 'timezones') {
            data = await getTimezones(siteId, dateRange.start, dateRange.end, 250)
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
        return <Detective className="w-5 h-5 text-neutral-400" />
      case 'A2':
        return <Broadcast className="w-5 h-5 text-blue-500 dark:text-blue-400" />
      case 'O1':
      case 'EU':
      case 'AP':
        return <GlobeIcon className="w-5 h-5 text-neutral-400" />
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

  const getItemLabel = (item: AudienceItem): string => {
    switch (activeTab) {
      case 'countries': return getCountryName(item.country ?? '')
      case 'regions': return getRegionName(item.region ?? '', item.country ?? '')
      case 'cities': return getCityName(item.city ?? '')
      case 'languages': return formatLanguage(item.language ?? '')
      case 'timezones': return formatTimezone(item.timezone ?? '')
      default: return ''
    }
  }

  const getItemFilterValue = (item: AudienceItem): string | undefined => {
    switch (activeTab) {
      case 'countries': return item.country
      case 'regions': return item.region
      case 'cities': return item.city
      case 'languages': return item.language
      case 'timezones': return item.timezone
      default: return undefined
    }
  }

  const getData = (): AudienceItem[] => {
    switch (activeTab) {
      case 'countries': return countries
      case 'regions': return regions
      case 'cities': return cities
      case 'languages': return languages
      case 'timezones': return timezones
      default: return []
    }
  }

  // Check if the current tab's data is disabled by privacy settings
  const isTabDisabled = () => {
    if (activeTab === 'languages' || activeTab === 'timezones') {
      return !collectAudienceData
    }
    if (geoDataLevel === 'none') return true
    if (geoDataLevel === 'country' && (activeTab === 'regions' || activeTab === 'cities')) return true
    return false
  }

  // Filter out "Unknown" entries that result from disabled collection
  const filterUnknown = (data: AudienceItem[]) => {
    return data.filter(item => {
      if (activeTab === 'countries') return item.country && item.country !== 'Unknown' && item.country !== ''
      if (activeTab === 'regions') return item.region && item.region !== 'Unknown' && item.region !== ''
      if (activeTab === 'cities') return item.city && item.city !== 'Unknown' && item.city !== ''
      if (activeTab === 'languages') return item.language && item.language !== 'Unknown' && item.language !== ''
      if (activeTab === 'timezones') return item.timezone && item.timezone !== 'Unknown' && item.timezone !== ''
      return true
    })
  }

  // Whether the current tab shows a flag icon
  const showsFlag = activeTab === 'countries' || activeTab === 'regions' || activeTab === 'cities' || activeTab === 'languages' || activeTab === 'timezones'

  const isVisualTab = activeTab === 'map'
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
    if (activeTab === 'languages' || activeTab === 'timezones') {
      return 'Audience data collection is disabled in site settings'
    }
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
      <div ref={containerRef} className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1" role="tablist" aria-label="Audience view tabs" onKeyDown={handleTabKeyDown}>
            {(['map', 'countries', 'regions', 'cities', 'languages', 'timezones'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`relative px-2.5 py-1 text-xs font-medium transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded cursor-pointer ${
                  activeTab === tab
                    ? 'text-white'
                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-300'
                } ease-apple`}
              >
                {tab}
                <span
                  className={`absolute inset-x-0 -bottom-px h-[3px] rounded-full transition-[width,background-color] duration-base ${
                    activeTab === tab ? 'bg-brand-orange scale-x-100' : 'bg-transparent scale-x-0'
                  } ease-apple`}
                />
              </button>
            ))}
          </div>
          {showViewAll && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-brand-orange dark:hover:text-brand-orange hover:bg-neutral-800 transition-all cursor-pointer rounded-lg ease-apple"
              aria-label="View all audience data"
            >
              <FrameCornersIcon className="w-4 h-4" weight="bold" />
            </button>
          )}
        </div>

        <div className="space-y-2 flex-1 min-h-[270px]">
          {isTabDisabled() ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-neutral-400 text-sm">{getDisabledMessage()}</p>
            </div>
          ) : isVisualTab ? (
            hasData ? (
              inView ? <DottedMap data={filterUnknown(countries) as { country: string; pageviews: number }[]} /> : null
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
                <div className="rounded-full bg-neutral-800 p-4">
                  <GlobeIcon className="w-8 h-8 text-neutral-400" />
                </div>
                <h4 className="font-semibold text-white">
                  No location data yet
                </h4>
                <p className="text-sm text-neutral-400 max-w-xs">
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
                {displayedData.map((item, idx) => {
                  const dim = TAB_TO_DIMENSION[activeTab]
                  const filterValue = getItemFilterValue(item)
                  const canFilter = onFilter && dim && filterValue
                  const maxPv = displayedData[0]?.pageviews ?? 0
                  const barWidth = maxPv > 0 ? (item.pageviews / maxPv) * 75 : 0
                  const itemKey = activeTab === 'languages' ? (item.language ?? idx) : activeTab === 'timezones' ? (item.timezone ?? idx) : `${item.country ?? ''}-${item.region ?? ''}-${item.city ?? ''}`
                  return (
                    <div
                      key={itemKey}
                      onClick={() => canFilter && onFilter({ dimension: dim, operator: 'is', values: [filterValue!] })}
                      className={`relative flex items-center justify-between h-9 group hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors${canFilter ? ' cursor-pointer' : ''} ease-apple`}
                    >
                      <div
                        className="absolute inset-y-0.5 left-0.5 bg-gradient-to-r from-brand-orange/15 via-brand-orange/8 to-transparent border border-brand-orange/20 shadow-[inset_0_1px_0_rgba(253,94,15,0.08)] rounded-md transition-[width,background-color] ease-apple"
                        style={{ width: `${barWidth}%` }}
                      />
                      <div className="relative flex-1 truncate text-white flex items-center gap-3">
                        {showsFlag && <span className="shrink-0">{getFlagComponent(getItemFlagCode(item, activeTab))}</span>}
                        <span className="truncate">
                          {getItemLabel(item)}
                        </span>
                      </div>
                      <div className="relative flex items-center gap-2 ml-4">
                        <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
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
              <div className="rounded-full bg-neutral-800 p-4">
                <GlobeIcon className="w-8 h-8 text-neutral-400" />
              </div>
              <h4 className="font-semibold text-white">
                No {activeTab === 'languages' ? 'language' : activeTab === 'timezones' ? 'timezone' : 'location'} data yet
              </h4>
              <p className="text-sm text-neutral-400 max-w-xs">
                {activeTab === 'languages' ? 'Visitor language preferences will appear here.' :
                 activeTab === 'timezones' ? 'Visitor timezones will appear here.' :
                 'Visitor locations will appear here based on anonymous geographic data.'}
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
        className="max-w-2xl !bg-neutral-900/65 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:!bg-neutral-900/60 !border-white/[0.08]"
      >
        <div>
          <input
            type="text"
            value={modalSearch}
            onChange={(e) => setModalSearch(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full px-3 py-2 mb-3 text-sm bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50"
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
              const label = getItemLabel(item)
              return label.toLowerCase().includes(search)
            })
            const modalTotal = modalData.reduce((sum, item) => sum + item.pageviews, 0)
            return (
              <VirtualList
                items={modalData}
                estimateSize={36}
                className="max-h-[80vh] overflow-y-auto pr-2"
                renderItem={(item, idx) => {
                  const dim = TAB_TO_DIMENSION[activeTab]
                  const filterValue = getItemFilterValue(item)
                  const canFilter = onFilter && dim && filterValue
                  const itemKey = activeTab === 'languages' ? (item.language ?? idx) : activeTab === 'timezones' ? (item.timezone ?? idx) : `${item.country ?? ''}-${item.region ?? ''}-${item.city ?? ''}`
                  return (
                    <div
                      key={itemKey}
                      onClick={() => { if (canFilter) { onFilter({ dimension: dim, operator: 'is', values: [filterValue!] }); setIsModalOpen(false) } }}
                      className={`flex items-center justify-between h-9 group hover:bg-neutral-800 rounded-lg px-2 transition-colors${canFilter ? ' cursor-pointer' : ''} ease-apple`}
                    >
                      <div className="flex-1 truncate text-white flex items-center gap-3">
                        {showsFlag && <span className="shrink-0">{getFlagComponent(getItemFlagCode(item, activeTab))}</span>}
                        <span className="truncate">
                          {getItemLabel(item)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
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

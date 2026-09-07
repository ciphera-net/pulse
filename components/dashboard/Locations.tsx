'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { formatNumber } from '@/lib/utils/format'
import { CountryFlag } from '@/components/ui/CountryFlag'
import iso3166 from 'iso-3166-2'

const MapView = dynamic(() => import('./MapView'), { ssr: false })
import { GlobeIcon, Switcher } from '@ciphera-net/facet'
import { GlobeHemisphereWest } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ShieldCheck, Detective, Broadcast } from '@phosphor-icons/react'
import { useFullDimensionList, type FullListKind } from '@/lib/swr/dashboard'
import { type DimensionFilter } from '@/lib/filters'
import { MetricRowStat, MetricUnitLabel, rowBarWidth } from '@/components/dashboard/MetricRowStat'
import { CardPager, useCardPage } from '@/components/dashboard/CardPager'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { DimensionInfoTip } from '@/components/dashboard/MetricInfoTip'

interface AudienceProps {
  countries: Array<{ country: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  cities: Array<{ city: string; country: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  regions: Array<{ region: string; country: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  languages: Array<{ language: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  timezones: Array<{ timezone: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  geoDataLevel?: 'full' | 'country' | 'none'
  collectAudienceData?: boolean
  siteId: string
  dateRange: { start: string, end: string }
  // True range totals — the F9 denominator; no totals → no percentages.
  totals?: { pageviews: number; visitors: number }
  // Active page filters, threaded into the modal fetch (F14).
  filters?: string
  // Hidden on the anonymous share surface (no full-list endpoints there).
  memberFeatures?: boolean
  onFilter?: (filter: DimensionFilter) => void
}

type Tab = 'map' | 'countries' | 'regions' | 'cities' | 'languages' | 'timezones'

const LIMIT = 7

const TAB_TO_DIMENSION: Record<string, string> = { countries: 'country', regions: 'region', cities: 'city', languages: 'language', timezones: 'timezone' }
const TAB_TO_KIND: Partial<Record<Tab, FullListKind>> = { countries: 'countries', regions: 'regions', cities: 'cities', languages: 'languages', timezones: 'timezones' }

function formatLanguage(locale: string): string {
  if (locale === 'Unknown') return 'Unknown'
  try {
    const parts = locale.replace(/@.*$/, '').split('-')
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
    if (tz.startsWith('Europe/Brussels')) return 'BE'
    if (tz.startsWith('Europe/Amsterdam')) return 'NL'
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
    if (tz.startsWith('Asia/Hong_Kong')) return 'HK'
    if (tz.startsWith('Asia/Shanghai')) return 'CN'
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
      const locale = (item.language ?? '').replace(/@.*$/, '')
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

export default function Audience({ countries, cities, regions, languages, timezones, geoDataLevel = 'full', collectAudienceData = true, siteId, dateRange, totals, filters, memberFeatures = true, onFilter }: AudienceProps) {
  const [activeTab, setActiveTab] = useState<Tab>('countries')
  type AudienceItem = { country?: string; city?: string; region?: string; language?: string; timezone?: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }


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

  const getFlagComponent = (countryCode: string, tab?: Tab) => {
    if (!countryCode || countryCode === 'Unknown')
      return tab === 'languages' ? <GlobeHemisphereWest className="w-5 h-5 text-neutral-400" /> : null

    switch (countryCode) {
      case 'T1':
        return <ShieldCheck className="w-5 h-5 text-purple-400" />
      case 'A1':
        return <Detective className="w-5 h-5 text-neutral-400" />
      case 'A2':
        return <Broadcast className="w-5 h-5 text-blue-400" />
      case 'O1':
      case 'EU':
      case 'AP':
        return <GlobeIcon className="w-5 h-5 text-neutral-400" />
    }

    return <CountryFlag code={countryCode} className="w-5 h-5 rounded-none" />
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
  const hasData = isVisualTab
    ? (countries && filterUnknown(countries).length > 0)
    : (data && data.length > 0)
  // The dashboard fan-out carries only the top 10 per dimension — when the
  // active tab overflows the card, fetch the full list once (same endpoint the
  // retired view-all modal used) and paginate it client-side.
  const wantsFullList = memberFeatures && !isVisualTab && !isTabDisabled() && data.length > LIMIT
  const { data: fullData } = useFullDimensionList<AudienceItem>(
    wantsFullList ? (TAB_TO_KIND[activeTab] ?? null) : null,
    siteId, dateRange?.start, dateRange?.end, 250, filters,
  )
  // Gate on wantsFullList: stale hook-state from another range must never
  // outrank the fan-out rows (the frozen-blocks bug, 01-09-2026).
  const fullClean = wantsFullList && fullData ? filterUnknown(fullData) : null
  const allData = fullClean && fullClean.length >= data.length ? fullClean : data
  const pageCount = isVisualTab ? 1 : Math.max(1, Math.ceil(allData.length / LIMIT))
  // Page state keys on the context: a tab/filter/range change reads as page 1,
  // and a shrinking list clamps at read time.
  const [page, setPage] = useCardPage(`${activeTab}|${filters ?? ''}|${dateRange?.start}|${dateRange?.end}`, pageCount)

  const displayedData = (!isVisualTab && hasData) ? allData.slice((page - 1) * LIMIT, page * LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)

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
    <div ref={containerRef} data-tour="dimension-card" data-tour-card="locations" className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
        <div className="flex items-center justify-between mb-4">
          {/* One Facet Switcher for every dimension card (owner pick C0, 06-09-2026);
              the overflow wrapper keeps a narrow card scrollable, as the tab row was. */}
          <div className="min-w-0 overflow-x-auto scrollbar-hide pb-1">
            <Switcher
              size="sm"
              tone="solid"
              aria-label="Audience view"
              options={[
                { value: 'map', label: 'Map' },
                { value: 'countries', label: 'Countries' },
                { value: 'regions', label: 'Regions' },
                { value: 'cities', label: 'Cities' },
                { value: 'languages', label: 'Languages' },
                { value: 'timezones', label: 'Timezones' },
              ]}
              value={activeTab}
              onChange={(v) => setActiveTab(v as Tab)}
            />
          </div>
          <DimensionInfoTip tab={activeTab} className="ms-2 me-auto" />
          <div className="flex min-w-0 shrink items-center gap-1.5">
            <MetricUnitLabel />
          </div>
        </div>

        <div className="flex-1 min-h-[270px]">
          {isTabDisabled() ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-neutral-400 text-sm">{getDisabledMessage()}</p>
            </div>
          ) : isVisualTab ? (
            hasData ? (
              inView ? <MapView data={filterUnknown(countries) as { country: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }[]} /> : null
            ) : (
              <EmptyState
                icon={<GlobeHemisphereWest />}
                title="Your first visitor hasn't arrived"
                description="Countries and cities will light up on this map as traffic flows in from around the world."
                action={{ label: 'Install tracking script', href: '/installation' }}
              />
            )
          ) : (
            hasData ? (
              <CascadeGroup flipKey={`${activeTab}-${page}`} className="space-y-2">
                {displayedData.map((item, idx) => {
                  const dim = TAB_TO_DIMENSION[activeTab]
                  const filterValue = getItemFilterValue(item)
                  const canFilter = onFilter && dim && filterValue
                  const barWidth = rowBarWidth(item, allData)
                  const itemKey = activeTab === 'languages' ? (item.language ?? idx) : activeTab === 'timezones' ? (item.timezone ?? idx) : `${item.country ?? ''}-${item.region ?? ''}-${item.city ?? ''}`
                  const Row = canFilter ? 'button' : 'div'
                  return (
                    <CascadeRow key={itemKey} index={idx}>
                      <Row
                        {...(canFilter ? { type: 'button' as const, onClick: () => canFilter && onFilter({ dimension: dim, operator: 'is', values: [filterValue!] }) } : {})}
                        className={`interactive-row w-full text-left relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${canFilter ? ' cursor-pointer' : ''}`}
                      >
                        <RowBar width={barWidth} index={idx} />
                        <div className="relative flex-1 truncate text-white flex items-center gap-3">
                          {showsFlag && <span className="shrink-0">{getFlagComponent(getItemFlagCode(item, activeTab), activeTab)}</span>}
                          <span className="truncate">
                            {getItemLabel(item)}
                          </span>
                        </div>
                        <MetricRowStat row={item} totals={totals} />
                      </Row>
                    </CascadeRow>
                  )
                })}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
                ))}
            </CascadeGroup>
          ) : (
            <EmptyState
              icon={<GlobeHemisphereWest />}
              title={`No ${activeTab} data yet`}
              description={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}-level breakdowns appear once enough visitors arrive to generate meaningful geographic data.`}
            />
          )
        )}
        </div>

      <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label={activeTab} />
    </div>
  )
}

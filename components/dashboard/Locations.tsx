'use client'

import { ImportedCardNote } from '@/components/dashboard/ImportedCardNote'
import type { ImportedProvenance, LanguageGroupStat } from '@/lib/api/stats'
import type { ImportedDimension } from '@/lib/import/source-display'
import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { formatNumber } from '@/lib/utils/format'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { hasFlag } from '@/lib/flags'
import iso3166 from 'iso-3166-2'
import { TIMEZONE_COUNTRY } from '@/lib/timezone-countries.gen'
import { formatLanguage } from '@/lib/dashboard/language'

const MapView = dynamic(() => import('./MapView'), { ssr: false })
import { GlobeIcon, Switcher } from '@ciphera-net/facet'
import { GlobeHemisphereWest } from '@phosphor-icons/react'
import CardEmptyState from '@/components/dashboard/CardEmptyState'
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
  // PULSE-173: one row per base language, additive alongside `languages`.
  // `undefined` (the prop simply not passed, or the payload predates the
  // grouping rollout) falls back to the per-locale `languages` view — no
  // error, no distinct loading state; see isLanguageGrouped below.
  languageGroups?: LanguageGroupStat[] | null
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
  /** Realtime mode — an empty block reads the one realtime line (CardEmptyState). */
  live?: boolean
  /** Each card's imported-history provenance, from the dashboard response (PULSE-118). */
  importedCards?: Record<string, ImportedProvenance>
}

type Tab = 'map' | 'countries' | 'regions' | 'cities' | 'languages' | 'timezones'

/** The dashboard's `imported_cards` key each tab reads (PULSE-118). Timezones stay native: no key. */
const TAB_DIMENSION: Record<Tab, ImportedDimension | null> = {
  map: 'country',
  countries: 'country',
  regions: 'region',
  cities: 'city',
  languages: 'language',
  timezones: null,
}

const LIMIT = 7

const TAB_TO_DIMENSION: Record<string, string> = { countries: 'country', regions: 'region', cities: 'city', languages: 'language', timezones: 'timezone' }
const TAB_TO_KIND: Partial<Record<Tab, FullListKind>> = { countries: 'countries', regions: 'regions', cities: 'cities', languages: 'languages', timezones: 'timezones' }

// * IANA timezone → ISO country code, from IANA tzdata's own zone.tab + backward links
// * (lib/timezone-countries.gen.ts, regenerate with scripts/generate-timezone-countries.mjs).
// * It was a hand-written list of ~45 zones, so most rows had no flag (PULSE-170). A zone that
// * belongs to no country (UTC, Etc/*, the Etc/Unknown placeholder) returns '' and the row shows
// * the same grey globe the Languages tab uses for "no country" (PULSE-179, the owner's T-A).
export function getTimezoneCountry(tz: string): string {
  if (!tz || tz === 'Unknown') return ''
  return TIMEZONE_COUNTRY[tz] ?? ''
}

// * A grouped language row's flag code (PULSE-173): the server-computed
// * `flag_region` when it names a code we have art for, else the group key's
// * CLDR likely-subtag region (e.g. "ja" -> "JP") when THAT has art, else ''
// * (globe). `flag_region` already encodes "which member, if any, earned the
// * flag" (the most-visited member that carries a region, or the floor's
// * stricter rule on a shared dashboard) — this function only ever adds the
// * bare-key fallback and the hasFlag gate, never re-picks a member.
function getGroupFlagCode(item: { language?: string; flag_region?: string | null }): string {
  const key = item.language ?? ''
  if (!key || key === 'Unknown') return ''
  const region = (item.flag_region ?? '').toUpperCase()
  if (region && hasFlag(region)) return region
  try {
    const likely = new Intl.Locale(key).maximize().region
    if (likely && hasFlag(likely)) return likely
  } catch {
    // Not a resolvable BCP47 primary subtag — no fallback flag, same as an
    // unresolvable code anywhere else on this card.
  }
  return ''
}

// * Get the country code to show a flag for any item in any tab. `grouped`
// * (PULSE-173) is true only for the Languages tab's grouped-by-base rows,
// * where `item.language` is a bare group key ("en"), not a locale tag with
// * its own region subtag — a distinct code path is required, not a fallback
// * on the same one.
function getItemFlagCode(item: { country?: string; language?: string; timezone?: string; flag_region?: string | null }, tab: Tab, grouped?: boolean): string {
  switch (tab) {
    case 'countries':
    case 'regions':
    case 'cities':
      return item.country ?? ''
    case 'languages': {
      if (grouped) return getGroupFlagCode(item)
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

export default function Audience({ countries, cities, regions, languages, languageGroups, timezones, geoDataLevel = 'full', collectAudienceData = true, siteId, dateRange, totals, filters, memberFeatures = true, onFilter, live = false, importedCards }: AudienceProps) {
  const [activeTab, setActiveTab] = useState<Tab>('countries')
  type AudienceItem = {
    country?: string; city?: string; region?: string; language?: string; timezone?: string
    pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null
    // PULSE-173, grouped language rows only:
    members?: string[]; locale_count?: number; flag_region?: string | null
  }

  // PULSE-173: grouped mode is keyed on the PROP's presence, not its length.
  // An empty `language_groups` array (a real site with zero language rows) is
  // still grouped, just with nothing to show. `undefined` (an older backend,
  // deploy skew) and `null` (the backend has no grouped view for this
  // response: the range holds imported language history, which only the
  // per-locale list merges, or a cached response from before the field
  // existed) both fall back to the per-locale `languages` list.
  const isLanguageGrouped = activeTab === 'languages' && languageGroups !== undefined && languageGroups !== null


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
    // * A row with no country gets the globe on the two tabs whose rows can legitimately have
    // * none: a bare language tag, and a timezone that belongs to no country (UTC, Etc/*). The
    // * globe is a flag's size, so the label stays in the flagged rows' column (PULSE-179).
    if (!countryCode || countryCode === 'Unknown')
      return tab === 'languages' || tab === 'timezones' ? <GlobeHemisphereWest className="w-5 h-5 text-neutral-400" /> : null

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

  // PULSE-173: a grouped language row filters on ALL its members at once
  // ("language is en-US, en-GB, en, …" compiled to the backend's IN(...) for
  // the `is` operator — lib/filters.ts, internal/database/filters.go), not
  // just the group key, so the filtered dashboard matches exactly the
  // visitors the row's numbers describe. Every other tab, and an ungrouped
  // language row, keeps the single-value behaviour unchanged.
  const getItemFilterValues = (item: AudienceItem): string[] | undefined => {
    if (isLanguageGrouped) {
      if (item.members && item.members.length > 0) return item.members
      // A grouped row with no `members` (a floored shared-dashboard payload,
      // where onFilter is never passed anyway, or a backend that omitted it)
      // still filters on SOMETHING sane: the group key itself.
      return item.language ? [item.language] : undefined
    }
    const v = getItemFilterValue(item)
    return v ? [v] : undefined
  }

  const getData = (): AudienceItem[] => {
    switch (activeTab) {
      case 'countries': return countries
      case 'regions': return regions
      case 'cities': return cities
      case 'languages': return isLanguageGrouped ? (languageGroups as AudienceItem[]) : languages
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
  // retired view-all modal used) and paginate it client-side. PULSE-173: a
  // grouped Languages tab fetches the GROUPED full list (a distinct SWR kind,
  // not a flag on the per-locale one — see lib/swr/dashboard.ts) so its rows
  // carry members/locale_count/flag_region same as the fan-out ones.
  const fullListKind: FullListKind | null = isLanguageGrouped ? 'languages-grouped' : (TAB_TO_KIND[activeTab] ?? null)
  const wantsFullList = memberFeatures && !isVisualTab && !isTabDisabled() && data.length > LIMIT
  const { data: fullData } = useFullDimensionList<AudienceItem>(
    wantsFullList ? fullListKind : null,
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
              <CardEmptyState
              live={live}
                icon={<GlobeHemisphereWest />}
                title="Your first visitor hasn't arrived"
                description="Countries and cities will light up on this map as traffic flows in from around the world."
                action={{
                label: 'Install tracking script',
                href: '/settings/site/general',
                onClick: () => sessionStorage.setItem('pulse_active_site', siteId),
              }}
              />
            )
          ) : (
            hasData ? (
              <CascadeGroup flipKey={`${activeTab}-${page}`} className="space-y-2">
                {displayedData.map((item, idx) => {
                  const dim = TAB_TO_DIMENSION[activeTab]
                  const filterValues = getItemFilterValues(item)
                  const canFilter = onFilter && dim && filterValues && filterValues.length > 0
                  const barWidth = rowBarWidth(item, allData)
                  const itemKey = activeTab === 'languages' ? (item.language ?? idx) : activeTab === 'timezones' ? (item.timezone ?? idx) : `${item.country ?? ''}-${item.region ?? ''}-${item.city ?? ''}`
                  const Row = canFilter ? 'button' : 'div'
                  // PULSE-173: "N regions" is a muted secondary next to the
                  // language name, shown only for a grouped row spanning more
                  // than one locale — a shared-dashboard payload never has
                  // locale_count at all (omitted, not zero), so this renders
                  // nothing there, matching the contract's "on shared
                  // dashboards there is no locale_count".
                  const showRegionCount = isLanguageGrouped && (item.locale_count ?? 0) > 1
                  return (
                    <CascadeRow key={itemKey} index={idx}>
                      <Row
                        {...(canFilter ? { type: 'button' as const, onClick: () => canFilter && onFilter({ dimension: dim, operator: 'is', values: filterValues! }) } : {})}
                        className={`interactive-row w-full text-left relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${canFilter ? ' cursor-pointer' : ''}`}
                      >
                        <RowBar width={barWidth} index={idx} />
                        <div className="relative flex-1 truncate text-white flex items-center gap-3">
                          {showsFlag && <span className="shrink-0">{getFlagComponent(getItemFlagCode(item, activeTab, isLanguageGrouped), activeTab)}</span>}
                          <span className="truncate flex items-baseline gap-1.5 min-w-0">
                            <span className="truncate">{getItemLabel(item)}</span>
                            {showRegionCount && (
                              <span className="text-neutral-500 text-xs shrink-0">{item.locale_count} regions</span>
                            )}
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
            <CardEmptyState
              live={live}
              icon={<GlobeHemisphereWest />}
              title={`No ${activeTab} data yet`}
              description={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}-level breakdowns appear once enough visitors arrive to generate meaningful geographic data.`}
            />
          )
        )}
        </div>

      <ImportedCardNote card={TAB_DIMENSION[activeTab] ? importedCards?.[TAB_DIMENSION[activeTab]!] : null} dimension={TAB_DIMENSION[activeTab]} />
      <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label={activeTab} />
    </div>
  )
}

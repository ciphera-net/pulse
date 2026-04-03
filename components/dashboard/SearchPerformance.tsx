'use client'

import { useState, useEffect } from 'react'
import { logger } from '@/lib/utils/logger'
import { formatNumber, Modal } from '@ciphera-net/ui'
import { FrameCornersIcon, Monitor, DeviceMobile, DeviceTablet } from '@phosphor-icons/react'
import { useGSCStatus, useGSCOverview, useGSCTopQueries, useGSCTopPages, useGSCTopCountries, useGSCTopDevices, useGSCOpportunities } from '@/lib/swr/dashboard'
import { getGSCTopQueries, getGSCTopPages, getGSCTopCountries, getGSCTopDevices, getGSCOpportunities } from '@/lib/api/gsc'
import type { GSCDataRow, GSCCountryRow, GSCDeviceRow, GSCOpportunityRow } from '@/lib/api/gsc'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import { ListSkeleton } from '@/components/skeletons'
import VirtualList from './VirtualList'

interface SearchPerformanceProps {
  siteId: string
  dateRange: { start: string; end: string }
}

type Tab = 'queries' | 'pages' | 'countries' | 'devices' | 'opportunities'

const LIMIT = 7

const tabLabels: Record<Tab, string> = {
  queries: 'Queries',
  pages: 'Pages',
  countries: 'Countries',
  devices: 'Devices',
  opportunities: 'Opportunities',
}

const alpha3ToAlpha2: Record<string, string> = {
  USA: 'US', GBR: 'GB', DEU: 'DE', FRA: 'FR', NLD: 'NL', BEL: 'BE',
  CHE: 'CH', AUT: 'AT', CAN: 'CA', AUS: 'AU', BRA: 'BR', IND: 'IN',
  JPN: 'JP', KOR: 'KR', CHN: 'CN', ESP: 'ES', ITA: 'IT', PRT: 'PT',
  SWE: 'SE', NOR: 'NO', DNK: 'DK', FIN: 'FI', POL: 'PL', CZE: 'CZ',
  ROU: 'RO', HUN: 'HU', BGR: 'BG', HRV: 'HR', SVK: 'SK', SVN: 'SI',
  LTU: 'LT', LVA: 'LV', EST: 'EE', IRL: 'IE', RUS: 'RU', UKR: 'UA',
  TUR: 'TR', MEX: 'MX', ARG: 'AR', COL: 'CO', CHL: 'CL', PER: 'PE',
  ZAF: 'ZA', NGA: 'NG', EGY: 'EG', KEN: 'KE', ISR: 'IL', ARE: 'AE',
  SAU: 'SA', SGP: 'SG', MYS: 'MY', THA: 'TH', IDN: 'ID', PHL: 'PH',
  VNM: 'VN', TWN: 'TW', HKG: 'HK', NZL: 'NZ', GRC: 'GR', LUX: 'LU',
}

function countryFlag(alpha3: string): string {
  const a2 = alpha3ToAlpha2[alpha3.toUpperCase()]
  if (!a2) return ''
  return String.fromCodePoint(...[...a2].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))
}

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })

function countryName(alpha3: string): string {
  const a2 = alpha3ToAlpha2[alpha3.toUpperCase()]
  if (!a2) return alpha3
  try { return countryNames.of(a2) ?? alpha3 } catch { return alpha3 }
}

function getDeviceIcon(device: string) {
  switch (device.toUpperCase()) {
    case 'DESKTOP': return Monitor
    case 'MOBILE': return DeviceMobile
    case 'TABLET': return DeviceTablet
    default: return Monitor
  }
}

function getPositionBadgeClasses(position: number): string {
  if (position <= 10) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/20'
  if (position <= 20) return 'text-brand-orange dark:text-brand-orange bg-brand-orange/10 dark:bg-brand-orange/20'
  if (position <= 50) return 'text-neutral-400 dark:text-neutral-500 bg-neutral-800'
  return 'text-red-500 dark:text-red-400 bg-red-500/10 dark:bg-red-500/20'
}

export default function SearchPerformance({ siteId, dateRange }: SearchPerformanceProps) {
  const [activeTab, setActiveTab] = useState<Tab>('queries')
  const handleTabKeyDown = useTabListKeyboard()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [fullData, setFullData] = useState<(GSCDataRow | GSCCountryRow | GSCOpportunityRow)[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)

  const { data: gscStatus } = useGSCStatus(siteId)
  const { data: overview, isLoading: overviewLoading } = useGSCOverview(siteId, dateRange.start, dateRange.end)
  const { data: queriesData, isLoading: queriesLoading } = useGSCTopQueries(siteId, dateRange.start, dateRange.end, LIMIT, 0)
  const { data: pagesData, isLoading: pagesLoading } = useGSCTopPages(siteId, dateRange.start, dateRange.end, LIMIT, 0)
  const { data: countriesData, isLoading: countriesLoading } = useGSCTopCountries(siteId, dateRange.start, dateRange.end, LIMIT, 0)
  const { data: devicesData, isLoading: devicesLoading } = useGSCTopDevices(siteId, dateRange.start, dateRange.end)
  const { data: opportunitiesData, isLoading: opportunitiesLoading } = useGSCOpportunities(siteId, dateRange.start, dateRange.end, LIMIT)

  // Fetch full data when modal opens (matches ContentStats/TopReferrers pattern)
  useEffect(() => {
    if (isModalOpen) {
      const fetchData = async () => {
        setIsLoadingFull(true)
        try {
          if (activeTab === 'queries') {
            const data = await getGSCTopQueries(siteId, dateRange.start, dateRange.end, 100, 0)
            setFullData(data.queries ?? [])
          } else if (activeTab === 'pages') {
            const data = await getGSCTopPages(siteId, dateRange.start, dateRange.end, 100, 0)
            setFullData(data.pages ?? [])
          } else if (activeTab === 'countries') {
            const data = await getGSCTopCountries(siteId, dateRange.start, dateRange.end, 100, 0)
            setFullData(data.countries ?? [])
          } else if (activeTab === 'opportunities') {
            const data = await getGSCOpportunities(siteId, dateRange.start, dateRange.end, 100)
            setFullData(data.opportunities ?? [])
          }
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

  // Don't render if GSC is not connected
  if (!gscStatus?.connected) return null

  const isLoading = overviewLoading || queriesLoading || pagesLoading || countriesLoading || devicesLoading || opportunitiesLoading
  const queries = queriesData?.queries ?? []
  const pages = pagesData?.pages ?? []
  const countries = countriesData?.countries ?? []
  const devices = devicesData?.devices ?? []
  const opportunities = opportunitiesData?.opportunities ?? []
  const hasData = overview && (overview.total_clicks > 0 || overview.total_impressions > 0)

  // Hide panel entirely if loaded but no data
  if (!isLoading && !hasData) return null

  // Determine displayed data per tab
  const getDisplayedData = () => {
    switch (activeTab) {
      case 'queries': return queries.slice(0, LIMIT)
      case 'pages': return pages.slice(0, LIMIT)
      case 'countries': return countries.slice(0, LIMIT)
      case 'devices': return devices
      case 'opportunities': return opportunities.slice(0, LIMIT)
    }
  }

  const displayedData = getDisplayedData()

  const showViewAll = activeTab === 'devices'
    ? false
    : (() => {
        switch (activeTab) {
          case 'queries': return queries.length >= LIMIT
          case 'pages': return pages.length >= LIMIT
          case 'countries': return countries.length >= LIMIT
          case 'opportunities': return opportunities.length >= LIMIT
          default: return false
        }
      })()

  const emptySlots = activeTab === 'devices' ? 0 : Math.max(0, LIMIT - displayedData.length)

  // Render a row for queries/pages
  function renderDataRow(row: GSCDataRow, maxImpressions: number, totalImpressions: number) {
    const label = activeTab === 'queries' ? row.query : row.page
    const barWidth = maxImpressions > 0 ? (row.impressions / maxImpressions) * 75 : 0
    return (
      <div
        key={label}
        className="relative flex items-center justify-between h-9 group hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors"
      >
        <div
          className="absolute inset-y-0.5 left-0.5 bg-gradient-to-r from-brand-orange/15 via-brand-orange/8 to-transparent border border-brand-orange/20 shadow-[inset_0_1px_0_rgba(253,94,15,0.08)] rounded-md transition-all"
          style={{ width: `${barWidth}%` }}
        />
        <span className="relative text-sm text-white truncate flex-1 min-w-0" title={label}>
          {label}
        </span>
        <div className="relative flex items-center gap-2 ml-4 shrink-0">
          <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
            {totalImpressions > 0 ? `${Math.round((row.impressions / totalImpressions) * 100)}%` : ''}
          </span>
          <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
            {formatNumber(row.clicks)}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getPositionBadgeClasses(row.position)}`}>
            {row.position.toFixed(1)}
          </span>
        </div>
      </div>
    )
  }

  // Render a row for countries
  function renderCountryRow(row: GSCCountryRow, maxClicks: number, totalClicks: number) {
    const barWidth = maxClicks > 0 ? (row.clicks / maxClicks) * 75 : 0
    const flag = countryFlag(row.country)
    const name = countryName(row.country)
    return (
      <div
        key={row.country}
        className="relative flex items-center justify-between h-9 group hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors"
      >
        <div
          className="absolute inset-y-0.5 left-0.5 bg-gradient-to-r from-brand-orange/15 via-brand-orange/8 to-transparent border border-brand-orange/20 shadow-[inset_0_1px_0_rgba(253,94,15,0.08)] rounded-md transition-all"
          style={{ width: `${barWidth}%` }}
        />
        <span className="relative text-sm text-white truncate flex-1 min-w-0" title={name}>
          {flag ? `${flag} ` : ''}{name}
        </span>
        <div className="relative flex items-center gap-2 ml-4 shrink-0">
          <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
            {totalClicks > 0 ? `${Math.round((row.clicks / totalClicks) * 100)}%` : ''}
          </span>
          <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
            {formatNumber(row.clicks)}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getPositionBadgeClasses(row.position)}`}>
            {row.position.toFixed(1)}
          </span>
        </div>
      </div>
    )
  }

  // Render a row for devices
  function renderDeviceRow(row: GSCDeviceRow, maxClicks: number, totalClicks: number) {
    const barWidth = maxClicks > 0 ? (row.clicks / maxClicks) * 75 : 0
    const Icon = getDeviceIcon(row.device)
    const label = row.device.charAt(0).toUpperCase() + row.device.slice(1).toLowerCase()
    return (
      <div
        key={row.device}
        className="relative flex items-center justify-between h-9 group hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors"
      >
        <div
          className="absolute inset-y-0.5 left-0.5 bg-gradient-to-r from-brand-orange/15 via-brand-orange/8 to-transparent border border-brand-orange/20 shadow-[inset_0_1px_0_rgba(253,94,15,0.08)] rounded-md transition-all"
          style={{ width: `${barWidth}%` }}
        />
        <span className="relative text-sm text-white truncate flex-1 min-w-0 flex items-center gap-2">
          <Icon className="w-5 h-5 text-neutral-400 shrink-0" />
          {label}
        </span>
        <div className="relative flex items-center gap-2 ml-4 shrink-0">
          <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
            {totalClicks > 0 ? `${Math.round((row.clicks / totalClicks) * 100)}%` : ''}
          </span>
          <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
            {formatNumber(row.clicks)}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getPositionBadgeClasses(row.position)}`}>
            {row.position.toFixed(1)}
          </span>
        </div>
      </div>
    )
  }

  // Render a row for opportunities
  function renderOpportunityRow(row: GSCOpportunityRow, maxImpressions: number) {
    const barWidth = maxImpressions > 0 ? (row.impressions / maxImpressions) * 75 : 0
    return (
      <div
        key={row.query}
        className="relative flex items-center justify-between h-9 group hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors"
      >
        <div
          className="absolute inset-y-0.5 left-0.5 bg-gradient-to-r from-brand-orange/15 via-brand-orange/8 to-transparent border border-brand-orange/20 shadow-[inset_0_1px_0_rgba(253,94,15,0.08)] rounded-md transition-all"
          style={{ width: `${barWidth}%` }}
        />
        <span className="relative text-sm text-white truncate flex-1 min-w-0" title={row.query}>
          {row.query}
        </span>
        <div className="relative flex items-center gap-2 ml-4 shrink-0">
          <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
            {formatNumber(row.clicks)}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getPositionBadgeClasses(row.position)}`}>
            {row.position.toFixed(1)}
          </span>
          <span className="text-xs font-medium text-emerald-500">
            &rarr; {formatNumber(row.potential_clicks)}
          </span>
        </div>
      </div>
    )
  }

  // Render the data list based on active tab
  function renderDataList() {
    if (displayedData.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center py-6">
          <p className="text-sm text-neutral-400 dark:text-neutral-500">No search data yet</p>
        </div>
      )
    }

    let rows: React.ReactNode[]

    if (activeTab === 'queries' || activeTab === 'pages') {
      const typed = displayedData as GSCDataRow[]
      const totalImpressions = typed.reduce((sum, d) => sum + d.impressions, 0)
      const maxImpressions = typed[0]?.impressions ?? 0
      rows = typed.map(row => renderDataRow(row, maxImpressions, totalImpressions))
    } else if (activeTab === 'countries') {
      const typed = displayedData as GSCCountryRow[]
      const totalClicks = typed.reduce((sum, d) => sum + d.clicks, 0)
      const maxClicks = typed[0]?.clicks ?? 0
      rows = typed.map(row => renderCountryRow(row, maxClicks, totalClicks))
    } else if (activeTab === 'devices') {
      const typed = displayedData as GSCDeviceRow[]
      const totalClicks = typed.reduce((sum, d) => sum + d.clicks, 0)
      const maxClicks = typed[0]?.clicks ?? 0
      rows = typed.map(row => renderDeviceRow(row, maxClicks, totalClicks))
    } else {
      const typed = displayedData as GSCOpportunityRow[]
      const maxImpressions = typed[0]?.impressions ?? 0
      rows = typed.map(row => renderOpportunityRow(row, maxImpressions))
    }

    return (
      <>
        {rows}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
        ))}
      </>
    )
  }

  // Modal row rendering
  function renderModalRow(row: GSCDataRow | GSCCountryRow | GSCOpportunityRow, totalImpressions: number) {
    if (activeTab === 'queries' || activeTab === 'pages') {
      const r = row as GSCDataRow
      const label = activeTab === 'queries' ? r.query : r.page
      return (
        <div
          key={label}
          className="flex items-center justify-between h-9 group hover:bg-neutral-800 rounded-lg px-2 transition-colors"
        >
          <span className="flex-1 truncate text-sm text-white" title={label}>
            {label}
          </span>
          <div className="flex items-center gap-2 ml-4">
            <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
              {totalImpressions > 0 ? `${Math.round((r.impressions / totalImpressions) * 100)}%` : ''}
            </span>
            <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
              {formatNumber(r.clicks)}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getPositionBadgeClasses(r.position)}`}>
              {r.position.toFixed(1)}
            </span>
          </div>
        </div>
      )
    } else if (activeTab === 'countries') {
      const r = row as GSCCountryRow
      const flag = countryFlag(r.country)
      const name = countryName(r.country)
      return (
        <div
          key={r.country}
          className="flex items-center justify-between h-9 group hover:bg-neutral-800 rounded-lg px-2 transition-colors"
        >
          <span className="flex-1 truncate text-sm text-white" title={name}>
            {flag ? `${flag} ` : ''}{name}
          </span>
          <div className="flex items-center gap-2 ml-4">
            <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
              {totalImpressions > 0 ? `${Math.round((r.clicks / totalImpressions) * 100)}%` : ''}
            </span>
            <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
              {formatNumber(r.clicks)}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getPositionBadgeClasses(r.position)}`}>
              {r.position.toFixed(1)}
            </span>
          </div>
        </div>
      )
    } else {
      // opportunities
      const r = row as GSCOpportunityRow
      return (
        <div
          key={r.query}
          className="flex items-center justify-between h-9 group hover:bg-neutral-800 rounded-lg px-2 transition-colors"
        >
          <span className="flex-1 truncate text-sm text-white" title={r.query}>
            {r.query}
          </span>
          <div className="flex items-center gap-2 ml-4">
            <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
              {formatNumber(r.clicks)}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getPositionBadgeClasses(r.position)}`}>
              {r.position.toFixed(1)}
            </span>
            <span className="text-xs font-medium text-emerald-500">
              &rarr; {formatNumber(r.potential_clicks)}
            </span>
          </div>
        </div>
      )
    }
  }

  // Get modal label for search filtering
  function getModalLabel(row: GSCDataRow | GSCCountryRow | GSCOpportunityRow): string {
    if (activeTab === 'queries') return (row as GSCDataRow).query
    if (activeTab === 'pages') return (row as GSCDataRow).page
    if (activeTab === 'countries') return countryName((row as GSCCountryRow).country)
    return (row as GSCOpportunityRow).query
  }

  // Get the source data for modal based on active tab
  function getModalSourceData(): (GSCDataRow | GSCCountryRow | GSCOpportunityRow)[] {
    switch (activeTab) {
      case 'queries': return queries
      case 'pages': return pages
      case 'countries': return countries
      case 'opportunities': return opportunities
      default: return []
    }
  }

  return (
    <>
      <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1" role="tablist" aria-label="Search data tabs" onKeyDown={handleTabKeyDown}>
            {(['queries', 'pages', 'countries', 'devices', 'opportunities'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`relative px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded cursor-pointer ${
                  activeTab === tab
                    ? 'text-white'
                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {tabLabels[tab]}
                <span
                  className={`absolute inset-x-0 -bottom-px h-[3px] rounded-full transition-all duration-200 ${
                    activeTab === tab ? 'bg-brand-orange scale-x-100' : 'bg-transparent scale-x-0'
                  }`}
                />
              </button>
            ))}
          </div>
          {showViewAll && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-brand-orange dark:hover:text-brand-orange hover:bg-neutral-800 transition-all cursor-pointer rounded-lg"
              aria-label="View all search data"
            >
              <FrameCornersIcon className="w-4 h-4" weight="bold" />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2 flex-1 min-h-[270px]">
            <ListSkeleton rows={LIMIT} />
          </div>
        ) : (
          <>
            {/* Data list */}
            <div className="space-y-2 flex-1 min-h-[270px]">
              {renderDataList()}
            </div>
          </>
        )}
      </div>

      {/* Expand modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setModalSearch('') }}
        title={`Search ${tabLabels[activeTab]}`}
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
            const source = fullData.length > 0 ? fullData : getModalSourceData()
            const modalData = source.filter(row => {
              if (!modalSearch) return true
              return getModalLabel(row).toLowerCase().includes(modalSearch.toLowerCase())
            })
            const modalTotal = activeTab === 'countries'
              ? modalData.reduce((sum, r) => sum + (r as GSCCountryRow).clicks, 0)
              : modalData.reduce((sum, r) => sum + ((r as GSCDataRow).impressions ?? 0), 0)
            return (
              <VirtualList
                items={modalData}
                estimateSize={36}
                className="max-h-[80vh] overflow-y-auto pr-2"
                renderItem={(row) => renderModalRow(row, modalTotal)}
              />
            )
          })()}
        </div>
      </Modal>
    </>
  )
}

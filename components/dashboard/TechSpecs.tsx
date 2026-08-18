'use client'

import { useState, useMemo } from 'react'
import { formatNumber } from '@/lib/utils/format'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import { getBrowserIcon, getOSIcon, getDeviceIcon } from '@/lib/utils/icons'
import { Monitor, FrameCornersIcon } from '@phosphor-icons/react'
import { Modal } from '@ciphera-net/facet'
import { DeviceMobile } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { ListSkeleton } from '@/components/skeletons'
import VirtualList from './VirtualList'
import { useFullDimensionList, type FullListKind } from '@/lib/swr/dashboard'
import { type DimensionFilter } from '@/lib/filters'

interface TechSpecsProps {
  browsers: Array<{ browser: string; pageviews: number }>
  os: Array<{ os: string; pageviews: number }>
  devices: Array<{ device: string; pageviews: number }>
  screenResolutions: Array<{ screen_resolution: string; pageviews: number }>
  collectDeviceInfo?: boolean
  collectScreenResolution?: boolean
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

type Tab = 'browsers' | 'os' | 'devices' | 'screens'

const TAB_TO_KIND: Record<Tab, FullListKind> = {
  browsers: 'browsers',
  os: 'os',
  devices: 'devices',
  screens: 'screen-resolutions',
}

// The full-list endpoints return rows keyed by their own dimension name; the
// card renders a unified { name, pageviews } shape.
type RawTechRow = { browser?: string; os?: string; device?: string; screen_resolution?: string; pageviews: number }
const RAW_NAME_KEY: Record<Tab, keyof RawTechRow> = {
  browsers: 'browser',
  os: 'os',
  devices: 'device',
  screens: 'screen_resolution',
}

function capitalize(s: string): string {
  if (!s) return s
  // Preserve intentional casing (e.g. macOS, iOS, webOS, ChromeOS, FreeBSD)
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const LIMIT = 7

const TAB_TO_DIMENSION: Record<string, string> = { browsers: 'browser', os: 'os', devices: 'device', screens: 'screen_resolution' }

export default function TechSpecs({ browsers, os, devices, screenResolutions, collectDeviceInfo = true, collectScreenResolution = true, siteId, dateRange, totals, filters, memberFeatures = true, onFilter }: TechSpecsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('browsers')
  const handleTabKeyDown = useTabListKeyboard()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  type TechItem = { name: string; pageviews: number; icon: React.ReactNode }

  const denom = totals && totals.pageviews > 0 ? totals.pageviews : null
  const pct = (pageviews: number) =>
    denom != null ? `${Math.round((pageviews / denom) * 100)}%` : ''

  // Filter out "Unknown" entries that result from disabled collection
  const filterUnknown = (items: Array<{ name: string; pageviews: number; icon: React.ReactNode }>) => {
    return items.filter(item => item.name && item.name !== 'Unknown' && item.name !== '')
  }

  // Modal data via SWR — armed only while open, filters on the key (F14/F17).
  const {
    data: fullRaw,
    error: fullError,
    isLoading: isLoadingFull,
    mutate: refetchFull,
  } = useFullDimensionList<RawTechRow>(
    isModalOpen ? TAB_TO_KIND[activeTab] : null,
    siteId, dateRange?.start, dateRange?.end, 100, filters,
  )

  const fullData: TechItem[] = useMemo(() => {
    const nameKey = RAW_NAME_KEY[activeTab]
    const iconFor = (name: string) =>
      activeTab === 'browsers' ? getBrowserIcon(name)
        : activeTab === 'os' ? getOSIcon(name)
          : activeTab === 'devices' ? getDeviceIcon(name)
            : <Monitor className="text-neutral-500" />
    return filterUnknown((fullRaw ?? []).map(row => {
      const name = (row[nameKey] as string) ?? ''
      return { name, pageviews: row.pageviews, icon: iconFor(name) }
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullRaw, activeTab])

  const getRawData = () => {
    switch (activeTab) {
      case 'browsers':
        return browsers.map(b => ({ name: b.browser, pageviews: b.pageviews, icon: getBrowserIcon(b.browser) }))
      case 'os':
        return os.map(o => ({ name: o.os, pageviews: o.pageviews, icon: getOSIcon(o.os) }))
      case 'devices':
        return devices.map(d => ({ name: d.device, pageviews: d.pageviews, icon: getDeviceIcon(d.device) }))
      case 'screens':
        return screenResolutions.map(s => ({ name: s.screen_resolution, pageviews: s.pageviews, icon: <Monitor className="text-neutral-500" /> }))
      default:
        return []
    }
  }

  // Check if current tab is disabled by privacy settings
  const isTabDisabled = () => {
    if (!collectDeviceInfo && (activeTab === 'browsers' || activeTab === 'os' || activeTab === 'devices')) {
      return true
    }
    if (!collectScreenResolution && activeTab === 'screens') {
      return true
    }
    return false
  }

  const getDisabledMessage = () => {
    if (!collectDeviceInfo && (activeTab === 'browsers' || activeTab === 'os' || activeTab === 'devices')) {
      return 'Device info collection is disabled in site settings'
    }
    if (!collectScreenResolution && activeTab === 'screens') {
      return 'Screen resolution collection is disabled in site settings'
    }
    return 'No data available'
  }

  const rawData = getRawData()
  const data = filterUnknown(rawData)
  const hasData = data && data.length > 0
  const displayedData = hasData ? data.slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)
  const showViewAll = memberFeatures && hasData && data.length > LIMIT

  return (
    <>
      <div className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 min-w-0 overflow-x-auto scrollbar-hide pb-1 max-md:[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]" role="tablist" aria-label="Technology view tabs" onKeyDown={handleTabKeyDown}>
            {(['browsers', 'os', 'devices', 'screens'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`relative px-2.5 py-3 sm:py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded-none cursor-pointer ${
                  activeTab === tab
                    ? 'text-white'
                    : 'text-neutral-500 hover:text-neutral-300'
                } ease-apple`}
              >
                {{ browsers: 'Browsers', os: 'OS', devices: 'Devices', screens: 'Screens' }[tab]}
                <span
                  className={`absolute inset-x-0 -bottom-px h-[3px] rounded-none transition-[width,background-color] duration-base ${
                    activeTab === tab ? 'bg-brand-orange scale-x-100' : 'bg-transparent scale-x-0'
                  } ease-apple`}
                />
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {denom != null && (
              <span className="hidden whitespace-nowrap text-[11px] text-neutral-500 sm:block">
                share of {formatNumber(denom)} pageviews
              </span>
            )}
            {showViewAll && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="p-3 md:p-1.5 text-neutral-500 hover:text-brand-orange hover:bg-neutral-800 transition-all cursor-pointer rounded-none ease-apple"
                aria-label="View all technology"
              >
                <FrameCornersIcon className="w-4 h-4" weight="bold" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2 flex-1 min-h-[270px]">
          {isTabDisabled() ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-neutral-400 text-sm">{getDisabledMessage()}</p>
            </div>
          ) : hasData ? (
            <>
              {displayedData.map((item) => {
                const dim = TAB_TO_DIMENSION[activeTab]
                const canFilter = onFilter && dim
                const maxPv = displayedData[0]?.pageviews ?? 0
                const barWidth = maxPv > 0 ? (item.pageviews / maxPv) * 75 : 0
                return (
                  <div
                    key={item.name}
                    onClick={() => canFilter && onFilter({ dimension: dim, operator: 'is', values: [item.name] })}
                    className={`interactive-row relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${canFilter ? ' cursor-pointer' : ''}`}
                  >
                    <div
                      className="absolute inset-y-0.5 left-0.5 bg-brand-orange/[0.07] border-l-2 border-brand-orange/70 rounded-none transition-[width,background-color] ease-apple"
                      style={{ width: `${barWidth}%` }}
                    />
                    <div className="relative flex-1 truncate text-white flex items-center gap-3">
                      {item.icon && <span className="text-lg">{item.icon}</span>}
                      <span className="truncate">{capitalize(item.name)}</span>
                    </div>
                    <div className="relative flex items-center gap-2 ml-4">
                      <span className="text-xs font-medium text-brand-orange opacity-100 translate-x-0 md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
                        {pct(item.pageviews)}
                      </span>
                      <span className="text-sm font-semibold text-neutral-400">
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
            <EmptyState
              icon={<DeviceMobile />}
              title="No devices detected yet"
              description="Browser, OS, and screen data appears automatically as visitors arrive. No extra setup needed."
              action={{ label: 'Install tracking script', href: '/installation' }}
            />
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setModalSearch('') }}
        title={activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
        className="max-w-2xl max-h-[90vh] flex flex-col !bg-card !border-neutral-800"
      >
        <div>
          <input
            type="text"
            value={modalSearch}
            onChange={(e) => setModalSearch(e.target.value)}
            placeholder="Search technology..."
            className="w-full px-3 py-2 mb-3 text-sm bg-neutral-800 border border-neutral-700 rounded-none text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50"
          />
          {denom != null && (
            <p className="mb-3 text-[11px] text-neutral-500">
              Shares are of all {formatNumber(denom)} pageviews in the range — searching narrows the rows, not the denominator.
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoadingFull ? (
            <div className="py-4">
              <ListSkeleton rows={10} />
            </div>
          ) : fullError ? (
            <ErrorCard
              title="Couldn’t load the full list"
              onRetry={() => refetchFull()}
            />
          ) : (() => {
            const modalData = fullData.filter(item => !modalSearch || item.name.toLowerCase().includes(modalSearch.toLowerCase()))
            const dim = TAB_TO_DIMENSION[activeTab]
            if (modalData.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-neutral-500">{modalSearch ? 'Nothing matches your search' : 'No rows in this range'}</p>
                </div>
              )
            }
            return (
              <VirtualList
                items={modalData}
                estimateSize={36}
                className="pr-2"
                renderItem={(item) => {
                  const canFilter = onFilter && dim
                  return (
                    <div
                      key={item.name}
                      onClick={() => { if (canFilter) { onFilter({ dimension: dim, operator: 'is', values: [item.name] }); setIsModalOpen(false) } }}
                      className={`interactive-row flex items-center justify-between h-9 group rounded-none px-2${canFilter ? ' cursor-pointer' : ''}`}
                    >
                      <div className="flex-1 truncate text-white flex items-center gap-3">
                        {item.icon && <span className="text-lg">{item.icon}</span>}
                        <span className="truncate">{capitalize(item.name)}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs font-medium text-brand-orange opacity-100 translate-x-0 md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
                          {pct(item.pageviews)}
                        </span>
                        <span className="text-sm font-semibold text-neutral-400">
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
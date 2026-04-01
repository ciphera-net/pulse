'use client'

import { useState, useEffect } from 'react'
import { logger } from '@/lib/utils/logger'
import { formatNumber } from '@ciphera-net/ui'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import { getBrowserIcon, getOSIcon, getDeviceIcon } from '@/lib/utils/icons'
import Link from 'next/link'
import { Monitor, FrameCornersIcon } from '@phosphor-icons/react'
import { Modal, GridIcon, ArrowRightIcon } from '@ciphera-net/ui'
import { ListSkeleton } from '@/components/skeletons'
import VirtualList from './VirtualList'
import { getBrowsers, getOS, getDevices, getScreenResolutions } from '@/lib/api/stats'
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
  onFilter?: (filter: DimensionFilter) => void
}

type Tab = 'browsers' | 'os' | 'devices' | 'screens'

function capitalize(s: string): string {
  if (!s) return s
  // Preserve intentional casing (e.g. macOS, iOS, webOS, ChromeOS, FreeBSD)
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const LIMIT = 7

const TAB_TO_DIMENSION: Record<string, string> = { browsers: 'browser', os: 'os', devices: 'device' }

export default function TechSpecs({ browsers, os, devices, screenResolutions, collectDeviceInfo = true, collectScreenResolution = true, siteId, dateRange, onFilter }: TechSpecsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('browsers')
  const handleTabKeyDown = useTabListKeyboard()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  type TechItem = { name: string; pageviews: number; icon: React.ReactNode }
  const [fullData, setFullData] = useState<TechItem[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)

  // Filter out "Unknown" entries that result from disabled collection
  const filterUnknown = (items: Array<{ name: string; pageviews: number; icon: React.ReactNode }>) => {
    return items.filter(item => item.name && item.name !== 'Unknown' && item.name !== '')
  }

  useEffect(() => {
    if (isModalOpen) {
      const fetchData = async () => {
        setIsLoadingFull(true)
        try {
          let data: TechItem[] = []
          if (activeTab === 'browsers') {
            const res = await getBrowsers(siteId, dateRange.start, dateRange.end, 100)
            data = res.map(b => ({ name: b.browser, pageviews: b.pageviews, icon: getBrowserIcon(b.browser) }))
          } else if (activeTab === 'os') {
            const res = await getOS(siteId, dateRange.start, dateRange.end, 100)
            data = res.map(o => ({ name: o.os, pageviews: o.pageviews, icon: getOSIcon(o.os) }))
          } else if (activeTab === 'devices') {
            const res = await getDevices(siteId, dateRange.start, dateRange.end, 100)
            data = res.map(d => ({ name: d.device, pageviews: d.pageviews, icon: getDeviceIcon(d.device) }))
          } else if (activeTab === 'screens') {
            const res = await getScreenResolutions(siteId, dateRange.start, dateRange.end, 100)
            data = res.map(s => ({ name: s.screen_resolution, pageviews: s.pageviews, icon: <Monitor className="text-neutral-500" /> }))
          }
          setFullData(filterUnknown(data))
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
  const totalPageviews = data.reduce((sum, item) => sum + item.pageviews, 0)
  const hasData = data && data.length > 0
  const displayedData = hasData ? data.slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)
  const showViewAll = hasData && data.length > LIMIT

  return (
    <>
      <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1" role="tablist" aria-label="Technology view tabs" onKeyDown={handleTabKeyDown}>
            {(['browsers', 'os', 'devices', 'screens'] as Tab[]).map((tab) => (
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
                {{ browsers: 'Browsers', os: 'OS', devices: 'Devices', screens: 'Screens' }[tab]}
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
              aria-label="View all technology"
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
                    className={`relative flex items-center justify-between h-9 group hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors${canFilter ? ' cursor-pointer' : ''}`}
                  >
                    <div
                      className="absolute inset-y-0.5 left-0.5 bg-gradient-to-r from-brand-orange/15 via-brand-orange/8 to-transparent border border-brand-orange/20 shadow-[inset_0_1px_0_rgba(253,94,15,0.08)] rounded-md transition-all"
                      style={{ width: `${barWidth}%` }}
                    />
                    <div className="relative flex-1 truncate text-white flex items-center gap-3">
                      {item.icon && <span className="text-lg">{item.icon}</span>}
                      <span className="truncate">{capitalize(item.name)}</span>
                    </div>
                    <div className="relative flex items-center gap-2 ml-4">
                      <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                        {totalPageviews > 0 ? `${Math.round((item.pageviews / totalPageviews) * 100)}%` : ''}
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
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
              <div className="rounded-full bg-neutral-800 p-4">
                <GridIcon className="w-8 h-8 text-neutral-400" />
              </div>
              <h4 className="font-semibold text-white">
                No technology data yet
              </h4>
              <p className="text-sm text-neutral-400 max-w-xs">
                Browser, OS, and device information will appear as visitors arrive.
              </p>
              <Link
                href="/installation"
                className="inline-flex items-center gap-2 text-sm font-medium text-brand-orange hover:text-brand-orange/90 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/20 rounded"
              >
                Install tracking script
                <ArrowRightIcon className="w-4 h-4" />
              </Link>
            </div>
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
            placeholder="Search technology..."
            className="w-full px-3 py-2 mb-3 text-sm bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50"
          />
        </div>
        <div className="max-h-[80vh]">
          {isLoadingFull ? (
            <div className="py-4">
              <ListSkeleton rows={10} />
            </div>
          ) : (() => {
            const modalData = (fullData.length > 0 ? fullData : data).filter(item => !modalSearch || item.name.toLowerCase().includes(modalSearch.toLowerCase()))
            const modalTotal = modalData.reduce((sum, item) => sum + item.pageviews, 0)
            const dim = TAB_TO_DIMENSION[activeTab]
            return (
              <VirtualList
                items={modalData}
                estimateSize={36}
                className="max-h-[80vh] overflow-y-auto pr-2"
                renderItem={(item) => {
                  const canFilter = onFilter && dim
                  return (
                    <div
                      key={item.name}
                      onClick={() => { if (canFilter) { onFilter({ dimension: dim, operator: 'is', values: [item.name] }); setIsModalOpen(false) } }}
                      className={`flex items-center justify-between h-9 group hover:bg-neutral-800 rounded-lg px-2 transition-colors${canFilter ? ' cursor-pointer' : ''}`}
                    >
                      <div className="flex-1 truncate text-white flex items-center gap-3">
                        {item.icon && <span className="text-lg">{item.icon}</span>}
                        <span className="truncate">{capitalize(item.name)}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                          {modalTotal > 0 ? `${Math.round((item.pageviews / modalTotal) * 100)}%` : ''}
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
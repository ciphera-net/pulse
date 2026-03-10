'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { logger } from '@/lib/utils/logger'
import { formatNumber } from '@ciphera-net/ui'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import { getBrowserIcon, getOSIcon, getDeviceIcon } from '@/lib/utils/icons'
import { Monitor, FrameCornersIcon } from '@phosphor-icons/react'
import { Modal, GridIcon } from '@ciphera-net/ui'
import { ListSkeleton } from '@/components/skeletons'
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
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const LIMIT = 7

const TAB_TO_DIMENSION: Record<string, string> = { browsers: 'browser', os: 'os', devices: 'device' }

export default function TechSpecs({ browsers, os, devices, screenResolutions, collectDeviceInfo = true, collectScreenResolution = true, siteId, dateRange, onFilter }: TechSpecsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('browsers')
  const handleTabKeyDown = useTabListKeyboard()
  const [isModalOpen, setIsModalOpen] = useState(false)
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
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Technology
            </h3>
            {showViewAll && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-brand-orange dark:hover:text-brand-orange hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all cursor-pointer rounded-lg"
                aria-label="View all technology"
              >
                <FrameCornersIcon className="w-4 h-4" weight="bold" />
              </button>
            )}
          </div>
          <div className="flex gap-1" role="tablist" aria-label="Technology view tabs" onKeyDown={handleTabKeyDown}>
            {(['browsers', 'os', 'devices', 'screens'] as Tab[]).map((tab) => (
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
                    layoutId="techSpecsTab"
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
          ) : hasData ? (
            <>
              {displayedData.map((item) => {
                const dim = TAB_TO_DIMENSION[activeTab]
                const canFilter = onFilter && dim
                return (
                  <div
                    key={item.name}
                    onClick={() => canFilter && onFilter({ dimension: dim, operator: 'is', values: [item.name] })}
                    className={`flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors${canFilter ? ' cursor-pointer' : ''}`}
                  >
                    <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                      {item.icon && <span className="text-lg">{item.icon}</span>}
                      <span className="truncate">{capitalize(item.name)}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
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
                <GridIcon className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
              </div>
              <h4 className="font-semibold text-neutral-900 dark:text-white">
                No technology data yet
              </h4>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
                Browser, OS, and device information will appear as visitors arrive.
              </p>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Technology - ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`}
        className="max-w-2xl"
      >
        <div className="space-y-1 max-h-[80vh] overflow-y-auto pr-2">
          {isLoadingFull ? (
            <div className="py-4">
              <ListSkeleton rows={10} />
            </div>
          ) : (() => {
            const modalData = fullData.length > 0 ? fullData : data
            const modalTotal = modalData.reduce((sum, item) => sum + item.pageviews, 0)
            const dim = TAB_TO_DIMENSION[activeTab]
            return modalData.map((item) => {
              const canFilter = onFilter && dim
              return (
                <div
                  key={item.name}
                  onClick={() => { if (canFilter) { onFilter({ dimension: dim, operator: 'is', values: [item.name] }); setIsModalOpen(false) } }}
                  className={`flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors${canFilter ? ' cursor-pointer' : ''}`}
                >
                  <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                    {item.icon && <span className="text-lg">{item.icon}</span>}
                    <span className="truncate">{capitalize(item.name)}</span>
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
            })
          })()}
        </div>
      </Modal>
    </>
  )
}
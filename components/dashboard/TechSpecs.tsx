'use client'

import { useState, useEffect } from 'react'
import { formatNumber } from '@/lib/utils/format'
import { getBrowserIcon, getOSIcon, getDeviceIcon } from '@/lib/utils/icons'
import { MdMonitor } from 'react-icons/md'
import { Modal } from '@ciphera-net/ui'
import { getBrowsers, getOS, getDevices, getScreenResolutions } from '@/lib/api/stats'

interface TechSpecsProps {
  browsers: Array<{ browser: string; pageviews: number }>
  os: Array<{ os: string; pageviews: number }>
  devices: Array<{ device: string; pageviews: number }>
  screenResolutions: Array<{ screen_resolution: string; pageviews: number }>
  collectDeviceInfo?: boolean
  collectScreenResolution?: boolean
  siteId: string
  dateRange: { start: string, end: string }
}

type Tab = 'browsers' | 'os' | 'devices' | 'screens'

const LIMIT = 7

export default function TechSpecs({ browsers, os, devices, screenResolutions, collectDeviceInfo = true, collectScreenResolution = true, siteId, dateRange }: TechSpecsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('browsers')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fullData, setFullData] = useState<any[]>([])
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
          let data: any[] = []
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
            data = res.map(s => ({ name: s.screen_resolution, pageviews: s.pageviews, icon: <MdMonitor className="text-neutral-500" /> }))
          }
          setFullData(filterUnknown(data))
        } catch (e) {
          console.error(e)
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
        return screenResolutions.map(s => ({ name: s.screen_resolution, pageviews: s.pageviews, icon: <MdMonitor className="text-neutral-500" /> }))
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
  const showViewAll = hasData && data.length > LIMIT

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Technology
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
            {(['browsers', 'os', 'devices', 'screens'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors capitalize ${
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
          ) : hasData ? (
            <>
              {displayedData.map((item, index) => (
                <div key={index} className="flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors">
                  <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                    {item.icon && <span className="text-lg">{item.icon}</span>}
                    <span className="truncate">{item.name}</span>
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
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Technology - ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`}
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {isLoadingFull ? (
            <div className="py-4 text-center text-neutral-500">Loading...</div>
          ) : (
            (fullData.length > 0 ? fullData : data).map((item, index) => (
              <div key={index} className="flex items-center justify-between py-2 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors">
                <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                  {item.icon && <span className="text-lg">{item.icon}</span>}
                  <span className="truncate">{item.name === 'Unknown' ? 'Unknown' : item.name}</span>
                </div>
                <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
                  {formatNumber(item.pageviews)}
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </>
  )
}
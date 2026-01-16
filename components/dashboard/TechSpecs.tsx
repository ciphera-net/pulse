'use client'

import { useState } from 'react'
import { formatNumber } from '@/lib/utils/format'

interface TechSpecsProps {
  browsers: Array<{ browser: string; pageviews: number }>
  os: Array<{ os: string; pageviews: number }>
  devices: Array<{ device: string; pageviews: number }>
}

type Tab = 'browsers' | 'os' | 'devices'

export default function TechSpecs({ browsers, os, devices }: TechSpecsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('browsers')

  const renderContent = () => {
    let data: Array<{ name: string; pageviews: number }> = []
    
    if (activeTab === 'browsers') {
        data = browsers.map(b => ({ name: b.browser, pageviews: b.pageviews }))
    } else if (activeTab === 'os') {
        data = os.map(o => ({ name: o.os, pageviews: o.pageviews }))
    } else if (activeTab === 'devices') {
        data = devices.map(d => ({ name: d.device, pageviews: d.pageviews }))
    }

    if (!data || data.length === 0) {
      return <p className="text-neutral-600 dark:text-neutral-400">No data available</p>
    }

    return (
      <div className="space-y-3">
        {data.map((item, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
              <span className="truncate">{item.name === 'Unknown' ? 'Unknown' : item.name}</span>
            </div>
            <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
              {formatNumber(item.pageviews)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 h-full">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Technology
        </h3>
        <div className="flex p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
          <button
            onClick={() => setActiveTab('browsers')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'browsers'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Browsers
          </button>
          <button
            onClick={() => setActiveTab('os')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'os'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            OS
          </button>
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'devices'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Devices
          </button>
        </div>
      </div>
      {renderContent()}
    </div>
  )
}

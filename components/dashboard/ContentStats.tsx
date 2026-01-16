'use client'

import { useState } from 'react'
import { formatNumber } from '@/lib/utils/format'
import { TopPage } from '@/lib/api/stats'

interface ContentStatsProps {
  topPages: TopPage[]
  entryPages: TopPage[]
  exitPages: TopPage[]
}

type Tab = 'top_pages' | 'entry_pages' | 'exit_pages'

export default function ContentStats({ topPages, entryPages, exitPages }: ContentStatsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('top_pages')

  const renderContent = () => {
    let data: TopPage[] = []
    
    if (activeTab === 'top_pages') {
      data = topPages
    } else if (activeTab === 'entry_pages') {
      data = entryPages
    } else if (activeTab === 'exit_pages') {
      data = exitPages
    }

    if (!data || data.length === 0) {
      return <p className="text-neutral-600 dark:text-neutral-400">No data available</p>
    }

    return (
      <div className="space-y-3">
        {data.map((page, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex-1 truncate text-neutral-900 dark:text-white">
              {page.path}
            </div>
            <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
              {formatNumber(page.pageviews)}
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
          Content
        </h3>
        <div className="flex p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
          <button
            onClick={() => setActiveTab('top_pages')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'top_pages'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Top Pages
          </button>
          <button
            onClick={() => setActiveTab('entry_pages')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'entry_pages'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Entry
          </button>
          <button
            onClick={() => setActiveTab('exit_pages')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'exit_pages'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Exit
          </button>
        </div>
      </div>
      {renderContent()}
    </div>
  )
}

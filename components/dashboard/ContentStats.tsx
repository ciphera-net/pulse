'use client'

import { useState } from 'react'
import { formatNumber } from '@/lib/utils/format'
import { TopPage } from '@/lib/api/stats'
import { Modal } from '@ciphera-net/ui'
import { FiExternalLink } from 'react-icons/fi'

interface ContentStatsProps {
  topPages: TopPage[]
  entryPages: TopPage[]
  exitPages: TopPage[]
  domain: string
}

type Tab = 'top_pages' | 'entry_pages' | 'exit_pages'

const LIMIT = 7

export default function ContentStats({ topPages, entryPages, exitPages, domain }: ContentStatsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('top_pages')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const getData = () => {
    switch (activeTab) {
      case 'top_pages':
        return topPages
      case 'entry_pages':
        return entryPages
      case 'exit_pages':
        return exitPages
      default:
        return []
    }
  }

  const data = getData()
  const hasData = data && data.length > 0
  const displayedData = hasData ? data.slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)
  const showViewAll = hasData && data.length > LIMIT

  const getTabLabel = (tab: Tab) => {
    switch (tab) {
      case 'top_pages': return 'Top Pages'
      case 'entry_pages': return 'Entry'
      case 'exit_pages': return 'Exit'
    }
  }

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Content
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
            {(['top_pages', 'entry_pages', 'exit_pages'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                {getTabLabel(tab)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 flex-1 min-h-[270px]">
          {hasData ? (
            <>
              {displayedData.map((page, index) => (
                <div key={index} className="flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors">
                  <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center">
                    <a
                      href={`https://${domain.replace(/^https?:\/\//, '')}${page.path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline flex items-center"
                    >
                      {page.path}
                      <FiExternalLink className="w-3 h-3 ml-2 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  </div>
                  <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
                    {formatNumber(page.pageviews)}
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
        title={`Content - ${getTabLabel(activeTab)}`}
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {data.map((page, index) => (
            <div key={index} className="flex items-center justify-between py-2 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors">
              <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center">
                <a
                  href={`https://${domain.replace(/^https?:\/\//, '')}${page.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline flex items-center"
                >
                  {page.path}
                  <FiExternalLink className="w-3 h-3 ml-2 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </div>
              <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
                {formatNumber(page.pageviews)}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}

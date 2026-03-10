'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { logger } from '@/lib/utils/logger'
import { formatNumber } from '@ciphera-net/ui'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import { TopPage, getTopPages, getEntryPages, getExitPages } from '@/lib/api/stats'
import { FrameCornersIcon } from '@phosphor-icons/react'
import { Modal, ArrowUpRightIcon, LayoutDashboardIcon } from '@ciphera-net/ui'
import { ListSkeleton } from '@/components/skeletons'
import { type DimensionFilter } from '@/lib/filters'

interface ContentStatsProps {
  topPages: TopPage[]
  entryPages: TopPage[]
  exitPages: TopPage[]
  domain: string
  collectPagePaths?: boolean
  siteId: string
  dateRange: { start: string, end: string }
  onFilter?: (filter: DimensionFilter) => void
}

type Tab = 'top_pages' | 'entry_pages' | 'exit_pages'

const LIMIT = 7

export default function ContentStats({ topPages, entryPages, exitPages, domain, collectPagePaths = true, siteId, dateRange, onFilter }: ContentStatsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('top_pages')
  const handleTabKeyDown = useTabListKeyboard()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fullData, setFullData] = useState<TopPage[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)

  // Filter out generic "/" entries when page paths are disabled (all traffic shows as "/")
  const filterGenericPaths = (pages: TopPage[]) => {
    if (!collectPagePaths) return []
    // Filter out pages that are just "/" with high traffic (indicator of disabled tracking)
    return pages.filter(p => p.path && p.path !== '')
  }

  useEffect(() => {
    if (isModalOpen) {
      const fetchData = async () => {
        setIsLoadingFull(true)
        try {
          let data: TopPage[] = []
          if (activeTab === 'top_pages') {
            data = await getTopPages(siteId, dateRange.start, dateRange.end, 100)
          } else if (activeTab === 'entry_pages') {
            data = await getEntryPages(siteId, dateRange.start, dateRange.end, 100)
          } else if (activeTab === 'exit_pages') {
            data = await getExitPages(siteId, dateRange.start, dateRange.end, 100)
          }
          setFullData(filterGenericPaths(data))
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
  }, [isModalOpen, activeTab, siteId, dateRange, collectPagePaths])

  const getData = () => {
    switch (activeTab) {
      case 'top_pages':
        return filterGenericPaths(topPages)
      case 'entry_pages':
        return filterGenericPaths(entryPages)
      case 'exit_pages':
        return filterGenericPaths(exitPages)
      default:
        return []
    }
  }

  const data = getData()
  const totalPageviews = data.reduce((sum, p) => sum + p.pageviews, 0)
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
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Pages
            </h3>
            {showViewAll && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="p-1 text-neutral-300 dark:text-neutral-600 hover:text-brand-orange dark:hover:text-brand-orange transition-colors cursor-pointer rounded"
                aria-label="View all pages"
              >
                <FrameCornersIcon className="w-3.5 h-3.5" weight="bold" />
              </button>
            )}
          </div>
          <div className="flex gap-1" role="tablist" aria-label="Pages view tabs" onKeyDown={handleTabKeyDown}>
            {(['top_pages', 'entry_pages', 'exit_pages'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`relative px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded cursor-pointer ${
                  activeTab === tab
                    ? 'text-neutral-900 dark:text-white'
                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                {getTabLabel(tab)}
                {activeTab === tab && (
                  <motion.div
                    layoutId="contentStatsTab"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-orange"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 flex-1 min-h-[270px]">
          {!collectPagePaths ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-neutral-500 dark:text-neutral-400 text-sm">Page path tracking is disabled in site settings</p>
            </div>
          ) : hasData ? (
            <>
              {displayedData.map((page) => (
                <div
                  key={page.path}
                  onClick={() => onFilter?.({ dimension: 'page', operator: 'is', values: [page.path] })}
                  className={`flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors${onFilter ? ' cursor-pointer' : ''}`}
                >
                  <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center">
                    <span className="truncate">{page.path}</span>
                    <a
                      href={`https://${domain.replace(/^https?:\/\//, '')}${page.path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="ml-2 flex-shrink-0"
                    >
                      <ArrowUpRightIcon className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-brand-orange" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                      {totalPageviews > 0 ? `${Math.round((page.pageviews / totalPageviews) * 100)}%` : ''}
                    </span>
                    <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                      {formatNumber(page.pageviews)}
                    </span>
                  </div>
                </div>
              ))}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
              ))}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
              <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
                <LayoutDashboardIcon className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
              </div>
              <h4 className="font-semibold text-neutral-900 dark:text-white">
                No page data yet
              </h4>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
                Your most visited pages will appear here as traffic arrives.
              </p>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Pages - ${getTabLabel(activeTab)}`}
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {isLoadingFull ? (
            <div className="py-4">
              <ListSkeleton rows={10} />
            </div>
          ) : (
            (fullData.length > 0 ? fullData : data).map((page) => (
              <div key={page.path} className="flex items-center justify-between py-2 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors">
                <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center">
                  <a
                    href={`https://${domain.replace(/^https?:\/\//, '')}${page.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline flex items-center"
                  >
                    {page.path}
                    <ArrowUpRightIcon className="w-3 h-3 ml-2 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </div>
                <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
                  {formatNumber(page.pageviews)}
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </>
  )
}
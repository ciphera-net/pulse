'use client'

import { useState, useEffect } from 'react'
import { logger } from '@/lib/utils/logger'
import { formatNumber } from '@ciphera-net/ui'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import { TopPage, getTopPages, getEntryPages, getExitPages } from '@/lib/api/stats'
import Link from 'next/link'
import { FrameCornersIcon } from '@phosphor-icons/react'
import { Modal, ArrowUpRightIcon, ArrowRightIcon, LayoutDashboardIcon } from '@ciphera-net/ui'
import { ListSkeleton } from '@/components/skeletons'
import VirtualList from './VirtualList'
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
  const [modalSearch, setModalSearch] = useState('')
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
      case 'top_pages': return 'Pages'
      case 'entry_pages': return 'Entries'
      case 'exit_pages': return 'Exits'
    }
  }

  return (
    <>
      <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1" role="tablist" aria-label="Pages view tabs" onKeyDown={handleTabKeyDown}>
            {(['top_pages', 'entry_pages', 'exit_pages'] as Tab[]).map((tab) => (
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
                {getTabLabel(tab)}
                <span
                  className={`absolute inset-x-0 -bottom-px h-[3px] rounded-full transition-all duration-base ${
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
              aria-label="View all pages"
            >
              <FrameCornersIcon className="w-4 h-4" weight="bold" />
            </button>
          )}
        </div>

        <div className="space-y-2 flex-1 min-h-[270px]">
          {!collectPagePaths ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-neutral-400 text-sm">Page path tracking is disabled in site settings</p>
            </div>
          ) : hasData ? (
            <>
              {displayedData.map((page, idx) => {
                const maxPv = displayedData[0]?.pageviews ?? 0
                const barWidth = maxPv > 0 ? (page.pageviews / maxPv) * 75 : 0
                return (
                  <div
                    key={page.path}
                    onClick={() => onFilter?.({ dimension: 'page', operator: 'is', values: [page.path] })}
                    className={`relative flex items-center justify-between h-9 group hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors${onFilter ? ' cursor-pointer' : ''}`}
                  >
                    <div
                      className="absolute inset-y-0.5 left-0.5 bg-gradient-to-r from-brand-orange/15 via-brand-orange/8 to-transparent border border-brand-orange/20 shadow-[inset_0_1px_0_rgba(253,94,15,0.08)] rounded-md transition-all"
                      style={{ width: `${barWidth}%` }}
                    />
                    <div className="relative flex-1 truncate text-white flex items-center">
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
                    <div className="relative flex items-center gap-2 ml-4">
                      <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-base">
                        {totalPageviews > 0 ? `${Math.round((page.pageviews / totalPageviews) * 100)}%` : ''}
                      </span>
                      <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                        {formatNumber(page.pageviews)}
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
                <LayoutDashboardIcon className="w-8 h-8 text-neutral-400" />
              </div>
              <h4 className="font-semibold text-white">
                No page data yet
              </h4>
              <p className="text-sm text-neutral-400 max-w-xs">
                Your most visited pages will appear here as traffic arrives.
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
        title={getTabLabel(activeTab)}
        className="max-w-2xl !bg-neutral-900/65 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:!bg-neutral-900/60 !border-white/[0.08]"
      >
        <div>
          <input
            type="text"
            value={modalSearch}
            onChange={(e) => setModalSearch(e.target.value)}
            placeholder="Search pages..."
            className="w-full px-3 py-2 mb-3 text-sm bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50"
          />
        </div>
        <div className="max-h-[80vh]">
          {isLoadingFull ? (
            <div className="py-4">
              <ListSkeleton rows={10} />
            </div>
          ) : (() => {
            const modalData = (fullData.length > 0 ? fullData : data).filter(p => !modalSearch || p.path.toLowerCase().includes(modalSearch.toLowerCase()))
            const modalTotal = modalData.reduce((sum, p) => sum + p.pageviews, 0)
            return (
              <VirtualList
                items={modalData}
                estimateSize={36}
                className="max-h-[80vh] overflow-y-auto pr-2"
                renderItem={(page) => {
                  const canFilter = onFilter && page.path
                  return (
                    <div
                      key={page.path}
                      onClick={() => { if (canFilter) { onFilter({ dimension: 'page', operator: 'is', values: [page.path] }); setIsModalOpen(false) } }}
                      className={`flex items-center justify-between h-9 group hover:bg-neutral-800 rounded-lg px-2 transition-colors${canFilter ? ' cursor-pointer' : ''}`}
                    >
                      <div className="flex-1 truncate text-white flex items-center">
                        <span className="truncate">{page.path}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-base">
                          {modalTotal > 0 ? `${Math.round((page.pageviews / modalTotal) * 100)}%` : ''}
                        </span>
                        <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                          {formatNumber(page.pageviews)}
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
'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { logger } from '@/lib/utils/logger'
import { formatNumber, Modal } from '@ciphera-net/ui'
import { CaretUp, CaretDown, FrameCornersIcon } from '@phosphor-icons/react'
import { useGSCStatus, useGSCOverview, useGSCTopQueries, useGSCTopPages } from '@/lib/swr/dashboard'
import { getGSCTopQueries, getGSCTopPages } from '@/lib/api/gsc'
import type { GSCDataRow } from '@/lib/api/gsc'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import { ListSkeleton } from '@/components/skeletons'
import VirtualList from './VirtualList'

interface SearchPerformanceProps {
  siteId: string
  dateRange: { start: string; end: string }
}

type Tab = 'queries' | 'pages'

const LIMIT = 7

function ChangeArrow({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (!previous || previous === 0) return null
  const improved = invert ? current < previous : current > previous
  const same = current === previous
  if (same) return null
  return improved ? (
    <CaretUp className="w-3 h-3 text-emerald-500" weight="fill" />
  ) : (
    <CaretDown className="w-3 h-3 text-red-500" weight="fill" />
  )
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
  const [fullData, setFullData] = useState<GSCDataRow[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)

  const { data: gscStatus } = useGSCStatus(siteId)
  const { data: overview, isLoading: overviewLoading } = useGSCOverview(siteId, dateRange.start, dateRange.end)
  const { data: queriesData, isLoading: queriesLoading } = useGSCTopQueries(siteId, dateRange.start, dateRange.end, LIMIT, 0)
  const { data: pagesData, isLoading: pagesLoading } = useGSCTopPages(siteId, dateRange.start, dateRange.end, LIMIT, 0)

  // Fetch full data when modal opens (matches ContentStats/TopReferrers pattern)
  useEffect(() => {
    if (isModalOpen) {
      const fetchData = async () => {
        setIsLoadingFull(true)
        try {
          if (activeTab === 'queries') {
            const data = await getGSCTopQueries(siteId, dateRange.start, dateRange.end, 100, 0)
            setFullData(data.queries ?? [])
          } else {
            const data = await getGSCTopPages(siteId, dateRange.start, dateRange.end, 100, 0)
            setFullData(data.pages ?? [])
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

  const isLoading = overviewLoading || queriesLoading || pagesLoading
  const queries = queriesData?.queries ?? []
  const pages = pagesData?.pages ?? []
  const hasData = overview && (overview.total_clicks > 0 || overview.total_impressions > 0)

  // Hide panel entirely if loaded but no data
  if (!isLoading && !hasData) return null

  const data = activeTab === 'queries' ? queries : pages
  const totalImpressions = data.reduce((sum, d) => sum + d.impressions, 0)
  const displayedData = data.slice(0, LIMIT)
  const emptySlots = Math.max(0, LIMIT - displayedData.length)
  const showViewAll = data.length >= LIMIT

  const getLabel = (row: GSCDataRow) => activeTab === 'queries' ? row.query : row.page
  const getTabLabel = (tab: Tab) => tab === 'queries' ? 'Queries' : 'Pages'

  return (
    <>
      <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1" role="tablist" aria-label="Search data tabs" onKeyDown={handleTabKeyDown}>
            {(['queries', 'pages'] as Tab[]).map((tab) => (
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
                {activeTab === tab && (
                  <motion.div
                    layoutId="searchTab"
                    className="absolute inset-x-0 -bottom-px h-[3px] bg-brand-orange rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
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
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-6">
              <div className="h-4 w-20 bg-neutral-800 rounded animate-pulse" />
              <div className="h-4 w-24 bg-neutral-800 rounded animate-pulse" />
              <div className="h-4 w-20 bg-neutral-800 rounded animate-pulse" />
            </div>
            <div className="space-y-2 mt-4">
              <ListSkeleton rows={LIMIT} />
            </div>
          </div>
        ) : (
          <>
            {/* Inline stats row */}
            <div className="flex items-center gap-5 mb-4">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-400">Clicks</span>
                <span className="text-sm font-semibold text-white">
                  {formatNumber(overview?.total_clicks ?? 0)}
                </span>
                <ChangeArrow current={overview?.total_clicks ?? 0} previous={overview?.prev_clicks ?? 0} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-400">Impressions</span>
                <span className="text-sm font-semibold text-white">
                  {formatNumber(overview?.total_impressions ?? 0)}
                </span>
                <ChangeArrow current={overview?.total_impressions ?? 0} previous={overview?.prev_impressions ?? 0} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-400">Avg Position</span>
                <span className="text-sm font-semibold text-white">
                  {(overview?.avg_position ?? 0).toFixed(1)}
                </span>
                <ChangeArrow current={overview?.avg_position ?? 0} previous={overview?.prev_avg_position ?? 0} invert />
              </div>
            </div>

            {/* Data list */}
            <div className="space-y-2 flex-1 min-h-[270px]">
              {displayedData.length > 0 ? (
                <>
                  {displayedData.map((row) => {
                    const maxImpressions = displayedData[0]?.impressions ?? 0
                    const barWidth = maxImpressions > 0 ? (row.impressions / maxImpressions) * 75 : 0
                    const label = getLabel(row)
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
                        <div className="relative flex items-center gap-3 ml-4 shrink-0">
                          <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                            {totalImpressions > 0 ? `${Math.round((row.impressions / totalImpressions) * 100)}%` : ''}
                          </span>
                          <span className="text-sm font-semibold text-neutral-400">
                            {formatNumber(row.clicks)}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getPositionBadgeClasses(row.position)}`}>
                            {row.position.toFixed(1)}
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
                <div className="flex-1 flex items-center justify-center py-6">
                  <p className="text-sm text-neutral-400 dark:text-neutral-500">No search data yet</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Expand modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setModalSearch('') }}
        title={`Search ${getTabLabel(activeTab)}`}
        className="max-w-2xl"
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
            const source = fullData.length > 0 ? fullData : data
            const modalData = source.filter(row => {
              if (!modalSearch) return true
              return getLabel(row).toLowerCase().includes(modalSearch.toLowerCase())
            })
            const modalTotal = modalData.reduce((sum, r) => sum + r.impressions, 0)
            return (
              <VirtualList
                items={modalData}
                estimateSize={36}
                className="max-h-[80vh] overflow-y-auto pr-2"
                renderItem={(row) => {
                  const label = getLabel(row)
                  return (
                    <div
                      key={label}
                      className="flex items-center justify-between h-9 group hover:bg-neutral-800 rounded-lg px-2 transition-colors"
                    >
                      <span className="flex-1 truncate text-sm text-white" title={label}>
                        {label}
                      </span>
                      <div className="flex items-center gap-3 ml-4">
                        <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                          {modalTotal > 0 ? `${Math.round((row.impressions / modalTotal) * 100)}%` : ''}
                        </span>
                        <span className="text-sm font-semibold text-neutral-400">
                          {formatNumber(row.clicks)}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getPositionBadgeClasses(row.position)}`}>
                          {row.position.toFixed(1)}
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

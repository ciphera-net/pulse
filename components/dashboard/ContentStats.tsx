'use client'

import { useState, useEffect, useRef } from 'react'
import { logger } from '@/lib/utils/logger'
import { formatNumber, Spinner } from '@ciphera-net/ui'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import { TopPage, getTopPages, getEntryPages, getExitPages, PageEngagement, getPageEngagement } from '@/lib/api/stats'
import { FrameCornersIcon, FileText } from '@phosphor-icons/react'
import { Modal, ArrowUpRightIcon } from '@ciphera-net/ui'
import { EmptyState } from '@/components/ui/EmptyState'
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

type Tab = 'top_pages' | 'entry_pages' | 'exit_pages' | 'engagement'

const LIMIT = 7

export default function ContentStats({ topPages, entryPages, exitPages, domain, collectPagePaths = true, siteId, dateRange, onFilter }: ContentStatsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('top_pages')
  const handleTabKeyDown = useTabListKeyboard()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [fullData, setFullData] = useState<TopPage[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)

  // Engagement tab local state
  const [engagementData, setEngagementData] = useState<PageEngagement[]>([])
  const [engagementLoading, setEngagementLoading] = useState(false)
  const engagementFetched = useRef(false)

  // Engagement modal state
  const [fullEngagementData, setFullEngagementData] = useState<PageEngagement[]>([])
  const [isLoadingFullEngagement, setIsLoadingFullEngagement] = useState(false)

  // Filter out generic "/" entries when page paths are disabled (all traffic shows as "/")
  const filterGenericPaths = (pages: TopPage[]) => {
    if (!collectPagePaths) return []
    // Filter out pages that are just "/" with high traffic (indicator of disabled tracking)
    return pages.filter(p => p.path && p.path !== '')
  }

  // Reset engagement fetch flag when date range changes so it refetches
  useEffect(() => {
    engagementFetched.current = false
    // If engagement tab is active, immediately re-trigger fetch
    if (activeTab === 'engagement') {
      setEngagementLoading(true)
      engagementFetched.current = true
      getPageEngagement(siteId, dateRange?.start, dateRange?.end, 5, LIMIT)
        .then(setEngagementData)
        .catch(() => setEngagementData([]))
        .finally(() => setEngagementLoading(false))
    }
  }, [dateRange?.start, dateRange?.end]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy fetch engagement data on first activation
  useEffect(() => {
    if (activeTab !== 'engagement' || engagementFetched.current) return
    engagementFetched.current = true
    setEngagementLoading(true)
    getPageEngagement(siteId, dateRange?.start, dateRange?.end, 5, LIMIT)
      .then(setEngagementData)
      .catch(() => setEngagementData([]))
      .finally(() => setEngagementLoading(false))
  }, [activeTab, siteId, dateRange?.start, dateRange?.end])

  useEffect(() => {
    if (isModalOpen) {
      const fetchData = async () => {
        setIsLoadingFull(true)
        setIsLoadingFullEngagement(true)
        try {
          if (activeTab === 'engagement') {
            const data = await getPageEngagement(siteId, dateRange.start, dateRange.end, 5, 50)
            setFullEngagementData(data)
          } else {
            let data: TopPage[] = []
            if (activeTab === 'top_pages') {
              data = await getTopPages(siteId, dateRange.start, dateRange.end, 100)
            } else if (activeTab === 'entry_pages') {
              data = await getEntryPages(siteId, dateRange.start, dateRange.end, 100)
            } else if (activeTab === 'exit_pages') {
              data = await getExitPages(siteId, dateRange.start, dateRange.end, 100)
            }
            setFullData(filterGenericPaths(data))
          }
        } catch (e) {
          logger.error(e)
        } finally {
          setIsLoadingFull(false)
          setIsLoadingFullEngagement(false)
        }
      }
      fetchData()
    } else {
      setFullData([])
      setFullEngagementData([])
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

  const getTabLabel = (tab: Tab) => {
    switch (tab) {
      case 'top_pages': return 'Pages'
      case 'entry_pages': return 'Entries'
      case 'exit_pages': return 'Exits'
      case 'engagement': return 'Engagement'
    }
  }

  const isEngagementTab = activeTab === 'engagement'

  const data = isEngagementTab ? [] : getData()
  const totalPageviews = data.reduce((sum, p) => sum + p.pageviews, 0)
  const hasData = isEngagementTab ? engagementData.length > 0 : (data && data.length > 0)
  const displayedData = !isEngagementTab && hasData ? data.slice(0, LIMIT) : []
  const displayedEngagement = isEngagementTab ? engagementData.slice(0, LIMIT) : []
  const emptySlots = isEngagementTab
    ? Math.max(0, LIMIT - displayedEngagement.length)
    : Math.max(0, LIMIT - displayedData.length)
  const showViewAll = isEngagementTab
    ? (engagementData.length >= LIMIT)
    : (hasData && data.length > LIMIT)

  const renderEngagementRow = (item: PageEngagement, inModal = false) => {
    const scoreColor = item.engagement_score >= 70
      ? { bar: 'rgba(34,197,94,0.07)', border: 'rgba(34,197,94,0.7)', badge: 'bg-green-500/20 text-green-400' }
      : item.engagement_score >= 40
        ? { bar: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.7)', badge: 'bg-amber-500/20 text-amber-400' }
        : { bar: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.7)', badge: 'bg-red-500/20 text-red-400' }

    const readTime = item.avg_visible_duration >= 60
      ? `${Math.round(item.avg_visible_duration / 60)}m`
      : `${Math.round(item.avg_visible_duration)}s`

    return (
      <div
        key={item.path}
        className={`interactive-row relative overflow-hidden flex items-center justify-between h-9 group rounded-lg px-2 -mx-2${onFilter ? ' cursor-pointer' : ''}`}
        onClick={() => {
          onFilter?.({ dimension: 'page', operator: 'is', values: [item.path] })
          if (inModal) setIsModalOpen(false)
        }}
      >
        {/* Bar — width based on engagement score */}
        <div
          className="absolute inset-y-0.5 left-0.5 rounded-md transition-all duration-300 ease-apple"
          style={{
            width: `${(item.engagement_score / 100) * 75}%`,
            backgroundColor: scoreColor.bar,
            borderLeft: `2px solid ${scoreColor.border}`,
          }}
        />
        {/* Path */}
        <div className="relative flex-1 truncate text-white flex items-center">
          <span className="truncate">{item.path}</span>
        </div>
        {/* Score badge + details on hover */}
        <div className="relative flex items-center gap-2 ml-4">
          <span className="opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-150 text-[10px] font-medium text-neutral-500 whitespace-nowrap">
            {Math.round(item.avg_scroll_depth)}% scroll · {readTime} read
          </span>
          <span className={`inline-flex items-center justify-center w-8 h-5 rounded-full text-[10px] font-bold tabular-nums ${scoreColor.badge}`}>
            {item.engagement_score}
          </span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="glass-surface rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1" role="tablist" aria-label="Pages view tabs" onKeyDown={handleTabKeyDown}>
            {(['top_pages', 'entry_pages', 'exit_pages', 'engagement'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`relative px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded cursor-pointer ${
                  activeTab === tab
                    ? 'text-white'
                    : 'text-neutral-500 hover:text-neutral-300'
                } ease-apple`}
              >
                {getTabLabel(tab)}
                <span
                  className={`absolute inset-x-0 -bottom-px h-[3px] rounded-full transition-[width,background-color] duration-base ${
                    activeTab === tab ? 'bg-brand-orange scale-x-100' : 'bg-transparent scale-x-0'
                  } ease-apple`}
                />
              </button>
            ))}
          </div>
          {showViewAll && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 text-neutral-500 hover:text-brand-orange hover:bg-neutral-800 transition-all cursor-pointer rounded-lg ease-apple"
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
          ) : isEngagementTab ? (
            engagementLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="sm" />
              </div>
            ) : engagementData.length > 0 ? (
              <>
                {displayedEngagement.map((item) => renderEngagementRow(item))}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
                ))}
              </>
            ) : (
              <>
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-neutral-500">Not enough data yet</p>
                  <p className="text-xs text-neutral-600 mt-1">Pages need at least 5 sessions for scoring</p>
                </div>
                {Array.from({ length: LIMIT }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
                ))}
              </>
            )
          ) : hasData ? (
            <>
              {displayedData.map((page) => {
                const maxPv = displayedData[0]?.pageviews ?? 0
                const barWidth = maxPv > 0 ? (page.pageviews / maxPv) * 75 : 0
                return (
                  <div
                    key={page.path}
                    onClick={() => onFilter?.({ dimension: 'page', operator: 'is', values: [page.path] })}
                    className={`interactive-row relative overflow-hidden flex items-center justify-between h-9 group rounded-lg px-2 -mx-2${onFilter ? ' cursor-pointer' : ''}`}
                  >
                    <div
                      className="absolute inset-y-0.5 left-0.5 bg-brand-orange/[0.07] border-l-2 border-brand-orange/70 rounded-md transition-[width,background-color] ease-apple"
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
                        <ArrowUpRightIcon className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-brand-orange ease-apple" />
                      </a>
                    </div>
                    <div className="relative flex items-center gap-2 ml-4">
                      <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
                        {totalPageviews > 0 ? `${Math.round((page.pageviews / totalPageviews) * 100)}%` : ''}
                      </span>
                      <span className="text-sm font-semibold text-neutral-400">
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
            <EmptyState
              icon={<FileText />}
              title="Waiting for page views"
              description="Your most visited pages will rank here once traffic arrives. Entry and exit pages are tracked automatically."
              action={{ label: 'Install tracking script', href: '/installation' }}
            />
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setModalSearch('') }}
        title={getTabLabel(activeTab)}
        className="max-w-2xl max-h-[90vh] flex flex-col !bg-neutral-900/65 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:!bg-neutral-900/60 !border-white/[0.08]"
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
        <div className="flex-1 overflow-y-auto min-h-0">
          {isEngagementTab ? (
            isLoadingFullEngagement ? (
              <div className="py-4">
                <ListSkeleton rows={10} />
              </div>
            ) : (() => {
              const modalEngagementData = (fullEngagementData.length > 0 ? fullEngagementData : engagementData)
                .filter(p => !modalSearch || p.path.toLowerCase().includes(modalSearch.toLowerCase()))
              return modalEngagementData.length > 0 ? (
                <VirtualList
                  items={modalEngagementData}
                  estimateSize={36}
                  className="pr-2"
                  renderItem={(item) => renderEngagementRow(item, true)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-neutral-500">Not enough data yet</p>
                  <p className="text-xs text-neutral-600 mt-1">Pages need at least 5 sessions for scoring</p>
                </div>
              )
            })()
          ) : isLoadingFull ? (
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
                className="pr-2"
                renderItem={(page) => {
                  const canFilter = onFilter && page.path
                  return (
                    <div
                      key={page.path}
                      onClick={() => { if (canFilter) { onFilter({ dimension: 'page', operator: 'is', values: [page.path] }); setIsModalOpen(false) } }}
                      className={`interactive-row flex items-center justify-between h-9 group rounded-lg px-2${canFilter ? ' cursor-pointer' : ''}`}
                    >
                      <div className="flex-1 truncate text-white flex items-center">
                        <span className="truncate">{page.path}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
                          {modalTotal > 0 ? `${Math.round((page.pageviews / modalTotal) * 100)}%` : ''}
                        </span>
                        <span className="text-sm font-semibold text-neutral-400">
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

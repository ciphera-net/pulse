'use client'

import { useState } from 'react'
import { Spinner } from '@ciphera-net/facet'
import { formatNumber } from '@/lib/utils/format'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import { TopPage, PageEngagement } from '@/lib/api/stats'
import { FrameCornersIcon, FileText } from '@phosphor-icons/react'
import { Modal, ArrowUpRightIcon } from '@ciphera-net/facet'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { ListSkeleton } from '@/components/skeletons'
import VirtualList from './VirtualList'
import { useFullDimensionList, usePageEngagement, type FullListKind } from '@/lib/swr/dashboard'
import { type DimensionFilter } from '@/lib/filters'

interface ContentStatsProps {
  topPages: TopPage[]
  entryPages: TopPage[]
  exitPages: TopPage[]
  domain: string
  collectPagePaths?: boolean
  siteId: string
  dateRange: { start: string, end: string }
  // The site's true totals for the range (the same population the rows came
  // from). Percentages divide by THIS, not by the sum of visible rows — the
  // F9 fix: one unit, one denominator, in the card and its modal alike.
  totals?: { pageviews: number; visitors: number }
  // Active page filters, threaded into every fetch this card makes itself
  // (modal + engagement) so a modal opened from a filtered card shows the
  // same population as the card (F14).
  filters?: string
  // The anonymous share surface has no full-list endpoints (member-strict
  // since Phase 0) — hide the affordance rather than show an error for a
  // capability that does not exist there.
  memberFeatures?: boolean
  onFilter?: (filter: DimensionFilter) => void
}

type Tab = 'top_pages' | 'entry_pages' | 'exit_pages' | 'engagement'

const LIMIT = 7

const TAB_TO_KIND: Record<Exclude<Tab, 'engagement'>, FullListKind> = {
  top_pages: 'pages',
  entry_pages: 'entry-pages',
  exit_pages: 'exit-pages',
}

export default function ContentStats({ topPages, entryPages, exitPages, domain, collectPagePaths = true, siteId, dateRange, totals, filters, memberFeatures = true, onFilter }: ContentStatsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('top_pages')
  const handleTabKeyDown = useTabListKeyboard()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')

  const isEngagementTab = activeTab === 'engagement'

  // The Engagement tab's own fetch hits a member-only endpoint
  // (/page-engagement is not on the public-share allowlist), so the tab must
  // not exist on the anonymous surface — otherwise clicking it renders an
  // error box for a capability that structurally cannot work there.
  const tabs: Tab[] = memberFeatures
    ? ['top_pages', 'entry_pages', 'exit_pages', 'engagement']
    : ['top_pages', 'entry_pages', 'exit_pages']

  // The true denominator for every % in this card. null = not supplied →
  // no percentages are rendered (never a fabricated share-of-visible-rows).
  const denom = totals && totals.pageviews > 0 ? totals.pageviews : null

  // Engagement tab (card view): SWR with a conditional key — nothing fetches
  // until the tab is active, and a failure is an error state, not an empty
  // list masquerading as "not enough data yet" (F17).
  const {
    data: engagementData,
    error: engagementTabError,
    isLoading: engagementLoading,
    mutate: refetchEngagementTab,
  } = usePageEngagement(isEngagementTab, siteId, dateRange?.start, dateRange?.end, 5, LIMIT, filters)

  // Modal data: conditional keys arm only while the modal is open on the
  // matching tab. Filters ride the key (F14).
  const {
    data: fullData,
    error: fullError,
    isLoading: isLoadingFull,
    mutate: refetchFull,
  } = useFullDimensionList<TopPage>(
    isModalOpen && !isEngagementTab ? TAB_TO_KIND[activeTab as Exclude<Tab, 'engagement'>] : null,
    siteId, dateRange?.start, dateRange?.end, 100, filters,
  )
  const {
    data: fullEngagementData,
    error: fullEngagementError,
    isLoading: isLoadingFullEngagement,
    mutate: refetchFullEngagement,
  } = usePageEngagement(isModalOpen && isEngagementTab, siteId, dateRange?.start, dateRange?.end, 5, 50, filters)

  // Filter out generic "/" entries when page paths are disabled (all traffic shows as "/")
  const filterGenericPaths = (pages: TopPage[]) => {
    if (!collectPagePaths) return []
    // Filter out pages that are just "/" with high traffic (indicator of disabled tracking)
    return pages.filter(p => p.path && p.path !== '')
  }

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

  const data = isEngagementTab ? [] : getData()
  const engagementRows = engagementData ?? []
  const hasData = isEngagementTab ? engagementRows.length > 0 : (data && data.length > 0)
  const displayedData = !isEngagementTab && hasData ? data.slice(0, LIMIT) : []
  const displayedEngagement = isEngagementTab ? engagementRows.slice(0, LIMIT) : []
  const emptySlots = isEngagementTab
    ? Math.max(0, LIMIT - displayedEngagement.length)
    : Math.max(0, LIMIT - displayedData.length)
  const showViewAll = memberFeatures && (isEngagementTab
    ? (engagementRows.length >= LIMIT)
    : (hasData && data.length > LIMIT))

  const pct = (pageviews: number) =>
    denom != null ? `${Math.round((pageviews / denom) * 100)}%` : ''

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
        className={`interactive-row relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${onFilter ? ' cursor-pointer' : ''}`}
        onClick={() => {
          onFilter?.({ dimension: 'page', operator: 'is', values: [item.path] })
          if (inModal) setIsModalOpen(false)
        }}
      >
        {/* Bar — width based on engagement score */}
        <div
          className="absolute inset-y-0.5 left-0.5 rounded-none transition-all duration-300 ease-apple"
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
          <span className="opacity-100 translate-x-0 md:opacity-0 md:group-hover:opacity-100 md:translate-x-2 md:group-hover:translate-x-0 transition-all duration-150 text-[10px] font-medium text-neutral-500 whitespace-nowrap">
            {Math.round(item.avg_scroll_depth)}% scroll · {readTime} read
          </span>
          <span className={`inline-flex items-center justify-center w-8 h-5 rounded-none text-[10px] font-bold tabular-nums ${scoreColor.badge}`}>
            {item.engagement_score}
          </span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 min-w-0 overflow-x-auto scrollbar-hide pb-1 max-md:[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]" role="tablist" aria-label="Pages view tabs" onKeyDown={handleTabKeyDown}>
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`relative px-2.5 py-3 sm:py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded-none cursor-pointer ${
                  activeTab === tab
                    ? 'text-white'
                    : 'text-neutral-500 hover:text-neutral-300'
                } ease-apple`}
              >
                {getTabLabel(tab)}
                <span
                  className={`absolute inset-x-0 -bottom-px h-[3px] rounded-none transition-[width,background-color] duration-base ${
                    activeTab === tab ? 'bg-brand-orange scale-x-100' : 'bg-transparent scale-x-0'
                  } ease-apple`}
                />
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {denom != null && !isEngagementTab && (
              <span className="hidden whitespace-nowrap text-[11px] text-neutral-500 sm:block">
                share of {formatNumber(denom)} pageviews
              </span>
            )}
            {showViewAll && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="p-3 md:p-1.5 text-neutral-500 hover:text-brand-orange hover:bg-neutral-800 transition-all cursor-pointer rounded-none ease-apple"
                aria-label="View all pages"
              >
                <FrameCornersIcon className="w-4 h-4" weight="bold" />
              </button>
            )}
          </div>
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
            ) : engagementTabError ? (
              <ErrorCard
                title="Couldn’t load engagement scores"
                description="The rest of the dashboard is unaffected."
                onRetry={() => refetchEngagementTab()}
              />
            ) : engagementRows.length > 0 ? (
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
                    className={`interactive-row relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${onFilter ? ' cursor-pointer' : ''}`}
                  >
                    <div
                      className="absolute inset-y-0.5 left-0.5 bg-brand-orange/[0.07] border-l-2 border-brand-orange/70 rounded-none transition-[width,background-color] ease-apple"
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
                        {/* Visible by default on touch: a phone has no hover, so
                            this open-page link was permanently invisible yet
                            still tappable. Bigger and dimmed on mobile, restored
                            to the hover-reveal treatment at md+. */}
                        <ArrowUpRightIcon className="w-4 h-4 opacity-60 md:w-3 md:h-3 md:opacity-0 text-neutral-400 md:group-hover:opacity-100 transition-opacity hover:text-brand-orange ease-apple" />
                      </a>
                    </div>
                    <div className="relative flex items-center gap-2 ml-4">
                      <span className="text-xs font-medium text-brand-orange opacity-100 translate-x-0 md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
                        {pct(page.pageviews)}
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
        className="max-w-2xl max-h-[90vh] flex flex-col !bg-card !border-neutral-800"
      >
        <div>
          <input
            type="text"
            value={modalSearch}
            onChange={(e) => setModalSearch(e.target.value)}
            placeholder="Search pages..."
            className="w-full px-3 py-2 mb-3 text-sm bg-neutral-800 border border-neutral-700 rounded-none text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50"
          />
          {denom != null && !isEngagementTab && (
            <p className="mb-3 text-[11px] text-neutral-500">
              Shares are of all {formatNumber(denom)} pageviews in the range — searching narrows the rows, not the denominator.
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {isEngagementTab ? (
            isLoadingFullEngagement ? (
              <div className="py-4">
                <ListSkeleton rows={10} />
              </div>
            ) : fullEngagementError ? (
              <ErrorCard
                title="Couldn’t load the full list"
                onRetry={() => refetchFullEngagement()}
              />
            ) : (() => {
              const modalEngagementData = (fullEngagementData ?? [])
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
          ) : fullError ? (
            <ErrorCard
              title="Couldn’t load the full list"
              onRetry={() => refetchFull()}
            />
          ) : (() => {
            const modalData = filterGenericPaths(fullData ?? []).filter(p => !modalSearch || p.path.toLowerCase().includes(modalSearch.toLowerCase()))
            return modalData.length > 0 ? (
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
                      className={`interactive-row flex items-center justify-between h-9 group rounded-none px-2${canFilter ? ' cursor-pointer' : ''}`}
                    >
                      <div className="flex-1 truncate text-white flex items-center">
                        <span className="truncate">{page.path}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs font-medium text-brand-orange opacity-100 translate-x-0 md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
                          {pct(page.pageviews)}
                        </span>
                        <span className="text-sm font-semibold text-neutral-400">
                          {formatNumber(page.pageviews)}
                        </span>
                      </div>
                    </div>
                  )
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-neutral-500">{modalSearch ? 'No pages match your search' : 'No pages in this range'}</p>
              </div>
            )
          })()}
        </div>
      </Modal>
    </>
  )
}

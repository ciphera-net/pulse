'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { formatNumber } from '@/lib/utils/format'
import { Modal } from '@ciphera-net/facet'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { ListSkeleton } from '@/components/skeletons'
import VirtualList from './VirtualList'
import { type CampaignStat } from '@/lib/api/stats'
import { useCampaignsList } from '@/lib/swr/dashboard'
import { getReferrerFavicon, getReferrerIcon, getReferrerDisplayName } from '@/lib/utils/icons'
import { Megaphone, FrameCornersIcon } from '@phosphor-icons/react'
import UtmBuilder from '@/components/tools/UtmBuilder'
import { type DimensionFilter } from '@/lib/filters'
import { type BlockMetric } from '@/lib/dashboard/metrics'
import { MetricRowStat, MetricUnitLabel, rowBarWidth, shareDenominatorNote } from '@/components/dashboard/MetricRowStat'

interface CampaignsProps {
  // The page's selected metric — rows display it; ranking stays visitors-first.
  metric?: BlockMetric
  siteId: string
  dateRange: { start: string, end: string }
  filters?: string
  // True range totals — the F9 denominator. Campaign rows count VISITORS, so
  // shares divide by totals.visitors; no totals → no percentages.
  totals?: { pageviews: number; visitors: number }
  onFilter?: (filter: DimensionFilter) => void
}

type UtmTab = 'source' | 'medium' | 'campaign' | 'term' | 'content'

const LIMIT = 7

export default function Campaigns({ metric = 'visitors', siteId, dateRange, filters, totals, onFilter }: CampaignsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [faviconFailed, setFaviconFailed] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<UtmTab>('source')

  // 🔴 WAS a bare useEffect + useState fetch — the last card in the Acquisition
  // row still on the pre-Phase-3 pattern, missed by the migration that gave
  // every sibling "three honest states". It had no error state, no abort or
  // ordering guard, and its only failure handling was `logger.error`, which is
  // a NO-OP in a production browser build. So a failed request, or a stale
  // response landing after a fresh one, set `data` to [] and rendered the exact
  // same "No UTM data yet" empty state as a genuinely empty range — nothing in
  // the DOM or in state could tell the two apart.
  //
  // SWR keyed on (siteId, dates, limit, filters) fixes both halves: the newest
  // key's data wins, so a superseded in-flight response can no longer overwrite
  // a fresh one, and `error` is a real state the card can state out loud.
  const { data: cardData, error: cardError, isLoading, mutate: refetchCard } =
    useCampaignsList(siteId, dateRange.start, dateRange.end, 10, filters)
  const data = cardData ?? []

  // The view-all sheet fetches only while open — `enabled` keeps the key null
  // rather than firing and discarding, which is what the old `else setFullData([])`
  // branch was compensating for.
  const { data: fullDataRaw, error: fullError, isLoading: isLoadingFull } =
    useCampaignsList(siteId, dateRange.start, dateRange.end, 100, filters, isModalOpen)
  const fullData = fullDataRaw ?? []

  const sortedData = useMemo(
    () => [...data].sort((a, b) => b.visitors - a.visitors),
    [data]
  )
  const sortedFullData = useMemo(
    () => [...(fullData.length > 0 ? fullData : data)].sort((a, b) => b.visitors - a.visitors),
    [fullData, data]
  )

  const groupedData = useMemo(() => {
    // Rates for a grouped row are visitors-weighted means of the non-null
    // components — a component with no rate contributes no weight rather than
    // dragging the mean toward zero.
    type Acc = { visitors: number; pageviews: number; bounceW: number; bounceBase: number; durW: number; durBase: number }
    const grouped = new Map<string, Acc>()
    for (const item of sortedData) {
      const raw = item[activeTab]
      if (!raw) continue
      let acc = grouped.get(raw)
      if (!acc) {
        acc = { visitors: 0, pageviews: 0, bounceW: 0, bounceBase: 0, durW: 0, durBase: 0 }
        grouped.set(raw, acc)
      }
      acc.visitors += item.visitors
      acc.pageviews += item.pageviews
      if (item.bounce_rate != null && item.visitors > 0) {
        acc.bounceW += item.bounce_rate * item.visitors
        acc.bounceBase += item.visitors
      }
      if (item.avg_duration != null && item.visitors > 0) {
        acc.durW += item.avg_duration * item.visitors
        acc.durBase += item.visitors
      }
    }
    return [...grouped.entries()]
      .map(([name, a]) => ({
        name,
        visitors: a.visitors,
        pageviews: a.pageviews,
        bounce_rate: a.bounceBase > 0 ? a.bounceW / a.bounceBase : null,
        avg_duration: a.durBase > 0 ? a.durW / a.durBase : null,
      }))
      .sort((a, b) => b.visitors - a.visitors)
  }, [sortedData, activeTab])

  const hasData = data.length > 0
  const displayedData = hasData ? groupedData.slice(0, LIMIT) : []
  const showViewAll = hasData && groupedData.length > LIMIT
  const emptySlots = Math.max(0, LIMIT - displayedData.length)

  function renderSourceIcon(source: string) {
    const faviconUrl = getReferrerFavicon(source)
    const useFavicon = faviconUrl && !faviconFailed.has(source)
    if (useFavicon) {
      return (
        <Image
          src={faviconUrl}
          alt=""
          width={20}
          height={20}
          className="w-5 h-5 flex-shrink-0 rounded-none object-contain"
          onError={() => setFaviconFailed((prev) => new Set(prev).add(source))}
          unoptimized
        />
      )
    }
    return <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">{getReferrerIcon(source)}</span>
  }

  const handleExportCampaigns = () => {
    const rows = sortedFullData.length > 0 ? sortedFullData : sortedData
    if (rows.length === 0) return
    const header = ['Source', 'Medium', 'Campaign', 'Term', 'Content', 'Visitors', 'Pageviews']
    const csvRows = [
      header.join(','),
      ...rows.map(r =>
        [r.source, r.medium || '', r.campaign || '', r.term || '', r.content || '', r.visitors, r.pageviews].join(',')
      ),
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `campaigns_${dateRange.start}_${dateRange.end}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
        <div className="flex items-center justify-between gap-2 mb-4">
          {/* The five dimension tabs measure ~319px; on a phone that left no room
              for "Build URL", which was pushed 12px off the card. Every other
              dimension card (ContentStats, Locations, TechSpecs)
              already scrolls its tab row — this one and TopReferrers were the two
              that missed the pattern. */}
          <div className="flex gap-1 min-w-0 overflow-x-auto scrollbar-hide pb-1 max-md:[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]" role="tablist" aria-label="Campaign dimension tabs">
            {(['source', 'medium', 'campaign', 'term', 'content'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`relative px-2.5 py-3 sm:py-1 text-xs font-medium transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded-none cursor-pointer ${
                  activeTab === tab
                    ? 'text-white'
                    : 'text-neutral-500 hover:text-neutral-300'
                } ease-apple`}
              >
                {tab}
                <span
                  className={`absolute inset-x-0 -bottom-px h-[3px] rounded-none transition-[width,background-color] duration-base ${
                    activeTab === tab ? 'bg-brand-orange scale-x-100' : 'bg-transparent scale-x-0'
                  } ease-apple`}
                />
              </button>
            ))}
          </div>
          <div className="flex min-w-0 shrink items-center gap-2">
            <MetricUnitLabel metric={metric} />
            {showViewAll && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="p-3 md:p-1.5 text-neutral-500 hover:text-brand-orange hover:bg-neutral-800 transition-all cursor-pointer rounded-none ease-apple"
                aria-label="View all campaigns"
              >
                <FrameCornersIcon className="w-4 h-4" weight="bold" />
              </button>
            )}
            <button
              onClick={() => setIsBuilderOpen(true)}
              className="text-xs font-medium text-neutral-500 hover:text-brand-orange transition-colors cursor-pointer ease-apple"
            >
              Build URL
            </button>
          </div>
        </div>

        <div className="space-y-2 flex-1 min-h-[270px]">
          {isLoading ? (
            <ListSkeleton rows={LIMIT} />
          ) : cardError && !cardData ? (
            // The anti-fake-empty. Before this branch existed a failed request
            // rendered "No UTM data yet" — telling a customer they have no
            // campaign traffic when in fact we simply could not find out.
            // `!cardData` so a background revalidation failure keeps the last
            // good rows on screen instead of blanking a working card.
            <ErrorCard
              title="Couldn’t load campaigns"
              description="The rest of the dashboard is unaffected."
              onRetry={() => refetchCard()}
            />
          ) : hasData ? (
            <>
              {displayedData.map((item) => {
                const barWidth = rowBarWidth(metric, item, displayedData, 'visitors')
                const filterDimension = `utm_${activeTab}`
                return (
                  <div
                    key={item.name}
                    onClick={() => onFilter?.({ dimension: filterDimension, operator: 'is', values: [item.name] })}
                    className={`interactive-row relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${onFilter ? ' cursor-pointer' : ''}`}
                  >
                    <div
                      className="absolute inset-y-0.5 left-0.5 bg-brand-orange/[0.07] border-l-2 border-brand-orange/70 rounded-none transition-[width,background-color] ease-apple"
                      style={{ width: `${barWidth}%` }}
                    />
                    <div className="relative flex-1 text-white flex items-center gap-3 min-w-0">
                      {activeTab === 'source' && renderSourceIcon(item.name)}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-sm" title={item.name}>
                          {activeTab === 'source' ? getReferrerDisplayName(item.name) : item.name}
                        </div>
                      </div>
                    </div>
                    <MetricRowStat metric={metric} row={item} totals={totals} />
                  </div>
                )
              })}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
              ))}
            </>
          ) : (
            <EmptyState
              icon={<Megaphone />}
              title="No UTM data yet"
              description="Tag your links with UTM parameters to track which campaigns drive the most traffic."
              action={{ label: 'Build a UTM URL', onClick: () => setIsBuilderOpen(true) }}
            />
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setModalSearch('') }}
        title="Campaigns"
        className="max-w-2xl max-h-[90vh] flex flex-col !bg-card !border-neutral-800"
      >
        <div>
          <input
            type="text"
            value={modalSearch}
            onChange={(e) => setModalSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full px-3 py-2 mb-3 text-sm bg-neutral-800 border border-neutral-700 rounded-none text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50"
          />
          {shareDenominatorNote(metric, totals) && (
            <p className="mb-3 text-[11px] text-neutral-500">{shareDenominatorNote(metric, totals)}</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {fullError && !fullDataRaw ? (
            <ErrorCard
              title="Couldn’t load campaigns"
              description="Close and reopen to try again."
            />
          ) : isLoadingFull ? (
            <div className="py-4">
              <ListSkeleton rows={10} />
            </div>
          ) : (() => {
            const filteredCampaigns = !modalSearch ? sortedFullData : sortedFullData.filter(item => {
              const search = modalSearch.toLowerCase()
              return item.source.toLowerCase().includes(search) || (item.medium || '').toLowerCase().includes(search) || (item.campaign || '').toLowerCase().includes(search) || (item.term || '').toLowerCase().includes(search) || (item.content || '').toLowerCase().includes(search)
            })
            return (
              <>
                <div className="flex items-center justify-end mb-2">
                  <button
                    onClick={handleExportCampaigns}
                    className="text-xs font-medium text-neutral-400 hover:text-brand-orange transition-colors cursor-pointer ease-apple"
                  >
                    Export CSV
                  </button>
                </div>
                <VirtualList
                  items={filteredCampaigns}
                  estimateSize={36}
                  className="pr-2"
                  renderItem={(item) => (
                    <div
                      key={`${item.source}|${item.medium}|${item.campaign}`}
                      onClick={() => { if (onFilter) { onFilter({ dimension: 'utm_source', operator: 'is', values: [item.source] }); setIsModalOpen(false) } }}
                      className={`interactive-row flex items-center justify-between py-2 group rounded-none px-2${onFilter ? ' cursor-pointer' : ''}`}
                    >
                      <div className="flex-1 flex items-center gap-3 min-w-0">
                        {renderSourceIcon(item.source)}
                        <div className="min-w-0">
                          <div className="text-white font-medium truncate text-sm" title={item.source}>
                            {getReferrerDisplayName(item.source)}
                          </div>
                          <div className="flex items-center gap-1.5 text-caption text-neutral-500">
                            <span>{item.medium || '—'}</span>
                            <span>·</span>
                            <span className="truncate">{item.campaign || '—'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 ml-4 text-sm">
                        <MetricRowStat metric={metric} row={item} totals={totals} />
                        {metric !== 'pageviews' && (
                          <span className="text-neutral-500 w-16 text-right">
                            {formatNumber(item.pageviews)} pv
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                />
              </>
            )
          })()}
        </div>
      </Modal>

      <Modal
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        title="Campaign URL Builder"
      >
        <div className="p-1">
          <UtmBuilder initialSiteId={siteId} />
        </div>
      </Modal>
    </>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { logger } from '@/lib/utils/logger'
import { formatNumber } from '@ciphera-net/ui'
import { getReferrerDisplayName, getReferrerFavicon, getReferrerIcon, mergeReferrersByDisplayName } from '@/lib/utils/icons'
import Link from 'next/link'
import { ArrowSquareOut, FrameCornersIcon } from '@phosphor-icons/react'
import { Modal, GlobeIcon, ArrowRightIcon } from '@ciphera-net/ui'
import { ListSkeleton } from '@/components/skeletons'
import VirtualList from './VirtualList'
import { getTopReferrers, TopReferrer } from '@/lib/api/stats'
import { type DimensionFilter } from '@/lib/filters'

interface TopReferrersProps {
  referrers: Array<{ referrer: string; pageviews: number }>
  collectReferrers?: boolean
  siteId: string
  dateRange: { start: string, end: string }
  onFilter?: (filter: DimensionFilter) => void
}

const LIMIT = 7

export default function TopReferrers({ referrers, collectReferrers = true, siteId, dateRange, onFilter }: TopReferrersProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [fullData, setFullData] = useState<TopReferrer[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)
  const [faviconFailed, setFaviconFailed] = useState<Set<string>>(new Set())

  // Filter out empty/unknown referrers
  const filteredReferrers = (referrers || []).filter(
    ref => ref.referrer && ref.referrer !== 'Unknown' && ref.referrer !== ''
  )

  const mergedReferrers = mergeReferrersByDisplayName(filteredReferrers)

  const totalPageviews = mergedReferrers.reduce((sum, r) => sum + r.pageviews, 0)
  const hasData = mergedReferrers.length > 0
  const displayedReferrers = hasData ? mergedReferrers.slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedReferrers.length)
  const showViewAll = hasData && mergedReferrers.length > LIMIT

  function renderReferrerIcon(referrer: string) {
    const faviconUrl = getReferrerFavicon(referrer)
    const useFavicon = faviconUrl && !faviconFailed.has(referrer)
    if (useFavicon) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={faviconUrl}
          alt=""
          width={20}
          height={20}
          className="w-5 h-5 flex-shrink-0 rounded object-contain"
          onError={() => setFaviconFailed((prev) => new Set(prev).add(referrer))}
          onLoad={(e) => {
            // Google's favicon service returns a 16x16 default globe when no real favicon exists
            const img = e.currentTarget
            if (img.naturalWidth <= 16) {
              setFaviconFailed((prev) => new Set(prev).add(referrer))
            }
          }}
        />
      )
    }
    return <span className="text-lg flex-shrink-0">{getReferrerIcon(referrer)}</span>
  }

  useEffect(() => {
    if (isModalOpen) {
      const fetchData = async () => {
        setIsLoadingFull(true)
        try {
          const data = await getTopReferrers(siteId, dateRange.start, dateRange.end, 100)
          // Filter fetched data too
          const filtered = (data || []).filter(
            ref => ref.referrer && ref.referrer !== 'Unknown' && ref.referrer !== ''
          )
          setFullData(filtered)
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
  }, [isModalOpen, siteId, dateRange])

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ArrowSquareOut className="w-5 h-5 text-neutral-400 dark:text-neutral-500" weight="bold" />
            <h3 className="text-lg font-semibold text-white">
              Referrers
            </h3>
            {showViewAll && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-brand-orange dark:hover:text-brand-orange hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all cursor-pointer rounded-lg"
                aria-label="View all referrers"
              >
                <FrameCornersIcon className="w-4 h-4" weight="bold" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2 flex-1 min-h-[270px]">
          {!collectReferrers ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-neutral-400 text-sm">Referrer tracking is disabled in site settings</p>
            </div>
          ) : hasData ? (
            <>
              {displayedReferrers.map((ref) => {
                const maxPv = displayedReferrers[0]?.pageviews ?? 0
                const barWidth = maxPv > 0 ? (ref.pageviews / maxPv) * 75 : 0
                return (
                  <div
                    key={ref.referrer}
                    onClick={() => onFilter?.({ dimension: 'referrer', operator: 'is', values: ref.allReferrers ?? [ref.referrer] })}
                    className={`relative flex items-center justify-between h-9 group hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors${onFilter ? ' cursor-pointer' : ''}`}
                  >
                    <div
                      className="absolute inset-y-0.5 left-0.5 bg-brand-orange/15 dark:bg-brand-orange/40 rounded-md transition-all"
                      style={{ width: `${barWidth}%` }}
                    />
                    <div className="relative flex-1 truncate text-white flex items-center gap-3">
                      {renderReferrerIcon(ref.referrer)}
                      <span className="truncate" title={ref.referrer}>{getReferrerDisplayName(ref.referrer)}</span>
                    </div>
                    <div className="relative flex items-center gap-2 ml-4">
                      <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                        {totalPageviews > 0 ? `${Math.round((ref.pageviews / totalPageviews) * 100)}%` : ''}
                      </span>
                      <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                        {formatNumber(ref.pageviews)}
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
              <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
                <GlobeIcon className="w-8 h-8 text-neutral-400" />
              </div>
              <h4 className="font-semibold text-white">
                No referrers yet
              </h4>
              <p className="text-sm text-neutral-400 max-w-xs">
                Traffic sources will appear here when visitors come from external sites.
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
        title="Referrers"
        className="max-w-2xl"
      >
        <div>
          <input
            type="text"
            value={modalSearch}
            onChange={(e) => setModalSearch(e.target.value)}
            placeholder="Search referrers..."
            className="w-full px-3 py-2 mb-3 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50"
          />
        </div>
        <div className="max-h-[80vh]">
          {isLoadingFull ? (
            <div className="py-4">
              <ListSkeleton rows={10} />
            </div>
          ) : (() => {
            const modalData = mergeReferrersByDisplayName(fullData.length > 0 ? fullData : filteredReferrers).filter(r => !modalSearch || getReferrerDisplayName(r.referrer).toLowerCase().includes(modalSearch.toLowerCase()))
            const modalTotal = modalData.reduce((sum, r) => sum + r.pageviews, 0)
            return (
              <VirtualList
                items={modalData}
                estimateSize={36}
                className="max-h-[80vh] overflow-y-auto pr-2"
                renderItem={(ref) => (
                  <div
                    key={ref.referrer}
                    onClick={() => { if (onFilter) { onFilter({ dimension: 'referrer', operator: 'is', values: [ref.referrer] }); setIsModalOpen(false) } }}
                    className={`flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 transition-colors${onFilter ? ' cursor-pointer' : ''}`}
                  >
                    <div className="flex-1 truncate text-white flex items-center gap-3">
                      {renderReferrerIcon(ref.referrer)}
                      <span className="truncate" title={ref.referrer}>{getReferrerDisplayName(ref.referrer)}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                        {modalTotal > 0 ? `${Math.round((ref.pageviews / modalTotal) * 100)}%` : ''}
                      </span>
                      <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                        {formatNumber(ref.pageviews)}
                      </span>
                    </div>
                  </div>
                )}
              />
            )
          })()}
        </div>
      </Modal>
    </>
  )
}
'use client'

import { useState, useEffect } from 'react'
import { formatNumber } from '@/lib/utils/format'
import { getReferrerIcon } from '@/lib/utils/icons'
import { Modal, GlobeIcon } from '@ciphera-net/ui'
import { getTopReferrers, TopReferrer } from '@/lib/api/stats'

interface TopReferrersProps {
  referrers: Array<{ referrer: string; pageviews: number }>
  collectReferrers?: boolean
  siteId: string
  dateRange: { start: string, end: string }
}

const LIMIT = 7

export default function TopReferrers({ referrers, collectReferrers = true, siteId, dateRange }: TopReferrersProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fullData, setFullData] = useState<TopReferrer[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)

  // Filter out empty/unknown referrers
  const filteredReferrers = (referrers || []).filter(
    ref => ref.referrer && ref.referrer !== 'Unknown' && ref.referrer !== ''
  )

  const hasData = filteredReferrers.length > 0
  const displayedReferrers = hasData ? filteredReferrers.slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedReferrers.length)
  const showViewAll = hasData && filteredReferrers.length > LIMIT

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
          console.error(e)
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
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Top Referrers
          </h3>
          {showViewAll && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded"
            >
              View All
            </button>
          )}
        </div>

        <div className="space-y-2 flex-1 min-h-[270px]">
          {!collectReferrers ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-neutral-500 dark:text-neutral-400 text-sm">Referrer tracking is disabled in site settings</p>
            </div>
          ) : hasData ? (
            <>
              {displayedReferrers.map((ref, index) => (
                <div key={index} className="flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors">
                  <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                    <span className="text-lg flex-shrink-0">{getReferrerIcon(ref.referrer)}</span>
                    <span className="truncate" title={ref.referrer}>{ref.referrer}</span>
                  </div>
                  <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
                    {formatNumber(ref.pageviews)}
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
                <GlobeIcon className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
              </div>
              <h4 className="font-semibold text-neutral-900 dark:text-white">
                No referrers yet
              </h4>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
                Traffic sources will appear here when visitors come from external sites.
              </p>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Top Referrers"
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {isLoadingFull ? (
            <div className="py-8 flex flex-col items-center gap-2">
              <div className="animate-spin w-6 h-6 border-2 border-neutral-300 dark:border-neutral-700 border-t-brand-orange rounded-full" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
            </div>
          ) : (
            (fullData.length > 0 ? fullData : filteredReferrers).map((ref, index) => (
              <div key={index} className="flex items-center justify-between py-2 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors">
                <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                  <span className="text-lg flex-shrink-0">{getReferrerIcon(ref.referrer)}</span>
                  <span className="truncate" title={ref.referrer}>{ref.referrer}</span>
                </div>
                <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
                  {formatNumber(ref.pageviews)}
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </>
  )
}
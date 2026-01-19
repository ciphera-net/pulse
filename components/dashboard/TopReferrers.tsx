'use client'

import { useState } from 'react'
import { formatNumber } from '@/lib/utils/format'
import { getReferrerIcon } from '@/lib/utils/icons'
import { Modal } from '@ciphera-net/ui'

interface TopReferrersProps {
  referrers: Array<{ referrer: string; pageviews: number }>
  collectReferrers?: boolean
}

const LIMIT = 7

export default function TopReferrers({ referrers, collectReferrers = true }: TopReferrersProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Filter out empty/unknown referrers
  const filteredReferrers = (referrers || []).filter(
    ref => ref.referrer && ref.referrer !== 'Unknown' && ref.referrer !== ''
  )

  const hasData = filteredReferrers.length > 0
  const displayedReferrers = hasData ? filteredReferrers.slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedReferrers.length)
  const showViewAll = hasData && filteredReferrers.length > LIMIT

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Top Referrers
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
            <div className="h-full flex flex-col items-center justify-center">
              <p className="text-neutral-600 dark:text-neutral-400">No data available</p>
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
          {referrers?.map((ref, index) => (
            <div key={index} className="flex items-center justify-between py-2 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors">
              <div className="flex-1 truncate text-neutral-900 dark:text-white flex items-center gap-3">
                <span className="text-lg flex-shrink-0">{getReferrerIcon(ref.referrer)}</span>
                <span className="truncate" title={ref.referrer}>{ref.referrer}</span>
              </div>
              <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
                {formatNumber(ref.pageviews)}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}

'use client'

import { useState } from 'react'
import { formatNumber } from '@/lib/utils/format'
import { getReferrerIcon } from '@/lib/utils/icons'
import { Modal } from '@ciphera-net/ui'

interface TopReferrersProps {
  referrers: Array<{ referrer: string; pageviews: number }>
}

const LIMIT = 7

export default function TopReferrers({ referrers }: TopReferrersProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const hasData = referrers && referrers.length > 0
  const displayedReferrers = hasData ? referrers.slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedReferrers.length)
  const showViewAll = hasData && referrers.length > LIMIT

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

        <div className="space-y-3 flex-1 min-h-[270px]">
          {hasData ? (
            <>
              {displayedReferrers.map((ref, index) => (
                <div key={index} className="flex items-center justify-between h-7">
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
                <div key={`empty-${i}`} className="h-7" aria-hidden="true" />
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
            <div key={index} className="flex items-center justify-between py-1">
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

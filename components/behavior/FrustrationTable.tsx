'use client'

import { useState, useEffect } from 'react'
import { formatNumber, Modal } from '@ciphera-net/ui'
import { FrameCornersIcon } from '@phosphor-icons/react'
import type { FrustrationElement } from '@/lib/api/stats'
import { ListSkeleton } from '@/components/skeletons'

interface FrustrationTableProps {
  title: string
  description: string
  items: FrustrationElement[]
  total: number
  showAvgClicks?: boolean
  loading: boolean
  fetchAll?: () => Promise<{ items: FrustrationElement[]; total: number }>
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="animate-pulse flex items-center justify-between h-9 px-2">
          <div className="flex items-center gap-3 flex-1">
            <div className="h-4 w-32 bg-neutral-200 dark:bg-neutral-700 rounded" />
            <div className="h-3 w-20 bg-neutral-200 dark:bg-neutral-700 rounded" />
          </div>
          <div className="h-4 w-10 bg-neutral-200 dark:bg-neutral-700 rounded" />
        </div>
      ))}
    </div>
  )
}

function Row({
  item,
  showAvgClicks,
}: {
  item: FrustrationElement
  showAvgClicks?: boolean
}) {
  return (
    <div className="flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span
          className="text-sm font-mono text-neutral-900 dark:text-white truncate max-w-[200px]"
          title={item.selector}
        >
          {item.selector}
        </span>
        <span
          className="text-xs text-neutral-400 dark:text-neutral-500 truncate max-w-[140px]"
          title={item.page_path}
        >
          {item.page_path}
        </span>
      </div>
      <div className="flex items-center gap-4 ml-4 shrink-0">
        {showAvgClicks && item.avg_click_count != null && (
          <span className="text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
            avg {item.avg_click_count.toFixed(1)}
          </span>
        )}
        <span className="text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
          {item.sessions} {item.sessions === 1 ? 'session' : 'sessions'}
        </span>
        <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 tabular-nums">
          {formatNumber(item.count)}
        </span>
      </div>
    </div>
  )
}

export default function FrustrationTable({
  title,
  description,
  items,
  total,
  showAvgClicks,
  loading,
  fetchAll,
}: FrustrationTableProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fullData, setFullData] = useState<FrustrationElement[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)
  const hasData = items.length > 0
  const showViewAll = hasData && total > items.length

  useEffect(() => {
    if (isModalOpen && fetchAll) {
      const load = async () => {
        setIsLoadingFull(true)
        try {
          const result = await fetchAll()
          setFullData(result.items)
        } catch {
          // silent
        } finally {
          setIsLoadingFull(false)
        }
      }
      load()
    } else {
      setFullData([])
    }
  }, [isModalOpen, fetchAll])

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {title}
            </h3>
            {showViewAll && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-brand-orange dark:hover:text-brand-orange hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all cursor-pointer rounded-lg"
                aria-label={`View all ${title.toLowerCase()}`}
              >
                <FrameCornersIcon className="w-4 h-4" weight="bold" />
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          {description}
        </p>

        <div className="flex-1 min-h-[200px]">
          {loading ? (
            <SkeletonRows />
          ) : hasData ? (
            <div className="space-y-0.5">
              {items.map((item, i) => (
                <Row key={`${item.selector}-${item.page_path}-${i}`} item={item} showAvgClicks={showAvgClicks} />
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No {title.toLowerCase()} detected in this period
              </p>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={title}
        className="max-w-2xl"
      >
        <div className="max-h-[80vh] overflow-y-auto">
          {isLoadingFull ? (
            <div className="py-4">
              <ListSkeleton rows={10} />
            </div>
          ) : fullData.length > 0 ? (
            <div className="space-y-0.5">
              {fullData.map((item, i) => (
                <Row key={`${item.selector}-${item.page_path}-${i}`} item={item} showAvgClicks={showAvgClicks} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 py-8 text-center">
              No data available
            </p>
          )}
        </div>
      </Modal>
    </>
  )
}

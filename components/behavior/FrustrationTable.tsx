'use client'

import { useState, useEffect } from 'react'
import { formatNumber, Modal } from '@ciphera-net/ui'
import { FrameCornersIcon, Copy, Check, CursorClick } from '@phosphor-icons/react'
import { toast } from '@ciphera-net/ui'
import type { FrustrationElement } from '@/lib/api/stats'
import { ListSkeleton } from '@/components/skeletons'

const DISPLAY_LIMIT = 7

interface FrustrationTableProps {
  title: string
  description: string
  items: FrustrationElement[]
  total: number
  totalSignals: number
  showAvgClicks?: boolean
  loading: boolean
  fetchAll?: () => Promise<{ items: FrustrationElement[]; total: number }>
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: DISPLAY_LIMIT }).map((_, i) => (
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

function SelectorCell({ selector }: { selector: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(selector)
    setCopied(true)
    toast.success('Selector copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 min-w-0 group/copy cursor-pointer"
      title={selector}
    >
      <span className="text-sm font-mono text-white truncate">
        {selector}
      </span>
      <span className="opacity-0 group-hover/copy:opacity-100 transition-opacity shrink-0">
        {copied ? (
          <Check className="w-3 h-3 text-green-500" />
        ) : (
          <Copy className="w-3 h-3 text-neutral-400" />
        )}
      </span>
    </button>
  )
}

function Row({
  item,
  showAvgClicks,
  totalSignals,
}: {
  item: FrustrationElement
  showAvgClicks?: boolean
  totalSignals: number
}) {
  const pct = totalSignals > 0 ? `${Math.round((item.count / totalSignals) * 100)}%` : ''

  return (
    <div className="flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <SelectorCell selector={item.selector} />
          <span
            className="text-xs text-neutral-400 dark:text-neutral-500 truncate shrink-0"
            title={item.page_path}
          >
            {item.page_path}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0">
        {/* Percentage badge: slides in on hover */}
        <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-base tabular-nums">
          {pct}
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
  totalSignals,
  showAvgClicks,
  loading,
  fetchAll,
}: FrustrationTableProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fullData, setFullData] = useState<FrustrationElement[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)
  const hasData = items.length > 0
  const showViewAll = hasData && total > items.length
  const emptySlots = Math.max(0, DISPLAY_LIMIT - items.length)

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
      <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-white">
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
        <p className="text-sm text-neutral-400 mb-4">
          {description}
        </p>

        <div className="flex-1 min-h-[270px]">
          {loading ? (
            <SkeletonRows />
          ) : hasData ? (
            <>
              {items.map((item, i) => (
                <Row key={`${item.selector}-${item.page_path}-${i}`} item={item} showAvgClicks={showAvgClicks} totalSignals={totalSignals} />
              ))}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
              ))}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8 gap-4">
              <img
                src="/illustrations/blank-canvas.svg"
                alt="No frustration signals"
                className="w-44 h-auto mb-1"
              />
              <h4 className="font-semibold text-white">
                No {title.toLowerCase()} detected
              </h4>
              <p className="text-sm text-neutral-400 max-w-md">
                Frustration tracking requires the add-on script. Add it after your core Pulse script:
              </p>
              <code className="text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-3 py-2 rounded-lg font-mono break-all">
                {'<script defer src="https://pulse.ciphera.net/script.frustration.js"></script>'}
              </code>
              <a href="/installation" target="_blank" rel="noopener noreferrer" className="mt-1 text-sm font-medium text-brand-orange hover:underline">
                View setup guide
              </a>
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
                <Row key={`${item.selector}-${item.page_path}-${i}`} item={item} showAvgClicks={showAvgClicks} totalSignals={totalSignals} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400 py-8 text-center">
              No data available
            </p>
          )}
        </div>
      </Modal>
    </>
  )
}

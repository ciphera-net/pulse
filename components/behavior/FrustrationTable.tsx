'use client'

import { useEffect, useState } from 'react'
import { toast } from '@ciphera-net/facet'
import { Check, CircleNotch, Copy, CursorClick } from '@phosphor-icons/react'
import { formatNumber } from '@/lib/utils/format'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useRageClicks, useDeadClicks } from '@/lib/swr/dashboard'
import type { FrustrationElement } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// Rage / dead element table. Un-lensed it renders the useBehavior payload with
// no extra fetch; when a ?page= lens is pinned it fetches the FILTERED list
// (keepPreviousData). "View all" is the shared dialog primitive (focus trap for
// free) with the 150ms loading rule, an ErrorCard on failure, and settled-only
// empties — the old silent catch is gone.
// ---------------------------------------------------------------------------

const DISPLAY_LIMIT = 7
const VIEW_ALL_LIMIT = 100

interface FrustrationTableProps {
  kind: 'rage' | 'dead'
  title: string
  showAvgClicks?: boolean
  siteId: string
  start: string
  end: string
  lensPage: string | null
  /** No-lens display source (from the useBehavior payload). */
  fallbackItems: FrustrationElement[]
  fallbackTotal: number
  /** Denominator for the hover share % (the kind's total signal count). */
  totalSignals: number
}

/** 150ms-delayed spinner for stable-height loading regions. */
function DelayedSpinner({ className = '' }: { className?: string }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 150)
    return () => clearTimeout(t)
  }, [])
  if (!visible) return null
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <CircleNotch className="h-5 w-5 animate-spin text-neutral-500" />
    </div>
  )
}

function SelectorCell({ selector }: { selector: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(selector)
    setCopied(true)
    toast.success('Selector copied')
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="group/copy flex min-w-0 items-center gap-1 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
      title={selector}
    >
      <span className="truncate font-mono text-sm text-white">{selector}</span>
      <span className="shrink-0 opacity-0 transition-opacity duration-fast ease-apple group-hover/copy:opacity-100">
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-neutral-400" />}
      </span>
    </button>
  )
}

function Row({
  item,
  showAvgClicks,
  totalSignals,
  maxCount,
}: {
  item: FrustrationElement
  showAvgClicks?: boolean
  totalSignals: number
  maxCount: number
}) {
  const pct = totalSignals > 0 ? Math.round((item.count / totalSignals) * 100) : 0
  const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0
  return (
    <div className="group flex h-9 items-center justify-between gap-2 rounded-none px-2 transition-colors duration-fast ease-apple hover:bg-neutral-800/60">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <SelectorCell selector={item.selector} />
        <span className="shrink-0 truncate text-xs text-neutral-500" title={item.page_path}>
          {item.page_path}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {totalSignals > 0 && (
          <span className="text-xs font-medium tabular-nums text-brand-orange opacity-0 transition-opacity duration-fast ease-apple group-hover:opacity-100">
            {pct}%
          </span>
        )}
        {showAvgClicks && item.avg_click_count != null && item.avg_click_count > 0 && (
          <span className="text-xs tabular-nums text-neutral-500">avg {item.avg_click_count.toFixed(1)}</span>
        )}
        <div className="relative flex h-6 w-16 items-center justify-end px-2">
          <div
            className="absolute inset-y-0 right-0 rounded-none bg-brand-orange/10"
            style={{ width: `${barWidth}%` }}
            aria-hidden="true"
          />
          <span className="relative text-sm font-semibold tabular-nums text-neutral-400">
            {formatNumber(item.count)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function FrustrationTable({
  kind,
  title,
  showAvgClicks,
  siteId,
  start,
  end,
  lensPage,
  fallbackItems,
  fallbackTotal,
  totalSignals,
}: FrustrationTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const isRage = kind === 'rage'
  const lensActive = !!lensPage

  // * Both hooks are called (rules-of-hooks); the `enabled` gate leaves the
  // * non-matching kind, the un-lensed table and the closed dialog as no-op
  // * null-key SWR — only the matching kind actually fetches.
  const rageLens = useRageClicks(siteId, start, end, DISPLAY_LIMIT, lensPage ?? undefined, isRage && lensActive)
  const deadLens = useDeadClicks(siteId, start, end, DISPLAY_LIMIT, lensPage ?? undefined, !isRage && lensActive)
  const lens = isRage ? rageLens : deadLens

  const rageAll = useRageClicks(siteId, start, end, VIEW_ALL_LIMIT, lensPage ?? undefined, isRage && dialogOpen)
  const deadAll = useDeadClicks(siteId, start, end, VIEW_ALL_LIMIT, lensPage ?? undefined, !isRage && dialogOpen)
  const all = isRage ? rageAll : deadAll

  const items = lensActive ? (lens.data?.items ?? []) : fallbackItems
  const total = lensActive ? (lens.data?.total ?? 0) : fallbackTotal
  const loading = lensActive && lens.isLoading && !lens.data

  const hasData = items.length > 0
  const showViewAll = hasData && total > items.length
  const maxCount = items.reduce((m, i) => Math.max(m, i.count), 0)
  const emptySlots = Math.max(0, DISPLAY_LIMIT - items.length)

  const kindNoun = isRage ? 'rage clicks' : 'dead clicks'
  const allItems = all.data?.items ?? []
  const allMax = allItems.reduce((m, i) => Math.max(m, i.count), 0)

  return (
    <div className="flex h-full flex-col rounded-none border border-border bg-card p-4">
      <div className="mb-3 flex h-6 items-center justify-between">
        <span className="text-xs text-neutral-500">{title}</span>
        {showViewAll && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="rounded-none text-xs text-neutral-500 transition-colors duration-fast ease-apple hover:text-brand-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
          >
            View all
          </button>
        )}
      </div>

      {/* Column header */}
      <div className="flex h-6 items-center justify-between px-2 text-xs text-neutral-500">
        <span>Element</span>
        <span>Count</span>
      </div>

      <div className="flex-1">
        {lensActive && lens.error ? (
          <ErrorCard
            title={`Couldn't load ${kindNoun}`}
            description={`The filtered request for ${lensPage} failed.`}
            onRetry={() => { void lens.mutate() }}
            className="min-h-[252px] py-6"
          />
        ) : loading ? (
          <DelayedSpinner className="min-h-[252px]" />
        ) : hasData ? (
          <>
            {items.map((item, i) => (
              <Row
                key={`${item.selector}-${item.page_path}-${i}`}
                item={item}
                showAvgClicks={showAvgClicks}
                totalSignals={totalSignals}
                maxCount={maxCount}
              />
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div key={`empty-${i}`} className="h-9" aria-hidden="true" />
            ))}
          </>
        ) : lensActive ? (
          <div className="flex min-h-[252px] items-center justify-center px-4 text-center">
            <p className="text-sm text-neutral-500">
              No {kindNoun} on {lensPage} in this period.
            </p>
          </div>
        ) : (
          <EmptyState
            icon={<CursorClick />}
            title={`No ${kindNoun} detected`}
            description="Frustration signals are tracked automatically once the behavior script is installed."
            action={{ label: 'Install tracking script', href: '/installation' }}
          />
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">{title}</DialogTitle>
            {lensPage && (
              <DialogDescription className="text-xs text-neutral-500">
                On {lensPage}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="min-h-[240px] max-h-[70vh] overflow-y-auto">
            {all.error ? (
              <ErrorCard
                title={`Couldn't load ${kindNoun}`}
                description="The request failed for this period."
                onRetry={() => { void all.mutate() }}
                className="py-8"
              />
            ) : all.isLoading && !all.data ? (
              <DelayedSpinner className="min-h-[240px]" />
            ) : allItems.length > 0 ? (
              <div className="space-y-0.5">
                {allItems.map((item, i) => (
                  <Row
                    key={`${item.selector}-${item.page_path}-${i}`}
                    item={item}
                    showAvgClicks={showAvgClicks}
                    totalSignals={totalSignals}
                    maxCount={allMax}
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[240px] items-center justify-center px-4 text-center">
                <p className="text-sm text-neutral-500">
                  {lensPage
                    ? `No ${kindNoun} on ${lensPage} in this period.`
                    : `No ${kindNoun} recorded in this period.`}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

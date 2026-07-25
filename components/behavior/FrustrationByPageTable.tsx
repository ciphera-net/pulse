'use client'

import { Files } from '@phosphor-icons/react'
import { formatNumber } from '@/lib/utils/format'
import { EmptyState } from '@/components/ui/EmptyState'
import type { FrustrationByPage } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// Frustration by page — the ?page= lens navigation. Rows are focusable
// (↑/↓ move, Enter/Space toggle, click toggles); the pinned row carries the
// selected ring and a brighter bar. Selecting a row filters the element tables
// above via the URL lens; the summary and this table stay unfiltered.
// ---------------------------------------------------------------------------

interface FrustrationByPageTableProps {
  pages: FrustrationByPage[]
  lensPage: string | null
  onToggleLens: (path: string) => void
}

export default function FrustrationByPageTable({ pages, lensPage, onToggleLens }: FrustrationByPageTableProps) {
  const hasData = pages.length > 0
  const maxTotal = Math.max(...pages.map((p) => p.total), 1)

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const idxRaw = target.dataset?.idx
    if (idxRaw === undefined) return
    let idx = parseInt(idxRaw, 10)
    if (e.key === 'ArrowDown') idx += 1
    else if (e.key === 'ArrowUp') idx -= 1
    else return
    e.preventDefault()
    idx = Math.max(0, Math.min(pages.length - 1, idx))
    e.currentTarget.querySelector<HTMLButtonElement>(`button[data-idx="${idx}"]`)?.focus()
  }

  return (
    <div className="rounded-none border border-border bg-card p-4">
      <div className="mb-3 flex h-6 items-center justify-between gap-3">
        <span className="text-xs text-neutral-500">Frustration by page</span>
        {hasData && (
          <span className="hidden text-xs text-neutral-600 sm:block">
            Select a page to filter signals
          </span>
        )}
      </div>

      {hasData ? (
        <div className="overflow-x-auto">
          {/* Column header */}
          <div className="flex h-6 items-center px-2 text-xs text-neutral-500">
            <span className="flex-1">Page</span>
            <div className="flex items-center gap-6">
              <span className="w-12 text-right">Rage</span>
              <span className="w-12 text-right">Dead</span>
              <span className="w-12 text-right">Total</span>
              <span className="w-16 text-right">Elements</span>
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-0.5" onKeyDown={onKeyDown}>
            {pages.map((page, i) => {
              const active = lensPage === page.page_path
              const barWidth = (page.total / maxTotal) * 100
              return (
                <button
                  key={page.page_path}
                  type="button"
                  data-idx={i}
                  title={page.page_path}
                  aria-pressed={active}
                  onClick={() => onToggleLens(page.page_path)}
                  className={`group relative flex h-9 w-full items-center rounded-none px-2 text-left transition-colors duration-fast ease-apple hover:bg-neutral-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange ${
                    active ? 'ring-1 ring-inset ring-brand-orange/40' : ''
                  }`}
                >
                  <div
                    className={`absolute inset-y-1 left-0 rounded-none ${active ? 'bg-brand-orange/20' : 'bg-brand-orange/10'}`}
                    style={{ width: `${barWidth}%` }}
                    aria-hidden="true"
                  />
                  <span className="relative flex-1 truncate text-sm text-white">{page.page_path}</span>
                  <div className="relative flex items-center gap-6">
                    <span className="w-12 text-right text-sm tabular-nums text-neutral-400">
                      {formatNumber(page.rage_clicks)}
                    </span>
                    <span className="w-12 text-right text-sm tabular-nums text-neutral-400">
                      {formatNumber(page.dead_clicks)}
                    </span>
                    <span className="w-12 text-right text-sm font-semibold tabular-nums text-white">
                      {formatNumber(page.total)}
                    </span>
                    <span className="w-16 text-right text-sm tabular-nums text-neutral-400">
                      {formatNumber(page.unique_elements)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Files />}
          title="No frustration signals detected"
          description="Page-level frustration appears here once rage or dead clicks are recorded on your site."
          action={{ label: 'Install tracking script', href: '/installation' }}
        />
      )}
    </div>
  )
}

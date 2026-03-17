'use client'

import { formatNumber } from '@ciphera-net/ui'
import { Files } from '@phosphor-icons/react'
import type { FrustrationByPage } from '@/lib/api/stats'

interface FrustrationByPageTableProps {
  pages: FrustrationByPage[]
  loading: boolean
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="animate-pulse flex items-center justify-between h-9 px-2">
          <div className="h-4 w-40 bg-neutral-200 dark:bg-neutral-700 rounded" />
          <div className="flex gap-6">
            <div className="h-4 w-10 bg-neutral-200 dark:bg-neutral-700 rounded" />
            <div className="h-4 w-10 bg-neutral-200 dark:bg-neutral-700 rounded" />
            <div className="h-4 w-10 bg-neutral-200 dark:bg-neutral-700 rounded" />
            <div className="h-4 w-10 bg-neutral-200 dark:bg-neutral-700 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function FrustrationByPageTable({ pages, loading }: FrustrationByPageTableProps) {
  const hasData = pages.length > 0
  const maxTotal = Math.max(...pages.map(p => p.total), 1)

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 mb-8">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Frustration by Page
        </h3>
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
        Pages with the most frustration signals
      </p>

      {loading ? (
        <SkeletonRows />
      ) : hasData ? (
        <div className="overflow-x-auto -mx-6 px-6">
          {/* Header */}
          <div className="flex items-center justify-between px-2 -mx-2 mb-2 text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
            <span>Page</span>
            <div className="flex items-center gap-6">
              <span className="w-12 text-right">Rage</span>
              <span className="w-12 text-right">Dead</span>
              <span className="w-12 text-right">Total</span>
              <span className="w-16 text-right">Elements</span>
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-0.5">
            {pages.map((page) => {
              const barWidth = (page.total / maxTotal) * 75
              return (
                <div
                  key={page.page_path}
                  className="relative flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors"
                >
                  {/* Background bar */}
                  <div
                    className="absolute inset-y-0 left-0 bg-brand-orange/15 dark:bg-brand-orange/25 rounded-lg transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                  <span
                    className="relative text-sm text-neutral-900 dark:text-white truncate max-w-[200px] sm:max-w-[300px]"
                    title={page.page_path}
                  >
                    {page.page_path}
                  </span>
                  <div className="relative flex items-center gap-6">
                    <span className="w-12 text-right text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
                      {formatNumber(page.rage_clicks)}
                    </span>
                    <span className="w-12 text-right text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
                      {formatNumber(page.dead_clicks)}
                    </span>
                    <span className="w-12 text-right text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">
                      {formatNumber(page.total)}
                    </span>
                    <span className="w-16 text-right text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
                      {page.unique_elements}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center px-6 py-8 gap-4 min-h-[200px]">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
            <Files className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
          </div>
          <h4 className="font-semibold text-neutral-900 dark:text-white">
            No frustration signals detected
          </h4>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md">
            Page-level frustration data will appear here once rage clicks or dead clicks are detected on your site.
          </p>
        </div>
      )}
    </div>
  )
}

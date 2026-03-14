'use client'

import Link from 'next/link'
import { MagnifyingGlass, CaretUp, CaretDown } from '@phosphor-icons/react'
import { useGSCStatus, useGSCOverview, useGSCTopQueries } from '@/lib/swr/dashboard'

interface SearchPerformanceProps {
  siteId: string
  dateRange: { start: string; end: string }
}

function ChangeArrow({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (!previous || previous === 0) return null
  const improved = invert ? current < previous : current > previous
  const same = current === previous
  if (same) return null
  return improved ? (
    <CaretUp className="w-3 h-3 text-emerald-500" weight="fill" />
  ) : (
    <CaretDown className="w-3 h-3 text-red-500" weight="fill" />
  )
}

export default function SearchPerformance({ siteId, dateRange }: SearchPerformanceProps) {
  const { data: gscStatus } = useGSCStatus(siteId)
  const { data: overview, isLoading: overviewLoading } = useGSCOverview(siteId, dateRange.start, dateRange.end)
  const { data: queriesData, isLoading: queriesLoading } = useGSCTopQueries(siteId, dateRange.start, dateRange.end, 5, 0)

  // Don't render if GSC is not connected or no data
  if (!gscStatus?.connected) return null

  const isLoading = overviewLoading || queriesLoading
  const queries = queriesData?.queries ?? []
  const hasData = overview && (overview.total_clicks > 0 || overview.total_impressions > 0)

  // Hide panel entirely if loaded but no data
  if (!isLoading && !hasData) return null

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MagnifyingGlass className="w-5 h-5 text-neutral-400 dark:text-neutral-500" weight="bold" />
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Search
          </h3>
        </div>
        <Link
          href={`/sites/${siteId}/search`}
          className="text-xs font-medium text-neutral-400 dark:text-neutral-500 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
        >
          View all &rarr;
        </Link>
      </div>

      {isLoading ? (
        /* Loading skeleton */
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-6">
            <div className="h-4 w-20 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
            <div className="h-4 w-24 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
            <div className="h-4 w-20 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
          </div>
          <div className="space-y-2 mt-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-9 bg-neutral-100 dark:bg-neutral-800 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Inline stats row */}
          <div className="flex items-center gap-5 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Clicks</span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                {(overview?.total_clicks ?? 0).toLocaleString()}
              </span>
              <ChangeArrow current={overview?.total_clicks ?? 0} previous={overview?.prev_clicks ?? 0} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Impressions</span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                {(overview?.total_impressions ?? 0).toLocaleString()}
              </span>
              <ChangeArrow current={overview?.total_impressions ?? 0} previous={overview?.prev_impressions ?? 0} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Avg Position</span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                {(overview?.avg_position ?? 0).toFixed(1)}
              </span>
              <ChangeArrow current={overview?.avg_position ?? 0} previous={overview?.prev_avg_position ?? 0} invert />
            </div>
          </div>

          {/* Top 5 queries list */}
          <div className="space-y-1 flex-1">
            {queries.length > 0 ? (
              queries.map((q) => (
                <div
                  key={q.query}
                  className="flex items-center justify-between h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <span className="text-sm text-neutral-900 dark:text-white truncate flex-1 min-w-0" title={q.query}>
                    {q.query}
                  </span>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                      {q.clicks.toLocaleString()}
                    </span>
                    <span className="text-xs text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded font-medium">
                      {q.position.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex-1 flex items-center justify-center py-6">
                <p className="text-sm text-neutral-400 dark:text-neutral-500">No search data yet</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

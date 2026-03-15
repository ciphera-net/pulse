'use client'

import type { TopPath } from '@/lib/api/journeys'
import { TableSkeleton } from '@/components/skeletons'
import { Path, ArrowRight, Clock, Users } from '@phosphor-icons/react'

interface TopPathsTableProps {
  paths: TopPath[]
  loading: boolean
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

function smartLabel(path: string): string {
  if (path === '/') return '/'
  const segments = path.replace(/\/$/, '').split('/')
  if (segments.length <= 2) return path
  return `…/${segments[segments.length - 1]}`
}

export default function TopPathsTable({ paths, loading }: TopPathsTableProps) {
  const hasData = paths.length > 0

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
      <div className="mb-1">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Top Paths
        </h3>
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
        Most common navigation paths across sessions
      </p>

      {loading ? (
        <TableSkeleton rows={7} cols={4} />
      ) : hasData ? (
        <div className="space-y-2">
          {paths.map((path, i) => (
            <div
              key={i}
              className="group rounded-xl border border-neutral-100 dark:border-neutral-800 hover:border-neutral-200 dark:hover:border-neutral-700 p-4 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">
                  #{i + 1}
                </span>
                <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="flex items-center gap-1.5">
                    <Users weight="bold" className="w-3.5 h-3.5" />
                    {path.session_count.toLocaleString()}
                  </span>
                  {path.avg_duration > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Clock weight="bold" className="w-3.5 h-3.5" />
                      {formatDuration(path.avg_duration)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center flex-wrap gap-1.5">
                {path.page_sequence.map((page, j) => (
                  <div key={j} className="flex items-center gap-1.5">
                    {j > 0 && (
                      <ArrowRight
                        weight="bold"
                        className="w-3 h-3 text-neutral-300 dark:text-neutral-600 shrink-0"
                      />
                    )}
                    <span
                      className="inline-flex px-2.5 py-1 rounded-md text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                      title={page}
                    >
                      {smartLabel(page)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
            <Path className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
          </div>
          <h4 className="font-semibold text-neutral-900 dark:text-white">
            No path data yet
          </h4>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
            Common navigation paths will appear here as visitors browse your site.
          </p>
        </div>
      )}
    </div>
  )
}

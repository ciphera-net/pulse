'use client'

import type { TopPath } from '@/lib/api/journeys'
import { TableSkeleton } from '@/components/skeletons'

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

export default function TopPathsTable({ paths, loading }: TopPathsTableProps) {
  const hasData = paths.length > 0

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Top Paths
        </h3>
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
        Most common navigation paths across sessions
      </p>

      {loading ? (
        <TableSkeleton rows={7} cols={4} />
      ) : hasData ? (
        <div>
          {/* Header */}
          <div className="flex items-center px-2 -mx-2 mb-2 text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
            <span className="w-8 text-right shrink-0">#</span>
            <span className="flex-1 ml-3">Path</span>
            <span className="w-20 text-right shrink-0">Sessions</span>
            <span className="w-16 text-right shrink-0">Dur.</span>
          </div>

          {/* Rows */}
          <div className="space-y-0.5">
            {paths.map((path, i) => (
              <div
                key={i}
                className="flex items-center h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors"
              >
                <span className="w-8 text-right shrink-0 text-sm tabular-nums text-neutral-400">
                  {i + 1}
                </span>
                <span
                  className="flex-1 ml-3 text-sm text-neutral-900 dark:text-white truncate"
                  title={path.page_sequence.join(' → ')}
                >
                  {path.page_sequence.join(' → ')}
                </span>
                <span className="w-20 text-right shrink-0 text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
                  {path.session_count.toLocaleString()}
                </span>
                <span className="w-16 text-right shrink-0 text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
                  {formatDuration(path.avg_duration)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No path data available
          </p>
        </div>
      )}
    </div>
  )
}

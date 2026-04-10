'use client'

import type { TopPath } from '@/lib/api/journeys'
import { TableSkeleton } from '@/components/skeletons'
import { Path, ArrowRight, Clock } from '@phosphor-icons/react'

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

function truncateSequence(seq: string[], max: number): (string | null)[] {
  if (seq.length <= max) return seq
  const head = seq.slice(0, 3)
  const tail = seq.slice(-2)
  return [...head, null, ...tail]
}

export default function TopPathsTable({ paths, loading }: TopPathsTableProps) {
  const hasData = paths.length > 0
  const maxCount = hasData ? paths[0].session_count : 0

  return (
    <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6">
      <div className="mb-1">
        <h3 className="text-lg font-semibold text-white">
          Top Paths
        </h3>
      </div>
      <p className="text-sm text-neutral-400 mb-5">
        Most common navigation paths across sessions
      </p>

      {loading ? (
        <TableSkeleton rows={7} cols={4} />
      ) : hasData ? (
        <div className="space-y-0.5">
          {paths.map((path, i) => {
            const barWidth = maxCount > 0 ? (path.session_count / maxCount) * 75 : 0
            const displaySeq = truncateSequence(path.page_sequence, 7)

            return (
              <div
                key={i}
                className="relative flex items-center h-10 group hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-lg px-3 -mx-3 transition-colors"
              >
                {/* Background bar */}
                <div
                  className="absolute inset-y-0.5 left-0.5 bg-brand-orange/15 dark:bg-brand-orange/25 rounded-md transition-all"
                  style={{ width: `${barWidth}%` }}
                />

                {/* Content */}
                <div className="relative flex items-center justify-between w-full min-w-0">
                  {/* Path sequence */}
                  <div className="flex items-center min-w-0 gap-1.5 flex-1 overflow-hidden">
                    {displaySeq.map((page, j) => (
                      <div key={j} className="flex items-center gap-1.5 shrink-0">
                        {j > 0 && (
                          <ArrowRight
                            weight="bold"
                            className="w-2.5 h-2.5 text-neutral-300 dark:text-neutral-600 shrink-0"
                          />
                        )}
                        {page === null ? (
                          <span className="text-xs text-neutral-400 dark:text-neutral-500">
                            …
                          </span>
                        ) : (
                          <span
                            className="text-sm text-white truncate"
                            title={page}
                          >
                            {smartLabel(page)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Stats */}
                  <div className="relative flex items-center gap-4 ml-4 shrink-0">
                    {path.avg_duration > 0 && (
                      <span className="hidden sm:flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                        <Clock weight="bold" className="w-3 h-3" />
                        {formatDuration(path.avg_duration)}
                      </span>
                    )}
                    <span className="text-sm tabular-nums font-semibold text-neutral-600 dark:text-neutral-400">
                      {path.session_count.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
            <Path className="w-8 h-8 text-neutral-400" />
          </div>
          <h4 className="font-semibold text-white">
            No path data yet
          </h4>
          <p className="text-sm text-neutral-400 max-w-xs">
            Common navigation paths will appear here as visitors browse your site.
          </p>
        </div>
      )}
    </div>
  )
}

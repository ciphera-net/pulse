'use client'

import { ArrowLineDown } from '@phosphor-icons/react'
import { formatNumber } from '@/lib/utils/format'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ScrollDepthDistribution } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// Scroll depth in the dashboard's card-row grammar (owner rebuild, 19-08):
// the same h-9 rows, neutral magnitude bars and persistent gray shares as
// every sibling list card, for a monotonically decreasing distribution.
// Bars scale relative to the widest rail (reached 25%); the share divides by
// total sessions with scroll data. No fake-minimum widths — a small share
// reads small.
// ---------------------------------------------------------------------------

const THRESHOLDS = [25, 50, 75, 100] as const
const LIMIT = 7 // sibling cards render 7 row slots; pad so grids stay level

export default function ScrollDepthBars({ scrollDepth, bare = false }: {
  scrollDepth?: ScrollDepthDistribution
  // Render only the rows, no card chrome/header — for composition inside the
  // Content section's tabbed card (Scroll depth · Events).
  bare?: boolean
}) {
  const total = scrollDepth?.total_sessions ?? 0
  const hasData = total > 0
  const maxCount = scrollDepth?.scroll_25 ?? 0

  const content = (
    <>
      {hasData ? (
        <div className="flex-1 space-y-2">
          {THRESHOLDS.map((threshold) => {
            const count = (scrollDepth?.[`scroll_${threshold}` as keyof ScrollDepthDistribution] as number) ?? 0
            const share = total > 0 ? (count / total) * 100 : 0
            const barWidth = maxCount > 0 ? (count / maxCount) * 75 : 0
            return (
              <div
                key={threshold}
                className="interactive-row relative overflow-hidden flex items-center justify-between h-9 rounded-none px-2 -mx-2"
              >
                <div
                  className="absolute inset-y-0.5 left-0.5 bg-brand-orange/[0.07] border-l-2 border-brand-orange/70 rounded-none transition-[width,background-color] ease-apple"
                  style={{ width: `${barWidth}%` }}
                  aria-hidden="true"
                />
                <div className="relative flex-1 truncate text-white flex items-center">
                  <span className="truncate">Reached {threshold}%</span>
                </div>
                <div className="relative flex items-center gap-2 ml-4">
                  <span className="text-xs font-medium text-brand-orange opacity-100 translate-x-0 md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
                    {Math.round(share)}%
                  </span>
                  <span className="text-sm font-semibold text-neutral-400">
                    {formatNumber(count)}
                  </span>
                </div>
              </div>
            )
          })}
          {Array.from({ length: LIMIT - THRESHOLDS.length }).map((_, i) => (
            <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
          ))}
          {/* In bare mode the wrapping card's header states the session count. */}
          {!bare && (
            <p className="mt-3 text-xs text-neutral-500">
              {formatNumber(total)} {total === 1 ? 'session' : 'sessions'}
            </p>
          )}
        </div>
      ) : (
        <EmptyState
          icon={<ArrowLineDown />}
          title="No scrolls recorded yet"
          description="Scroll tracking is automatic — depth data appears once visitors start reading your pages."
          action={{ label: 'Install tracking script', href: '/installation' }}
        />
      )}
    </>
  )

  if (bare) return content

  return (
    <div className="flex h-full flex-col rounded-none border border-border bg-card p-4">
      <div className="mb-3">
        <span className="text-xs text-neutral-500">Scroll depth</span>
      </div>
      {content}
    </div>
  )
}

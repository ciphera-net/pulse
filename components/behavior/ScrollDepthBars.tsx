'use client'

import { ArrowLineDown } from '@phosphor-icons/react'
import { formatNumber } from '@/lib/utils/format'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ScrollDepthDistribution } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// Scroll depth — four horizontal threshold rails (the funnel-canvas rail
// language) for a monotonically decreasing distribution. Replaces the radar
// chart, which was both the wrong shape for this data and the page's only
// heavy charting-lib dependency. No fake-minimum widths — a small share reads small.
// ---------------------------------------------------------------------------

const THRESHOLDS = [25, 50, 75, 100] as const

export default function ScrollDepthBars({ scrollDepth }: { scrollDepth?: ScrollDepthDistribution }) {
  const total = scrollDepth?.total_sessions ?? 0
  const hasData = total > 0

  return (
    <div className="flex h-full flex-col rounded-none border border-border bg-card p-4">
      <div className="mb-3">
        <span className="font-mono text-xs text-neutral-500">Scroll depth</span>
      </div>

      {hasData ? (
        <>
          <div className="flex flex-1 flex-col justify-center gap-3">
            {THRESHOLDS.map((threshold) => {
              const count = (scrollDepth?.[`scroll_${threshold}` as keyof ScrollDepthDistribution] as number) ?? 0
              const pct = total > 0 ? (count / total) * 100 : 0
              return (
                <div key={threshold} className="flex items-center gap-3">
                  <span className="w-9 shrink-0 font-mono text-xs tabular-nums text-neutral-500">{threshold}%</span>
                  <div className="relative h-6 flex-1 rounded-none bg-neutral-800/40">
                    {pct > 0 && (
                      <div
                        className="absolute inset-y-0 left-0 rounded-none border-r-2 border-brand-orange bg-brand-orange/20"
                        style={{ width: `${pct}%` }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <span className="w-12 shrink-0 text-right text-sm tabular-nums text-white">{Math.round(pct)}%</span>
                </div>
              )
            })}
          </div>
          <p className="mt-3 font-mono text-xs text-neutral-500">
            {formatNumber(total)} {total === 1 ? 'session' : 'sessions'}
          </p>
        </>
      ) : (
        <EmptyState
          icon={<ArrowLineDown />}
          title="No scrolls recorded yet"
          description="Scroll tracking is automatic — depth data appears once visitors start reading your pages."
          action={{ label: 'Install tracking script', href: '/installation' }}
        />
      )}
    </div>
  )
}

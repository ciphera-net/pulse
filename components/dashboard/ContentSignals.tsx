'use client'

import { useState } from 'react'
import { formatNumber } from '@/lib/utils/format'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import { usePagePreview } from '@/lib/swr/dashboard'
import type { GoalCountStat, ScrollDepthDistribution } from '@/lib/api/stats'
import ScrollDepthBars from './ScrollDepthBars'
import GoalStats from './GoalStats'
import { DimensionInfoTip } from '@/components/dashboard/MetricInfoTip'

// ---------------------------------------------------------------------------
// The Content section's second card in the approved C mockup: scroll depth and
// custom events share one card behind tabs, balancing ContentStats beside it.
// Both are read-only composition — the tab row is the same grammar as every
// other dimension card; the content components render `bare`.
// ---------------------------------------------------------------------------

interface ContentSignalsProps {
  scrollDepth?: ScrollDepthDistribution
  goalCounts: GoalCountStat[]
  siteId: string
  dateRange: { start: string; end: string }
  // The public share surface (02-09-2026): the numbers on this card already
  // ride the floored dashboard payload, but the page-preview capture and the
  // events drill-down hit member-strict endpoints — off means neither fetch
  // ever fires, and the scroll tab renders its rails fallback.
  memberFeatures?: boolean
}

type Tab = 'scroll' | 'events'

export default function ContentSignals({ scrollDepth, goalCounts, siteId, dateRange, memberFeatures = true }: ContentSignalsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('scroll')
  const handleTabKeyDown = useTabListKeyboard()

  // The full-page capture behind the scroll tab's stacked sheets. null =
  // no capture (a state — the tab renders its rails fallback), and a fetch
  // error falls back the same way. Since 02-09-2026 the share surface gets
  // the same backdrop through the public endpoint (is_public sites only) —
  // memberFeatures now routes the fetch instead of suppressing it; only the
  // events drill-down below stays member-gated.
  const { data: pagePreview } = usePagePreview(siteId, memberFeatures)

  const scrollSessions = scrollDepth?.total_sessions ?? 0

  return (
    <div data-tour="dimension-card" data-tour-card="content-signals" className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 min-w-0" role="tablist" aria-label="Content signals tabs" onKeyDown={handleTabKeyDown}>
          {([['scroll', 'Scroll depth'], ['events', 'Events']] as [Tab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              role="tab"
              aria-selected={activeTab === tab}
              className={`relative px-2.5 py-3 sm:py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded-none cursor-pointer ${
                activeTab === tab
                  ? 'text-white'
                  : 'text-neutral-500 hover:text-neutral-300'
              } ease-apple`}
            >
              {label}
              <span
                className={`absolute inset-x-0 -bottom-px h-[3px] rounded-none transition-[width,background-color] duration-base ${
                  activeTab === tab ? 'bg-brand-orange scale-x-100' : 'bg-transparent scale-x-0'
                } ease-apple`}
              />
            </button>
          ))}
        </div>
        <DimensionInfoTip tab={activeTab} className="ms-2 me-auto" />
        {activeTab === 'scroll' && scrollSessions > 0 && (
          <span className="shrink-0 whitespace-nowrap text-[11px] text-neutral-500">
            {formatNumber(scrollSessions)} {scrollSessions === 1 ? 'session' : 'sessions'}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col min-h-[270px]">
        {activeTab === 'scroll' ? (
          <ScrollDepthBars scrollDepth={scrollDepth} preview={pagePreview} bare />
        ) : (
          <GoalStats goalCounts={goalCounts} siteId={siteId} dateRange={dateRange} bare memberFeatures={memberFeatures} />
        )}
      </div>
    </div>
  )
}

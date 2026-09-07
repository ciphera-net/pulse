'use client'

import { useState } from 'react'
import { TopPage } from '@/lib/api/stats'
import { FileText } from '@phosphor-icons/react'
import { ArrowUpRightIcon, Switcher } from '@ciphera-net/facet'
import { EmptyState } from '@/components/ui/EmptyState'
import { useFullDimensionList, type FullListKind } from '@/lib/swr/dashboard'
import { type DimensionFilter } from '@/lib/filters'
import { MetricRowStat, MetricUnitLabel, rowBarWidth } from '@/components/dashboard/MetricRowStat'
import { CardPager, useCardPage } from '@/components/dashboard/CardPager'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { DimensionInfoTip } from '@/components/dashboard/MetricInfoTip'

interface ContentStatsProps {
  topPages: TopPage[]
  entryPages: TopPage[]
  exitPages: TopPage[]
  domain: string
  collectPagePaths?: boolean
  siteId: string
  dateRange: { start: string, end: string }
  // The site's true totals for the range (the same population the rows came
  // from). Percentages divide by THIS, not by the sum of visible rows — the
  // F9 fix: one unit, one denominator, in the card and its modal alike.
  totals?: { pageviews: number; visitors: number }
  // Active page filters, threaded into every fetch this card makes itself
  // (the modal) so a modal opened from a filtered card shows the same
  // population as the card (F14).
  filters?: string
  // The anonymous share surface has no full-list endpoints (member-strict
  // since Phase 0) — hide the affordance rather than show an error for a
  // capability that does not exist there.
  memberFeatures?: boolean
  onFilter?: (filter: DimensionFilter) => void
}

type Tab = 'top_pages' | 'entry_pages' | 'exit_pages'

const LIMIT = 7

const TAB_TO_KIND: Record<Tab, FullListKind> = {
  top_pages: 'pages',
  entry_pages: 'entry-pages',
  exit_pages: 'exit-pages',
}

export default function ContentStats({ topPages, entryPages, exitPages, domain, collectPagePaths = true, siteId, dateRange, totals, filters, memberFeatures = true, onFilter }: ContentStatsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('top_pages')
  const tabs: Tab[] = ['top_pages', 'entry_pages', 'exit_pages']

  // Twin columns (O3, 01-09-2026): the Pages tab shows visitors + views —
  // the one list where the two genuinely diverge (a page is read repeatedly).
  // Entry/exit rows are visit-counts by construction (visitors == pageviews),
  // so a second column there would print the same number twice.
  const twinColumns = activeTab === 'top_pages'

  // Filter out generic "/" entries when page paths are disabled (all traffic shows as "/")
  const filterGenericPaths = (pages: TopPage[]) => {
    if (!collectPagePaths) return []
    // Filter out pages that are just "/" with high traffic (indicator of disabled tracking)
    return pages.filter(p => p.path && p.path !== '')
  }

  const getData = () => {
    switch (activeTab) {
      case 'top_pages':
        return filterGenericPaths(topPages)
      case 'entry_pages':
        return filterGenericPaths(entryPages)
      case 'exit_pages':
        return filterGenericPaths(exitPages)
    }
  }

  const getTabLabel = (tab: Tab) => {
    switch (tab) {
      case 'top_pages': return 'Pages'
      case 'entry_pages': return 'Entries'
      case 'exit_pages': return 'Exits'
    }
  }

  const data = getData()
  const hasData = data && data.length > 0

  // The dashboard fan-out carries only the top 10 — when the active tab
  // overflows the card, fetch the full list once (same endpoint the retired
  // view-all modal used) and paginate it client-side.
  const wantsFullList = memberFeatures && collectPagePaths && data.length > LIMIT
  const { data: fullData } = useFullDimensionList<TopPage>(
    wantsFullList ? TAB_TO_KIND[activeTab] : null,
    siteId, dateRange?.start, dateRange?.end, 100, filters,
  )
  // Gate on wantsFullList: stale hook-state from another range must never
  // outrank the fan-out rows (the frozen-blocks bug, 01-09-2026).
  const fullClean = wantsFullList && fullData ? filterGenericPaths(fullData) : null
  const allData = fullClean && fullClean.length >= data.length ? fullClean : data
  const pageCount = Math.max(1, Math.ceil(allData.length / LIMIT))
  // Page state keys on the context: a tab/filter/range change reads as page 1,
  // and a shrinking list clamps at read time.
  const [page, setPage] = useCardPage(`${activeTab}|${filters ?? ''}|${dateRange?.start}|${dateRange?.end}`, pageCount)

  const displayedData = hasData ? allData.slice((page - 1) * LIMIT, page * LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)

  return (
    <div data-tour="dimension-card" data-tour-card="content" className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
        <div className="flex items-center justify-between mb-4">
          {/* One Facet Switcher for every dimension card (owner pick C0, 06-09-2026);
              the overflow wrapper keeps a narrow card scrollable, as the tab row was. */}
          <div className="min-w-0 overflow-x-auto scrollbar-hide pb-1">
            <Switcher
              size="sm"
              aria-label="Pages view"
              options={tabs.map((tab) => ({ value: tab, label: getTabLabel(tab) }))}
              value={activeTab}
              onChange={(v) => setActiveTab(v as Tab)}
            />
          </div>
          <DimensionInfoTip tab={activeTab} className="ms-2 me-auto" />
          {/* No denominator note in the header (owner call 19-08) — the modal
              keeps its explanation, where search could otherwise mislead. */}
          <div className="flex min-w-0 shrink items-center gap-1.5">
            <MetricUnitLabel views={twinColumns} />
          </div>
        </div>

        <div className="flex-1 min-h-[270px]">
          {!collectPagePaths ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-neutral-400 text-sm">Page path tracking is disabled in site settings</p>
            </div>
          ) : hasData ? (
            <CascadeGroup flipKey={`${activeTab}-${page}`} className="space-y-2">
              {displayedData.map((row, i) => {
                const barWidth = rowBarWidth(row, allData)
                return (
                  // This row cannot become a <button>: it contains a real
                  // "open this page" link, and a link inside a button is
                  // invalid — the control-inside-a-control pattern the info
                  // glyph round removed. It gets keyboard semantics instead,
                  // so it is reachable and operable without a mouse.
                  <CascadeRow key={row.path} index={i}>
                  <div
                    {...(onFilter
                      ? {
                          role: 'button' as const,
                          tabIndex: 0,
                          onClick: () => onFilter({ dimension: 'page', operator: 'is', values: [row.path] }),
                          onKeyDown: (e: React.KeyboardEvent) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return
                            // Space scrolls the page by default; a control must not.
                            e.preventDefault()
                            onFilter({ dimension: 'page', operator: 'is', values: [row.path] })
                          },
                        }
                      : {})}
                    className={`interactive-row relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${onFilter ? ' cursor-pointer' : ''}`}
                  >
                    <RowBar width={barWidth} index={i} />
                    <div className="relative flex-1 truncate text-white flex items-center">
                      <span className="truncate">{row.path}</span>
                      <a
                        href={`https://${domain.replace(/^https?:\/\//, '')}${row.path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="ml-2 flex-shrink-0"
                      >
                        {/* Visible by default on touch: a phone has no hover, so
                            this open-page link was permanently invisible yet
                            still tappable. Bigger and dimmed on mobile, restored
                            to the hover-reveal treatment at md+. */}
                        <ArrowUpRightIcon className="w-4 h-4 opacity-60 md:w-3 md:h-3 md:opacity-0 text-neutral-400 md:group-hover:opacity-100 transition-opacity hover:text-brand-orange ease-apple" />
                      </a>
                    </div>
                    <MetricRowStat row={row} totals={totals} views={twinColumns} />
                  </div>
                  </CascadeRow>
                )
              })}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
              ))}
            </CascadeGroup>
          ) : (
            <EmptyState
              icon={<FileText />}
              title="Waiting for page views"
              description="Your most visited pages will rank here once traffic arrives. Entry and exit pages are tracked automatically."
              action={{ label: 'Install tracking script', href: '/installation' }}
            />
          )}
        </div>

      <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label="pages" />
    </div>
  )
}

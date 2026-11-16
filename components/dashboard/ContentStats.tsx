'use client'

import { ImportedCardNote } from '@/components/dashboard/ImportedCardNote'
import type { GoalCountStat, ImportedProvenance } from '@/lib/api/stats'
import type { ImportedDimension } from '@/lib/import/source-display'
import { useState } from 'react'
import { TopPage } from '@/lib/api/stats'
import { ArrowSquareOut, FileText } from '@phosphor-icons/react'
import { Switcher } from '@ciphera-net/facet'
import CardEmptyState from '@/components/dashboard/CardEmptyState'
import { EmptyState } from '@/components/ui/EmptyState'
import { CardFooter, FRAME_CARD, FRAME_CARD_BODY, useDashboardFrame } from '@/lib/dashboard/frame'
import { useFullDimensionList, type FullListKind } from '@/lib/swr/dashboard'
import { type DimensionFilter } from '@/lib/filters'
import { DIMENSION_ROW, MetricRowStat, MetricUnitLabel, rowBarWidth } from '@/components/dashboard/MetricRowStat'
import { CardPager, useCardPage } from '@/components/dashboard/CardPager'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { DimensionInfoTip } from '@/components/dashboard/MetricInfoTip'
import OutboundLinksTab from '@/components/dashboard/OutboundLinksTab'
import { SortHead, sortRows, type Sort, type SortColumn } from '@/components/dashboard/SortHead'

/** The Pages tab's two columns, which sort its rows in the new frame (R41): the widths of the numbers under them. */
type PageSortKey = 'visitors' | 'views'
const PAGE_COLUMNS: SortColumn<PageSortKey>[] = [
  { key: 'visitors', label: 'visitors', className: 'w-12' },
  { key: 'views', label: 'views', className: 'w-12' },
]

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
  // A customer's share link is served no full-list endpoints (its public-scoped read
  // is a closed list of five routes) — hide the affordance rather than show an error
  // for a capability that does not exist there. The demo site is served them, so it
  // keeps this on.
  memberFeatures?: boolean
  onFilter?: (filter: DimensionFilter) => void
  /** Realtime mode — an empty block reads the one realtime line (CardEmptyState). */
  live?: boolean
  /** Realtime mode's rolling window in minutes (PULSE-192): every list this card fetches on its own uses it instead of the dates. */
  liveMinutes?: number
  /** Each card's imported-history provenance, from the dashboard response (PULSE-118). */
  importedCards?: Record<string, ImportedProvenance>
  /**
   * The new dashboard frame only: Outbound's links are this block's fourth tab (15-11-2026), in place of a block
   * of their own. Given where their read is served (a member's page and the demo); a share link is not served it
   * and gets no tab. Outside the frame it is ignored: today's page keeps its Outbound card.
   */
  outbound?: {
    period?: string
    goalCounts?: GoalCountStat[]
    goalsImported?: ImportedProvenance | null
    /** The site's "Outbound links" option is off. */
    trackingOff?: boolean
  }
}

type Tab = 'top_pages' | 'entry_pages' | 'exit_pages' | 'outbound'
/** The three lists of pages. */
type PageTab = Exclude<Tab, 'outbound'>

/** The dashboard's `imported_cards` key each tab reads (PULSE-118). */
const TAB_DIMENSION: Record<PageTab, ImportedDimension> = { top_pages: 'page', entry_pages: 'entry_page', exit_pages: 'exit_page' }

const LIMIT = 7

const TAB_TO_KIND: Record<PageTab, FullListKind> = {
  top_pages: 'pages',
  entry_pages: 'entry-pages',
  exit_pages: 'exit-pages',
}

export default function ContentStats({ topPages, entryPages, exitPages, domain, collectPagePaths = true, siteId, dateRange, totals, filters, memberFeatures = true, onFilter, live = false, liveMinutes, importedCards, outbound }: ContentStatsProps) {
  const frame = useDashboardFrame()
  const [chosenTab, setActiveTab] = useState<Tab>('top_pages')
  // The Pages tab's order in the frame. Visitors, high to low, is the order the server ranks by.
  const [sort, setSort] = useState<Sort<PageSortKey>>({ key: 'visitors', dir: 'desc' })
  // Outbound is a tab only in the frame, and only where its read is served.
  const hasOutbound = frame && outbound !== undefined
  const tabs: Tab[] = hasOutbound ? ['top_pages', 'entry_pages', 'exit_pages', 'outbound'] : ['top_pages', 'entry_pages', 'exit_pages']
  // A tab that is no longer offered (the page turned into one without the read) falls back to Pages.
  const activeTab: Tab = chosenTab === 'outbound' && !hasOutbound ? 'top_pages' : chosenTab
  const onOutbound = activeTab === 'outbound'
  /** The list of pages the block reads from, whichever tab is open: Outbound is drawn by its own component. */
  const pageTab: PageTab = onOutbound ? 'top_pages' : activeTab

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
    switch (pageTab) {
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
      case 'outbound': return 'Outbound'
    }
  }

  const data = getData()
  const hasData = data && data.length > 0

  // The dashboard fan-out carries only the top 10 — when the active tab
  // overflows the card, fetch the full list once (same endpoint the retired
  // view-all modal used) and paginate it client-side.
  const wantsFullList = !onOutbound && memberFeatures && collectPagePaths && data.length > LIMIT
  const { data: fullData } = useFullDimensionList<TopPage>(
    wantsFullList ? TAB_TO_KIND[pageTab] : null,
    siteId, dateRange?.start, dateRange?.end, 100, filters, liveMinutes,
  )
  // Gate on wantsFullList: stale hook-state from another range must never
  // outrank the fan-out rows (the frozen-blocks bug, 01-09-2026).
  const fullClean = wantsFullList && fullData ? filterGenericPaths(fullData) : null
  const listed = fullClean && fullClean.length >= data.length ? fullClean : data
  // In the frame the Pages tab's two column names sort its rows, high to low and low to high (R41); ties keep the
  // server's order, and the bars keep following visitors. Today's arrangement keeps the server's order.
  const sortable = frame && twinColumns
  const allData = sortable ? sortRows(listed, sort, (row, key) => (key === 'visitors' ? row.visitors ?? 0 : row.pageviews ?? 0)) : listed
  const pageCount = Math.max(1, Math.ceil(allData.length / LIMIT))
  // Page state keys on the context: a tab/filter/range change reads as page 1,
  // and a shrinking list clamps at read time. In the frame a new order does too.
  const [page, setPage] = useCardPage(`${activeTab}|${filters ?? ''}|${dateRange?.start}|${dateRange?.end}|${liveMinutes ?? ''}${sortable ? `|${sort.key}:${sort.dir}` : ''}`, pageCount)

  const displayedData = hasData ? allData.slice((page - 1) * LIMIT, page * LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)

  return (
    <div data-tour="dimension-card" data-tour-card="content" className={frame ? FRAME_CARD : 'bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0'}>
        <div className="flex items-center justify-between mb-4">
          {/* One Facet Switcher for every dimension card (owner pick C0, 06-09-2026);
              the overflow wrapper keeps a narrow card scrollable, as the tab row was. */}
          <div className="min-w-0 overflow-x-auto scrollbar-hide pb-1">
            <Switcher
              size="sm"
              tone="solid"
              aria-label="Pages view"
              options={tabs.map((tab) => ({ value: tab, label: getTabLabel(tab) }))}
              value={activeTab}
              onChange={(v) => setActiveTab(v as Tab)}
            />
          </div>
          <DimensionInfoTip tab={activeTab} className="ms-2 me-auto" />
          {/* No denominator note in the header (owner call 19-08) — the modal
              keeps its explanation, where search could otherwise mislead. */}
          {/* PULSE-172: the "All pages" link retired from this header — the
              Pages view stays reachable from the sidebar. The unit label keeps
              its own right-aligned slot unchanged. */}
          <div className="flex min-w-0 shrink items-center gap-3">
            {onOutbound ? (
              <MetricUnitLabel unit="clicks" />
            ) : sortable ? (
              // The same two columns and gap as MetricUnitLabel's, each name a control.
              <SortHead columns={PAGE_COLUMNS} sort={sort} onSort={setSort} className="gap-2" />
            ) : (
              <MetricUnitLabel views={twinColumns} />
            )}
          </div>
        </div>

        {onOutbound && outbound ? (
          <OutboundLinksTab
            siteId={siteId}
            dateRange={dateRange}
            period={outbound.period}
            goalCounts={outbound.goalCounts}
            goalsImported={outbound.goalsImported}
            filters={filters}
            live={live}
            liveMinutes={liveMinutes}
            trackingOff={outbound.trackingOff}
          />
        ) : (
        <>
        <div className={frame ? FRAME_CARD_BODY : 'flex-1 min-h-[270px]'}>
          {!collectPagePaths ? (
            // Not collected for this site, in Pulse's one empty state (R57); its switch left settings by ruling (R2).
            <EmptyState icon={<FileText />} title="Pages are off" description="This site does not collect page addresses." className="h-full py-6" />
          ) : hasData ? (
            <CascadeGroup flipKey={`${activeTab}-${page}`} className="space-y-2">
              {displayedData.map((row, i) => {
                const barWidth = rowBarWidth(row, allData)
                // The row's one action: its overlay button's, and a press on a number's (which takes the pointer back
                // from the overlay so its exact count can open).
                const filterRow = onFilter ? () => onFilter({ dimension: 'page', operator: 'is', values: [row.path] }) : undefined
                return (
                  <CascadeRow key={row.path} index={i}>
                  {/* The Referrers row's device (PUL-20), ported here (PUL-22):
                     a click anywhere on the row FILTERS, and the page opens from
                     one small icon after the path. The row holds a real link, so
                     it cannot be a <button> (and a role="button" div around a
                     link is the same nesting to a screen reader): it is a <div>
                     with a full-row overlay button for the filter, and the icon
                     above it (relative z-10) opting back into pointer events for
                     its own box only. Everything else is pointer-events-none so
                     clicks reach the overlay. */}
                  <div className={`interactive-row ${DIMENSION_ROW}${onFilter ? ' cursor-pointer' : ''}`}>
                    {onFilter && (
                      <button
                        type="button"
                        className="absolute inset-0 w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
                        aria-label={`Filter by page: ${row.path}`}
                        onClick={filterRow}
                      />
                    )}
                    <RowBar width={barWidth} index={i} className="pointer-events-none" />
                    <div className="relative flex-1 min-w-0 text-white flex items-center gap-3 pointer-events-none">
                      <span className="truncate" title={row.path}>{row.path}</span>
                      {/* Hidden at rest; the row's hover or the icon's own
                          keyboard focus reveals it. Touch has no hover, so it
                          always shows there. p-1 -m-1: a 22 px hit box around a
                          14 px glyph. Orange on its own hover, like every
                          outbound arrow (PUL-22). */}
                      <a
                        href={`https://${domain.replace(/^https?:\/\//, '')}${row.path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${row.path} in a new tab`}
                        className="relative z-10 pointer-events-auto -m-1 shrink-0 rounded-sm p-1 text-neutral-500 opacity-0 transition ease-apple hover:text-brand-ink focus:outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-brand-orange group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <ArrowSquareOut className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                    <MetricRowStat row={row} totals={totals} views={twinColumns} overlay={{ onPress: filterRow }} />
                  </div>
                  </CascadeRow>
                )
              })}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
              ))}
            </CascadeGroup>
          ) : (
            <CardEmptyState
              live={live}
              icon={<FileText />}
              kind="page views"
              fresh="Your pages are listed here by how often they are viewed."
            />
          )}
        </div>

      <CardFooter>
        <ImportedCardNote card={importedCards?.[TAB_DIMENSION[pageTab]]} dimension={TAB_DIMENSION[pageTab]} />
        <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label="pages" />
      </CardFooter>
        </>
        )}
    </div>
  )
}

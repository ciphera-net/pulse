'use client'

import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import ContentStats from '@/components/dashboard/ContentStats'
import Sources from '@/components/dashboard/Sources'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import type { DashboardData } from '@/lib/api/stats'
import { DEFAULT_GEO_DATA_LEVEL } from '@/lib/api/sites'
import type { DashboardCapabilities } from '@/lib/dashboard/capabilities'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'
import type { DimensionFilter } from '@/lib/filters'

const ContentSignals = dynamic(() => import('@/components/dashboard/ContentSignals'))
const DashboardBottom = dynamic(() => import('@/components/dashboard/DashboardBottom'))

// ---------------------------------------------------------------------------
// THE NEW DASHBOARD FRAME (owner rulings of 14-11-2026). Every reader's since 15-11-2026: every team (it was the
// beta `new-dashboard` until then) and the public pages, the demo and a share link.
//
// The same blocks as today's page, arranged anew and told so through DashboardFrameProvider:
//   * tight cards, 12 px apart, and no section titles (R1, R12);
//   * Sources beside Pages, then Locations and Technology, then Events across both columns (R2; Outbound's
//     links became the Pages block's fourth tab on 15-11-2026, so Outbound is no block of its own);
//   * every block ONE size, the map inside it (lib/dashboard/frame.tsx, FRAME_CARD);
//   * the last block is Events alone: scroll depth leaves the dashboard (R5);
//   * under the blocks, what converts beside when people come, then Search, Uptime and Performance as three small
//     overviews (R35, components/dashboard/DashboardBottom.tsx); today's heat map across the page is today's alone;
//   * glass on the deck, the blocks and the bottom (R3, R15).
// The toolbar that stays, the chart's missing bucket picker and the install banner are the surface's
// (components/surfaces/DashboardSurface.tsx), which mounts this in place of its own arrangement.
//
// Today's arrangement is still in the surface, no longer drawn, and this file repeats each block's props: it was
// built that way so no line of the page every customer saw moved to make room for the beta.
// components/dashboard/__tests__/frame-wiring.test.ts pins this file's props as phase3-wiring.test.ts pins the
// surface's. Deleting the surface's arrangement is the next step, and this one remains.
// ---------------------------------------------------------------------------

interface DashboardFrameProps {
  /** The chart deck, built by the surface, which owns the chart's state. Drawn first. */
  deck: ReactNode
  dashboard: DashboardData | undefined
  site: DashboardData['site']
  siteId: string
  caps: DashboardCapabilities
  isLive: boolean
  liveMinutes: number | undefined
  dateRange: { start: string; end: string }
  /** The API period token (1h, 24h, …) for the reads that resolve a rolling window on the server. */
  period: string | undefined
  /** The range's true totals, filtered as the rows are: the one denominator of every block's share. */
  rangeTotals: { pageviews: number; visitors: number }
  previousVisitors: number | null
  filtersParam: string
  onCardFilter: ((filter: DimensionFilter) => void) | undefined
  /** The site's "Outbound links" option is switched off: the Pages block's Outbound tab then says so in place of its rows. */
  outboundOff: boolean
}

export default function DashboardFrame({
  deck,
  dashboard,
  site,
  siteId,
  caps,
  isLive,
  liveMinutes,
  dateRange,
  period,
  rangeTotals: totals,
  previousVisitors,
  filtersParam,
  onCardFilter,
  outboundOff,
}: DashboardFrameProps) {
  return (
    <DashboardFrameProvider>
      <div className="flex flex-col gap-3" data-dashboard-frame="">
        {deck}

        {/* ONE grid for the five blocks: no titles stand between its rows, so nothing has to keep a pair
            together, and below `lg` it is one column in the same order. Outbound is no block of its own any
            more (15-11-2026): its links are the Pages block's fourth tab. */}
        <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
          <Sources
            referrers={dashboard?.top_referrers ?? []}
            channels={dashboard?.channels ?? []}
            collectReferrers={site.collect_referrers ?? true}
            showReferrerDomains={site.show_referrer_domains ?? false}
            siteId={siteId}
            live={isLive}
            liveMinutes={liveMinutes}
            dateRange={dateRange}
            period={period}
            totals={totals}
            filters={filtersParam || undefined}
            onFilter={onCardFilter}
            memberFeatures={caps.fullReads}
            campaigns={caps.fullReads ? undefined : (dashboard?.campaigns ?? [])}
            importedCards={dashboard?.imported_cards}
          />
          <ContentStats
            topPages={dashboard?.top_pages ?? []}
            entryPages={dashboard?.entry_pages ?? []}
            exitPages={dashboard?.exit_pages ?? []}
            domain={site.domain}
            collectPagePaths={site.collect_page_paths ?? true}
            siteId={siteId}
            live={isLive}
            liveMinutes={liveMinutes}
            dateRange={dateRange}
            totals={totals}
            filters={filtersParam || undefined}
            onFilter={onCardFilter}
            memberFeatures={caps.fullReads}
            importedCards={dashboard?.imported_cards}
            // Outbound's links are this block's fourth tab (15-11-2026). A share link is not served their read
            // (event-property reads are outside a public-scoped read) and gets no tab.
            outbound={caps.fullReads ? { period, goalCounts: dashboard?.goal_counts ?? [], goalsImported: dashboard?.imported_goals, trackingOff: outboundOff } : undefined}
          />
          <Audience
            countries={dashboard?.countries ?? []}
            cities={dashboard?.cities ?? []}
            regions={dashboard?.regions ?? []}
            languages={dashboard?.languages ?? []}
            languageGroups={dashboard?.language_groups}
            timezones={dashboard?.timezones ?? []}
            geoDataLevel={site.collect_geo_data || DEFAULT_GEO_DATA_LEVEL}
            collectAudienceData={site.collect_audience_data ?? true}
            siteId={siteId}
            live={isLive}
            liveMinutes={liveMinutes}
            dateRange={dateRange}
            totals={totals}
            previousVisitors={previousVisitors}
            filters={filtersParam || undefined}
            onFilter={onCardFilter}
            memberFeatures={caps.fullReads}
            importedCards={dashboard?.imported_cards}
          />
          <TechSpecs
            browsers={dashboard?.browsers ?? []}
            os={dashboard?.os ?? []}
            devices={dashboard?.devices ?? []}
            screenResolutions={dashboard?.screen_resolutions ?? []}
            collectDeviceInfo={site.collect_device_info ?? true}
            collectScreenResolution={site.collect_screen_resolution ?? true}
            siteId={siteId}
            live={isLive}
            liveMinutes={liveMinutes}
            dateRange={dateRange}
            totals={totals}
            filters={filtersParam || undefined}
            onFilter={onCardFilter}
            memberFeatures={caps.fullReads}
            importedCards={dashboard?.imported_cards}
          />
          {/* Events alone (the block switches its scroll depth tab off inside the frame). The scroll depth
              numbers still arrive on the payload and are simply not handed on. It is the fifth block, so it
              closes the grid across both columns. It takes the totals for its conversion: an event's visitors
              over the range's visitors, the denominator every block's share has. */}
          <div className="lg:col-span-2" data-frame-events="">
            <ContentSignals
              goalCounts={dashboard?.goal_counts ?? []}
              goalsImported={dashboard?.imported_goals}
              siteId={siteId}
              dateRange={dateRange}
              liveMinutes={liveMinutes}
              totals={totals}
              memberFeatures={caps.fullReads}
              filters={filtersParam || undefined}
            />
          </div>
        </div>

        {/* The bottom: what converts beside the week, then three overviews (R35). Not in realtime (one instant has
            no week to draw, and no funnel worth a rate) and not on a share link, which is served neither hour
            buckets nor any of the bottom's own reads. */}
        {!isLive && caps.hourlyBuckets && caps.fullReads && (
          <DashboardBottom siteId={siteId} dateRange={dateRange} period={period} filters={filtersParam || undefined} />
        )}
      </div>
    </DashboardFrameProvider>
  )
}

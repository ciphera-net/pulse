'use client'

import ConversionBlock from '@/components/dashboard/bottom/ConversionBlock'
import WeekHeat from '@/components/dashboard/bottom/WeekHeat'
import { PerformanceTile, SearchTile, UptimeTile } from '@/components/dashboard/bottom/OverviewTiles'

// ---------------------------------------------------------------------------
// THE BOTTOM OF THE NEW DASHBOARD (owner ruling R35 of 15-11-2026: "the pair with the three tiles", the heat map
// "Headline"). It stands where the frame drew the heat map across the page:
//
//   row 1  what converts (Funnels and Journeys as tabs)  |  when people come, at half width
//   row 2  Search | Uptime | Performance, three small overviews of how the site is doing
//
// Both rows are rows of the frame's own column, 12 px apart like every other row of the page. Three tiles stand
// across from 1,280 px. Under it a third of the page is too narrow for the four dials with their names, so Search
// and Uptime share a row and Performance takes the next one.
//
// The frame draws it for a member and for the demo, and not in realtime (an instant has no week, and no funnel
// worth a rate), nor on a share link (which is served none of these reads).
// ---------------------------------------------------------------------------

interface DashboardBottomProps {
  siteId: string
  dateRange: { start: string; end: string }
  /** The API period token for a window the server resolves (today, 24h). */
  period?: string
  /** The page's filters, as the page sends them. */
  filters?: string
}

export default function DashboardBottom({ siteId, dateRange, period, filters }: DashboardBottomProps) {
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0" data-dashboard-bottom="pair">
        <ConversionBlock siteId={siteId} dateRange={dateRange} period={period} filters={filters} />
        <WeekHeat siteId={siteId} dateRange={dateRange} filters={filters} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0" data-dashboard-bottom="tiles">
        <SearchTile siteId={siteId} dateRange={dateRange} />
        <UptimeTile siteId={siteId} dateRange={dateRange} period={period} />
        <PerformanceTile siteId={siteId} />
      </div>
    </>
  )
}

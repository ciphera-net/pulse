'use client'
// Every widget the dashboard can hold (PUL-88): the chart, the five blocks, the pair under them and the overviews as
// they are today, plus the small tiles. Each one renders the app's REAL component with the props the frame gives it
// (components/surfaces/DashboardFrame.tsx), so a widget is the block a customer already knows. Pinned against the
// frame's props by components/dashboard/__tests__/frame-wiring.test.ts.
import type { ComponentType, ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { ArrowSquareIn, Broadcast, CalendarDots, ChartLine, Hash, CardsThree, CursorClick, Desktop, Gauge, GlobeHemisphereWest } from '@phosphor-icons/react'
import { CloudUploadIcon, FunnelIcon, HeartbeatIcon, SearchIcon } from '@ciphera-net/facet'
import ContentStats from '@/components/dashboard/ContentStats'
import Sources from '@/components/dashboard/Sources'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import ConversionBlock from '@/components/dashboard/bottom/ConversionBlock'
import WeekHeat from '@/components/dashboard/bottom/WeekHeat'
import { PerformanceTile, SearchTile, UptimeTile } from '@/components/dashboard/bottom/OverviewTiles'
import type { DashboardData } from '@/lib/api/stats'
import { DEFAULT_GEO_DATA_LEVEL } from '@/lib/api/sites'
import type { DashboardCapabilities } from '@/lib/dashboard/capabilities'
import type { DimensionFilter } from '@/lib/filters'
import { ChartPicker } from './ChartPicker'
import { CompactBlock } from './compact'
import { KeyNumbers } from './keyNumbers'
import { CdnTile, FunnelsTile, LiveTile } from './tiles'
import type { Placed, WidgetSize } from './store'

const ContentSignals = dynamic(() => import('@/components/dashboard/ContentSignals'))

/** What the frame is given today, minus the chart deck: every widget draws from it. */
export interface FrameCtx {
  /** The chart deck the surface builds (KPI rail and chart). */
  deck?: ReactNode
  dashboard: DashboardData | undefined
  site: DashboardData['site']
  siteId: string
  caps: DashboardCapabilities
  isLive: boolean
  liveMinutes: number | undefined
  dateRange: { start: string; end: string }
  period: string | undefined
  rangeTotals: { pageviews: number; visitors: number }
  previousVisitors: number | null
  filtersParam: string
  onCardFilter: ((filter: DimensionFilter) => void) | undefined
  outboundOff: boolean
}

export interface WidgetDef {
  id: string
  name: string
  /** One line in the gallery: what the widget answers. */
  blurb: string
  icon: ComponentType<{ className?: string }>
  /** Blocks are today's dashboard; pages are the small widgets of the pages in the sidebar. */
  group: 'blocks' | 'pages'
  sizes: WidgetSize[]
  size: WidgetSize
  /** May be on the dashboard more than once (the Funnels widget, one per funnel). */
  multi?: boolean
  /** False where today's frame does not draw it (realtime, a share link): the widget keeps its place and draws nothing. */
  shown?: (c: FrameCtx) => boolean
  render: (c: FrameCtx, size: WidgetSize, placed?: Placed) => ReactNode
}

const bottomShown = (c: FrameCtx) => !c.isLive && c.caps.hourlyBuckets && c.caps.fullReads

export const WIDGETS: WidgetDef[] = [
  {
    id: 'chart', name: 'Chart', blurb: 'The key numbers and the chart over time. The smaller sizes show the chart alone.', icon: ChartLine, group: 'blocks', sizes: ['xl', 'l', 'm'], size: 'xl',
    render: (c, size) => (
      <div className="relative h-full overflow-hidden" data-chart-variant={size}>
        {c.deck}
        {(size === 'l' || size === 'm') && <ChartPicker deck={c.deck} />}
      </div>
    ),
  },
  {
    id: 'numbers', name: 'Key numbers', blurb: 'Visitors, pageviews, pages a visit, bounce rate and visit duration, each with its trend. Small shows the one you pick.', icon: Hash, group: 'blocks', sizes: ['s', 'l', 'row'], size: 'row',
    render: (c, size, placed) => <KeyNumbers ctx={c} size={size} placed={placed} />,
  },
  {
    id: 'sources', name: 'Sources', blurb: 'Where visitors come from: channels, referrers and campaigns.', icon: ArrowSquareIn, group: 'blocks', sizes: ['s', 'm', 'l', 'row'], size: 'l',
    render: (c) => (
      <Sources
        referrers={c.dashboard?.top_referrers ?? []}
        channels={c.dashboard?.channels ?? []}
        collectReferrers={c.site.collect_referrers ?? true}
        showReferrerDomains={c.site.show_referrer_domains ?? false}
        siteId={c.siteId}
        live={c.isLive}
        liveMinutes={c.liveMinutes}
        dateRange={c.dateRange}
        period={c.period}
        totals={c.rangeTotals}
        filters={c.filtersParam || undefined}
        onFilter={c.onCardFilter}
        memberFeatures={c.caps.fullReads}
        campaigns={c.caps.fullReads ? undefined : (c.dashboard?.campaigns ?? [])}
        importedCards={c.dashboard?.imported_cards}
      />
    ),
  },
  {
    id: 'pages', name: 'Pages', blurb: 'The pages people read, enter on and leave from.', icon: CardsThree, group: 'blocks', sizes: ['s', 'm', 'l', 'row'], size: 'l',
    render: (c) => (
      <ContentStats
        topPages={c.dashboard?.top_pages ?? []}
        entryPages={c.dashboard?.entry_pages ?? []}
        exitPages={c.dashboard?.exit_pages ?? []}
        domain={c.site.domain}
        collectPagePaths={c.site.collect_page_paths ?? true}
        siteId={c.siteId}
        live={c.isLive}
        liveMinutes={c.liveMinutes}
        dateRange={c.dateRange}
        totals={c.rangeTotals}
        filters={c.filtersParam || undefined}
        onFilter={c.onCardFilter}
        memberFeatures={c.caps.fullReads}
        importedCards={c.dashboard?.imported_cards}
        outbound={c.caps.fullReads ? { period: c.period, goalCounts: c.dashboard?.goal_counts ?? [], goalsImported: c.dashboard?.imported_goals, trackingOff: c.outboundOff } : undefined}
      />
    ),
  },
  {
    id: 'locations', name: 'Locations', blurb: 'Countries, regions, cities and languages, with the map.', icon: GlobeHemisphereWest, group: 'blocks', sizes: ['s', 'm', 'l', 'row'], size: 'l',
    render: (c) => (
      <Audience
        countries={c.dashboard?.countries ?? []}
        cities={c.dashboard?.cities ?? []}
        regions={c.dashboard?.regions ?? []}
        languages={c.dashboard?.languages ?? []}
        languageGroups={c.dashboard?.language_groups}
        timezones={c.dashboard?.timezones ?? []}
        geoDataLevel={c.site.collect_geo_data || DEFAULT_GEO_DATA_LEVEL}
        collectAudienceData={c.site.collect_audience_data ?? true}
        siteId={c.siteId}
        live={c.isLive}
        liveMinutes={c.liveMinutes}
        dateRange={c.dateRange}
        totals={c.rangeTotals}
        previousVisitors={c.previousVisitors}
        filters={c.filtersParam || undefined}
        onFilter={c.onCardFilter}
        memberFeatures={c.caps.fullReads}
        importedCards={c.dashboard?.imported_cards}
      />
    ),
  },
  {
    id: 'technology', name: 'Technology', blurb: 'Browsers, systems, devices and screen sizes.', icon: Desktop, group: 'blocks', sizes: ['s', 'm', 'l', 'row'], size: 'l',
    render: (c) => (
      <TechSpecs
        browsers={c.dashboard?.browsers ?? []}
        os={c.dashboard?.os ?? []}
        devices={c.dashboard?.devices ?? []}
        screenResolutions={c.dashboard?.screen_resolutions ?? []}
        collectDeviceInfo={c.site.collect_device_info ?? true}
        collectScreenResolution={c.site.collect_screen_resolution ?? true}
        siteId={c.siteId}
        live={c.isLive}
        liveMinutes={c.liveMinutes}
        dateRange={c.dateRange}
        totals={c.rangeTotals}
        filters={c.filtersParam || undefined}
        onFilter={c.onCardFilter}
        memberFeatures={c.caps.fullReads}
        importedCards={c.dashboard?.imported_cards}
      />
    ),
  },
  {
    id: 'events', name: 'Events', blurb: 'Custom events, goals and their properties.', icon: CursorClick, group: 'blocks', sizes: ['s', 'm', 'row', 'xl'], size: 'xl',
    render: (c) => (
      <ContentSignals
        goalCounts={c.dashboard?.goal_counts ?? []}
        goalsImported={c.dashboard?.imported_goals}
        siteId={c.siteId}
        dateRange={c.dateRange}
        period={c.period}
        liveMinutes={c.liveMinutes}
        totals={c.rangeTotals}
        memberFeatures={c.caps.fullReads}
        filters={c.filtersParam || undefined}
        onFilter={c.onCardFilter}
      />
    ),
  },
  {
    id: 'conversion', name: 'Funnels and Journeys', blurb: 'What converts: your top funnel and the paths people take.', icon: FunnelIcon, group: 'blocks', sizes: ['l', 'xl'], size: 'l', shown: bottomShown,
    render: (c) => <ConversionBlock siteId={c.siteId} dateRange={c.dateRange} period={c.period} filters={c.filtersParam || undefined} />,
  },
  {
    id: 'week', name: 'When people come', blurb: 'Visits by weekday and hour, as a heat map.', icon: CalendarDots, group: 'blocks', sizes: ['l', 'xl'], size: 'l', shown: bottomShown,
    render: (c) => <WeekHeat siteId={c.siteId} dateRange={c.dateRange} filters={c.filtersParam || undefined} />,
  },
  {
    id: 'search', name: 'Search clicks', blurb: 'Clicks from Google, impressions and average position.', icon: SearchIcon, group: 'pages', sizes: ['s', 'm'], size: 's', shown: bottomShown,
    render: (c) => <SearchTile siteId={c.siteId} dateRange={c.dateRange} />,
  },
  {
    id: 'uptime', name: 'Uptime', blurb: 'Whether the site is up, and a bar for every day.', icon: HeartbeatIcon, group: 'pages', sizes: ['s', 'm'], size: 's', shown: bottomShown,
    render: (c) => <UptimeTile siteId={c.siteId} dateRange={c.dateRange} period={c.period} />,
  },
  {
    id: 'performance', name: 'Performance', blurb: 'The four scores of the last check on a phone.', icon: Gauge, group: 'pages', sizes: ['m'], size: 'm', shown: bottomShown,
    render: (c) => <PerformanceTile siteId={c.siteId} />,
  },
  {
    id: 'funnels', name: 'Funnels', blurb: 'One funnel of your choice: how many make it from the first step to the last.', icon: FunnelIcon, group: 'pages', sizes: ['s', 'm'], size: 's', shown: bottomShown, multi: true,
    render: (c, _size, placed) => <FunnelsTile siteId={c.siteId} dateRange={c.dateRange} period={c.period} filters={c.filtersParam || undefined} funnelId={placed?.funnel} />,
  },
  {
    id: 'cdn', name: 'CDN', blurb: 'Bandwidth served, the share from cache, and requests.', icon: CloudUploadIcon, group: 'pages', sizes: ['s', 'm'], size: 's', shown: bottomShown,
    render: (c) => <CdnTile siteId={c.siteId} dateRange={c.dateRange} period={c.period} />,
  },
  {
    id: 'live', name: 'Visitors now', blurb: 'How many people are on the site right now.', icon: Broadcast, group: 'pages', sizes: ['s', 'm'], size: 's', shown: (c) => c.caps.hourlyBuckets && c.caps.fullReads,
    render: (c) => <LiveTile siteId={c.siteId} />,
  },
]

// A block's smaller sizes are its compact form (compact.tsx); Large (and Events' tall full width) is the block itself.
for (const w of WIDGETS) {
  if (!['sources', 'pages', 'locations', 'technology', 'events'].includes(w.id)) continue
  const block = w.render
  const own: WidgetSize = w.id === 'events' ? 'xl' : 'l'
  w.render = (c, size, placed) => (size === own ? block(c, size, placed) : <CompactBlock blockId={w.id} ctx={c} size={size} placed={placed} />)
}

const BY_ID = new Map(WIDGETS.map((w) => [w.id, w]))
/** A widget by a placed id: `funnels:2` is the second Funnels widget, the same definition. */
export const WIDGET = { get: (id: string) => BY_ID.get(id.split(':')[0]) }
export const baseId = (id: string) => id.split(':')[0]

export const SIZE_NAME: Record<WidgetSize, string> = { s: 'Small', m: 'Wide', l: 'Large', xl: 'Full width', row: 'Full width' }
/** A size's name for one widget: where it has both full widths (Events), the two-row one is "Full, tall". */
export function sizeName(def: WidgetDef, z: WidgetSize): string {
  return z === 'xl' && def.sizes.includes('row') ? 'Full, tall' : SIZE_NAME[z]
}

/**
 * The grid: four columns from 1,024 px, two from 640 px, one on a phone; every row 215 px, so a block (two rows and the
 * gap between them) is today's 442 px, and two small widgets stacked beside it fill its height exactly.
 */
export const GRID = 'grid grid-flow-row-dense grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 auto-rows-[215px]'
export const SPAN: Record<WidgetSize, string> = {
  s: 'col-span-1 row-span-1',
  m: 'col-span-1 sm:col-span-2 row-span-1',
  l: 'col-span-1 sm:col-span-2 row-span-2',
  xl: 'col-span-1 sm:col-span-2 lg:col-span-4 row-span-2',
  row: 'col-span-1 sm:col-span-2 lg:col-span-4 row-span-1',
}

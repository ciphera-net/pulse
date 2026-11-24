'use client'
// The small widgets of the pages (PUL-88): Funnels, CDN and Visitors now in a tile, drawn in the overview tiles' own
// grammar (components/dashboard/bottom/OverviewTiles.tsx: an icon and a name, a state or a change on the right, one
// figure, a line of context, the page's own marks along the floor). `Tile` is not exported there, so its markup is
// repeated here, unchanged but for the height, which is the grid cell's.
import type { ComponentType, ReactNode } from 'react'
import Link from 'next/link'
import { Broadcast } from '@phosphor-icons/react'
import { CloudUploadIcon, FunnelIcon } from '@ciphera-net/facet'
import { RailDelta } from '@/components/funnels/FunnelRail'
import { Sparkline } from '@/components/ui/sparkline'
import { fmtBytes, fmtHitRate } from '@/components/cdn/cdnMetrics'
import { FRAME_SURFACE } from '@/lib/dashboard/frame'
import { memberScope, scopeHref, servesPage, useOptionalSiteScope, type SitePage } from '@/lib/scope/SiteScope'
import { useBunnyDailyStats, useBunnyOverview, useBunnyStatus, useDailyStats, useFunnelListStats, useFunnels, useRealtime, useStats } from '@/lib/swr/dashboard'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { DIMENSION_ROW, MetricRowStat } from '@/components/dashboard/MetricRowStat'
import { formatCompactNumber } from '@/lib/utils/format'
import { pctChange } from '@/lib/utils/pctChange'

type Icon = ComponentType<{ className?: string }>

interface TileProps {
  page: SitePage
  siteId: string
  icon: Icon
  label: string
  right?: ReactNode
  value?: ReactNode
  context?: ReactNode
  floor?: ReactNode
}

function Tile({ page, siteId, icon: TileIcon, label, right, value, context, floor }: TileProps) {
  const scope = useOptionalSiteScope() ?? memberScope(siteId)
  if (!servesPage(scope, page)) return null
  return (
    <Link
      href={scopeHref(scope, page)}
      className={`${FRAME_SURFACE} group relative flex h-full min-h-[164px] min-w-0 flex-col overflow-hidden px-6 pt-5 transition-colors duration-fast ease-apple hover:border-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange`}
      data-overview-tile={page}
    >
      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[13px] text-neutral-400 transition-colors duration-fast ease-apple group-hover:text-white">
          <TileIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        {right}
      </div>
      {value !== undefined && <div className="relative z-10 mt-0.5 text-xl font-semibold tabular-nums text-white" data-tile-value="">{value}</div>}
      {context !== undefined && <div className="relative z-10 mt-0.5 truncate text-[11px] text-neutral-500" data-tile-context="">{context}</div>}
      {floor}
    </Link>
  )
}

const dash = <span className="text-neutral-600">—</span>
const blank = ' '
/** The rows a one-row tile holds under its name. */
const ROWS = 3

interface Own { siteId: string; dateRange: { start: string; end: string }; period?: string; filters?: string }

/** Funnels: the funnel most visitors enter, its rate from the first step to the last, and its steps along the floor. */
export function FunnelsTile({ siteId, dateRange, period, filters, funnelId }: Own & { funnelId?: string }) {
  const { data: funnels } = useFunnels(siteId)
  const { data: stats } = useFunnelListStats(siteId, dateRange.start, dateRange.end, filters, period)
  const ranked = funnels && stats
    ? funnels
      .map((funnel) => ({ funnel, steps: stats[funnel.id]?.steps ?? [] }))
      .sort((a, b) => (b.steps[0]?.visitors ?? 0) - (a.steps[0]?.visitors ?? 0))
    : null
  // The funnel this widget was set to (Customize mode); else the one most visitors enter, as the Funnels and Journeys
  // block opens on. A funnel deleted since falls back the same way.
  const top = ranked?.find((r) => r.funnel.id === funnelId) ?? ranked?.[0] ?? null
  const shown = top ? (top.steps.length <= ROWS ? top.steps.map((s, i) => ({ s, n: i + 1 })) : [0, top.steps.length - 2, top.steps.length - 1].map((i) => ({ s: top.steps[i], n: i + 1 }))) : []
  const entered = top?.steps[0]?.visitors ?? 0
  const finished = top?.steps[top.steps.length - 1]?.visitors ?? 0
  const rate = entered > 0 ? (finished / entered) * 100 : null
  const none = !!ranked && ranked.length === 0
  return (
    <Tile
      page="funnels"
      siteId={siteId}
      icon={FunnelIcon}
      label="Funnels"
      right={top ? <span className="min-w-0 truncate text-[11px] text-neutral-500">{top.funnel.name}</span> : null}
      value={rate === null ? dash : `${rate.toFixed(rate >= 10 ? 0 : 1)}%`}
      context={none ? 'This site has no funnel yet.' : undefined}
      floor={top && entered > 0 ? (
        <div className="relative z-10 mt-3" data-funnel-steps="">
          <CascadeGroup flipKey={top.funnel.id} className="space-y-2">
            {shown.map(({ s: step, n }, i) => (
              <CascadeRow key={n} index={i}>
                <div className={`interactive-row ${DIMENSION_ROW}`}>
                  <RowBar width={(step.visitors / entered) * 75} index={i} />
                  <div className="relative flex min-w-0 flex-1 items-center gap-3 truncate text-white">
                    <span className="w-4 shrink-0 text-right text-sm text-neutral-500">{n}</span>
                    <span className="truncate">{step.step.name}</span>
                  </div>
                  <MetricRowStat row={{ visitors: step.visitors, pageviews: step.visitors } as never} totals={{ visitors: entered, pageviews: entered }} />
                </div>
              </CascadeRow>
            ))}
          </CascadeGroup>
        </div>
      ) : null}
    />
  )
}

/** CDN: what the edge served in the range against the range before, the share served from cache, the daily trace. */
export function CdnTile({ siteId, dateRange, period }: Own) {
  const { data: status } = useBunnyStatus(siteId)
  const connected = status?.connected === true
  const { data: overview } = useBunnyOverview(connected ? siteId : '', dateRange.start, dateRange.end, period)
  const { data: daily } = useBunnyDailyStats(connected ? siteId : '', dateRange.start, dateRange.end, period)
  const series = (daily?.daily_stats ?? []).map((d) => d.bandwidth_used)
  const off = status !== undefined && !connected
  return (
    <Tile
      page="cdn"
      siteId={siteId}
      icon={CloudUploadIcon}
      label="CDN bandwidth"
      right={overview ? <RailDelta change={pctChange(overview.total_bandwidth, overview.prev_total_bandwidth)} /> : null}
      value={overview ? fmtBytes(overview.total_bandwidth) : dash}
      context={off ? 'Bunny is not connected.' : overview ? `${fmtHitRate(overview.cache_hit_rate)} from cache · ${formatCompactNumber(overview.total_requests)} requests` : blank}
      floor={series.length > 1 ? (
        <Sparkline values={series} active={false} restHoverInk height={44} padBottom={2} className="absolute inset-x-0 bottom-0 z-0 h-12 w-full opacity-40 transition-opacity duration-base ease-apple group-hover:opacity-70" />
      ) : null}
    />
  )
}

export function LiveTile({ siteId }: { siteId: string }) {
  const { data } = useRealtime(siteId)
  const { data: hours } = useDailyStats(siteId, '', '', 'hour', undefined, 'today')
  const { data: todayStats } = useStats(siteId, '', '', undefined, 'today')
  const series = (hours ?? []).map((h) => h.visitors)
  // Today's unique visitors as the server counts them: a sum of the hours would count a person once an hour.
  const today = todayStats?.visitors ?? null
  return (
    <Tile
      page="dashboard"
      siteId={siteId}
      icon={Broadcast}
      label="Visitors now"
      right={<span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-neutral-300"><span className="h-1.5 w-1.5 rounded-full bg-brand-orange" aria-hidden="true" />Live</span>}
      value={data ? formatCompactNumber(data.visitors) : dash}
      context={data ? `in the last 5 minutes${today !== null ? ` · ${formatCompactNumber(today)} today` : ''}` : blank}
      floor={series.length > 1 ? (
        <Sparkline values={series} active={false} restHoverInk height={44} padBottom={2} className="absolute inset-x-0 bottom-0 z-0 h-12 w-full opacity-40 transition-opacity duration-base ease-apple group-hover:opacity-70" />
      ) : null}
    />
  )
}

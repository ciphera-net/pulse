'use client'

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import Link from 'next/link'
import { Gauge } from '@phosphor-icons/react'
import { HeartbeatIcon, SearchIcon } from '@ciphera-net/facet'
import { RailDelta } from '@/components/funnels/FunnelRail'
import ScoreGauge from '@/components/performance/ScoreGauge'
import { Sparkline } from '@/components/ui/sparkline'
import { UPTIME_DEGRADED, UPTIME_NEG, UPTIME_POS } from '@/components/uptime/uptimeMetrics'
import { FRAME_SURFACE } from '@/lib/dashboard/frame'
import { memberScope, scopeHref, servesPage, useOptionalSiteScope, type SitePage } from '@/lib/scope/SiteScope'
import { useGSCDailyTotals, useGSCOverview, useGSCStatus, usePerformanceConfig, usePerformanceLatest, useUptimeStatus } from '@/lib/swr/dashboard'
import { formatCompactNumber } from '@/lib/utils/format'
import { pctChange } from '@/lib/utils/pctChange'

// ---------------------------------------------------------------------------
// HOW THE SITE IS DOING: three small overviews under the dashboard's blocks (the new frame's bottom, owner ruling
// R35 of 15-11-2026), in the chart rail's own language: an icon and a name, a state or a change, one figure, a
// line of context, and the page's own marks along the floor. Each is a link to its page, so a press anywhere on a
// tile, on a candle or on a dial, opens the page behind it.
//   Search       clicks from Google against the range before; impressions and position; the daily trace
//   Uptime       the range's uptime, its state in a dot and a word; the Uptime page's own candles, one a day
//   Performance  the Performance page's own four dials, from the last check on a phone (the page's default)
//
// None of the three counts visitors, so none follows the page's filters: a monitor checks the site, a search
// click is Google's count, a dial is a lab run. A tile for something that is not set up says so in a sentence and
// still opens its page, which is where it is set up. A tile never states a figure it has not been given.
// ---------------------------------------------------------------------------

type Icon = ComponentType<{ className?: string }>

interface TileProps {
  page: SitePage
  siteId: string
  icon: Icon
  label: string
  right?: ReactNode
  /** The figure and its line of context; a tile that is all marks (Performance) has neither. */
  value?: ReactNode
  context?: ReactNode
  floor?: ReactNode
  className?: string
}

/** 164 px: what four of the Performance page's dials need under a tile's name. */
function Tile({ page, siteId, icon: TileIcon, label, right, value, context, floor, className = '' }: TileProps) {
  const scope = useOptionalSiteScope() ?? memberScope(siteId)
  // A page this reader is not served has no tile: a link must lead somewhere.
  if (!servesPage(scope, page)) return null
  return (
    <Link
      href={scopeHref(scope, page)}
      className={`${FRAME_SURFACE} group relative flex h-[164px] min-w-0 flex-col overflow-hidden px-6 pt-5 transition-colors duration-fast ease-apple hover:border-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange ${className}`}
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

/** No figure: a dash, never a zero. */
const dash = <span className="text-neutral-600">—</span>
/** A line that keeps its height while its text is on the way. */
const blank = ' '

interface TileOwnProps { siteId: string; dateRange: { start: string; end: string }; period?: string }

export function SearchTile({ siteId, dateRange }: TileOwnProps) {
  const { data: status } = useGSCStatus(siteId)
  const connected = status?.connected === true
  // Nothing is asked of a site with no connection: the read would only refuse.
  const { data: overview } = useGSCOverview(connected ? siteId : '', dateRange.start, dateRange.end)
  const { data: daily } = useGSCDailyTotals(connected ? siteId : '', dateRange.start, dateRange.end)
  const series = (daily?.daily_totals ?? []).map((day) => day.clicks)
  const off = status !== undefined && !connected
  return (
    <Tile
      page="search"
      siteId={siteId}
      icon={SearchIcon}
      label="Search clicks"
      right={overview ? <RailDelta change={pctChange(overview.total_clicks, overview.prev_clicks)} /> : null}
      value={overview ? formatCompactNumber(overview.total_clicks) : dash}
      context={off
        ? 'Search Console is not connected.'
        : overview
          ? `${formatCompactNumber(overview.total_impressions)} impressions · position ${overview.avg_position.toFixed(1)}`
          : blank}
      floor={series.length > 1 ? (
        <Sparkline values={series} active={false} restHoverInk height={44} padBottom={2} className="absolute inset-x-0 bottom-0 z-0 h-12 w-full opacity-40 transition-opacity duration-base ease-apple group-hover:opacity-70" />
      ) : null}
    />
  )
}

const STATE: Record<string, { word: string; dot: string }> = {
  operational: { word: 'Operational', dot: 'bg-green-400' },
  degraded: { word: 'Degraded', dot: 'bg-brand-orange' },
  down: { word: 'Down', dot: 'bg-red-400' },
}

interface Day { date: string; total_checks: number; failed_checks: number; degraded_checks: number }

/**
 * The Uptime page's candles (components/uptime/UptimePanel.tsx, its availability strip): one state bar a day, all
 * one height, in the page's own colours and by its own rule. A day with a failed check is red, a day with a slow
 * one amber, a day with no check the grid's grey, and every other day green at three quarters, full while the
 * pointer is on the tile. A bar is 72% of its slot, as on the page.
 */
function Candles({ days }: { days: Day[] }) {
  return (
    <svg className="absolute inset-x-6 bottom-4 z-0 h-10 w-[calc(100%-3rem)]" viewBox={`0 0 ${days.length} 1`} preserveAspectRatio="none" aria-hidden="true" data-candles="">
      {days.map((day, i) => {
        const none = day.total_checks === 0
        const state = none ? 'none' : day.failed_checks > 0 ? 'down' : day.degraded_checks > 0 ? 'degraded' : 'up'
        const fill = state === 'none' ? 'var(--chart-grid)' : state === 'down' ? UPTIME_NEG : state === 'degraded' ? UPTIME_DEGRADED : UPTIME_POS
        return (
          <rect
            key={day.date}
            x={i + 0.14}
            y={0}
            width={0.72}
            height={1}
            fill={fill}
            className={state === 'up' ? 'opacity-75 transition-opacity duration-base ease-apple group-hover:opacity-100' : undefined}
            data-candle={state}
          />
        )
      })}
    </svg>
  )
}

export function UptimeTile({ siteId, dateRange, period }: TileOwnProps) {
  const { data: uptime } = useUptimeStatus(siteId, dateRange.start, dateRange.end, period)
  const monitors = uptime?.monitors ?? []
  // No monitor is not 100%: the read answers 100 with nothing to check, and the tile says there is no monitor.
  const none = !!uptime && (uptime.total_monitors === 0 || monitors.length === 0)
  const days: Day[] = monitors[0]?.daily_stats ?? []
  const checks = days.reduce((n, day) => n + day.total_checks, 0)
  const ms = checks > 0
    ? Math.round((monitors[0]?.daily_stats ?? []).reduce((n, day) => n + day.avg_response_time_ms * day.total_checks, 0) / checks)
    : null
  const state = uptime ? STATE[uptime.status] : null
  return (
    <Tile
      page="uptime"
      siteId={siteId}
      icon={HeartbeatIcon}
      label="Uptime"
      right={uptime && !none && state ? (
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-neutral-300">
          <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} aria-hidden="true" />
          {state.word}
        </span>
      ) : null}
      value={!uptime || none ? dash : `${uptime.overall_uptime.toFixed(uptime.overall_uptime === 100 ? 0 : 2)}%`}
      context={!uptime
        ? blank
        : none
          ? 'This site has no monitor yet.'
          : `${uptime.total_monitors} monitor${uptime.total_monitors === 1 ? '' : 's'}${ms !== null ? ` · ${ms} ms on average` : ''}`}
      floor={!none && days.length > 0 ? <Candles days={days} /> : null}
    />
  )
}

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`
}

const DIAL = 80
const DIAL_GAP = 8
/**
 * The Performance page's four dials, as wide as the tile lets them be. A dial is the page's own at 80 px (forty
 * notches, the score in its band's colour), and four of them with their names need about 330 px. A tile is a third
 * of the page, which leaves a member on a laptop about 290 px, so the row measures itself and draws the same dial
 * smaller: scaled, not redrawn, so it is the page's dial at every width. The names are plain small text: spaced
 * like the page's own label, "Performance" and "Accessibility" ran into each other under dials of 61 px. Under
 * 1,280 px three tiles across leave no room for four named dials, so there the tile takes a row of its own
 * (DashboardBottom) and the dials keep to its left.
 */
function Dials({ dials }: { dials: [string, number | null][] }) {
  const row = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = row.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const fit = () => setScale(Math.max(0.5, Math.min(1, (el.clientWidth - 3 * DIAL_GAP) / 4 / DIAL)))
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  return (
    <div ref={row} className="relative z-10 mt-2 grid max-w-[440px] grid-cols-4" style={{ columnGap: DIAL_GAP }} data-dials="">
      {dials.map(([name, score]) => (
        <div key={name} className="flex min-w-0 flex-col items-center gap-1" data-dial={name}>
          <div style={{ width: DIAL * scale, height: DIAL * scale }}>
            <div style={{ width: DIAL, height: DIAL, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <ScoreGauge score={score} label="" size={DIAL} />
            </div>
          </div>
          <span className="max-w-full text-center text-[11px] font-medium leading-[14px] text-neutral-400">{name}</span>
        </div>
      ))}
    </div>
  )
}

export function PerformanceTile({ siteId }: Pick<TileOwnProps, 'siteId'>) {
  const { data: latest } = usePerformanceLatest(siteId)
  const { data: config } = usePerformanceConfig(siteId)
  // The phone's check, as the Performance page opens on; a site checked on a desktop alone shows that one.
  const phone = latest?.checks.find((check) => check.strategy === 'mobile')
  const check = phone ?? latest?.checks.find((c) => c.strategy === 'desktop')
  const none = !!latest && !check
  // The page's four category scores, by its names and in its order.
  const dials: [string, number | null][] = [
    ['Performance', check?.performance_score ?? null],
    ['Accessibility', check?.accessibility_score ?? null],
    ['Best Practices', check?.best_practices_score ?? null],
    ['SEO', check?.seo_score ?? null],
  ]
  return (
    <Tile
      page="performance"
      siteId={siteId}
      className="sm:col-span-2 xl:col-span-1"
      icon={Gauge}
      label="Performance"
      right={check ? (
        <span className="shrink-0 text-[11px] text-neutral-500">checked {ago(check.checked_at)}</span>
      ) : null}
      floor={!latest ? null : none ? (
        <div className="relative z-10 flex flex-1 items-center pb-5 text-sm text-neutral-500" data-tile-context="">
          {config && !config.enabled ? 'Performance checks are off for this site.' : 'No check has run yet.'}
        </div>
      ) : (
        <Dials dials={dials} />
      )}
    />
  )
}

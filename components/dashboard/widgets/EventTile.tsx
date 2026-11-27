'use client'
// One event as a tile (review W20, A2; owner W21, 27-11-2026: the day bars, "similar to the bars on the Pages page"):
// "Signups" on the dashboard without the Events block. Several may be placed, each its own event (the layout entry's
// `event`, the stored name), as the Funnels tile is for one funnel.
//
// The overview tiles' shell (components/dashboard/bottom/OverviewTiles.tsx's Tile, to the class): the border lifts
// and the name turns white under the pointer, and a press filters the dashboard to the visitors who did the event, as
// a press on the Events block's row does. Its count and visitors come from the dashboard's own answer (goal_counts);
// the change against the period before is ONE read shared by every event tile; its floor is the Pages page's day
// bars (components/pages/list/DayBars) of the visitors who did it, one read per tile.
import type { ReactNode } from 'react'
import { CursorClick } from '@phosphor-icons/react'
import DayBars from '@/components/pages/list/DayBars'
import { bucketsFor, hourName } from '@/components/pages/list/buckets'
import { RailDelta } from '@/components/funnels/FunnelRail'
import { getDailyStats, getGoalStats, type DailyStat, type GoalCountStat } from '@/lib/api/stats'
import { FRAME_SURFACE } from '@/lib/dashboard/frame'
import { eventName } from '@/lib/dashboard/events'
import { EVENT_KIND, parseFilterMode, parseFiltersFromURL, serializeFilters } from '@/lib/filters'
import { previousDateRange } from '@/lib/hooks/periodUrl'
import { todayIn } from '@/lib/import/core/dates'
import { useSiteSWR } from '@/lib/swr/site-read'
import { formatCompactNumber } from '@/lib/utils/format'
import { pctChange } from '@/lib/utils/pctChange'
import type { FrameCtx } from './registry'
import type { Placed } from './store'

/**
 * The event a tile shows: its own, else the one fired most. Its own event with none in this range is shown at zero
 * under its own name, never replaced by another event.
 */
export function eventFor(events: readonly GoalCountStat[], name: string | undefined): GoalCountStat | null {
  if (name) return events.find((e) => e.event_name === name) ?? ({ event_name: name, count: 0, visitors: 0 } as GoalCountStat)
  return [...events].sort((a, b) => b.count - a.count)[0] ?? null
}

/** The event counts of the period before, for every event tile at once (one SWR key). */
function usePreviousCounts(ctx: FrameCtx): GoalCountStat[] | null {
  const prev = ctx.caps.comparison && ctx.period !== 'all' && !ctx.isLive ? previousDateRange(ctx.dateRange) : null
  const { data } = useSiteSWR<GoalCountStat[]>(
    ctx.siteId, 'demo',
    (siteKey) => (prev ? ['eventTilePrevious', siteKey, prev.start, prev.end, ctx.filtersParam] : null),
    (ref) => getGoalStats(ref, prev!.start, prev!.end, 100, ctx.filtersParam || undefined),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )
  return prev ? data ?? null : null
}

/**
 * The visitors who did the event, per hour on a range of one day and per day beyond (the Pages page's rule, which
 * DayBars groups into weeks and months past 42 days): the daily series under the page's filters and the event's.
 * None in realtime, and none under "match any", where one more filter would widen the page instead of narrowing it.
 */
function useEventSeries(ctx: FrameCtx, event: string | undefined, oneDay: boolean): number[] | null {
  const interval = oneDay ? 'hour' : 'day'
  const filters = event && parseFilterMode(ctx.filtersParam) !== 'any'
    ? serializeFilters([...parseFiltersFromURL(ctx.filtersParam), { dimension: EVENT_KIND, operator: 'is', values: [event] }])
    : null
  const { data } = useSiteSWR<DailyStat[]>(
    ctx.siteId, 'demo',
    (siteKey) => (filters && !ctx.isLive ? ['eventTileSeries', siteKey, ctx.dateRange.start, ctx.dateRange.end, interval, filters] : null),
    (ref) => getDailyStats(ref, ctx.dateRange.start, ctx.dateRange.end, interval, filters!),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )
  return data ? data.map((d) => d.visitors) : null
}

const pct = (n: number) => `${n >= 10 || n === 0 ? Math.round(n) : n.toFixed(1)}%`
const VISITORS = { one: 'visitor', many: 'visitors' }

/** The overview tiles' shell. The press is an overlay (the Events block's way), so the bars can take the pointer. */
function Shell({ event, name, press, children }: { event: string; name: string; press: (() => void) | undefined; children: ReactNode }) {
  return (
    <div className={`${FRAME_SURFACE} group relative flex h-full min-h-[164px] min-w-0 flex-col overflow-hidden px-6 pt-5 transition-colors duration-fast ease-apple hover:border-white/[0.16]`} data-event-tile={event}>
      {press && (
        <button type="button" onClick={press} aria-label={`Filter by event: ${name}`} data-event-press="" className="absolute inset-0 z-[5] h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange" />
      )}
      {children}
    </div>
  )
}

export function EventTile({ ctx, placed }: { ctx: FrameCtx; placed?: Placed }) {
  const events = ctx.dashboard?.goal_counts ?? []
  const event = eventFor(events, placed?.event)
  const name = event ? eventName(event) : 'One event'
  const tz = ctx.site?.timezone
  const live = !!tz && ctx.dateRange.end === todayIn(tz)
  const days = Math.round((Date.parse(ctx.dateRange.end) - Date.parse(ctx.dateRange.start)) / 86_400_000) + 1
  const oneDay = days === 1
  const series = useEventSeries(ctx, event?.event_name, oneDay)
  const previous = usePreviousCounts(ctx)
  const before = event && previous ? previous.find((e) => e.event_name === event.event_name)?.count ?? 0 : null
  const change = event && before !== null ? pctChange(event.count, before) : null
  const visitors = event?.visitors ?? null
  const share = visitors !== null && ctx.rangeTotals.visitors > 0 ? (visitors / ctx.rangeTotals.visitors) * 100 : null
  const press = event && ctx.onCardFilter ? () => ctx.onCardFilter?.({ dimension: EVENT_KIND, operator: 'is', values: [event.event_name] }) : undefined
  // A range of one day draws its hours, today's up to the hour now in the site's own time.
  const nowHour = live && tz ? Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date())) : null
  const hoursShown = oneDay ? (live && nowHour !== null ? Math.min(24, nowHour + 1) : 24) : 0
  const { kind, buckets } = bucketsFor(ctx.dateRange.start, days, 42)
  const context = events.length === 0 && !placed?.event
    ? 'This site has no events in this range.'
    : visitors !== null && share !== null ? `${formatCompactNumber(visitors)} visitors · ${pct(share)} of all` : ' '
  return (
    <Shell event={event?.event_name ?? ''} name={name} press={press}>
      <div className="pointer-events-none relative z-10 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[13px] text-neutral-400 transition-colors duration-fast ease-apple group-hover:text-white">
          <CursorClick className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{name}</span>
        </span>
        {change ? <RailDelta change={change} /> : null}
      </div>
      <div className="pointer-events-none relative z-10 mt-0.5 text-xl font-semibold tabular-nums text-white" data-tile-value="">{event ? formatCompactNumber(event.count) : '—'}</div>
      <div className="pointer-events-none relative z-10 mt-0.5 truncate text-[11px] text-neutral-500" data-tile-context="">{context}</div>
      {series && series.length > 0 && (
        // The bars take the pointer for their own days; a press on them is still the tile's press.
        <div className="relative z-10 mt-auto pb-4" onClick={press} data-event-bars="">
          {oneDay
            ? <DayBars values={series.slice(0, hoursShown)} hours={Array.from({ length: hoursShown }, (_, h) => hourName(h))} kind="day" buckets={[]} live={live} height={40} unit={VISITORS} className="w-full" />
            : <DayBars values={series} kind={kind} buckets={buckets} live={live} height={40} unit={VISITORS} className="w-full" />}
        </div>
      )}
    </Shell>
  )
}

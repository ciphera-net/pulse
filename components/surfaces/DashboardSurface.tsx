'use client'


import { siteDaysCaption } from '@/lib/utils/timezones'
import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSWRConfig } from 'swr'
import {
  type Stats,
  type DailyStat,
} from '@/lib/api/stats'
import { useFilterSuggestions } from '@/lib/hooks/useFilterSuggestions'
import { toast } from '@ciphera-net/facet'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { PERIOD_TO_API } from '@/lib/constants/periods'
import { type Site } from '@/lib/api/sites'
import { formatDate } from '@/lib/utils/format'
import { useUrlDateRange } from '@/lib/hooks/useUrlDateRange'
import { useRealtimeToggle } from '@/lib/hooks/useRealtimeToggle'
import { previousDateRange } from '@/lib/hooks/periodUrl'
import { resolveDashboardRange, serverResolvedPeriod } from '@/lib/dashboard/resolveRange'
import dynamic from 'next/dynamic'
import { DashboardSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import RealtimeOrb from '@/components/dashboard/RealtimeOrb'
import {
  REALTIME_MODES,
  REALTIME_ROLLING_MINUTES,
  isRealtimePeriod,
} from '@/lib/dashboard/realtimeRange'
import { PollLiveSync, SocketLiveSync } from '@/components/dashboard/LiveSync'
// The new dashboard's filter (owner rulings R36, R46, R48 of 15-11-2026): one field, the filters on in one box.
import SearchFilter from '@/components/dashboard/filter/search/SearchFilter'
import FiltersBox from '@/components/dashboard/filter/search/FiltersBox'
import { pageValuesFrom, placeCountriesFrom } from '@/components/dashboard/filter/search/values'
const CommandDeck = dynamic(() => import('@/components/dashboard/CommandDeck'), { ssr: false })
import DashboardFrame from '@/components/surfaces/DashboardFrame'
import FrameToolbar from '@/components/dashboard/FrameToolbar'

// Client-only and off the critical path: driver.js only matters once the
// dashboard is interactive, and the controller waits for the anchors anyway.
const TourController = dynamic(() => import('@/lib/tour/TourController'), { ssr: false })
import { type DimensionFilter, type FilterMode, serializeFilters, parseFiltersFromURL, parseFilterMode, modeFor, canMatchAny, EVENT_FILTERS_FLAG, MATCH_ANY_FLAG, readEventNameAsEvent, eventFilterRoomFor, TOO_MANY_EVENT_FILTERS } from '@/lib/filters'
import { useFeature } from '@/lib/features'
import {
  useDashboard,
  useRealtime,
  useStats,
  useSite,
  useDataWindow,
  useDailyStats,
  useInstallStatus,
} from '@/lib/swr/dashboard'
import { EmptyFactsProvider, type EmptyFacts } from '@/lib/dashboard/emptyFacts'
import { ErrorCard } from '@/components/ui/ErrorCard'
import InstallBanner from '@/components/dashboard/InstallBanner'
import { useLiveIndicator } from '@/lib/live-indicator-context'
import { useRecordPublicSiteIdentity } from '@/lib/swr/public-site-identity'
import { type MetricType, isMetricType } from '@/lib/dashboard/metrics'
import { displayDomain } from '@/lib/utils/displayDomain'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { importLeftOutByFilter } from '@/lib/dashboard/importBoundary'
import type { WindowState } from '@/lib/view/view'
import { useSiteScope, type SiteScope } from '@/lib/scope/SiteScope'
import { postEmbedReady } from '@/lib/scope/embed'
import { dashboardCapabilities, type DashboardCapabilities } from '@/lib/dashboard/capabilities'
import { isLockedShare, liveListKeyMatcher } from '@/lib/dashboard/publicView'



// Windows that end at an instant rather than at a site day: their previous
// period has no bucket-for-bucket counterpart, so the chart draws none.
const ROLLING_PERIODS: ReadonlySet<string> = new Set(['30m', '1h', '6h', '24h'])

/**
 * The site record and the data window: the two reads that exist only where the site
 * itself is served, and that the page waits on before it can resolve a range.
 */
interface SiteFacts {
  siteRecord: Site | undefined
  siteError: unknown
  refetchSite: () => Promise<unknown>
  dataWindow: WindowState
}

function useSiteFacts(siteId: string): SiteFacts {
  // Independent of the dashboard's own combined fetch ON PURPOSE: the
  // dashboard request itself needs a resolved date range before it can fire,
  // and the range needs the site's timezone before IT can resolve — reading
  // the zone off `dashboard.site` would be circular. This is the same
  // siteId-only fetch the sidebar already dedupes against.
  const { data: siteRecord, error: siteError, mutate: refetchSite } = useSite(siteId)
  const dataWindow = useDataWindow(siteId, 'dashboard')
  return { siteRecord, siteError, refetchSite, dataWindow }
}

/**
 * THE DASHBOARD, FOR EVERY READER (PUL-34 Phase 2). One composition renders the member's
 * dashboard (/sites/<id>), the demo (/demo) and a customer's share link (/share/<id>): the
 * scope says which (lib/scope/SiteScope.tsx), and `dashboardCapabilities` says what that
 * scope may show, so the demo cannot drift from the product.
 */
export default function DashboardSurface() {
  const scope = useSiteScope()
  const caps = useMemo(() => dashboardCapabilities(scope), [scope])
  // 🔴 A customer's share link is served FIVE routes (stats, daily, realtime, dashboard,
  // page-preview) and the site record and the data window are not among them: every other
  // route answers 404 to it. So under that scope the two reads are not made at all (a
  // missing record is not a failure to retry three times and toast); the site rides the
  // dashboard payload, as it always did on the share page.
  return caps.siteRecord
    ? <SiteDashboardWithRecord scope={scope} caps={caps} />
    : <SiteDashboard scope={scope} caps={caps} facts={null} />
}

function SiteDashboardWithRecord({ scope, caps }: { scope: SiteScope; caps: DashboardCapabilities }) {
  const facts = useSiteFacts(scope.siteId)
  return <SiteDashboard scope={scope} caps={caps} facts={facts} />
}

function SiteDashboard({ scope, caps, facts }: { scope: SiteScope; caps: DashboardCapabilities; facts: SiteFacts | null }) {
  const siteId = scope.siteId
  // The dashboard is the frame (lib/dashboard/frame.tsx says what it is) for every reader since 15-11-2026: every
  // team (the `new-dashboard` flag went to everyone at 20:32 UTC), and public pages too (the demo, a share link).
  // The arrangement it replaced (section headers over a card grid, the old filter pills and builder, the chart's
  // bucket picker, the Outbound card, Peak hours) left this file on 16-11-2026.
  const siteRecord = facts?.siteRecord
  const siteError = facts?.siteError
  const refetchSite = facts?.refetchSite
  // `null` is "known, no window": the switcher greys nothing and nothing waits on it.
  const dataWindow: WindowState = facts ? facts.dataWindow : null

  // Range state lives in the URL (?period=&start=&end=), the estate grammar
  // every other date-ranged page already uses (F12): a shared link carries the
  // range, back/forward works, and nothing is silently rewritten to a frozen
  // custom range on reload. The chart intervals are view state, not identity —
  // plain React state, no persistence. The view itself is the ONE memory shared by
  // every page (PULSE-20), answered against this page's data window.
  // Realtime is a MODE entered from the orb — never a menu row, never remembered;
  // `rollingMinutes` turns it into a `minutes=` fetch instead of a date span.
  //
  // A customer's share link is the exception that proves the rule: its four fixed
  // windows are decided inside the hook, from the scope (see useUrlDateRange).
  const urlRange = useUrlDateRange({
    surface: 'dashboard',
    window: dataWindow,
    timezone: siteRecord?.timezone,
    modes: caps.realtimeMode ? REALTIME_MODES : undefined,
    rollingMinutes: caps.realtimeMode ? REALTIME_ROLLING_MINUTES : undefined,
    retentionMonths: siteRecord?.data_retention_months,
    daysCaption: siteDaysCaption(siteRecord?.timezone),
  })
  const { period, dateRange, periodReady, rollingMinutes, picker } = urlRange
  const isLive = isRealtimePeriod(period)
  // The live window every list on this page fetches in realtime mode (PULSE-192): the
  // fan-out sends it as minutes=, and so must every card list, Outbound, Campaigns, the
  // goal breakdowns and the filter suggestions, or they describe the calendar day.
  const liveMinutes = isLive ? (rollingMinutes ?? undefined) : undefined

  // Dimension filters state. A share link carries none: a filtered public-scoped read is
  // refused (400), so a `?filters=` in its URL is never parsed, let alone sent.
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<DimensionFilter[]>(() => {
    const raw = caps.filters ? searchParams.get('filters') : null
    return raw ? parseFiltersFromURL(raw) : []
  })
  // Match any (R65; lib/filters.ts): the switch's state starts from the address. The mode the page is REALLY in is
  // modeFor's: Any only with two filters or more and no event filter among them. Until /me has said whether the
  // team has the beta, an address that asks for Any is believed (its reads go out once, as Any); a team without the
  // beta reads Match all, and the address is rewritten to say so.
  const [filterMode, setFilterMode] = useState<FilterMode>(() => parseFilterMode(caps.filters ? searchParams.get('filters') : null))
  const matchAnyFlag = useFeature(MATCH_ANY_FLAG)
  const mode: FilterMode = matchAnyFlag === false ? 'all' : modeFor(filters, filterMode)
  // The switch leaves with its second filter (or when an event filter joins), and it does not come back on by itself.
  // Put back while rendering, not in an effect: React renders again at once, before anything is drawn or read.
  if (filterMode === 'any' && !canMatchAny(filters)) setFilterMode('all')
  // ONE string for every read and for the address, so the mode reaches each of them or none.
  const filtersParam = useMemo(() => serializeFilters(filters, mode), [filters, mode])
  // The event filter's beta (R45): the Search filter offers an event and an outbound link, and an old address's
  // event_name filter reads as an event, once /me says the beta is on. The page never sends the two side by side,
  // which the server refuses.
  const eventFilters = useFeature(EVENT_FILTERS_FLAG) === true
  useEffect(() => {
    if (eventFilters) setFilters((prev) => readEventNameAsEvent(prev))
  }, [eventFilters])

  // Deck metric selection lives in the URL (?metric=) like ?period= — a shared
  // link carries it and a reload keeps it. DECOUPLED (owner decision,
  // 01-09-2026): the selection drives ONLY the hero chart. The dimension
  // blocks hold fixed columns (visitors; the Pages card adds views) and never
  // re-render on a KPI click.
  const [metric, setMetric] = useState<MetricType>(() => {
    const raw = searchParams.get('metric')
    return isMetricType(raw) ? raw : 'visitors'
  })
  const handleMetricChange = useCallback((m: MetricType) => {
    setMetric(m)
  }, [])
  useEffect(() => {
    const url = new URL(window.location.href)
    if (metric !== 'visitors') {
      url.searchParams.set('metric', metric)
    } else {
      url.searchParams.delete('metric')
    }
    window.history.replaceState({}, '', url.toString())
  }, [metric])

  // For relative periods send the period name; for custom ranges send dates.
  //
  // 🔴 GATED ON periodReady. Until the range memory has been read, `period` is
  // DEFAULT_PERIOD ('30') — a placeholder, not a choice — and firing on it is
  // not free: it mints a real SWR cache entry for period=30d. On the NEXT
  // navigation to this page that entry is warm, so `dashboard` resolves
  // instantly to a 30-day range and every card below renders 30 days of data
  // for one render, under whatever label the picker settles on. That is the
  // themodestyhouse.com report of 20-08-2026: Campaigns showing `reddit`
  // (9 days stale) and `copilot.com` (6 days stale) while the range said Today.
  // Suppressing the request is what stops the poisoned cache entry existing.
  const apiPeriod = !periodReady
    ? undefined
    : period !== 'custom' ? (PERIOD_TO_API[period] || undefined) : undefined

  // '1h' narrows to minutes; '24h' narrows to hours — the server resolves 24h as
  // a genuine rolling window (D3), and drawing it as two daily bars split the
  // window mid-bar (F5). Other multi-day ranges keep the user's interval choice.
  //
  // A young day cannot draw an hourly line worth reading — until THREE hours
  // of data exist, Today renders MINUTE buckets instead, the Last-1-hour
  // instrument (owner rulings 04-09 and 05-09-2026, widened from 1h after the
  // 01:02 two-bucket diagonal; supersedes the rejected full-day-axis attempt).
  //
  // 🔴 PULSE-201: this used to be read off the FETCHED response (span of the
  // returned `daily_stats` < 3h), via a `firstHourOfDay` state flipped in an
  // effect once data arrived. That info arrives one render AFTER the request
  // that needed it, so a cold Today load always fired twice: once with
  // interval='hour' (the state's startup default), then again with
  // interval='minute' the instant the effect flipped it — two full
  // /dashboard fan-outs for one page view, the double-request + 8s-timeout
  // report this fixes.
  //
  // Decided up front instead, from what `GetTimeSeriesStats` itself proves:
  // its generate_series always spans the day's LOCAL MIDNIGHT to
  // min(requested end, now) (internal/database/stats.go) — zero-filled, never
  // trimmed to where traffic starts — so "span of the returned buckets" IS
  // "time elapsed since the site's local midnight", to within one bucket's
  // width. That elapsed time needs only the site's timezone and the
  // requested day, both already settled (periodReady gates on the timezone)
  // before this is ever evaluated, so the very FIRST request already asks
  // for the right granularity and no flip — and no second fetch — follows.
  //
  // Read off `urlRange.siteNow` (the minute-bucketed site wall-clock stand-in
  // this page already derives its "today" from) via its LOCAL getters, rather
  // than a fresh `Date.now()` here: the page's render body stays pure, and
  // the minute it rolls over is the same minute every other "today" check on
  // this page rolls over.
  // Realtime is always minute buckets: a live window drawn at day granularity is
  // one bar, which is not a chart.
  //
  // A customer's share link is day-granular whatever the range: the server clamps every
  // public-scoped read to day buckets (an hourly bucket holding one visitor is that
  // person's arrival time), so it is asked for exactly that.
  const isYoungSingleDay =
    dateRange.start === dateRange.end &&
    dateRange.start === formatDate(urlRange.siteNow) &&
    urlRange.siteNow.getHours() * 60 + urlRange.siteNow.getMinutes() < 3 * 60
  //
  // The chart has no bucket picker: the buckets follow the range (minutes live and for a young day, hours for one
  // day, days beyond, and past a year whatever the server picks).
  const interval = !caps.hourlyBuckets ? 'day' : isLive ? 'minute' : period === '1h' ? 'minute' : period === '24h' ? 'hour' : (dateRange.start === dateRange.end ? (isYoungSingleDay ? 'minute' : 'hour') : 'day')

  // Single dashboard request replaces focused hooks (overview, pages, locations,
  // devices, referrers, goals). The backend runs all queries in parallel
  // and caches the result in Redis for efficient data loading.
  // While the period is unresolved BOTH the dates and the period token are
  // withheld, which makes useDashboard's SWR key null and issues no request at
  // all. Withholding only the token would fall through to the client-computed
  // dateRange for the placeholder period — the same 30-day window by another
  // route.
  //
  // A share link names no date at all: its request is the period token alone (the server
  // refuses a start/end on a public-scoped read), so it is handed none to carry.
  const datedRead = periodReady && caps.explicitDates
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError, mutate: refetchDashboard } = useDashboard(
    siteId,
    datedRead ? (dateRange?.start || '') : '',
    datedRead ? (dateRange?.end || '') : '',
    interval,
    filtersParam || undefined,
    apiPeriod,
    // In realtime mode the window is sent as rolling minutes, not as dates or a
    // period token: "the last 30 minutes" is not expressible as two YYYY-MM-DD
    // strings without losing the thing that makes it live.
    rollingMinutes ?? undefined,
  )

  // Server-resolved date range is the single source of truth for period-based queries.
  // null while loading — all downstream consumers must gate on this being non-null.
  // Custom ranges use client-computed dateRange immediately (no server resolution needed).
  //
  // 🔴 `!periodReady` MUST short-circuit to null, and this line is where the
  // first attempt at this fix leaked. Suppressing the REQUEST is not enough:
  // with no apiPeriod the expression falls through to `dateRange`, which for
  // the placeholder period is the client-computed THIRTY-DAY window — the very
  // range being kept off the screen, arriving by the fallback instead of the
  // cache. Gate the value, not just the fetch.
  const resolvedDateRange = resolveDashboardRange(periodReady, dashboard?.date_range, apiPeriod, dateRange)


  const handleAddFilter = useCallback((filter: DimensionFilter) => {
    // The server reads at most two event filters (each is one more read of the range), and a row's press comes here
    // without passing the Search filter's own check: refused with its words, never sent to be refused.
    if (!eventFilterRoomFor(filter, filters)) {
      toast.error(TOO_MANY_EVENT_FILTERS)
      return
    }
    setFilters(prev => {
      const isDuplicate = prev.some(
        f => f.dimension === filter.dimension && f.operator === filter.operator && f.values.join(';') === filter.values.join(';')
      )
      if (isDuplicate) return prev
      return [...prev, filter]
    })
  }, [filters])

  const handleRemoveFilter = useCallback((index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilters([])
  }, [])

  // A saved set in place of the filters on, in one change (saved filters, R59: the Filter panel lists the sets).
  const handleApplySavedFilters = useCallback((next: DimensionFilter[], savedMode: FilterMode = 'all') => {
    setFilters(next)
    setFilterMode(savedMode)
  }, [])

  // A row that filters is a real control and one that cannot is inert text: the cards
  // take no `onFilter` where filtering is refused (a share link).
  const onCardFilter = caps.filters ? handleAddFilter : undefined

  // What an EMPTY block may truthfully say (lib/dashboard/emptyFacts.tsx): whether a filter is on, whether the
  // site has ever had a visit, whether a longer range exists. The install status is the banner's own live read
  // (the same SWR entry, so no second request), with the site record as the first frame's answer. It is a
  // member's read: a public page is not served it, the hook is handed no site there and asks nothing, and a
  // public block says its heading alone anyway.
  const { data: installLive } = useInstallStatus(caps.member ? siteId : undefined)
  // "No visitors yet" needs two things to agree: the script has never reported, AND the site has no day of history
  // at all (its data window is `null`). A site whose history was imported from another tool has a window, and a
  // chart full of visits, before its script ever reports; the server keeps that case on purpose (an import-only
  // site still gets a window). An empty block beside that chart must not say nobody has come. While the window is
  // still on its way (`undefined`) nothing is claimed.
  const neverVisited = (installLive?.install_status ?? siteRecord?.install_status) === 'never_installed' && dataWindow === null
  const filtered = filters.length > 0
  const clearFilters = caps.filters ? handleClearFilters : undefined
  const canWiden = period !== 'all'
  // The site's "Outbound links" option (Site settings, General; on unless it was switched off). Only the member's
  // site record carries it.
  const outboundOff = siteRecord?.script_features?.outbound != null && !siteRecord.script_features.outbound

  // * Commit a draft from the filter popover — replaces the filter at its
  // * index when editing, appends (via the duplicate-guarded add) otherwise.
  const handleFilterApply = useCallback((filter: DimensionFilter, editingIndex: number | null) => {
    if (editingIndex !== null) {
      setFilters(prev => prev.map((f, i) => i === editingIndex ? filter : f))
    } else {
      handleAddFilter(filter)
    }
  }, [handleAddFilter])

  // Fetch full suggestion list (up to 100) when a dimension is selected in the filter dropdown
  // All time travels as the `all` token here too (as on Funnels and Journeys): sent as
  // the window's dates it would 400 once the window passes the 366-day cap.
  const handleFetchSuggestions = useFilterSuggestions(
    siteId,
    resolvedDateRange,
    filtersParam || undefined,
    serverResolvedPeriod(periodReady, period),
    liveMinutes,
  )

  // Sync filters to URL
  useEffect(() => {
    const url = new URL(window.location.href)
    if (filtersParam) {
      url.searchParams.set('filters', filtersParam)
    } else {
      url.searchParams.delete('filters')
    }
    window.history.replaceState({}, '', url.toString())
  }, [filtersParam])

  // The kinds with no value read of their own, from the page's own answer (the Search filter offers them).
  const pageValues = useMemo(() => pageValuesFrom(dashboard), [dashboard])
  const places = useMemo(() => placeCountriesFrom(dashboard), [dashboard])

  // Previous period date range for comparison — the shared, tested helper
  // (periodUrl.ts), not ad-hoc arithmetic. It applies the exact same two
  // rules this used to hand-roll (span > 366 days → null; previous start
  // before Pulse's 2020-01-01 data floor → null) via LOCAL date parts, never
  // toISOString() — a UTC round-trip shifts a day near midnight outside UTC,
  // and resolvedDateRange is already a SITE-local "YYYY-MM-DD" pair (either
  // the server's own echoed range, or the client range resolved against the
  // site's wall clock), so it must be read as local parts, not re-UTC'd.
  // Hooks below gate on prevRange via empty-string fallthrough so SWR skips the fetch.
  // "All time" has no previous period — there is no history before the whole of it —
  // so it carries no comparison rather than one against days with no data. Nor does
  // realtime: the server echoes a live window as the day it falls in, so the "previous
  // period" was all of yesterday, and every rail delta compared five minutes with a
  // whole day (a red −99% under a live view). Nor does a share link: the previous
  // window is a read over arbitrary dates, which a public-scoped read refuses.
  const prevRange = useMemo(
    (): { start: string; end: string } | null =>
      caps.comparison && resolvedDateRange && period !== 'all' && !isLive ? previousDateRange(resolvedDateRange) : null,
    [caps.comparison, resolvedDateRange, period, isLive],
  )
  const { data: realtimeData } = useRealtime(siteId, 15_000)
  const { mutate: mutateLiveLists } = useSWRConfig()

  // THE transport seam. Everything else on this page is transport-agnostic: the
  // transport says "something changed" and the page refetches over HTTP, reading
  // the same endpoints every other period reads. Only mounted while live, so a
  // historical view holds no connection: a member's page by the realtime socket, a
  // public one (which has no socket to open) by a timer (components/dashboard/LiveSync).
  const refreshLive = useCallback(() => {
    void refetchDashboard()
    // The cards' own live lists refresh on the same signal (lib/swr/dashboard.ts,
    // LIVE_LIST_KEY), so a card never lags the KPI rail above it.
    void mutateLiveLists(liveListKeyMatcher(siteId))
  }, [refetchDashboard, mutateLiveLists, siteId])
  const liveSync = isLive
    ? (caps.member
        ? <SocketLiveSync siteId={siteId} onChanged={refreshLive} />
        : <PollLiveSync onChanged={refreshLive} />)
    : null

  // The orb is the one switch into realtime; leaving returns to the view the reader
  // was on (useRealtimeToggle — shared with Visitors, so the two cannot drift).
  const { toggle: toggleRealtime } = useRealtimeToggle(urlRange)
  // The previous-period comparison carries the SAME filters as the current
  // period. Omitting them compared a filtered current window against an
  // unfiltered previous one — every KPI delta was garbage under any active
  // filter, measured as a true +13% rendered −46% red (F4).
  const { data: prevStats } = useStats(siteId, prevRange?.start ?? '', prevRange?.end ?? '', filtersParam || undefined)
  // The previous period's SERIES, for the chart's dashed line (PUL-19): the
  // same window, the same filters and the same buckets as the series drawn.
  // Only where the two windows line up bucket for bucket — whole site days in
  // day or hour buckets. Rolling windows (30m, 1h, 6h, 24h) end at an instant,
  // not a day, so their previous window as two DATES is a different shape;
  // minute buckets (a young Today) are left out with them.
  const seriesInterval = dashboard?.interval ?? interval
  const comparesSeries = prevRange !== null && !ROLLING_PERIODS.has(period) && (seriesInterval === 'day' || seriesInterval === 'hour')
  const { data: prevDaily } = useDailyStats(
    siteId,
    comparesSeries && prevRange ? prevRange.start : '',
    comparesSeries && prevRange ? prevRange.end : '',
    seriesInterval === 'hour' ? 'hour' : 'day',
    filtersParam || undefined,
  )
  // Derive typed values from single dashboard response
  const site = dashboard?.site ?? null
  // A share link is never served the site record, so the public headers name it from this payload
  // (lib/swr/public-site-identity.ts); recorded under a public scope only.
  useRecordPublicSiteIdentity(siteId, site)
  // `dashboard.site` is the sanitized public shape (NewPublicSiteResponse). It carries no
  // identity setting, and none is needed: the Unique visitors definition is the same on every
  // site.
  // The four averages default to null ("not measured"), never 0 — a fabricated
  // zero is indistinguishable from a measured one (F11).
  const stats: Stats = dashboard?.stats ?? { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null, avg_scroll_depth: null, avg_visible_duration: null }
  const realtime = realtimeData?.visitors ?? dashboard?.realtime_visitors ?? 0
  // In realtime the rail's headline visitors IS the orb's count: the server's live count
  // over the same five minutes (since 14-11-2026 read from ClickHouse with the realtime
  // view's visibility, so a bot caught after it arrived is left out; the Redis presence
  // list is only its fallback). Taken from the window's own stats instead, the rail and
  // the orb could each be right and still disagree side by side, which is what was
  // reported (plan §11.10). One source, one number.
  const deckStats: Stats = isLive ? { ...stats, visitors: realtime } : stats
  // Realtime's fact for an empty block: the live count is KNOWN and at zero. `realtime` above falls back to 0 while
  // nothing is known, which suits a number on screen and not a claim: "Nobody on the site" is said on a known zero
  // only, and a block with none of its own kind says that instead (owner ruling R25, 14-11-2026).
  const nobodyLive = (realtimeData?.visitors ?? dashboard?.realtime_visitors) === 0
  const emptyFacts = useMemo<EmptyFacts>(
    () => ({ filtered, clearFilters, neverVisited, canWiden, nobodyLive }),
    [filtered, clearFilters, neverVisited, canWiden, nobodyLive],
  )
  const dailyStats: DailyStat[] = dashboard?.daily_stats ?? []

  // Show error toast on fetch failure
  useEffect(() => {
    if (dashboardError) {
      toast.error('Failed to load dashboard analytics')
    }
  }, [dashboardError])

  // Track when dashboard data was last updated (drives the Live indicator in
  // GlassTopBar)
  const { markUpdated } = useLiveIndicator()
  useEffect(() => {
    if (dashboard) {
      markUpdated()
    }
  }, [dashboard, markUpdated])

  useEffect(() => {
    if (site?.domain) document.title = `${displayDomain(site)} | Pulse`
  }, [site?.domain])

  // Skip the minimum-loading skeleton when SWR already has cached data
  // (prevents the 300ms flash when navigating back to the dashboard)
  // `!periodReady` counts as loading. With the request suppressed SWR reports
  // isLoading:false for a null key, so without this the page would drop
  // straight past the skeleton into a body with no range — a blank dashboard
  // instead of an honest loading state.
  const showSkeleton = useMinimumLoading(!periodReady || (dashboardLoading && !dashboard))
  const fadeClass = useSkeletonFade(showSkeleton)

  // The hero frames /demo over a capture of it and swaps the capture for the frame only
  // once the frame says its page has drawn REAL numbers (lib/scope/embed.ts). So it says
  // so once, when the dashboard payload has first rendered: never on the skeleton, and
  // never again when a period change sends the page back through it.
  const dashboardDrawn = Boolean(dashboard) && !showSkeleton
  const embedAnnounced = useRef(false)
  useEffect(() => {
    if (!caps.embedReady || !dashboardDrawn || embedAnnounced.current) return
    embedAnnounced.current = true
    postEmbedReady()
  }, [caps.embedReady, dashboardDrawn])

  // A password-protected share link whose unlock lapsed: retrying cannot work, the
  // reader has to enter the password again, and that happens on a reload.
  const lockedShareCard = (
    <ErrorCard
      title="This dashboard is password protected"
      description="Reload the page and enter the password again."
    />
  )
  const lockedShare = !caps.member && isLockedShare(dashboardError)

  const failureCard = (failure: unknown, retry: () => void) => {
    if (!caps.member && isLockedShare(failure)) return lockedShareCard
    const status = (failure as { status?: number })?.status
    // "Your data is intact" speaks to the site's owner: a public reader has no data here.
    const reassurance = caps.member ? ' Your data is intact — this is a loading problem, not a data problem.' : ''
    return (
      <ErrorCard
        title="Couldn’t load the dashboard"
        description={status ? `The analytics request failed (HTTP ${status}).${reassurance}` : `The analytics request failed.${reassurance}`}
        onRetry={retry}
      />
    )
  }

  // F8: a failed request is a FAILURE, stated as one. "Site not found" used to
  // render for ANY error with no cached data — a 500 from the fan-out, a 400
  // from interval validation, an expired session — confidently wrong about a
  // site that exists. Only an actual 404 earns that sentence.
  const failureState = (failure: unknown, retry: () => void) => {
    const status = (failure as { status?: number })?.status
    if (status === 404) {
      return (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
          <p className="text-neutral-400">Site not found</p>
        </div>
      )
    }
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        {failureCard(failure, retry)}
      </div>
    )
  }

  const toolbarControls = () => (
    <>
      {caps.realtimeMode ? (
        <RealtimeOrb count={realtime} live={isLive} onToggle={toggleRealtime} />
      ) : (
        // Display-only: a share link's realtime MODE is refused by the server (a live
        // window on a public link can single out one visitor), so the orb shows the
        // count and must not become a toggle.
        <RealtimeOrb count={realtime} />
      )}
      {/* The spacer pushes the filter/date cluster to the right edge on desktop.
          In a wrapped mobile row a flex-1 spacer would claim a whole line and
          strand the controls, so it only exists at sm+. */}
      <div className="hidden flex-1 sm:block" />
      {caps.filters && (
        // The filters on in one box, then the Search filter's button (its panel is a portal).
        <>
          <FiltersBox
            filters={filters}
            onApply={handleFilterApply}
            onRemove={handleRemoveFilter}
            onClearAll={handleClearFilters}
            pageValues={pageValues}
            places={places}
            mode={mode}
            // The switch is offered where the team has the beta; without it the box is as it was.
            onMode={matchAnyFlag === true ? setFilterMode : undefined}
          />
          {/* A filtered view leaves imported days out: filters select visits, and an imported day holds totals
              (M11-h). Said beside the control that did it, from the response's own provenance. */}
          {importLeftOutByFilter(dashboard?.imported) && (
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500" data-testid="imported-filtered-note">
              Pulse-measured days only
              <TermInfoTip term="imported_history" />
            </span>
          )}
          <SearchFilter filters={filters} onApply={handleFilterApply} fetchSuggestions={handleFetchSuggestions} pageValues={pageValues} onApplySet={handleApplySavedFilters} mode={mode} eventFilters={eventFilters} />
        </>
      )}
      <DateRangePicker {...picker} />
    </>
  )

  // The toolbar stays at the top while the page moves under it (components/dashboard/FrameToolbar).
  const toolbarRow = () => <FrameToolbar>{toolbarControls()}</FrameToolbar>

  // PULSE-87: the view waits for the SITE's timezone before it can resolve a
  // range, and a site that failed to load never supplies one — so that failure
  // is stated BEFORE the skeleton gate, or the skeleton wins forever. (A 403 does
  // not reach this page: the site layout shows the other-team state instead.)
  if (!siteRecord && siteError) {
    return failureState(siteError, () => { void refetchSite?.() })
  }

  // 🔴 A protected share whose unlock lapsed stops painting numbers. The share cookie is the
  // ONLY grant, so its expiry is the normal failure mode of a protected link left open; SWR
  // keeps the last answer beside the error, and hour-old numbers behind a live-looking page
  // are the lie this page was built not to tell (share-expiry-reprompt). The lock replaces
  // them, stale payload or not, and the toolbar goes with them: no other window can help.
  if (lockedShare) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        {lockedShareCard}
      </div>
    )
  }

  if (showSkeleton) {
    // The frame's own skeleton, for every reader (components/skeletons.tsx).
    return <DashboardSkeleton />
  }

  // pulse#893: a failed dashboard request keeps the toolbar. Returning only the
  // error card took the period picker and the realtime orb with it, so a period
  // that fails every time (a long range on a large site) left no way to choose
  // another one except editing ?period= by hand. Retry stays on the card; the
  // toolbar is the way to a different period. A 404 is not a loading failure:
  // the site does not exist, so it keeps the bare "Site not found".
  if (dashboardError && !dashboard) {
    if ((dashboardError as { status?: number })?.status === 404) {
      return failureState(dashboardError, () => refetchDashboard())
    }
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        {liveSync}
        {toolbarRow()}
        {failureCard(dashboardError, () => refetchDashboard())}
      </div>
    )
  }

  if (!site) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <p className="text-neutral-400">Site not found</p>
      </div>
    )
  }

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      <EmptyFactsProvider value={emptyFacts}>
      {liveSync}
      {caps.member && <TourController />}
      {toolbarRow()}

      {/* Install health — a fact about the SITE, above the deck, distinct from
          the chart's own "no data in this range" (a fact about the RANGE).
          Renders nothing when the site is reporting normally. A member's affordance:
          a public reader has nothing to install. */}
      {caps.member && <InstallBanner siteId={siteId} />}

      {/* The command deck (provenance strip, KPI rail, full-height chart) and the blocks, arranged by
          DashboardFrame. */}
      {resolvedDateRange && (
        <DashboardFrame
          deck={
            <CommandDeck
              data={dailyStats}
              stats={deckStats}
              prevStats={prevStats}
              metric={metric}
              onMetricChange={handleMetricChange}
              // The bucket the series is IN: past a year of All time the server picks it.
              interval={dashboard?.interval ?? interval}
              live={isLive}
              dateRange={resolvedDateRange}
              period={period}
              imported={dashboard?.imported}
              prevImported={prevStats?.imported}
              prevData={comparesSeries ? (prevDaily ?? null) : null}
              prevRange={prevRange}
              prevFloor={dataWindow?.from ?? null}
            />
          }
          dashboard={dashboard}
          site={site}
          siteId={siteId}
          caps={caps}
          isLive={isLive}
          liveMinutes={liveMinutes}
          dateRange={resolvedDateRange}
          period={apiPeriod || undefined}
          // One denominator for every block's % (F9): the range's true totals, filtered exactly as the rows are.
          rangeTotals={{ pageviews: stats.pageviews, visitors: stats.visitors }}
          previousVisitors={prevStats?.visitors ?? null}
          filtersParam={filtersParam}
          onCardFilter={onCardFilter}
          outboundOff={outboundOff}
          eventFilters={eventFilters}
        />
      )}
      </EmptyFactsProvider>
    </div>
  )
}

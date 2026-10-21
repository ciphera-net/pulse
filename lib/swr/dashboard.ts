// * SWR configuration for dashboard data fetching
// * Implements stale-while-revalidate pattern for efficient data updates

import { useEffect } from 'react'
import useSWR from 'swr'
import { getDataWindow, type DataWindowResponse } from '@/lib/api/dataWindow'
import { useOptionalSiteScope } from '@/lib/scope/SiteScope'
import { isPublicSiteRef, siteRefKey, type SiteRef } from '@/lib/scope/site-ref'
import { siteReadAvailable, useSiteSWR, withAvailability } from '@/lib/swr/site-read'
import type { Surface, WindowState } from '@/lib/view/view'
import { getBingStatus, getBingOverview, getBingDailyTotals, type BingStatus, type BingOverview, type BingDailyRow, type BingDateBasis } from '@/lib/api/bing'
import { useAuth } from '@/lib/auth/context'
import {
  getVisitors,
  getVisitorProfile,
  getVisitorVisits,
  getVisitEvents,
  type VisitorsResponse,
  type VisitorProfileResponse,
  type VisitsResponse,
  type VisitEventsResponse,
  type VisitorRange,
} from '@/lib/api/visitors'
import { toast } from '@ciphera-net/facet'
import {
  getDashboard,
  getPagesTable,
  getCampaigns,
  getRealtime,
  getStats,
  getDailyStats,
  getTopPages,
  getEntryPages,
  getExitPages,
  getTopReferrers,
  getCountries,
  getCities,
  getRegions,
  getLanguages,
  getLanguageGroups,
  getBrowsers,
  getOS,
  getDevices,
  getScreenResolutions,
  getTimezones,
  getEventPropertyValues,
  type EventPropertyValue,
  // /stats carries the provenance of the imported days it includes (PULSE-118).
  type StatsResponse,
} from '@/lib/api/stats'
import {
  getJourneyFlow,
  getJourneyEntryPoints,
  type JourneyFlow,
  type EntryPoint,
} from '@/lib/api/journeys'
import { getSite, getSiteTeam, getInstallStatus, getIngestHealth, getTrafficStatus, type IngestHealthResponse, type TrafficStatusResponse } from '@/lib/api/sites'
import type { Site, InstallStatusResponse } from '@/lib/api/sites'
import { listFunnels, getFunnel, getFunnelStats, getAllFunnelStats, getFunnelTrends, getFunnelBreakdown, type Funnel, type FunnelStats, type FunnelTrends, type FunnelBreakdown } from '@/lib/api/funnels'
import {
  getUptimeStatus,
  getUptimeIncidents,
  getUptimeResponseTimes,
  getMonitorChecks,
  type UptimeStatusResponse,
  type UptimeIncidentsResponse,
  type UptimeResponseTimesResponse,
  type UptimeCheck,
} from '@/lib/api/uptime'
import { getPerformanceConfig, getPerformanceLatest, getPerformanceHistory, getPagePreview, getPublicPagePreview, type PerformanceConfig, type PerformanceCheck, type PerformanceLatest, type PagePreview as PagePreviewData } from '@/lib/api/performance'
import { listGoals, type Goal } from '@/lib/api/goals'
import { getQuarantineStats, type QuarantineStats } from '@/lib/api/quarantine'
import { getGSCStatus, getGSCOverview, getGSCTopQueries, getGSCTopPages, getGSCDailyTotals, getGSCNewQueries, getGSCTopCountries, getGSCTopDevices, getGSCOpportunities, getGSCQueryPages, getGSCPageQueries, getGSCQueryTrend } from '@/lib/api/gsc'
import type { GSCStatus, GSCOverview, GSCQueryResponse, GSCPageResponse, GSCDailyTotal, GSCNewQueries, GSCCountryResponse, GSCDeviceResponse, GSCOpportunityResponse, GSCQueryTrendPoint } from '@/lib/api/gsc'
import { getBunnyStatus, getBunnyOverview, getBunnyDailyStats, getBunnyRegions, getBunnyLive } from '@/lib/api/bunny'
import type { BunnyStatus, BunnyOverview, BunnyDailyRow, BunnyRegionsResponse, BunnyLiveResponse } from '@/lib/api/bunny'
import { getSubscription, type SubscriptionDetails } from '@/lib/api/billing'
import type {
  DailyStat,
  CampaignStat,
  DashboardData,
  PagesTableData,
} from '@/lib/api/stats'

// * SWR fetcher functions.
// *
// * The reads that have a public route take a SiteRef (lib/scope/site-ref): a plain id is the member read,
// * a public ref reads /public/sites/<id>/<same path>. A read with no public route keeps a plain site id,
// * so handing it a public ref is a type error rather than a request the demo answers with a 404.
const fetchers = {
  site: (site: SiteRef) => getSite(site),
  installStatus: (siteId: string) => getInstallStatus(siteId),
  ingestHealth: (siteId: string) => getIngestHealth(siteId),
  trafficStatus: (siteId: string) => getTrafficStatus(siteId),
  dashboard: (site: SiteRef, start: string, end: string, interval?: string, filters?: string, period?: string, minutes?: number) => getDashboard(site, start, end, 10, interval, filters, period, minutes),
  stats: (site: SiteRef, start: string, end: string, filters?: string) => getStats(site, start, end, filters),
  dailyStats: (site: SiteRef, start: string, end: string, interval: 'hour' | 'day' | 'minute') =>
    getDailyStats(site, start, end, interval),
  realtime: (site: SiteRef) => getRealtime(site),
  campaigns: (site: SiteRef, start: string, end: string, limit: number) =>
    getCampaigns(site, start, end, limit),
  journeyFlow: (site: SiteRef, start: string, end: string, depth?: number, entryPath?: string, filters?: string, period?: string) =>
    getJourneyFlow(site, start, end, { depth, entryPath, filters, period }),
  journeyEntryPoints: (site: SiteRef, start: string, end: string, filters?: string, period?: string) =>
    getJourneyEntryPoints(site, start, end, filters, period),
  funnels: (site: SiteRef) => listFunnels(site),
  uptimeStatus: (site: SiteRef, start?: string, end?: string, period?: string) => getUptimeStatus(site, start, end, period),
  uptimeIncidents: (site: SiteRef, start: string, end: string, period?: string) => getUptimeIncidents(site, start, end, 200, period),
  uptimeResponseTimes: (site: SiteRef, monitorId: string, start: string, end: string, period?: string) =>
    getUptimeResponseTimes(site, monitorId, start, end, period),
  uptimeChecks: (site: SiteRef, monitorId: string, limit: number) => getMonitorChecks(site, monitorId, limit),
  performanceConfig: (site: SiteRef) => getPerformanceConfig(site),
  performanceLatest: (site: SiteRef) => getPerformanceLatest(site),
  performanceHistory: (site: SiteRef, strategy: 'mobile' | 'desktop', days: number) => getPerformanceHistory(site, strategy, days),
  goals: (site: SiteRef) => listGoals(site),
  gscStatus: (site: SiteRef) => getGSCStatus(site),
  bingStatus: (site: SiteRef) => getBingStatus(site),
  gscOverview: (site: SiteRef, start: string, end: string) => getGSCOverview(site, start, end),
  gscTopQueries: (site: SiteRef, start: string, end: string, limit: number, offset: number) => getGSCTopQueries(site, start, end, limit, offset),
  gscTopPages: (site: SiteRef, start: string, end: string, limit: number, offset: number) => getGSCTopPages(site, start, end, limit, offset),
  gscDailyTotals: (site: SiteRef, start: string, end: string) => getGSCDailyTotals(site, start, end),
  gscNewQueries: (site: SiteRef, start: string, end: string) => getGSCNewQueries(site, start, end),
  gscTopCountries: (site: SiteRef, start: string, end: string, limit: number, offset: number) => getGSCTopCountries(site, start, end, limit, offset),
  gscTopDevices: (site: SiteRef, start: string, end: string) => getGSCTopDevices(site, start, end),
  gscOpportunities: (site: SiteRef, start: string, end: string, limit: number) => getGSCOpportunities(site, start, end, limit),
  bunnyStatus: (site: SiteRef) => getBunnyStatus(site),
  bunnyOverview: (site: SiteRef, start: string, end: string, period?: string) => getBunnyOverview(site, start, end, period),
  bunnyDailyStats: (site: SiteRef, start: string, end: string, period?: string) => getBunnyDailyStats(site, start, end, period),
  bunnyRegions: (site: SiteRef, start: string, end: string, period?: string) => getBunnyRegions(site, start, end, period),
  bunnyLive: (site: SiteRef) => getBunnyLive(site),
  subscription: () => getSubscription(),
}

// * Standard SWR config for dashboard data
const dashboardSWRConfig = {
  // 🔁 CORRECTED (PULSE-226): this used to say "Keep stale data visible while
  // revalidating (better UX)" — that is not what this flag does. SWR keeps the
  // last-known `data` rendered while a revalidation is in flight UNCONDITIONALLY
  // (it is how the `data`/`isValidating` pair is designed, not a side effect of
  // any option here); turning this on or off never changes that.
  //
  // What `revalidateOnFocus: false` actually does: it stops SWR's default
  // global behaviour of re-subscribing to the window `focus` and document
  // `visibilitychange` events and firing a revalidation on them (the config
  // default is `true` — see node_modules/swr/dist/_internal's `initFocus` and
  // the default config). It is off here by default because turning it on for
  // every key in this file unthrottled would mean every one of these dozens
  // of hooks refetches on every single tab/window switch. Hooks that actually
  // need a backgrounded tab to catch itself up opt back in individually, each
  // with its own `focusThrottleInterval` so flipping tabs can't turn into a
  // request storm — see useDashboard below for the first and fullest comment.
  revalidateOnFocus: false,
  // * Revalidate when reconnecting (fresh data after offline)
  revalidateOnReconnect: true,
  // * Retry failed requests (but not rate limits or auth errors)
  shouldRetryOnError: true,
  errorRetryCount: 3,
  // * Error retry interval with exponential backoff
  errorRetryInterval: 5000,
  // * Don't retry on 429 (rate limit) or 401/403 (auth) — retrying makes it worse
  onErrorRetry: (error: any, _key: string, _config: any, revalidate: any, { retryCount }: { retryCount: number }) => {
    if (error?.status === 429) {
      const retryAfter = error?.data?.retryAfter
      const message = retryAfter
        ? `Too many requests. Please try again in ${retryAfter} seconds.`
        : 'Too many requests. Please wait a moment and try again.'
      toast.error(message, { id: 'rate-limit' })
      return
    }
    if (error?.status === 401 || error?.status === 403) return
    if (retryCount >= 3) return
    setTimeout(() => revalidate({ retryCount }), 5000 * Math.pow(2, retryCount))
  },
}

/**
 * One page's data window — what the view switcher needs BEFORE anything else is
 * fetched. Three states, each meaningful (lib/view/view.ts WindowState):
 *  - `undefined` while the request is in flight: periodReady waits on it, so no
 *    date-ranged request is made against a view that may be about to change;
 *  - `null` when the surface has no data OR the request failed: the switcher greys
 *    nothing and the page loads — a failed secondary request must never hold the whole
 *    page on a loading state. The failure is logged, never swallowed silently;
 *  - the window.
 * One request per site serves every surface (the key has no surface in it).
 *
 * Route class `demo`: a share link is not served the data window, so under it there is no
 * request and the answer is `null` (nothing known, nothing greyed), never `undefined`, which would hold
 * the page on its loading state for ever. A link's pages use their own fixed period rows instead.
 */
export function useDataWindow(siteId: string, surface: Surface): WindowState {
  const { data, error, available } = useSiteSWR<DataWindowResponse>(
    siteId, 'demo',
    (siteKey) => siteId ? ['dataWindow', siteKey] : null,
    (ref) => getDataWindow(ref),
    {
      ...dashboardSWRConfig,
      // The window moves at most once a day per surface (a sync landing, midnight).
      refreshInterval: 5 * 60 * 1000,
      dedupingInterval: 60 * 1000,
    },
  )
  useEffect(() => {
    if (error) console.error('data window request failed; the view switcher greys nothing', error)
  }, [error])
  if (!available) return null
  if (error) return null
  if (!data) return undefined
  return data.surfaces[surface] ?? null
}

// * Hook for site data (loads once, refreshes rarely).
// *
// * Route class `demo`: under a public scope this is GET /public/sites/<id>, the PUBLIC subset of the
// * record (PublicSite in lib/api/sites.ts: no owner, no configuration), which only the demo site is
// * served. A share link has no site record to read here (`available: false`): it reads `site` from
// * its dashboard payload.
export function useSite(siteId: string) {
  return useSiteSWR<Site>(
    siteId, 'demo',
    (siteKey) => siteId ? ['site', siteKey] : null,
    (ref) => fetchers.site(ref),
    {
      ...dashboardSWRConfig,
      // * Site data changes rarely, refresh every 5 minutes
      refreshInterval: 5 * 60 * 1000,
      // * Deduping interval to prevent duplicate requests
      dedupingInterval: 30 * 1000,
    }
  )
}

/**
 * Which team a site the session cannot read belongs to (PULSE-87). Asked only
 * after the site itself answered 403. A 403 here means "not one of your teams"
 * and is final, and a 404 means a server without the route — neither is worth
 * retrying, so nothing is.
 *
 * Route class `member`.
 */
export function useSiteTeam(siteId: string, enabled: boolean) {
  return useSiteSWR<{ organization_id: string }>(
    siteId, 'member',
    (siteKey) => enabled && siteId ? ['site-team', siteKey] : null,
    () => getSiteTeam(siteId),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
}

/**
 * Install-health for a site. Polls more eagerly while waiting for the first
 * event (so the install-flow "listening…" loop feels live), and backs off once
 * the install is active. Returns undefined data while loading.
 *
 * Route class `member`.
 */
export function useInstallStatus(siteId: string | undefined, options?: { poll?: boolean }) {
  const poll = options?.poll ?? false
  const swr = useSiteSWR<InstallStatusResponse>(
    siteId, 'member',
    (siteKey) => siteId ? ['install-status', siteKey] : null,
    () => fetchers.installStatus(siteId as string),
    {
      ...dashboardSWRConfig,
      // While actively watching for the first event, poll every 4s; otherwise
      // refresh on the slow cadence. The consumer flips `poll` on when the panel
      // is open and the install is not yet active.
      refreshInterval: (latest) =>
        poll && latest?.install_status !== 'active' ? 4000 : 60 * 1000,
      dedupingInterval: 2000,
    }
  )
  return swr
}

/**
 * Ingest health for a site: were any events refused in the site's last seven
 * LOCAL days, and for which of three causes.
 *
 * ⚠️ No polling. The window is seven days wide, so there is nothing to watch
 * change while somebody looks at the settings tab — and the install-status hook
 * above already polls, so a second poller on the same panel would double the
 * traffic for a number that moves once a day at most. Returns undefined while
 * loading; the consumer must render that as unresolved, never as "none".
 *
 * Route class `member`.
 */
export function useIngestHealth(siteId: string | undefined) {
  return useSiteSWR<IngestHealthResponse>(
    siteId, 'member',
    (siteKey) => siteId ? ['ingest-health', siteKey] : null,
    () => fetchers.ingestHealth(siteId as string),
    { ...dashboardSWRConfig, refreshInterval: 0, dedupingInterval: 60 * 1000 }
  )
}

/**
 * The traffic watcher's current judgement for one site — the TRAFFIC panel's
 * one row.
 *
 * ⚠️ No polling, for the same reason as useIngestHealth above and a stronger
 * one: the answer is about YESTERDAY, on the site's own clock, so it cannot
 * change while somebody reads a settings tab. It moves once a day at most, after
 * the site's local 06:00.
 *
 * Returns undefined while loading; the consumer MUST render that as unresolved
 * and never as "normal" — three states, and only the last is a measurement.
 *
 * Route class `member`.
 */
export function useTrafficStatus(siteId: string | undefined) {
  return useSiteSWR<TrafficStatusResponse>(
    siteId, 'member',
    (siteKey) => siteId ? ['traffic-status', siteKey] : null,
    () => fetchers.trafficStatus(siteId as string),
    { ...dashboardSWRConfig, refreshInterval: 0, dedupingInterval: 60 * 1000 }
  )
}

// * Hook for full dashboard data (single request replaces 7 focused hooks)
// * The backend runs all queries in parallel and caches the result in Redis (30s TTL)
// 🔴 THE PERIOD TOKEN IS NOT AN IDENTITY ON ITS OWN. These four keys used to
// read `period || \`${start}-${end}\`` — the dates were dropped whenever a
// relative period was sent, on the reasoning that the SERVER resolves the
// period so the client dates are advisory. True of the VALUE, false of the
// KEY: `period=today` is the same string today and tomorrow, so the cache
// entry never invalidated when the local day rolled over. Only the 60s
// refreshInterval eventually moved it, and a tab left open across midnight
// showed yesterday until it happened to tick.
//
// Both now. The token still drives the request (the server owns the timezone
// resolution and echoes meta.range); the dates only distinguish one day's
// answer from the next.
//
// Route class `customer` (/dashboard is one of the five routes a share link is served): it is
// read under every scope. On a share link (fidelity `scoped`) the page must ask for a fixed period
// token and nothing else: no filters, no dates, no minutes, no hour or minute interval.

export function useDashboard(
  siteId: string,
  start: string,
  end: string,
  interval?: string,
  filters?: string,
  period?: string,
  /**
   * A rolling live window in minutes — REALTIME MODE. When set, the window ends
   * "now" rather than at a calendar boundary, and the server buckets it per
   * minute.
   *
   * 🔴 It is part of the SWR key, and must be: without it a live view and a
   * historical view of the same site share one cache entry, so switching into
   * realtime would render the 30-day payload until something else invalidated it.
   *
   * ⚠️ The refresh cadence changes with it. A live view is driven by the
   * WebSocket (useRealtimeSync calls mutate), so the 60s timer is dropped to
   * 15s — a backstop for a dropped signal, not the mechanism. Leaving it at 60s
   * would make a missed message look like a frozen dashboard for a minute.
   */
  minutes?: number,
) {
  const live = minutes != null
  return useSiteSWR<DashboardData>(
    siteId, 'customer',
    (siteKey) => siteId && (live || period || (start && end))
      ? ['dashboard', siteKey, period ?? '', start, end, interval, filters, minutes ?? '']
      : null,
    (ref) => fetchers.dashboard(ref, start, end, interval, filters, live ? undefined : period, minutes),
    {
      ...dashboardSWRConfig,
      refreshInterval: live ? 15_000 : 60_000,
      // * Deduping interval to prevent duplicate requests. Much shorter when live:
      // * the push signal and the backstop timer can land close together, and a
      // * 10s window would swallow the very refetch the signal asked for.
      dedupingInterval: live ? 2_000 : 10_000,
      /**
       * PULSE-226 (a backgrounded tab does not catch up): the 60s `refreshInterval` above
       * already existed for every non-live period — that part was never the
       * bug, and the fix below does not touch it. The gap is what happens
       * while the tab is BACKGROUNDED. SWR's refreshInterval re-arms its own
       * timer on a plain `setTimeout` chain and checks `refreshWhenHidden`
       * (default `false`) before each tick — node_modules/swr/dist/index/index.mjs,
       * the polling effect's `execute()`: `if (!getCache().error && (refreshWhenHidden
       * || getConfig().isVisible()) && ...)`. While the document is hidden that
       * condition is false, so the tick is SKIPPED (not paused and caught up —
       * skipped, then it just reschedules another full interval via `next()`).
       * A tab backgrounded for an hour and brought back gets nothing until the
       * NEXT scheduled tick fires, which can be up to a full 60s away — that
       * "stale until it happens to tick" window is the defect.
       *
       * `revalidateOnFocus: true` re-arms SWR's OTHER revalidation path:
       * `initFocus` (same file, `_internal`) listens for both the window
       * `focus` event AND the document `visibilitychange` event, and on
       * either one every mounted key with `revalidateOnFocus` on fires a
       * revalidation — gated only by `isActive()` (document not hidden, and
       * online) and by `focusThrottleInterval`. So returning to a
       * backgrounded tab fires `visibilitychange` immediately, which
       * revalidates this key right away instead of waiting out the rest of
       * the 60s tick.
       *
       * `focusThrottleInterval: 30_000`: throttled per key (a local
       * `nextFocusRevalidatedAt` closed over inside the hook's own effect,
       * not a global cooldown), so it only bounds how often FOCUS events can
       * trigger a fetch for THIS key — it has no effect on the unconditional
       * 60s timer above. 30s is half the 60s poll cadence: a visible tab can
       * never get more than one focus-triggered fetch per half of its normal
       * cadence, so alt-tabbing or window-switching repeatedly collapses to
       * at most one extra request per 30s, never "one request per flip" (the
       * library default is 5s, which would not meaningfully guard against a
       * fast tab-flipper). It is also well above the 10s `dedupingInterval`
       * above, so the two only interact when a focus event lands inside 10s
       * of the periodic tick's own fetch — in that narrow case `dedupe: true`
       * (SWR calls focus revalidation with `WITH_DEDUPE`) makes the focus
       * fetch reuse that in-flight/just-finished request instead of firing a
       * second one, rather than racing it.
       *
       * Scoped to non-live only (`!live`): realtime (minutes) mode is
       * unchanged — it is driven by the WebSocket push via `useRealtimeSync`
       * calling `mutate`, with the 15s timer above only as a backstop for a
       * dropped message, so it already self-heals on its own signal and does
       * not need a focus listener.
       */
      revalidateOnFocus: !live,
      focusThrottleInterval: 30_000,
    }
  )
}

// * Hook for stats (refreshed less frequently). Route class `customer`.
export function useStats(siteId: string, start: string, end: string, filters?: string, period?: string) {
  return useSiteSWR<StatsResponse>(
    siteId, 'customer',
    (siteKey) => siteId && (period || (start && end)) ? ['stats', siteKey, period ?? '', start, end, filters] : null,
    (ref) => getStats(ref, start, end, filters, period),
    {
      ...dashboardSWRConfig,
      // * Refresh every 60 seconds for stats
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
      // PULSE-226: same backgrounded-tab gap as useDashboard (see its comment
      // for the full SWR citation) — this hook drives the same dashboard
      // page's KPI numbers on the same 60s/10s cadence, so it gets the same
      // treatment.
      revalidateOnFocus: true,
      focusThrottleInterval: 30_000,
    }
  )
}

// * Hook for the Pages surface.
// *
// * limit defaults to 500 rather than the API's 10: this surface exists BECAUSE
// * the tail matters — production's busiest site has 520 distinct paths with only
// * 49.3% of its pageviews in the top 10. Sorting and searching happen client
// * side over the fetched set, so the fetch has to carry more than a screenful.
// * Route class `demo`.
export function usePagesTable(
  siteId: string,
  start: string,
  end: string,
  limit = 500,
  filters?: string,
  period?: string
) {
  return useSiteSWR<PagesTableData>(
    siteId, 'demo',
    (siteKey) => siteId && (period || (start && end)) ? ['pagesTable', siteKey, period ?? '', start, end, limit, filters] : null,
    (ref) => getPagesTable(ref, start, end, limit, filters, period),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
      // PULSE-226: same backgrounded-tab gap as useDashboard (see its comment).
      // The Pages table is the same site-dashboard shell on the same 60s/10s
      // cadence as the surfaces above.
      revalidateOnFocus: true,
      focusThrottleInterval: 30_000,
    }
  )
}

// * Hook for daily stats (refreshed less frequently). Route class `customer`.
export function useDailyStats(
  siteId: string,
  start: string,
  end: string,
  interval: 'hour' | 'day' | 'minute',
  filters?: string,
  period?: string
) {
  return useSiteSWR<DailyStat[]>(
    siteId, 'customer',
    (siteKey) => siteId && (period || (start && end)) ? ['dailyStats', siteKey, period ?? '', start, end, interval, filters] : null,
    (ref) => getDailyStats(ref, start, end, interval, filters, period),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
      // PULSE-226: same backgrounded-tab gap as useDashboard (see its
      // comment). This is the dashboard's own trend chart (PeakHours), same
      // page, same 60s/10s cadence.
      revalidateOnFocus: true,
      focusThrottleInterval: 30_000,
    }
  )
}

// * Hook for realtime visitor count (refreshes with dashboard data).
// * Route class `customer`. Under a public scope there is no socket (useRealtimeSync does nothing), so the
// * count is only as live as this poll: `refreshInterval`.
export function useRealtime(siteId: string, refreshInterval: number = 60_000) {
  return useSiteSWR<{ visitors: number }>(
    siteId, 'customer',
    (siteKey) => siteId ? ['realtime', siteKey] : null,
    (ref) => fetchers.realtime(ref),
    {
      ...dashboardSWRConfig,
      // * Refresh every 60 seconds, aligned with dashboard data cycle
      refreshInterval,
      // * Revalidate on tab focus — SWR pauses polling when tab is hidden,
      // * so re-fetch immediately when the user returns
      revalidateOnFocus: true,
      // * Deduping interval to prevent duplicate requests
      dedupingInterval: 10_000,
      // * Keep previous data while loading new data
      keepPreviousData: true,
    }
  )
}

// * Hook for campaigns data (the Campaigns card's rows and its paged full list)
/**
 * Campaigns for a CARD — explicit dates, filter-aware, keyed on every argument
 * that changes the answer.
 *
 * 🔴 SEPARATE FROM useCampaigns ON PURPOSE, and the difference is the bug this
 * was written for. useCampaigns keys on `period || dates` because the SERVER
 * resolves the period, so the dates are redundant there. A card is handed
 * already-resolved dates and no period, so the DATES are its identity — keying
 * on anything less lets one range's rows be served for another's.
 *
 * It replaces a bare useEffect + useState fetch that had no error state, no
 * abort guard and a production no-op logger, so a failed or superseded request
 * rendered the identical "No UTM data yet" empty state as a genuinely empty
 * range. SWR gives three honest states and guarantees the newest key's data
 * wins, which is what stops a stale in-flight response overwriting a fresh one.
 */
export function useCampaignsList(
  siteId: string,
  start: string,
  end: string,
  limit: number,
  filters?: string,
  enabled = true,
  // 🔴 Sub-day rolling windows (1h/24h) MUST pass their period token: their
  // resolved dates are whole DAYS, and a window that crosses midnight spans
  // two of them — the date-only fetch then returns two full days of rows
  // (04-09-2026: yesterday's campaigns shown on the Last-1-hour view). The
  // server resolves the period; dates alone are only a sufficient identity
  // for day-granular ranges.
  period?: string,
  /** Realtime mode's rolling window; replaces the dates and the period (see LIVE_LIST_KEY). */
  liveMinutes?: number,
) {
  const live = liveMinutes != null
  return useSiteSWR<CampaignStat[]>(
    siteId, 'demo',
    (siteKey) => !enabled || !siteId ? null
      : live ? ['campaignsList', siteKey, LIVE_LIST_KEY, liveMinutes, limit, filters]
        : start && end ? ['campaignsList', siteKey, start, end, limit, filters, period ?? ''] : null,
    (ref) => getCampaigns(ref, start, end, limit, filters, live ? undefined : period, liveMinutes),
    {
      ...dashboardSWRConfig,
      refreshInterval: live ? liveListSWRConfig.refreshInterval : 60 * 1000,
      dedupingInterval: live ? liveListSWRConfig.dedupingInterval : 10 * 1000,
      // PULSE-226: same backgrounded-tab gap as useDashboard (see its
      // comment) for the non-live branch — the Sources/Campaigns card lives
      // on the same dashboard page. Live mode is untouched, same reason as
      // useDashboard: it already self-heals off the dashboard fan-out's own
      // live signal, not focus.
      revalidateOnFocus: !live,
      focusThrottleInterval: 30_000,
    }
  )
}

export function useCampaigns(siteId: string, start: string, end: string, limit = 100, period?: string) {
  return useSiteSWR<CampaignStat[]>(
    siteId, 'demo',
    (siteKey) => siteId && (period || (start && end)) ? ['campaigns', siteKey, period ?? '', start, end, limit] : null,
    (ref) => getCampaigns(ref, start, end, limit, undefined, period),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for the journeys Sankey: the flow, bounded on the server (top 50 pages
// * per column, exact totals). NO refreshInterval: Journeys' window ends
// * yesterday and its tables are rebuilt by a producer, so polling a once-a-day
// * dataset every minute only re-ran the read (and the server caches it 60 s
// * anyway). A new range, depth, entry page or filter is a new key and fetches.
export function useJourneyFlow(siteId: string, start: string, end: string, depth?: number, entryPath?: string, filters?: string, period?: string) {
  return useSiteSWR<JourneyFlow>(
    siteId, 'demo',
    (siteKey) => siteId && start && end ? ['journeyFlow', siteKey, period ?? '', start, end, depth, entryPath, filters] : null,
    (ref) => fetchers.journeyFlow(ref, start, end, depth, entryPath, filters, period),
    {
      ...dashboardSWRConfig,
      dedupingInterval: 10 * 1000,
      // * Depth/entry/period changes keep the canvas rendered with the previous
      // * data while the new key loads — no full-page skeleton after first load.
      keepPreviousData: true,
    }
  )
}

// * Hook for journey entry points (refreshes less frequently)
export function useJourneyEntryPoints(siteId: string, start: string, end: string, filters?: string, period?: string) {
  return useSiteSWR<EntryPoint[]>(
    siteId, 'demo',
    (siteKey) => siteId && start && end ? ['journeyEntryPoints', siteKey, period ?? '', start, end, filters] : null,
    (ref) => fetchers.journeyEntryPoints(ref, start, end, filters, period),
    {
      ...dashboardSWRConfig,
      refreshInterval: 5 * 60 * 1000,
      dedupingInterval: 30 * 1000,
      keepPreviousData: true,
    }
  )
}

// * Hook for funnels list. Route class `demo`: every funnel read is.
export function useFunnels(siteId: string) {
  return useSiteSWR<Funnel[]>(
    siteId, 'demo',
    (siteKey) => siteId ? ['funnels', siteKey] : null,
    (ref) => fetchers.funnels(ref),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
      keepPreviousData: true,
    }
  )
}

// * Hook for a single funnel
export function useFunnelDetail(siteId: string, funnelId: string) {
  return useSiteSWR<Funnel>(
    siteId, 'demo',
    (siteKey) => siteId && funnelId ? ['funnel', siteKey, funnelId] : null,
    (ref) => getFunnel(ref, funnelId),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
    }
  )
}

// * Hook for the batched list-stats endpoint: every funnel's stats in ONE
// * request. The list page calls this twice (current + previous range)
// * instead of two requests per funnel per poll.
export function useFunnelListStats(siteId: string, startDate: string, endDate: string, filters?: string, period?: string) {
  return useSiteSWR<Record<string, FunnelStats>>(
    siteId, 'demo',
    (siteKey) => siteId && startDate && endDate ? ['funnelListStats', siteKey, period ?? '', `${startDate}-${endDate}`, filters] : null,
    (ref) => getAllFunnelStats(ref, startDate, endDate, filters, period),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
      keepPreviousData: true,
    }
  )
}

// * Hook for funnel step-level stats
export function useFunnelStats(siteId: string, funnelId: string, startDate: string, endDate: string, filters?: string, period?: string) {
  return useSiteSWR<FunnelStats>(
    siteId, 'demo',
    (siteKey) => siteId && funnelId && startDate && endDate ? ['funnelStats', siteKey, funnelId, period ?? '', `${startDate}-${endDate}`, filters] : null,
    (ref) => getFunnelStats(ref, funnelId, startDate, endDate, filters, period),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
      keepPreviousData: true,
    }
  )
}

// * Hook for funnel completion trends over time. editEpoch is bumped by the
// * detail page after an edit so the daily series refetches immediately — a
// * step change would otherwise keep showing pre-edit numbers for up to a
// * poll cycle (the key carries only ids and range).
export function useFunnelTrends(siteId: string, funnelId: string, startDate: string, endDate: string, filters?: string, editEpoch?: number, period?: string) {
  return useSiteSWR<FunnelTrends>(
    siteId, 'demo',
    (siteKey) => siteId && funnelId && startDate && endDate ? ['funnelTrends', siteKey, funnelId, period ?? '', `${startDate}-${endDate}`, filters, editEpoch ?? 0] : null,
    (ref) => getFunnelTrends(ref, funnelId, startDate, endDate, 'day', filters, period),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
      keepPreviousData: true,
    }
  )
}

// * Hook for a funnel step's dimension breakdown (step is 0-based, per the
// * API). editEpoch: same immediate-refetch-after-edit device as trends.
export function useFunnelBreakdown(
  siteId: string,
  funnelId: string,
  step: number,
  dimension: string,
  startDate: string,
  endDate: string,
  filters?: string,
  editEpoch?: number,
  period?: string,
) {
  return useSiteSWR<FunnelBreakdown>(
    siteId, 'demo',
    (siteKey) => siteId && funnelId && step >= 0 && dimension && startDate && endDate
      ? ['funnelBreakdown', siteKey, funnelId, step, dimension, period ?? '', `${startDate}-${endDate}`, filters, editEpoch ?? 0]
      : null,
    (ref) => getFunnelBreakdown(ref, funnelId, step, dimension, startDate, endDate, filters, period),
    {
      ...dashboardSWRConfig,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  )
}

// * Hook for uptime status (refreshes every 30s to match original polling).
// * start/end are UTC calendar days; omitted = the API's 90-day default.
export function useUptimeStatus(siteId: string, start?: string, end?: string, period?: string) {
  return useSiteSWR<UptimeStatusResponse>(
    siteId, 'demo',
    // 🔴 Requires the dates. This keyed on siteId ALONE, so a page withholding
    // its range while the period resolved still fired — the one gate the other
    // hooks give for free by null-keying on an empty date.
    (siteKey) => siteId && start && end ? ['uptimeStatus', siteKey, period ?? '', start, end] : null,
    (ref) => fetchers.uptimeStatus(ref, start, end, period),
    {
      ...dashboardSWRConfig,
      refreshInterval: 30 * 1000,
      dedupingInterval: 10 * 1000,
      keepPreviousData: true,
    }
  )
}

// * Hook for uptime incident episodes overlapping the range
export function useUptimeIncidents(siteId: string, start: string, end: string, period?: string) {
  return useSiteSWR<UptimeIncidentsResponse>(
    siteId, 'demo',
    (siteKey) => siteId && start && end ? ['uptimeIncidents', siteKey, period ?? '', start, end] : null,
    (ref) => fetchers.uptimeIncidents(ref, start, end, period),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
      keepPreviousData: true,
    }
  )
}

// * Hook for the server-bucketed latency series (the server owns hour/day
// * granularity and echoes it — never re-bucket client-side)
export function useUptimeResponseTimes(siteId: string, monitorId: string | undefined, start: string, end: string, period?: string) {
  return useSiteSWR<UptimeResponseTimesResponse>(
    siteId, 'demo',
    (siteKey) => siteId && monitorId ? ['uptimeResponseTimes', siteKey, monitorId, period ?? '', start, end] : null,
    (ref) => fetchers.uptimeResponseTimes(ref, monitorId as string, start, end, period),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
      keepPreviousData: true,
    }
  )
}

// * Hook for a monitor's recent raw checks (replaces the page's imperative
// * useEffect fetch — same SWR error/retry semantics as everything else)
export function useUptimeChecks(siteId: string, monitorId: string | undefined, limit = 50) {
  return useSiteSWR<UptimeCheck[]>(
    siteId, 'demo',
    (siteKey) => siteId && monitorId ? ['uptimeChecks', siteKey, monitorId, limit] : null,
    (ref) => fetchers.uptimeChecks(ref, monitorId as string, limit),
    {
      ...dashboardSWRConfig,
      refreshInterval: 30 * 1000,
      dedupingInterval: 10 * 1000,
      keepPreviousData: true,
    }
  )
}

// * Hook for goals list. Route class `demo`.
export function useGoals(siteId: string) {
  return useSiteSWR<Goal[]>(
    siteId, 'demo',
    (siteKey) => siteId ? ['goals', siteKey] : null,
    (ref) => fetchers.goals(ref),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hooks for Search Console: route class `demo` throughout (the status, the data and the drill-downs).
// * Hook for GSC connection status
export function useGSCStatus(siteId: string) {
  return useSiteSWR<GSCStatus>(
    siteId, 'demo',
    (siteKey) => siteId ? ['gscStatus', siteKey] : null,
    (ref) => fetchers.gscStatus(ref),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 30 * 1000,
    }
  )
}

// * Hook for GSC overview metrics (clicks, impressions, CTR, position)
export function useGSCOverview(siteId: string, start: string, end: string) {
  return useSiteSWR<GSCOverview>(
    siteId, 'demo',
    (siteKey) => siteId && start && end ? ['gscOverview', siteKey, start, end] : null,
    (ref) => fetchers.gscOverview(ref, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC top queries
export function useGSCTopQueries(siteId: string, start: string, end: string, limit = 50, offset = 0) {
  return useSiteSWR<GSCQueryResponse>(
    siteId, 'demo',
    (siteKey) => siteId && start && end ? ['gscTopQueries', siteKey, start, end, limit, offset] : null,
    (ref) => fetchers.gscTopQueries(ref, start, end, limit, offset),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC top pages
export function useGSCTopPages(siteId: string, start: string, end: string, limit = 50, offset = 0) {
  return useSiteSWR<GSCPageResponse>(
    siteId, 'demo',
    (siteKey) => siteId && start && end ? ['gscTopPages', siteKey, start, end, limit, offset] : null,
    (ref) => fetchers.gscTopPages(ref, start, end, limit, offset),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC daily totals (clicks & impressions per day)
export function useGSCDailyTotals(siteId: string, start: string, end: string) {
  return useSiteSWR<{ daily_totals: GSCDailyTotal[] }>(
    siteId, 'demo',
    (siteKey) => siteId && start && end ? ['gscDailyTotals', siteKey, start, end] : null,
    (ref) => fetchers.gscDailyTotals(ref, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC new queries (queries that appeared in the current period)
export function useGSCNewQueries(siteId: string, start: string, end: string) {
  return useSiteSWR<GSCNewQueries>(
    siteId, 'demo',
    (siteKey) => siteId && start && end ? ['gscNewQueries', siteKey, start, end] : null,
    (ref) => fetchers.gscNewQueries(ref, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC top countries
export function useGSCTopCountries(siteId: string, start: string, end: string, limit = 50, offset = 0) {
  const { data: status } = useGSCStatus(siteId)
  return useSiteSWR<GSCCountryResponse>(
    siteId, 'demo',
    (siteKey) => status?.connected ? [`gsc-top-countries`, siteKey, start, end, limit, offset] : null,
    (ref) => getGSCTopCountries(ref, start, end, limit, offset),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC top devices
export function useGSCTopDevices(siteId: string, start: string, end: string) {
  const { data: status } = useGSCStatus(siteId)
  return useSiteSWR<GSCDeviceResponse>(
    siteId, 'demo',
    (siteKey) => status?.connected ? [`gsc-top-devices`, siteKey, start, end] : null,
    (ref) => getGSCTopDevices(ref, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC opportunities (striking-distance queries)
export function useGSCOpportunities(siteId: string, start: string, end: string, limit = 50) {
  const { data: status } = useGSCStatus(siteId)
  return useSiteSWR<GSCOpportunityResponse>(
    siteId, 'demo',
    (siteKey) => status?.connected ? [`gsc-opportunities`, siteKey, start, end, limit] : null,
    (ref) => getGSCOpportunities(ref, start, end, limit),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Drill-down: the pages contributing to a query (queries-view expansion). The
// * key includes the query, so each expanded row owns its own cache entry — two
// * quick expands can't cross-render (the old shared-state race). Null key while
// * collapsed (query empty); keepPreviousData holds the prior pages across a
// * range revalidation.
export function useGSCQueryPages(siteId: string, query: string, start: string, end: string) {
  return useSiteSWR<GSCPageResponse>(
    siteId, 'demo',
    (siteKey) => siteId && query && start && end ? ['gscQueryPages', siteKey, query, start, end] : null,
    (ref) => getGSCQueryPages(ref, query, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true },
  )
}

// * Drill-down: the queries contributing to a page (pages-view expansion).
export function useGSCPageQueries(siteId: string, page: string, start: string, end: string) {
  return useSiteSWR<GSCQueryResponse>(
    siteId, 'demo',
    (siteKey) => siteId && page && start && end ? ['gscPageQueries', siteKey, page, start, end] : null,
    (ref) => getGSCPageQueries(ref, page, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true },
  )
}

// * A single query's daily position/clicks trend (queries-view sparkline). Null
// * key until the row is expanded (query empty).
export function useGSCQueryTrend(siteId: string, query: string, start: string, end: string) {
  return useSiteSWR<GSCQueryTrendPoint[]>(
    siteId, 'demo',
    (siteKey) => siteId && query && start && end ? ['gscQueryTrend', siteKey, query, start, end] : null,
    (ref) => getGSCQueryTrend(ref, query, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true },
  )
}

// * Hooks for the CDN page: route class `demo` throughout.
// * Hook for BunnyCDN connection status
export function useBunnyStatus(siteId: string) {
  return useSiteSWR<BunnyStatus>(
    siteId, 'demo',
    (siteKey) => siteId ? ['bunnyStatus', siteKey] : null,
    (ref) => fetchers.bunnyStatus(ref),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 30 * 1000 }
  )
}

// * Hook for BunnyCDN overview metrics (bandwidth, requests, cache hit rate)
export function useBunnyOverview(siteId: string, startDate: string, endDate: string, period?: string) {
  return useSiteSWR<BunnyOverview>(
    siteId, 'demo',
    (siteKey) => siteId && startDate && endDate ? ['bunnyOverview', siteKey, period ?? '', startDate, endDate] : null,
    (ref) => fetchers.bunnyOverview(ref, startDate, endDate, period),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for BunnyCDN daily stats (bandwidth & requests per day)
export function useBunnyDailyStats(siteId: string, startDate: string, endDate: string, period?: string) {
  return useSiteSWR<{ daily_stats: BunnyDailyRow[] }>(
    siteId, 'demo',
    (siteKey) => siteId && startDate && endDate ? ['bunnyDailyStats', siteKey, period ?? '', startDate, endDate] : null,
    (ref) => fetchers.bunnyDailyStats(ref, startDate, endDate, period),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for the live edge-region distribution. The backend proxies Bunny's
// * statistics API at request time (there is no stored geo table any more —
// * migration 137), so a slightly longer dedupe keeps a tab-refocus from
// * re-spending the customer's API budget inside the backend's own 2-min cache.
export function useBunnyRegions(siteId: string, startDate: string, endDate: string, period?: string) {
  return useSiteSWR<BunnyRegionsResponse>(
    siteId, 'demo',
    (siteKey) => siteId && startDate && endDate ? ['bunnyRegions', siteKey, period ?? '', startDate, endDate] : null,
    (ref) => fetchers.bunnyRegions(ref, startDate, endDate, period),
    { ...dashboardSWRConfig, keepPreviousData: true, dedupingInterval: 60 * 1000 }
  )
}

// * Live trailing-24h hourly stats. 60s refresh matches the backend's own
// * per-replica cache TTL — polling faster only re-reads the cache.
// *
// * A live surface must SELF-HEAL: SWR's poller refuses to revalidate while
// * an error sits in the cache, and the base config's onErrorRetry gives up
// * after three attempts — together they freeze the card for the whole page
// * session after one transient 502. So errors keep retrying on the same 60s
// * cadence indefinitely (auth failures excepted — retrying those makes it
// * worse), and returning to the tab revalidates, same as useRealtime.
export function useBunnyLive(siteId: string) {
  return useSiteSWR<BunnyLiveResponse>(
    siteId, 'demo',
    (siteKey) => siteId ? ['bunnyLive', siteKey] : null,
    (ref) => fetchers.bunnyLive(ref),
    {
      ...dashboardSWRConfig,
      keepPreviousData: true,
      dedupingInterval: 60 * 1000,
      refreshInterval: 60 * 1000,
      revalidateOnFocus: true,
      onErrorRetry: (error: any, _key, _config, revalidate, { retryCount }) => {
        if (error?.status === 401 || error?.status === 403) return
        setTimeout(() => void revalidate({ retryCount }), 60 * 1000)
      },
    }
  )
}

// * Hook for subscription details (changes rarely).
// * Returns null key when not authenticated to avoid 401 on public pages.
// * Route class `member` (no site, no public route): never read under a public scope, so a signed-in
// * visitor on /demo does not send their billing read from a public page.
export function useSubscription() {
  const { user } = useAuth()
  const available = siteReadAvailable(useOptionalSiteScope(), null, 'member')
  const swr = useSWR<SubscriptionDetails>(
    available && user ? 'subscription' : null,
    () => fetchers.subscription(),
    {
      ...dashboardSWRConfig,
      refreshInterval: 5 * 60 * 1000,
      dedupingInterval: 30 * 1000,
    }
  )
  return withAvailability(swr, available)
}

// * Hook for quarantine stats (Cerberus). Route class `member`.
export function useQuarantineStats(siteId: string | undefined) {
  return useSiteSWR<QuarantineStats>(
    siteId, 'member',
    (siteKey) => siteId ? ['quarantineStats', siteKey] : null,
    () => getQuarantineStats(siteId!),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000 }
  )
}

// * Hooks for the Performance page: route class `demo` throughout (a share link serves none of them).
// * Hook for Performance config. GET only: it is the page's read of whether checks are on, and the public
// * route answers it; the write that changes it is a member action the page does not draw publicly.
export function usePerformanceConfig(siteId: string) {
  return useSiteSWR<PerformanceConfig>(
    siteId, 'demo',
    (siteKey) => siteId ? ['performanceConfig', siteKey] : null,
    (ref) => fetchers.performanceConfig(ref),
    { ...dashboardSWRConfig, refreshInterval: 0, dedupingInterval: 10 * 1000 }
  )
}

// * Hook for the latest Performance checks. Returns BOTH the newest successful
// * check per strategy (`checks` — the numbers to render) and the newest attempt
// * per strategy whatever its outcome (`attempts` — what the status line
// * reports). They are not the same thing after a failed check, and treating
// * them as one is how a stale check used to be presented as current.
export function usePerformanceLatest(siteId: string) {
  return useSiteSWR<PerformanceLatest>(
    siteId, 'demo',
    (siteKey) => siteId ? ['performanceLatest', siteKey] : null,
    (ref) => fetchers.performanceLatest(ref),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000, keepPreviousData: true }
  )
}

// * Hook for Performance score history (trend chart)
export function usePerformanceHistory(siteId: string, strategy: 'mobile' | 'desktop', days = 90) {
  return useSiteSWR<PerformanceCheck[]>(
    siteId, 'demo',
    (siteKey) => siteId ? ['performanceHistory', siteKey, strategy, days] : null,
    (ref) => fetchers.performanceHistory(ref, strategy, days),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000, keepPreviousData: true }
  )
}

// * Re-export for convenience
export { fetchers }

// ─── Bing Webmaster Tools ────────────────────────────────────────────────────
//
// * Daily totals only. Bing's per-query endpoint refreshes weekly and takes no date range, so it
// * cannot honour the Search tab's date picker — see pulse-backend migration 134.

// * Bing: route class `demo` throughout.
// * Hook for Bing connection status. Same cadence as GSC: a connect or a sync failure should
// * appear on the settings card without a manual refresh.
export function useBingStatus(siteId: string) {
  return useSiteSWR<BingStatus>(
    siteId, 'demo',
    (siteKey) => siteId ? ['bingStatus', siteKey] : null,
    (ref) => fetchers.bingStatus(ref),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 30 * 1000,
    }
  )
}

// * Hook for Bing period totals.
// *
// * 🔑 GATED ON status?.connected, matching every GSC data hook. Without the gate every site
// * without a Bing connection would issue two requests per date change forever, and the endpoint
// * would answer with empty rows that are indistinguishable from "connected, no traffic".
export function useBingOverview(siteId: string, start: string, end: string) {
  const { data: status } = useBingStatus(siteId)
  return useSiteSWR<{ overview: BingOverview; date_basis: BingDateBasis }>(
    siteId, 'demo',
    (siteKey) => status?.connected ? ['bing-overview', siteKey, start, end] : null,
    (ref) => getBingOverview(ref, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for the Bing daily series that backs the chart.
export function useBingDailyTotals(siteId: string, start: string, end: string) {
  const { data: status } = useBingStatus(siteId)
  return useSiteSWR<{ daily_totals: BingDailyRow[]; date_basis: BingDateBasis }>(
    siteId, 'demo',
    (siteKey) => status?.connected ? ['bing-daily-totals', siteKey, start, end] : null,
    (ref) => getBingDailyTotals(ref, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// ─── Dashboard overhaul Phase 3 (F17): the six imperative fetches become SWR
// hooks so a failed request has an ERROR state instead of masquerading as
// "not enough data yet" — the fabricated-explanation antipattern the audit
// measured on this page.

// ─── Realtime mode's lists (PULSE-192) ────────────────────────────────────
//
// 🔴 In realtime mode the KPI rail and the chart read /dashboard?minutes=5, but until
// 01-10-2026 every list a card fetched ON ITS OWN (the full list behind its pagination,
// Outbound's two lists, the Campaigns view, a goal's property breakdown) was sent the
// CALENDAR DATES of the live view, which are today. A card that overflowed one page then
// showed the whole day under a five-minute KPI rail: a customer saw 510 visitors in the
// rail and one referrer with 9,640 below it. Invisible on small sites, whose five-minute
// lists rarely overflow a page.
//
// So every such list takes the live window as `minutes` and, when it is set:
//  - fetches `minutes=` instead of dates (the server answers it with the dashboard's own
//    bounds, dashboardRange in pulse-backend);
//  - keys its SWR entry on LIVE_LIST_KEY + minutes, never on the dates. 🔴 Keying a live
//    list on its dates would share an entry with Today's list (both are today's date) and
//    each would serve the other's rows across a mode switch;
//  - refreshes with the dashboard: the page's live signal revalidates every key that
//    isLiveListKey matches, and the same 15 s backstop the fan-out uses covers a dropped
//    signal.
export const LIVE_LIST_KEY = '__live__'
const LIVE_LIST_KINDS = new Set(['fullList', 'outbound', 'campaignsList'])

/**
 * Matches every live list SWR key of one site: what the page revalidates on its live signal.
 *
 * A plain id matches the member keys (as it always did); a public ref matches that site's public keys,
 * which carry `public:<id>` where a member key carries the id (siteRefKey).
 */
export function isLiveListKey(site: SiteRef) {
  const siteKey = siteRefKey(site)
  return (key: unknown): boolean =>
    Array.isArray(key) && LIVE_LIST_KINDS.has(key[0]) && key.includes(siteKey) && key.includes(LIVE_LIST_KEY)
}

/** The live lists' refresh cadence: the dashboard fan-out's own (useDashboard). */
const liveListSWRConfig = { refreshInterval: 15_000, dedupingInterval: 2_000 }

// * The full-list fetchers behind every card's "view all" modal, keyed by the
// * card's tab. `kind: null` (modal closed) fetches nothing; opening the modal
// * arms the key. Filters ride along so a modal opened from a filtered card
// * shows the SAME population as the card (F14 — the silent swap is gone).
const fullListFetchers = {
  pages: getTopPages,
  'entry-pages': getEntryPages,
  'exit-pages': getExitPages,
  referrers: getTopReferrers,
  countries: getCountries,
  cities: getCities,
  regions: getRegions,
  languages: getLanguages,
  // PULSE-173: the Languages tab's grouped-by-base-language full list. Kept as
  // a SEPARATE kind (not a flag on 'languages') so the SWR cache key never
  // collides between the per-locale and grouped shapes of the same endpoint.
  'languages-grouped': getLanguageGroups,
  timezones: getTimezones,
  browsers: getBrowsers,
  os: getOS,
  devices: getDevices,
  'screen-resolutions': getScreenResolutions,
} as const

export type FullListKind = keyof typeof fullListFetchers

// * Route class `demo`: every dimension list is a route only the demo is served; a share link reads
// * the top rows out of its dashboard payload and has no "view all".
export function useFullDimensionList<T>(
  kind: FullListKind | null, siteId: string, start: string, end: string,
  limit: number, filters?: string,
  /** Realtime mode's rolling window; replaces the dates (see LIVE_LIST_KEY). */
  liveMinutes?: number,
) {
  const live = liveMinutes != null
  return useSiteSWR<T[]>(
    siteId, 'demo',
    (siteKey) => !kind || !siteId ? null
      : live ? ['fullList', kind, siteKey, LIVE_LIST_KEY, liveMinutes, limit, filters]
        : start && end ? ['fullList', kind, siteKey, start, end, limit, filters] : null,
    (ref) => fullListFetchers[kind as FullListKind](ref, start, end, limit, filters, undefined, liveMinutes) as Promise<T[]>,
    // 🔴 NO keepPreviousData here. The cards arm this key only while their
    // list overflows; on a range switch the key can go NULL, and
    // keepPreviousData retains the OLD RANGE's rows on a null key forever —
    // which is how the blocks froze on 30-day data after switching to Today
    // (01-09-2026). While a new range's list loads, the dashboard fan-out
    // rows are the correct same-range fallback, so nothing flashes empty.
    { ...dashboardSWRConfig, ...(live ? liveListSWRConfig : {}) }
  )
}

// * The Outbound card's two lists: every outbound_link destination and the
// * page each click happened on, as EVENT counts (the property endpoints do
// * not count people and take no filters — the card labels both facts).
// * Keyed on the resolved dates AND the period token, and the token is SENT
// * (a `1h`/`today` window resolves in the site's timezone server-side; a
// * date-only fetch spans two days when the window crosses midnight — the
// * campaigns lesson of 02-09-2026). 1,000 rows = the endpoint's ceiling.
export interface OutboundLists {
  urls: EventPropertyValue[]
  paths: EventPropertyValue[]
}
export const OUTBOUND_ROW_LIMIT = 1000
// * Route class `demo`.
export function useOutboundLinks(siteId: string, start: string, end: string, period?: string, liveMinutes?: number) {
  const live = liveMinutes != null
  return useSiteSWR<OutboundLists>(
    siteId, 'demo',
    (siteKey) => !siteId ? null
      : live ? ['outbound', siteKey, LIVE_LIST_KEY, liveMinutes]
        : start && end ? ['outbound', siteKey, start, end, period ?? ''] : null,
    async (ref) => {
      const p = live ? undefined : period
      const [urls, paths] = await Promise.all([
        getEventPropertyValues(ref, 'outbound_link', 'url', start, end, OUTBOUND_ROW_LIMIT, p, liveMinutes),
        getEventPropertyValues(ref, 'outbound_link', 'page_path', start, end, OUTBOUND_ROW_LIMIT, p, liveMinutes),
      ])
      return { urls, paths }
    },
    { ...dashboardSWRConfig, ...(live ? liveListSWRConfig : { refreshInterval: 60_000, dedupingInterval: 10_000 }) }
  )
}

// * The scroll-depth card's full-page backdrop. null data = no capture exists
// * (a state the card renders via its rails fallback); errors are real
// * failures and also fall back. The image changes at most once per
// * performance check, so no polling and a long dedupe.
//
// * Route class `customer`: /page-preview is one of the five routes a share link is served, so
// * the card reads it under every scope. Under a public scope the read goes to the public route by itself,
// * whatever `member` says: the scope decides, not the caller (components/dashboard/ContentSignals passes
// * `member` today, and a public page cannot be allowed to get it wrong).
export function usePagePreview(siteId: string, member = true) {
  // member=false outside a scope is the legacy anonymous share page: same card, the public
  // endpoint (is_public sites only; the capture is the site's own page).
  // The flag is part of the key so a member view never shares an entry with
  // a public one. Under a public scope the key's site part already says so (`public:<id>`), and the flag
  // is false, as for any anonymous read.
  return useSiteSWR<PagePreviewData | null>(
    siteId, 'customer',
    (siteKey, ref) => siteId ? ['pagePreview', siteKey, isPublicSiteRef(ref) ? false : member] : null,
    (ref) => (isPublicSiteRef(ref) || member ? getPagePreview(ref) : getPublicPagePreview(siteId)),
    { ...dashboardSWRConfig, refreshInterval: 0, dedupingInterval: 5 * 60 * 1000, keepPreviousData: true }
  )
}

// ─── Visitors ───────────────────────────────────────────────────────
//
// Design: Pulse/docs/plans/30-08-2026-visitors-surface-design.md §4.
//
// 🔑 A 403 from these is not an error to retry — it is the site's
// visitor_views_enabled toggle being off, which is a STATE the page renders (the
// enable room). dashboardSWRConfig's onErrorRetry already declines to retry or
// toast a 403, so it lands in the hook's `error` as an ApiError with .status
// 403 and the page branches on it.
//
// The keys carry `minutes` as its own slot rather than folding it into
// start/end. A rolling window and a date range are different questions, and a
// key that could not tell them apart would serve a live view from a cached
// historical one.

/**
 * A Visitors range is complete when it names a window one of three ways: rolling
 * minutes (realtime), the `all` token, or both dates. The key carries all three, so the
 * same dates under a different token can never share a cache entry.
 */
function visitorRangeReady(range: VisitorRange): boolean {
  return range.minutes != null || range.period != null || Boolean(range.startDate && range.endDate)
}

// * Route class `member` for all four: Visitors is never public (one row per person), so under a public
// * scope none of them makes a request, whatever else a page asks.
export function useVisitors(
  siteId: string,
  range: VisitorRange,
  opts: { sort: string; order: 'asc' | 'desc'; page: number; pageSize: number; enabled?: boolean },
) {
  const { startDate, endDate, minutes, period } = range
  const ready = opts.enabled !== false && Boolean(siteId) && visitorRangeReady(range)
  return useSiteSWR<VisitorsResponse>(
    siteId, 'member',
    (siteKey) => ready ? ['visitors', siteKey, startDate, endDate, minutes, period, opts.sort, opts.order, opts.page, opts.pageSize] : null,
    () => getVisitors(siteId, range, opts),
    {
      ...dashboardSWRConfig,
      // Live windows refresh; historical ranges do not need to.
      refreshInterval: minutes != null ? 20 * 1000 : 60 * 1000,
      dedupingInterval: 10 * 1000,
      // Paging and re-sorting keep the roster on screen instead of flashing a
      // skeleton — the same reason journeys keeps its canvas.
      keepPreviousData: true,
    },
  )
}

export function useVisitorProfile(
  siteId: string,
  key: string,
  range: VisitorRange,
) {
  const { startDate, endDate, minutes, period } = range
  const ready = Boolean(siteId && key) && visitorRangeReady(range)
  return useSiteSWR<VisitorProfileResponse>(
    siteId, 'member',
    (siteKey) => ready ? ['visitorProfile', siteKey, key, startDate, endDate, minutes, period] : null,
    () => getVisitorProfile(siteId, key, range),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000, keepPreviousData: true },
  )
}

export function useVisitorVisits(
  siteId: string,
  key: string,
  range: VisitorRange,
  page: number,
  pageSize: number,
) {
  const { startDate, endDate, minutes, period } = range
  const ready = Boolean(siteId && key) && visitorRangeReady(range)
  return useSiteSWR<VisitsResponse>(
    siteId, 'member',
    (siteKey) => ready ? ['visitorVisits', siteKey, key, startDate, endDate, minutes, period, page, pageSize] : null,
    () => getVisitorVisits(siteId, key, range, { page, pageSize }),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000, keepPreviousData: true },
  )
}

// The trail is fetched per EXPANDED visit — the SearchExpansion per-row-SWR
// pattern. A null visitKey (collapsed row) is a null key, so a collapsed row
// costs nothing.
export function useVisitEvents(
  siteId: string,
  key: string,
  visitKey: string | null,
  range: VisitorRange,
  page: number,
) {
  const { startDate, endDate, minutes, period } = range
  const ready = Boolean(siteId && key && visitKey) && visitorRangeReady(range)
  return useSiteSWR<VisitEventsResponse>(
    siteId, 'member',
    (siteKey) => ready ? ['visitEvents', siteKey, key, visitKey, startDate, endDate, minutes, period, page] : null,
    () => getVisitEvents(siteId, key, visitKey as string, range, page),
    { ...dashboardSWRConfig, refreshInterval: 0, dedupingInterval: 30 * 1000, keepPreviousData: true },
  )
}

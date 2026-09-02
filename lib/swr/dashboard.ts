// * SWR configuration for dashboard data fetching
// * Implements stale-while-revalidate pattern for efficient data updates

import useSWR from 'swr'
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
} from '@/lib/api/visitors'
import { toast } from '@ciphera-net/facet'
import {
  getDashboard,
  getDashboardOverview,
  getDashboardPages,
  getDashboardLocations,
  getDashboardDevices,
  getDashboardReferrers,
  getDashboardGoals,
  getCampaigns,
  getRealtime,
  getRealtimePages,
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
  getBrowsers,
  getOS,
  getDevices,
  getScreenResolutions,
  getTimezones,
  type RealtimePageVisitors,
} from '@/lib/api/stats'
import {
  getJourneyTransitions,
  getJourneyEntryPoints,
  type TransitionsResponse,
  type EntryPoint,
} from '@/lib/api/journeys'
import { getSite, getInstallStatus } from '@/lib/api/sites'
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
import {
  getQuarantineStats,
  getQuarantineEvents,
  listSessions,
  getSiteDomainReputation,
  type QuarantineStats,
  type QuarantinedEvent,
  type DomainReputation,
  type SessionSummary,
  type QuarantineFilters,
} from '@/lib/api/quarantine'
import { getGSCStatus, getGSCOverview, getGSCTopQueries, getGSCTopPages, getGSCDailyTotals, getGSCNewQueries, getGSCTopCountries, getGSCTopDevices, getGSCOpportunities, getGSCQueryPages, getGSCPageQueries, getGSCQueryTrend } from '@/lib/api/gsc'
import type { GSCStatus, GSCOverview, GSCQueryResponse, GSCPageResponse, GSCDailyTotal, GSCNewQueries, GSCCountryResponse, GSCDeviceResponse, GSCOpportunityResponse, GSCQueryTrendPoint } from '@/lib/api/gsc'
import { getBunnyStatus, getBunnyOverview, getBunnyDailyStats, getBunnyRegions, getBunnyLive } from '@/lib/api/bunny'
import type { BunnyStatus, BunnyOverview, BunnyDailyRow, BunnyRegionsResponse, BunnyLiveResponse } from '@/lib/api/bunny'
import { getSubscription, type SubscriptionDetails } from '@/lib/api/billing'
import type {
  Stats,
  DailyStat,
  CampaignStat,
  DashboardData,
  DashboardOverviewData,
  DashboardPagesData,
  DashboardLocationsData,
  DashboardDevicesData,
  DashboardReferrersData,
  DashboardGoalsData,
} from '@/lib/api/stats'

// * SWR fetcher functions
const fetchers = {
  site: (siteId: string) => getSite(siteId),
  installStatus: (siteId: string) => getInstallStatus(siteId),
  dashboard: (siteId: string, start: string, end: string, interval?: string, filters?: string, period?: string) => getDashboard(siteId, start, end, 10, interval, filters, period),
  dashboardOverview: (siteId: string, start: string, end: string, interval?: string, filters?: string) => getDashboardOverview(siteId, start, end, interval, filters),
  dashboardPages: (siteId: string, start: string, end: string, filters?: string) => getDashboardPages(siteId, start, end, undefined, filters),
  dashboardLocations: (siteId: string, start: string, end: string, filters?: string) => getDashboardLocations(siteId, start, end, undefined, undefined, filters),
  dashboardDevices: (siteId: string, start: string, end: string, filters?: string) => getDashboardDevices(siteId, start, end, undefined, filters),
  dashboardReferrers: (siteId: string, start: string, end: string, filters?: string) => getDashboardReferrers(siteId, start, end, undefined, filters),
  dashboardGoals: (siteId: string, start: string, end: string, filters?: string) => getDashboardGoals(siteId, start, end, undefined, filters),
  stats: (siteId: string, start: string, end: string, filters?: string) => getStats(siteId, start, end, filters),
  dailyStats: (siteId: string, start: string, end: string, interval: 'hour' | 'day' | 'minute') =>
    getDailyStats(siteId, start, end, interval),
  realtime: (siteId: string) => getRealtime(siteId),
  campaigns: (siteId: string, start: string, end: string, limit: number) =>
    getCampaigns(siteId, start, end, limit),
  journeyTransitions: (siteId: string, start: string, end: string, depth?: number, minSessions?: number, entryPath?: string, filters?: string) =>
    getJourneyTransitions(siteId, start, end, { depth, minSessions, entryPath, filters }),
  journeyEntryPoints: (siteId: string, start: string, end: string, filters?: string) =>
    getJourneyEntryPoints(siteId, start, end, filters),
  funnels: (siteId: string) => listFunnels(siteId),
  uptimeStatus: (siteId: string, start?: string, end?: string) => getUptimeStatus(siteId, start, end),
  uptimeIncidents: (siteId: string, start: string, end: string) => getUptimeIncidents(siteId, start, end),
  uptimeResponseTimes: (siteId: string, monitorId: string, start: string, end: string) =>
    getUptimeResponseTimes(siteId, monitorId, start, end),
  uptimeChecks: (siteId: string, monitorId: string, limit: number) => getMonitorChecks(siteId, monitorId, limit),
  performanceConfig: (siteId: string) => getPerformanceConfig(siteId),
  performanceLatest: (siteId: string) => getPerformanceLatest(siteId),
  performanceHistory: (siteId: string, strategy: 'mobile' | 'desktop', days: number) => getPerformanceHistory(siteId, strategy, days),
  goals: (siteId: string) => listGoals(siteId),
  gscStatus: (siteId: string) => getGSCStatus(siteId),
  bingStatus: (siteId: string) => getBingStatus(siteId),
  gscOverview: (siteId: string, start: string, end: string) => getGSCOverview(siteId, start, end),
  gscTopQueries: (siteId: string, start: string, end: string, limit: number, offset: number) => getGSCTopQueries(siteId, start, end, limit, offset),
  gscTopPages: (siteId: string, start: string, end: string, limit: number, offset: number) => getGSCTopPages(siteId, start, end, limit, offset),
  gscDailyTotals: (siteId: string, start: string, end: string) => getGSCDailyTotals(siteId, start, end),
  gscNewQueries: (siteId: string, start: string, end: string) => getGSCNewQueries(siteId, start, end),
  gscTopCountries: (siteId: string, start: string, end: string, limit: number, offset: number) => getGSCTopCountries(siteId, start, end, limit, offset),
  gscTopDevices: (siteId: string, start: string, end: string) => getGSCTopDevices(siteId, start, end),
  gscOpportunities: (siteId: string, start: string, end: string, limit: number) => getGSCOpportunities(siteId, start, end, limit),
  bunnyStatus: (siteId: string) => getBunnyStatus(siteId),
  bunnyOverview: (siteId: string, start: string, end: string) => getBunnyOverview(siteId, start, end),
  bunnyDailyStats: (siteId: string, start: string, end: string) => getBunnyDailyStats(siteId, start, end),
  bunnyRegions: (siteId: string, start: string, end: string) => getBunnyRegions(siteId, start, end),
  bunnyLive: (siteId: string) => getBunnyLive(siteId),
  subscription: () => getSubscription(),
}

// * Standard SWR config for dashboard data
const dashboardSWRConfig = {
  // * Keep stale data visible while revalidating (better UX)
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

// * Hook for site data (loads once, refreshes rarely)
export function useSite(siteId: string) {
  return useSWR<Site>(
    siteId ? ['site', siteId] : null,
    () => fetchers.site(siteId),
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
 * Install-health for a site. Polls more eagerly while waiting for the first
 * event (so the install-flow "listening…" loop feels live), and backs off once
 * the install is active. Returns undefined data while loading.
 */
export function useInstallStatus(siteId: string | undefined, options?: { poll?: boolean }) {
  const poll = options?.poll ?? false
  const swr = useSWR<InstallStatusResponse>(
    siteId ? ['install-status', siteId] : null,
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

export function useDashboard(siteId: string, start: string, end: string, interval?: string, filters?: string, period?: string) {
  return useSWR<DashboardData>(
    siteId && (period || (start && end)) ? ['dashboard', siteId, period ?? '', start, end, interval, filters] : null,
    () => fetchers.dashboard(siteId, start, end, interval, filters, period),
    {
      ...dashboardSWRConfig,
      // * Refresh every 60 seconds for dashboard data
      refreshInterval: 60_000,
      // * Deduping interval to prevent duplicate requests
      dedupingInterval: 10_000,
    }
  )
}

// * Hook for stats (refreshed less frequently)
export function useStats(siteId: string, start: string, end: string, filters?: string, period?: string) {
  return useSWR<Stats>(
    siteId && (period || (start && end)) ? ['stats', siteId, period ?? '', start, end, filters] : null,
    () => getStats(siteId, start, end, filters, period),
    {
      ...dashboardSWRConfig,
      // * Refresh every 60 seconds for stats
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
    }
  )
}

// * Hook for daily stats (refreshed less frequently)
export function useDailyStats(
  siteId: string,
  start: string,
  end: string,
  interval: 'hour' | 'day' | 'minute',
  filters?: string,
  period?: string
) {
  return useSWR<DailyStat[]>(
    siteId && (period || (start && end)) ? ['dailyStats', siteId, period ?? '', start, end, interval, filters] : null,
    () => getDailyStats(siteId, start, end, interval, filters, period),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
    }
  )
}

// * Hook for realtime visitor count (refreshes with dashboard data)
export function useRealtime(siteId: string, refreshInterval: number = 60_000) {
  return useSWR<{ visitors: number }>(
    siteId ? ['realtime', siteId] : null,
    () => fetchers.realtime(siteId),
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

// * Hook for per-page real-time visitor counts (refreshes every 15s)
export function useRealtimePages(siteId: string) {
  return useSWR<RealtimePageVisitors[]>(
    siteId ? ['realtimePages', siteId] : null,
    () => getRealtimePages(siteId),
    {
      ...dashboardSWRConfig,
      refreshInterval: 15_000,
      revalidateOnFocus: true,
    }
  )
}

// * Hook for focused dashboard overview data (Fix 4.2: Efficient Data Transfer)
export function useDashboardOverview(siteId: string, start: string, end: string, interval?: string, filters?: string) {
  return useSWR<DashboardOverviewData>(
    siteId && start && end ? ['dashboardOverview', siteId, start, end, interval, filters] : null,
    () => fetchers.dashboardOverview(siteId, start, end, interval, filters),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for focused dashboard pages data
export function useDashboardPages(siteId: string, start: string, end: string, filters?: string) {
  return useSWR<DashboardPagesData>(
    siteId && start && end ? ['dashboardPages', siteId, start, end, filters] : null,
    () => fetchers.dashboardPages(siteId, start, end, filters),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for focused dashboard locations data
export function useDashboardLocations(siteId: string, start: string, end: string, filters?: string) {
  return useSWR<DashboardLocationsData>(
    siteId && start && end ? ['dashboardLocations', siteId, start, end, filters] : null,
    () => fetchers.dashboardLocations(siteId, start, end, filters),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for focused dashboard devices data
export function useDashboardDevices(siteId: string, start: string, end: string, filters?: string) {
  return useSWR<DashboardDevicesData>(
    siteId && start && end ? ['dashboardDevices', siteId, start, end, filters] : null,
    () => fetchers.dashboardDevices(siteId, start, end, filters),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for focused dashboard referrers data
export function useDashboardReferrers(siteId: string, start: string, end: string, filters?: string) {
  return useSWR<DashboardReferrersData>(
    siteId && start && end ? ['dashboardReferrers', siteId, start, end, filters] : null,
    () => fetchers.dashboardReferrers(siteId, start, end, filters),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for focused dashboard goals data
export function useDashboardGoals(siteId: string, start: string, end: string, filters?: string) {
  return useSWR<DashboardGoalsData>(
    siteId && start && end ? ['dashboardGoals', siteId, start, end, filters] : null,
    () => fetchers.dashboardGoals(siteId, start, end, filters),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for campaigns data (used by export modal)
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
) {
  return useSWR<CampaignStat[]>(
    enabled && siteId && start && end ? ['campaignsList', siteId, start, end, limit, filters] : null,
    () => getCampaigns(siteId, start, end, limit, filters),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

export function useCampaigns(siteId: string, start: string, end: string, limit = 100, period?: string) {
  return useSWR<CampaignStat[]>(
    siteId && (period || (start && end)) ? ['campaigns', siteId, period ?? '', start, end, limit] : null,
    () => getCampaigns(siteId, start, end, limit, undefined, period),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for journey flow transitions (Sankey diagram data)
export function useJourneyTransitions(siteId: string, start: string, end: string, depth?: number, minSessions?: number, entryPath?: string, filters?: string) {
  return useSWR<TransitionsResponse>(
    siteId && start && end ? ['journeyTransitions', siteId, start, end, depth, minSessions, entryPath, filters] : null,
    () => fetchers.journeyTransitions(siteId, start, end, depth, minSessions, entryPath, filters),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
      // * Depth/entry/period changes keep the canvas rendered with the previous
      // * data while the new key loads — no full-page skeleton after first load.
      keepPreviousData: true,
    }
  )
}

// * Hook for journey entry points (refreshes less frequently)
export function useJourneyEntryPoints(siteId: string, start: string, end: string, filters?: string) {
  return useSWR<EntryPoint[]>(
    siteId && start && end ? ['journeyEntryPoints', siteId, start, end, filters] : null,
    () => fetchers.journeyEntryPoints(siteId, start, end, filters),
    {
      ...dashboardSWRConfig,
      refreshInterval: 5 * 60 * 1000,
      dedupingInterval: 30 * 1000,
      keepPreviousData: true,
    }
  )
}

// * Hook for funnels list
export function useFunnels(siteId: string) {
  return useSWR<Funnel[]>(
    siteId ? ['funnels', siteId] : null,
    () => fetchers.funnels(siteId),
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
  return useSWR<Funnel>(
    siteId && funnelId ? ['funnel', siteId, funnelId] : null,
    () => getFunnel(siteId, funnelId),
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
export function useFunnelListStats(siteId: string, startDate: string, endDate: string, filters?: string) {
  return useSWR<Record<string, FunnelStats>>(
    siteId && startDate && endDate ? ['funnelListStats', siteId, `${startDate}-${endDate}`, filters] : null,
    () => getAllFunnelStats(siteId, startDate, endDate, filters),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
      keepPreviousData: true,
    }
  )
}

// * Hook for funnel step-level stats
export function useFunnelStats(siteId: string, funnelId: string, startDate: string, endDate: string, filters?: string) {
  return useSWR<FunnelStats>(
    siteId && funnelId && startDate && endDate ? ['funnelStats', siteId, funnelId, `${startDate}-${endDate}`, filters] : null,
    () => getFunnelStats(siteId, funnelId, startDate, endDate, filters),
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
export function useFunnelTrends(siteId: string, funnelId: string, startDate: string, endDate: string, filters?: string, editEpoch?: number) {
  return useSWR<FunnelTrends>(
    siteId && funnelId && startDate && endDate ? ['funnelTrends', siteId, funnelId, `${startDate}-${endDate}`, filters, editEpoch ?? 0] : null,
    () => getFunnelTrends(siteId, funnelId, startDate, endDate, 'day', filters),
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
) {
  return useSWR<FunnelBreakdown>(
    siteId && funnelId && step >= 0 && dimension && startDate && endDate
      ? ['funnelBreakdown', siteId, funnelId, step, dimension, `${startDate}-${endDate}`, filters, editEpoch ?? 0]
      : null,
    () => getFunnelBreakdown(siteId, funnelId, step, dimension, startDate, endDate, filters),
    {
      ...dashboardSWRConfig,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  )
}

// * Hook for uptime status (refreshes every 30s to match original polling).
// * start/end are UTC calendar days; omitted = the API's 90-day default.
export function useUptimeStatus(siteId: string, start?: string, end?: string) {
  return useSWR<UptimeStatusResponse>(
    // 🔴 Requires the dates. This keyed on siteId ALONE, so a page withholding
    // its range while the period resolved still fired — the one gate the other
    // hooks give for free by null-keying on an empty date.
    siteId && start && end ? ['uptimeStatus', siteId, start, end] : null,
    () => fetchers.uptimeStatus(siteId, start, end),
    {
      ...dashboardSWRConfig,
      refreshInterval: 30 * 1000,
      dedupingInterval: 10 * 1000,
      keepPreviousData: true,
    }
  )
}

// * Hook for uptime incident episodes overlapping the range
export function useUptimeIncidents(siteId: string, start: string, end: string) {
  return useSWR<UptimeIncidentsResponse>(
    siteId && start && end ? ['uptimeIncidents', siteId, start, end] : null,
    () => fetchers.uptimeIncidents(siteId, start, end),
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
export function useUptimeResponseTimes(siteId: string, monitorId: string | undefined, start: string, end: string) {
  return useSWR<UptimeResponseTimesResponse>(
    siteId && monitorId ? ['uptimeResponseTimes', siteId, monitorId, start, end] : null,
    () => fetchers.uptimeResponseTimes(siteId, monitorId as string, start, end),
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
  return useSWR<UptimeCheck[]>(
    siteId && monitorId ? ['uptimeChecks', siteId, monitorId, limit] : null,
    () => fetchers.uptimeChecks(siteId, monitorId as string, limit),
    {
      ...dashboardSWRConfig,
      refreshInterval: 30 * 1000,
      dedupingInterval: 10 * 1000,
      keepPreviousData: true,
    }
  )
}

// * Hook for goals list
export function useGoals(siteId: string) {
  return useSWR<Goal[]>(
    siteId ? ['goals', siteId] : null,
    () => fetchers.goals(siteId),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for GSC connection status
export function useGSCStatus(siteId: string) {
  return useSWR<GSCStatus>(
    siteId ? ['gscStatus', siteId] : null,
    () => fetchers.gscStatus(siteId),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 30 * 1000,
    }
  )
}

// * Hook for GSC overview metrics (clicks, impressions, CTR, position)
export function useGSCOverview(siteId: string, start: string, end: string) {
  return useSWR<GSCOverview>(
    siteId && start && end ? ['gscOverview', siteId, start, end] : null,
    () => fetchers.gscOverview(siteId, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC top queries
export function useGSCTopQueries(siteId: string, start: string, end: string, limit = 50, offset = 0) {
  return useSWR<GSCQueryResponse>(
    siteId && start && end ? ['gscTopQueries', siteId, start, end, limit, offset] : null,
    () => fetchers.gscTopQueries(siteId, start, end, limit, offset),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC top pages
export function useGSCTopPages(siteId: string, start: string, end: string, limit = 50, offset = 0) {
  return useSWR<GSCPageResponse>(
    siteId && start && end ? ['gscTopPages', siteId, start, end, limit, offset] : null,
    () => fetchers.gscTopPages(siteId, start, end, limit, offset),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC daily totals (clicks & impressions per day)
export function useGSCDailyTotals(siteId: string, start: string, end: string) {
  return useSWR<{ daily_totals: GSCDailyTotal[] }>(
    siteId && start && end ? ['gscDailyTotals', siteId, start, end] : null,
    () => fetchers.gscDailyTotals(siteId, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC new queries (queries that appeared in the current period)
export function useGSCNewQueries(siteId: string, start: string, end: string) {
  return useSWR<GSCNewQueries>(
    siteId && start && end ? ['gscNewQueries', siteId, start, end] : null,
    () => fetchers.gscNewQueries(siteId, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC top countries
export function useGSCTopCountries(siteId: string, start: string, end: string, limit = 50, offset = 0) {
  const { data: status } = useGSCStatus(siteId)
  return useSWR<GSCCountryResponse>(
    status?.connected ? [`gsc-top-countries`, siteId, start, end, limit, offset] : null,
    () => getGSCTopCountries(siteId, start, end, limit, offset),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC top devices
export function useGSCTopDevices(siteId: string, start: string, end: string) {
  const { data: status } = useGSCStatus(siteId)
  return useSWR<GSCDeviceResponse>(
    status?.connected ? [`gsc-top-devices`, siteId, start, end] : null,
    () => getGSCTopDevices(siteId, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for GSC opportunities (striking-distance queries)
export function useGSCOpportunities(siteId: string, start: string, end: string, limit = 50) {
  const { data: status } = useGSCStatus(siteId)
  return useSWR<GSCOpportunityResponse>(
    status?.connected ? [`gsc-opportunities`, siteId, start, end, limit] : null,
    () => getGSCOpportunities(siteId, start, end, limit),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Drill-down: the pages contributing to a query (queries-view expansion). The
// * key includes the query, so each expanded row owns its own cache entry — two
// * quick expands can't cross-render (the old shared-state race). Null key while
// * collapsed (query empty); keepPreviousData holds the prior pages across a
// * range revalidation.
export function useGSCQueryPages(siteId: string, query: string, start: string, end: string) {
  return useSWR<GSCPageResponse>(
    siteId && query && start && end ? ['gscQueryPages', siteId, query, start, end] : null,
    () => getGSCQueryPages(siteId, query, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true },
  )
}

// * Drill-down: the queries contributing to a page (pages-view expansion).
export function useGSCPageQueries(siteId: string, page: string, start: string, end: string) {
  return useSWR<GSCQueryResponse>(
    siteId && page && start && end ? ['gscPageQueries', siteId, page, start, end] : null,
    () => getGSCPageQueries(siteId, page, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true },
  )
}

// * A single query's daily position/clicks trend (queries-view sparkline). Null
// * key until the row is expanded (query empty).
export function useGSCQueryTrend(siteId: string, query: string, start: string, end: string) {
  return useSWR<GSCQueryTrendPoint[]>(
    siteId && query && start && end ? ['gscQueryTrend', siteId, query, start, end] : null,
    () => getGSCQueryTrend(siteId, query, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true },
  )
}

// * Hook for BunnyCDN connection status
export function useBunnyStatus(siteId: string) {
  return useSWR<BunnyStatus>(
    siteId ? ['bunnyStatus', siteId] : null,
    () => fetchers.bunnyStatus(siteId),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 30 * 1000 }
  )
}

// * Hook for BunnyCDN overview metrics (bandwidth, requests, cache hit rate)
export function useBunnyOverview(siteId: string, startDate: string, endDate: string) {
  return useSWR<BunnyOverview>(
    siteId && startDate && endDate ? ['bunnyOverview', siteId, startDate, endDate] : null,
    () => fetchers.bunnyOverview(siteId, startDate, endDate),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for BunnyCDN daily stats (bandwidth & requests per day)
export function useBunnyDailyStats(siteId: string, startDate: string, endDate: string) {
  return useSWR<{ daily_stats: BunnyDailyRow[] }>(
    siteId && startDate && endDate ? ['bunnyDailyStats', siteId, startDate, endDate] : null,
    () => fetchers.bunnyDailyStats(siteId, startDate, endDate),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for the live edge-region distribution. The backend proxies Bunny's
// * statistics API at request time (there is no stored geo table any more —
// * migration 137), so a slightly longer dedupe keeps a tab-refocus from
// * re-spending the customer's API budget inside the backend's own 2-min cache.
export function useBunnyRegions(siteId: string, startDate: string, endDate: string) {
  return useSWR<BunnyRegionsResponse>(
    siteId && startDate && endDate ? ['bunnyRegions', siteId, startDate, endDate] : null,
    () => fetchers.bunnyRegions(siteId, startDate, endDate),
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
  return useSWR<BunnyLiveResponse>(
    siteId ? ['bunnyLive', siteId] : null,
    () => fetchers.bunnyLive(siteId),
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
export function useSubscription() {
  const { user } = useAuth()
  return useSWR<SubscriptionDetails>(
    user ? 'subscription' : null,
    () => fetchers.subscription(),
    {
      ...dashboardSWRConfig,
      refreshInterval: 5 * 60 * 1000,
      dedupingInterval: 30 * 1000,
    }
  )
}

// * Hook for quarantine stats (Cerberus)
export function useQuarantineStats(siteId: string | undefined) {
  return useSWR<QuarantineStats>(
    siteId ? ['quarantineStats', siteId] : null,
    () => getQuarantineStats(siteId!),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000 }
  )
}

// * Hook for quarantine events list (Cerberus)
export function useQuarantineEvents(siteId: string | undefined, filters?: QuarantineFilters) {
  const key = siteId
    ? ['quarantineEvents', siteId, JSON.stringify(filters || {})]
    : null
  return useSWR<{ events: QuarantinedEvent[]; total: number }>(
    key,
    () => getQuarantineEvents(siteId!, filters),
    { ...dashboardSWRConfig, refreshInterval: 0, dedupingInterval: 10 * 1000 }
  )
}

// * Hook for session list (Cerberus)
export function useSessions(siteId: string | undefined, params?: { start_date?: string; end_date?: string; suspicious?: boolean; limit?: number }) {
  const key = siteId
    ? ['sessions', siteId, JSON.stringify(params || {})]
    : null
  return useSWR<{ sessions: SessionSummary[] }>(
    key,
    () => listSessions(siteId!, params),
    { ...dashboardSWRConfig, refreshInterval: 0, dedupingInterval: 10 * 1000 }
  )
}

// * Hook for per-site domain reputation (Cerberus)
export function useSiteDomainReputation(siteId: string | undefined) {
  return useSWR<{ domains: DomainReputation[] }>(
    siteId ? ['domainReputation', siteId] : null,
    () => getSiteDomainReputation(siteId!),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000 }
  )
}

// * Hook for Performance config
export function usePerformanceConfig(siteId: string) {
  return useSWR<PerformanceConfig>(
    siteId ? ['performanceConfig', siteId] : null,
    () => fetchers.performanceConfig(siteId),
    { ...dashboardSWRConfig, refreshInterval: 0, dedupingInterval: 10 * 1000 }
  )
}

// * Hook for the latest Performance checks. Returns BOTH the newest successful
// * check per strategy (`checks` — the numbers to render) and the newest attempt
// * per strategy whatever its outcome (`attempts` — what the status line
// * reports). They are not the same thing after a failed check, and treating
// * them as one is how a stale check used to be presented as current.
export function usePerformanceLatest(siteId: string) {
  return useSWR<PerformanceLatest>(
    siteId ? ['performanceLatest', siteId] : null,
    () => fetchers.performanceLatest(siteId),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000, keepPreviousData: true }
  )
}

// * Hook for Performance score history (trend chart)
export function usePerformanceHistory(siteId: string, strategy: 'mobile' | 'desktop', days = 90) {
  return useSWR<PerformanceCheck[]>(
    siteId ? ['performanceHistory', siteId, strategy, days] : null,
    () => fetchers.performanceHistory(siteId, strategy, days),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000, keepPreviousData: true }
  )
}

// * Re-export for convenience
export { fetchers }

// ─── Bing Webmaster Tools ────────────────────────────────────────────────────
//
// * Daily totals only. Bing's per-query endpoint refreshes weekly and takes no date range, so it
// * cannot honour the Search tab's date picker — see pulse-backend migration 134.

// * Hook for Bing connection status. Same cadence as GSC: a connect or a sync failure should
// * appear on the settings card without a manual refresh.
export function useBingStatus(siteId: string) {
  return useSWR<BingStatus>(
    siteId ? ['bingStatus', siteId] : null,
    () => fetchers.bingStatus(siteId),
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
  return useSWR<{ overview: BingOverview; date_basis: BingDateBasis }>(
    status?.connected ? ['bing-overview', siteId, start, end] : null,
    () => getBingOverview(siteId, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// * Hook for the Bing daily series that backs the chart.
export function useBingDailyTotals(siteId: string, start: string, end: string) {
  const { data: status } = useBingStatus(siteId)
  return useSWR<{ daily_totals: BingDailyRow[]; date_basis: BingDateBasis }>(
    status?.connected ? ['bing-daily-totals', siteId, start, end] : null,
    () => getBingDailyTotals(siteId, start, end),
    { ...dashboardSWRConfig, keepPreviousData: true }
  )
}

// ─── Dashboard overhaul Phase 3 (F17): the six imperative fetches become SWR
// hooks so a failed request has an ERROR state instead of masquerading as
// "not enough data yet" — the fabricated-explanation antipattern the audit
// measured on this page.

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
  timezones: getTimezones,
  browsers: getBrowsers,
  os: getOS,
  devices: getDevices,
  'screen-resolutions': getScreenResolutions,
} as const

export type FullListKind = keyof typeof fullListFetchers

export function useFullDimensionList<T>(
  kind: FullListKind | null, siteId: string, start: string, end: string,
  limit: number, filters?: string,
) {
  return useSWR<T[]>(
    kind && siteId && start && end ? ['fullList', kind, siteId, start, end, limit, filters] : null,
    () => fullListFetchers[kind as FullListKind](siteId, start, end, limit, filters) as Promise<T[]>,
    // 🔴 NO keepPreviousData here. The cards arm this key only while their
    // list overflows; on a range switch the key can go NULL, and
    // keepPreviousData retains the OLD RANGE's rows on a null key forever —
    // which is how the blocks froze on 30-day data after switching to Today
    // (01-09-2026). While a new range's list loads, the dashboard fan-out
    // rows are the correct same-range fallback, so nothing flashes empty.
    { ...dashboardSWRConfig }
  )
}

// * The scroll-depth card's full-page backdrop. null data = no capture exists
// * (a state the card renders via its rails fallback); errors are real
// * failures and also fall back. The image changes at most once per
// * performance check, so no polling and a long dedupe.
export function usePagePreview(siteId: string, member = true) {
  // member=false is the anonymous share surface: same card, the public
  // endpoint (is_public sites only; the capture is the site's own page).
  // The flag is part of the key so a member view never shares an entry with
  // a public one.
  return useSWR<PagePreviewData | null>(
    siteId ? ['pagePreview', siteId, member] : null,
    () => (member ? getPagePreview(siteId) : getPublicPagePreview(siteId)),
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

export function useVisitors(
  siteId: string,
  range: { startDate?: string; endDate?: string; minutes?: number | null },
  opts: { sort: string; order: 'asc' | 'desc'; page: number; pageSize: number; enabled?: boolean },
) {
  const { startDate, endDate, minutes } = range
  const ready = opts.enabled !== false && Boolean(siteId) && (minutes != null || Boolean(startDate && endDate))
  return useSWR<VisitorsResponse>(
    ready ? ['visitors', siteId, startDate, endDate, minutes, opts.sort, opts.order, opts.page, opts.pageSize] : null,
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
  range: { startDate?: string; endDate?: string; minutes?: number | null },
) {
  const { startDate, endDate, minutes } = range
  const ready = Boolean(siteId && key) && (minutes != null || Boolean(startDate && endDate))
  return useSWR<VisitorProfileResponse>(
    ready ? ['visitorProfile', siteId, key, startDate, endDate, minutes] : null,
    () => getVisitorProfile(siteId, key, range),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000, keepPreviousData: true },
  )
}

export function useVisitorVisits(
  siteId: string,
  key: string,
  range: { startDate?: string; endDate?: string; minutes?: number | null },
  page: number,
  pageSize: number,
) {
  const { startDate, endDate, minutes } = range
  const ready = Boolean(siteId && key) && (minutes != null || Boolean(startDate && endDate))
  return useSWR<VisitsResponse>(
    ready ? ['visitorVisits', siteId, key, startDate, endDate, minutes, page, pageSize] : null,
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
  range: { startDate?: string; endDate?: string; minutes?: number | null },
  page: number,
) {
  const { startDate, endDate, minutes } = range
  const ready = Boolean(siteId && key && visitKey) && (minutes != null || Boolean(startDate && endDate))
  return useSWR<VisitEventsResponse>(
    ready ? ['visitEvents', siteId, key, visitKey, startDate, endDate, minutes, page] : null,
    () => getVisitEvents(siteId, key, visitKey as string, range, page),
    { ...dashboardSWRConfig, refreshInterval: 0, dedupingInterval: 30 * 1000, keepPreviousData: true },
  )
}

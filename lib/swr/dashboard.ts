// * SWR configuration for dashboard data fetching
// * Implements stale-while-revalidate pattern for efficient data updates

import useSWR from 'swr'
import { toast } from '@ciphera-net/ui'
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
  getStats,
  getDailyStats,
  getBehavior,
} from '@/lib/api/stats'
import {
  getJourneyTransitions,
  getJourneyTopPaths,
  getJourneyEntryPoints,
  type TransitionsResponse,
  type TopPath as JourneyTopPath,
  type EntryPoint,
} from '@/lib/api/journeys'
import { listAnnotations } from '@/lib/api/annotations'
import type { Annotation } from '@/lib/api/annotations'
import { getSite } from '@/lib/api/sites'
import type { Site } from '@/lib/api/sites'
import { listFunnels, type Funnel } from '@/lib/api/funnels'
import { getUptimeStatus, type UptimeStatusResponse } from '@/lib/api/uptime'
import { getPageSpeedConfig, getPageSpeedLatest, getPageSpeedHistory, type PageSpeedConfig, type PageSpeedCheck } from '@/lib/api/pagespeed'
import { listGoals, type Goal } from '@/lib/api/goals'
import { listReportSchedules, listAlertSchedules, type ReportSchedule } from '@/lib/api/report-schedules'
import { listSessions, getBotFilterStats, type SessionSummary, type BotFilterStats } from '@/lib/api/bot-filter'
import { getGSCStatus, getGSCOverview, getGSCTopQueries, getGSCTopPages, getGSCDailyTotals, getGSCNewQueries } from '@/lib/api/gsc'
import type { GSCStatus, GSCOverview, GSCQueryResponse, GSCPageResponse, GSCDailyTotal, GSCNewQueries } from '@/lib/api/gsc'
import { getBunnyStatus, getBunnyOverview, getBunnyDailyStats, getBunnyTopCountries } from '@/lib/api/bunny'
import type { BunnyStatus, BunnyOverview, BunnyDailyRow, BunnyGeoRow } from '@/lib/api/bunny'
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
  BehaviorData,
} from '@/lib/api/stats'

// * SWR fetcher functions
const fetchers = {
  site: (siteId: string) => getSite(siteId),
  dashboard: (siteId: string, start: string, end: string, interval?: string, filters?: string) => getDashboard(siteId, start, end, 10, interval, filters),
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
  annotations: (siteId: string, start: string, end: string) => listAnnotations(siteId, start, end),
  behavior: (siteId: string, start: string, end: string) => getBehavior(siteId, start, end),
  journeyTransitions: (siteId: string, start: string, end: string, depth?: number, minSessions?: number, entryPath?: string) =>
    getJourneyTransitions(siteId, start, end, { depth, minSessions, entryPath }),
  journeyTopPaths: (siteId: string, start: string, end: string, limit?: number, minSessions?: number, entryPath?: string) =>
    getJourneyTopPaths(siteId, start, end, { limit, minSessions, entryPath }),
  journeyEntryPoints: (siteId: string, start: string, end: string) =>
    getJourneyEntryPoints(siteId, start, end),
  funnels: (siteId: string) => listFunnels(siteId),
  uptimeStatus: (siteId: string) => getUptimeStatus(siteId),
  pageSpeedConfig: (siteId: string) => getPageSpeedConfig(siteId),
  pageSpeedLatest: (siteId: string) => getPageSpeedLatest(siteId),
  pageSpeedHistory: (siteId: string, strategy: 'mobile' | 'desktop', days: number) => getPageSpeedHistory(siteId, strategy, days),
  goals: (siteId: string) => listGoals(siteId),
  reportSchedules: (siteId: string) => listReportSchedules(siteId),
  alertSchedules: (siteId: string) => listAlertSchedules(siteId),
  gscStatus: (siteId: string) => getGSCStatus(siteId),
  gscOverview: (siteId: string, start: string, end: string) => getGSCOverview(siteId, start, end),
  gscTopQueries: (siteId: string, start: string, end: string, limit: number, offset: number) => getGSCTopQueries(siteId, start, end, limit, offset),
  gscTopPages: (siteId: string, start: string, end: string, limit: number, offset: number) => getGSCTopPages(siteId, start, end, limit, offset),
  gscDailyTotals: (siteId: string, start: string, end: string) => getGSCDailyTotals(siteId, start, end),
  gscNewQueries: (siteId: string, start: string, end: string) => getGSCNewQueries(siteId, start, end),
  bunnyStatus: (siteId: string) => getBunnyStatus(siteId),
  bunnyOverview: (siteId: string, start: string, end: string) => getBunnyOverview(siteId, start, end),
  bunnyDailyStats: (siteId: string, start: string, end: string) => getBunnyDailyStats(siteId, start, end),
  bunnyTopCountries: (siteId: string, start: string, end: string) => getBunnyTopCountries(siteId, start, end),
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

// * Hook for full dashboard data (single request replaces 7 focused hooks)
// * The backend runs all queries in parallel and caches the result in Redis (30s TTL)
export function useDashboard(siteId: string, start: string, end: string, interval?: string, filters?: string) {
  return useSWR<DashboardData>(
    siteId && start && end ? ['dashboard', siteId, start, end, interval, filters] : null,
    () => fetchers.dashboard(siteId, start, end, interval, filters),
    {
      ...dashboardSWRConfig,
      // * Refresh every 60 seconds for dashboard data
      refreshInterval: 60 * 1000,
      // * Deduping interval to prevent duplicate requests
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for stats (refreshed less frequently)
export function useStats(siteId: string, start: string, end: string, filters?: string) {
  return useSWR<Stats>(
    siteId && start && end ? ['stats', siteId, start, end, filters] : null,
    () => fetchers.stats(siteId, start, end, filters),
    {
      ...dashboardSWRConfig,
      // * Refresh every 60 seconds for stats
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for daily stats (refreshed less frequently)
export function useDailyStats(
  siteId: string,
  start: string,
  end: string,
  interval: 'hour' | 'day' | 'minute'
) {
  return useSWR<DailyStat[]>(
    siteId && start && end ? ['dailyStats', siteId, start, end, interval] : null,
    () => fetchers.dailyStats(siteId, start, end, interval),
    {
      ...dashboardSWRConfig,
      // * Refresh every 60 seconds for chart data
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for realtime visitor count (refreshed frequently)
export function useRealtime(siteId: string, refreshInterval: number = 5000) {
  return useSWR<{ visitors: number }>(
    siteId ? ['realtime', siteId] : null,
    () => fetchers.realtime(siteId),
    {
      ...dashboardSWRConfig,
      // * Refresh frequently for real-time data (default 5 seconds)
      refreshInterval,
      // * Short deduping for real-time
      dedupingInterval: 2000,
      // * Keep previous data while loading new data
      keepPreviousData: true,
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
export function useCampaigns(siteId: string, start: string, end: string, limit = 100) {
  return useSWR<CampaignStat[]>(
    siteId && start && end ? ['campaigns', siteId, start, end, limit] : null,
    () => fetchers.campaigns(siteId, start, end, limit),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for annotations data
export function useAnnotations(siteId: string, startDate: string, endDate: string) {
  return useSWR<Annotation[]>(
    siteId && startDate && endDate ? ['annotations', siteId, startDate, endDate] : null,
    () => fetchers.annotations(siteId, startDate, endDate),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for bundled behavior data (all frustration signals in one request)
export function useBehavior(siteId: string, start: string, end: string) {
  return useSWR<BehaviorData>(
    siteId && start && end ? ['behavior', siteId, start, end] : null,
    () => fetchers.behavior(siteId, start, end),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for journey flow transitions (Sankey diagram data)
export function useJourneyTransitions(siteId: string, start: string, end: string, depth?: number, minSessions?: number, entryPath?: string) {
  return useSWR<TransitionsResponse>(
    siteId && start && end ? ['journeyTransitions', siteId, start, end, depth, minSessions, entryPath] : null,
    () => fetchers.journeyTransitions(siteId, start, end, depth, minSessions, entryPath),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for top journey paths
export function useJourneyTopPaths(siteId: string, start: string, end: string, limit?: number, minSessions?: number, entryPath?: string) {
  return useSWR<JourneyTopPath[]>(
    siteId && start && end ? ['journeyTopPaths', siteId, start, end, limit, minSessions, entryPath] : null,
    () => fetchers.journeyTopPaths(siteId, start, end, limit, minSessions, entryPath),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for journey entry points (refreshes less frequently)
export function useJourneyEntryPoints(siteId: string, start: string, end: string) {
  return useSWR<EntryPoint[]>(
    siteId && start && end ? ['journeyEntryPoints', siteId, start, end] : null,
    () => fetchers.journeyEntryPoints(siteId, start, end),
    {
      ...dashboardSWRConfig,
      refreshInterval: 5 * 60 * 1000,
      dedupingInterval: 30 * 1000,
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
    }
  )
}

// * Hook for uptime status (refreshes every 30s to match original polling)
export function useUptimeStatus(siteId: string) {
  return useSWR<UptimeStatusResponse>(
    siteId ? ['uptimeStatus', siteId] : null,
    () => fetchers.uptimeStatus(siteId),
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

// * Hook for report schedules
export function useReportSchedules(siteId: string) {
  return useSWR<ReportSchedule[]>(
    siteId ? ['reportSchedules', siteId] : null,
    () => fetchers.reportSchedules(siteId),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for alert schedules (uptime alerts)
export function useAlertSchedules(siteId: string) {
  return useSWR<ReportSchedule[]>(
    siteId ? ['alertSchedules', siteId] : null,
    () => fetchers.alertSchedules(siteId),
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
    dashboardSWRConfig
  )
}

// * Hook for GSC top queries
export function useGSCTopQueries(siteId: string, start: string, end: string, limit = 50, offset = 0) {
  return useSWR<GSCQueryResponse>(
    siteId && start && end ? ['gscTopQueries', siteId, start, end, limit, offset] : null,
    () => fetchers.gscTopQueries(siteId, start, end, limit, offset),
    dashboardSWRConfig
  )
}

// * Hook for GSC top pages
export function useGSCTopPages(siteId: string, start: string, end: string, limit = 50, offset = 0) {
  return useSWR<GSCPageResponse>(
    siteId && start && end ? ['gscTopPages', siteId, start, end, limit, offset] : null,
    () => fetchers.gscTopPages(siteId, start, end, limit, offset),
    dashboardSWRConfig
  )
}

// * Hook for GSC daily totals (clicks & impressions per day)
export function useGSCDailyTotals(siteId: string, start: string, end: string) {
  return useSWR<{ daily_totals: GSCDailyTotal[] }>(
    siteId && start && end ? ['gscDailyTotals', siteId, start, end] : null,
    () => fetchers.gscDailyTotals(siteId, start, end),
    dashboardSWRConfig
  )
}

// * Hook for GSC new queries (queries that appeared in the current period)
export function useGSCNewQueries(siteId: string, start: string, end: string) {
  return useSWR<GSCNewQueries>(
    siteId && start && end ? ['gscNewQueries', siteId, start, end] : null,
    () => fetchers.gscNewQueries(siteId, start, end),
    dashboardSWRConfig
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
    dashboardSWRConfig
  )
}

// * Hook for BunnyCDN daily stats (bandwidth & requests per day)
export function useBunnyDailyStats(siteId: string, startDate: string, endDate: string) {
  return useSWR<{ daily_stats: BunnyDailyRow[] }>(
    siteId && startDate && endDate ? ['bunnyDailyStats', siteId, startDate, endDate] : null,
    () => fetchers.bunnyDailyStats(siteId, startDate, endDate),
    dashboardSWRConfig
  )
}

// * Hook for BunnyCDN top countries by bandwidth
export function useBunnyTopCountries(siteId: string, startDate: string, endDate: string) {
  return useSWR<{ countries: BunnyGeoRow[] }>(
    siteId && startDate && endDate ? ['bunnyTopCountries', siteId, startDate, endDate] : null,
    () => fetchers.bunnyTopCountries(siteId, startDate, endDate),
    dashboardSWRConfig
  )
}

// * Hook for subscription details (changes rarely)
export function useSubscription() {
  return useSWR<SubscriptionDetails>(
    'subscription',
    () => fetchers.subscription(),
    {
      ...dashboardSWRConfig,
      refreshInterval: 5 * 60 * 1000,
      dedupingInterval: 30 * 1000,
    }
  )
}

// * Hook for session list (bot review)
export function useSessions(siteId: string, startDate: string, endDate: string, suspiciousOnly: boolean) {
  return useSWR<{ sessions: SessionSummary[] }>(
    siteId && startDate && endDate ? ['sessions', siteId, startDate, endDate, suspiciousOnly] : null,
    () => listSessions(siteId, startDate, endDate, suspiciousOnly),
    { ...dashboardSWRConfig, refreshInterval: 0, dedupingInterval: 10 * 1000 }
  )
}

// * Hook for bot filter stats
export function useBotFilterStats(siteId: string) {
  return useSWR<BotFilterStats>(
    siteId ? ['botFilterStats', siteId] : null,
    () => getBotFilterStats(siteId),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000 }
  )
}

// * Hook for PageSpeed config
export function usePageSpeedConfig(siteId: string) {
  return useSWR<PageSpeedConfig>(
    siteId ? ['pageSpeedConfig', siteId] : null,
    () => fetchers.pageSpeedConfig(siteId),
    { ...dashboardSWRConfig, refreshInterval: 0, dedupingInterval: 10 * 1000 }
  )
}

// * Hook for latest PageSpeed checks (mobile + desktop)
export function usePageSpeedLatest(siteId: string) {
  return useSWR<PageSpeedCheck[]>(
    siteId ? ['pageSpeedLatest', siteId] : null,
    () => fetchers.pageSpeedLatest(siteId),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000, keepPreviousData: true }
  )
}

// * Hook for PageSpeed score history (trend chart)
export function usePageSpeedHistory(siteId: string, strategy: 'mobile' | 'desktop', days = 90) {
  return useSWR<PageSpeedCheck[]>(
    siteId ? ['pageSpeedHistory', siteId, strategy, days] : null,
    () => fetchers.pageSpeedHistory(siteId, strategy, days),
    { ...dashboardSWRConfig, refreshInterval: 60 * 1000, dedupingInterval: 10 * 1000, keepPreviousData: true }
  )
}

// * Re-export for convenience
export { fetchers }

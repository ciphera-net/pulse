// * SWR configuration for dashboard data fetching
// * Implements stale-while-revalidate pattern for efficient data updates

import useSWR from 'swr'
import {
  getDashboard,
  getDashboardOverview,
  getDashboardPages,
  getDashboardLocations,
  getDashboardDevices,
  getDashboardReferrers,
  getDashboardPerformance,
  getDashboardGoals,
  getRealtime,
  getStats,
  getDailyStats,
} from '@/lib/api/stats'
import { getSite } from '@/lib/api/sites'
import type { Site } from '@/lib/api/sites'
import type {
  Stats,
  DailyStat,
  DashboardOverviewData,
  DashboardPagesData,
  DashboardLocationsData,
  DashboardDevicesData,
  DashboardReferrersData,
  DashboardPerformanceData,
  DashboardGoalsData,
} from '@/lib/api/stats'

// * SWR fetcher functions
const fetchers = {
  site: (siteId: string) => getSite(siteId),
  dashboard: (siteId: string, start: string, end: string) => getDashboard(siteId, start, end),
  dashboardOverview: (siteId: string, start: string, end: string) => getDashboardOverview(siteId, start, end),
  dashboardPages: (siteId: string, start: string, end: string) => getDashboardPages(siteId, start, end),
  dashboardLocations: (siteId: string, start: string, end: string) => getDashboardLocations(siteId, start, end),
  dashboardDevices: (siteId: string, start: string, end: string) => getDashboardDevices(siteId, start, end),
  dashboardReferrers: (siteId: string, start: string, end: string) => getDashboardReferrers(siteId, start, end),
  dashboardPerformance: (siteId: string, start: string, end: string) => getDashboardPerformance(siteId, start, end),
  dashboardGoals: (siteId: string, start: string, end: string) => getDashboardGoals(siteId, start, end),
  stats: (siteId: string, start: string, end: string) => getStats(siteId, start, end),
  dailyStats: (siteId: string, start: string, end: string, interval: 'hour' | 'day' | 'minute') =>
    getDailyStats(siteId, start, end, interval),
  realtime: (siteId: string) => getRealtime(siteId),
}

// * Standard SWR config for dashboard data
const dashboardSWRConfig = {
  // * Keep stale data visible while revalidating (better UX)
  revalidateOnFocus: false,
  // * Revalidate when reconnecting (fresh data after offline)
  revalidateOnReconnect: true,
  // * Retry failed requests
  shouldRetryOnError: true,
  errorRetryCount: 3,
  // * Error retry interval with exponential backoff
  errorRetryInterval: 5000,
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

// * Hook for dashboard summary data (refreshed less frequently)
export function useDashboard(siteId: string, start: string, end: string) {
  return useSWR(
    siteId && start && end ? ['dashboard', siteId, start, end] : null,
    () => fetchers.dashboard(siteId, start, end),
    {
      ...dashboardSWRConfig,
      // * Refresh every 60 seconds for dashboard summary
      refreshInterval: 60 * 1000,
      // * Deduping interval to prevent duplicate requests
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for stats (refreshed less frequently)
export function useStats(siteId: string, start: string, end: string) {
  return useSWR<Stats>(
    siteId && start && end ? ['stats', siteId, start, end] : null,
    () => fetchers.stats(siteId, start, end),
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
export function useDashboardOverview(siteId: string, start: string, end: string) {
  return useSWR<DashboardOverviewData>(
    siteId && start && end ? ['dashboardOverview', siteId, start, end] : null,
    () => fetchers.dashboardOverview(siteId, start, end),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for focused dashboard pages data
export function useDashboardPages(siteId: string, start: string, end: string) {
  return useSWR<DashboardPagesData>(
    siteId && start && end ? ['dashboardPages', siteId, start, end] : null,
    () => fetchers.dashboardPages(siteId, start, end),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for focused dashboard locations data
export function useDashboardLocations(siteId: string, start: string, end: string) {
  return useSWR<DashboardLocationsData>(
    siteId && start && end ? ['dashboardLocations', siteId, start, end] : null,
    () => fetchers.dashboardLocations(siteId, start, end),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for focused dashboard devices data
export function useDashboardDevices(siteId: string, start: string, end: string) {
  return useSWR<DashboardDevicesData>(
    siteId && start && end ? ['dashboardDevices', siteId, start, end] : null,
    () => fetchers.dashboardDevices(siteId, start, end),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for focused dashboard referrers data
export function useDashboardReferrers(siteId: string, start: string, end: string) {
  return useSWR<DashboardReferrersData>(
    siteId && start && end ? ['dashboardReferrers', siteId, start, end] : null,
    () => fetchers.dashboardReferrers(siteId, start, end),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for focused dashboard performance data
export function useDashboardPerformance(siteId: string, start: string, end: string) {
  return useSWR<DashboardPerformanceData>(
    siteId && start && end ? ['dashboardPerformance', siteId, start, end] : null,
    () => fetchers.dashboardPerformance(siteId, start, end),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Hook for focused dashboard goals data
export function useDashboardGoals(siteId: string, start: string, end: string) {
  return useSWR<DashboardGoalsData>(
    siteId && start && end ? ['dashboardGoals', siteId, start, end] : null,
    () => fetchers.dashboardGoals(siteId, start, end),
    {
      ...dashboardSWRConfig,
      refreshInterval: 60 * 1000,
      dedupingInterval: 10 * 1000,
    }
  )
}

// * Re-export for convenience
export { fetchers }

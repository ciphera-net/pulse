// * SWR configuration for dashboard data fetching
// * Implements stale-while-revalidate pattern for efficient data updates

import useSWR from 'swr'
import { getDashboard, getRealtime, getStats, getDailyStats } from '@/lib/api/stats'
import { getSite } from '@/lib/api/sites'
import type { Site } from '@/lib/api/sites'
import type { Stats, DailyStat } from '@/lib/api/stats'

// * SWR fetcher functions
const fetchers = {
  site: (siteId: string) => getSite(siteId),
  dashboard: (siteId: string, start: string, end: string) => getDashboard(siteId, start, end),
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

// * Re-export for convenience
export { fetchers }

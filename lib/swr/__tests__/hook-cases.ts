import * as hooks from '../dashboard'
import type { VisitorRange } from '@/lib/api/visitors'
import type { SiteRouteClass } from '../site-read'

// Every site data hook of lib/swr/dashboard.ts, called with the arguments that arm its SWR key, and the route
// class it must declare (lib/swr/site-read.ts). Shared by the tests that pin what a hook does under each scope.
// A test file using this must mock `swr` and the lib/api modules itself: the hooks are the real ones.

export const S = 'site-1'
const D1 = '2026-10-01'
const D2 = '2026-10-07'
const F = 'v2:country|is|NL'
const RANGE: VisitorRange = { startDate: D1, endDate: D2 }
const LIVE_RANGE: VisitorRange = { minutes: 5 }
const VISITOR_OPTS = { sort: 'last_seen', order: 'desc' as const, page: 1, pageSize: 25 }

export interface HookCase {
  /** `hook` or `hook#variant`; the golden file of member reads is keyed by it. */
  name: string
  /** The class the hook must read as (the backend's public route table decides it). */
  routeClass: SiteRouteClass
  /** False when the arguments leave the SWR key null on their own (a withheld range, a closed modal). */
  armed: boolean
  call: () => unknown
}

const armed = (name: string, routeClass: SiteRouteClass, call: () => unknown): HookCase => ({ name, routeClass, armed: true, call })
const idle = (name: string, routeClass: SiteRouteClass, call: () => unknown): HookCase => ({ name, routeClass, armed: false, call })

export const HOOK_CASES: HookCase[] = [
  armed('useDataWindow', 'demo', () => hooks.useDataWindow(S, 'dashboard')),
  armed('useSite', 'demo', () => hooks.useSite(S)),
  armed('useSiteTeam#enabled', 'member', () => hooks.useSiteTeam(S, true)),
  idle('useSiteTeam#disabled', 'member', () => hooks.useSiteTeam(S, false)),
  armed('useInstallStatus', 'member', () => hooks.useInstallStatus(S)),
  armed('useInstallStatus#poll', 'member', () => hooks.useInstallStatus(S, { poll: true })),
  idle('useInstallStatus#noSite', 'member', () => hooks.useInstallStatus(undefined)),
  armed('useIngestHealth', 'member', () => hooks.useIngestHealth(S)),
  armed('useTrafficStatus', 'member', () => hooks.useTrafficStatus(S)),
  armed('useDashboard#period', 'customer', () => hooks.useDashboard(S, D1, D2, 'day', F, 'today')),
  armed('useDashboard#dates', 'customer', () => hooks.useDashboard(S, D1, D2, 'hour', undefined, undefined)),
  armed('useDashboard#live', 'customer', () => hooks.useDashboard(S, D1, D1, 'minute', undefined, undefined, 5)),
  idle('useDashboard#withheld', 'customer', () => hooks.useDashboard(S, '', '', 'day', undefined, undefined)),
  armed('useStats', 'customer', () => hooks.useStats(S, D1, D2, F, '7d')),
  armed('useStats#dates', 'customer', () => hooks.useStats(S, D1, D2)),
  armed('usePagesTable', 'demo', () => hooks.usePagesTable(S, D1, D2, 250, F, '30d')),
  armed('usePagesTable#defaults', 'demo', () => hooks.usePagesTable(S, D1, D2)),
  armed('useDailyStats', 'customer', () => hooks.useDailyStats(S, D1, D2, 'day', F, 'today')),
  armed('useRealtime', 'customer', () => hooks.useRealtime(S)),
  armed('useRealtime#interval', 'customer', () => hooks.useRealtime(S, 15_000)),
  armed('useCampaignsList#dated', 'demo', () => hooks.useCampaignsList(S, D1, D2, 10, F, true, '7d')),
  armed('useCampaignsList#live', 'demo', () => hooks.useCampaignsList(S, D1, D1, 10, F, true, undefined, 5)),
  idle('useCampaignsList#disarmed', 'demo', () => hooks.useCampaignsList(S, D1, D2, 10, F, false)),
  armed('useCampaigns', 'demo', () => hooks.useCampaigns(S, D1, D2, 100, '30d')),
  armed('useJourneyFlow', 'demo', () => hooks.useJourneyFlow(S, D1, D2, 4, '/pricing', F, '30d')),
  armed('useJourneyEntryPoints', 'demo', () => hooks.useJourneyEntryPoints(S, D1, D2, F, '30d')),
  armed('useFunnels', 'demo', () => hooks.useFunnels(S)),
  armed('useFunnelDetail', 'demo', () => hooks.useFunnelDetail(S, 'funnel-1')),
  armed('useFunnelListStats', 'demo', () => hooks.useFunnelListStats(S, D1, D2, F, '30d')),
  armed('useFunnelStats', 'demo', () => hooks.useFunnelStats(S, 'funnel-1', D1, D2, F, '30d')),
  armed('useFunnelTrends', 'demo', () => hooks.useFunnelTrends(S, 'funnel-1', D1, D2, F, 3, '30d')),
  armed('useFunnelBreakdown', 'demo', () => hooks.useFunnelBreakdown(S, 'funnel-1', 2, 'country', D1, D2, F, 3, '30d')),
  armed('useUptimeStatus', 'demo', () => hooks.useUptimeStatus(S, D1, D2, '30d')),
  armed('useUptimeIncidents', 'demo', () => hooks.useUptimeIncidents(S, D1, D2, '30d')),
  armed('useUptimeResponseTimes', 'demo', () => hooks.useUptimeResponseTimes(S, 'monitor-1', D1, D2, '30d')),
  idle('useUptimeResponseTimes#noMonitor', 'demo', () => hooks.useUptimeResponseTimes(S, undefined, D1, D2)),
  armed('useUptimeChecks', 'demo', () => hooks.useUptimeChecks(S, 'monitor-1', 25)),
  armed('useGoals', 'demo', () => hooks.useGoals(S)),
  armed('useGSCStatus', 'demo', () => hooks.useGSCStatus(S)),
  armed('useGSCOverview', 'demo', () => hooks.useGSCOverview(S, D1, D2)),
  armed('useGSCTopQueries', 'demo', () => hooks.useGSCTopQueries(S, D1, D2, 20, 40)),
  armed('useGSCTopPages', 'demo', () => hooks.useGSCTopPages(S, D1, D2, 20, 40)),
  armed('useGSCDailyTotals', 'demo', () => hooks.useGSCDailyTotals(S, D1, D2)),
  armed('useGSCNewQueries', 'demo', () => hooks.useGSCNewQueries(S, D1, D2)),
  armed('useGSCTopCountries', 'demo', () => hooks.useGSCTopCountries(S, D1, D2, 20, 40)),
  armed('useGSCTopDevices', 'demo', () => hooks.useGSCTopDevices(S, D1, D2)),
  armed('useGSCOpportunities', 'demo', () => hooks.useGSCOpportunities(S, D1, D2, 30)),
  armed('useGSCQueryPages', 'demo', () => hooks.useGSCQueryPages(S, 'privacy analytics', D1, D2)),
  armed('useGSCPageQueries', 'demo', () => hooks.useGSCPageQueries(S, '/pricing', D1, D2)),
  armed('useGSCQueryTrend', 'demo', () => hooks.useGSCQueryTrend(S, 'privacy analytics', D1, D2)),
  armed('useBunnyStatus', 'demo', () => hooks.useBunnyStatus(S)),
  armed('useBunnyOverview', 'demo', () => hooks.useBunnyOverview(S, D1, D2, '30d')),
  armed('useBunnyDailyStats', 'demo', () => hooks.useBunnyDailyStats(S, D1, D2, '30d')),
  armed('useBunnyRegions', 'demo', () => hooks.useBunnyRegions(S, D1, D2, '30d')),
  armed('useBunnyLive', 'demo', () => hooks.useBunnyLive(S)),
  armed('useSubscription', 'member', () => hooks.useSubscription()),
  armed('useQuarantineStats', 'member', () => hooks.useQuarantineStats(S)),
  armed('usePerformanceConfig', 'demo', () => hooks.usePerformanceConfig(S)),
  armed('usePerformanceLatest', 'demo', () => hooks.usePerformanceLatest(S)),
  armed('usePerformanceHistory', 'demo', () => hooks.usePerformanceHistory(S, 'mobile', 30)),
  armed('usePerformanceHistory#defaults', 'demo', () => hooks.usePerformanceHistory(S, 'desktop')),
  armed('useBingStatus', 'demo', () => hooks.useBingStatus(S)),
  armed('useBingOverview', 'demo', () => hooks.useBingOverview(S, D1, D2)),
  armed('useBingDailyTotals', 'demo', () => hooks.useBingDailyTotals(S, D1, D2)),
  armed('useFullDimensionList#dated', 'demo', () => hooks.useFullDimensionList('countries', S, D1, D2, 250, F)),
  armed('useFullDimensionList#live', 'demo', () => hooks.useFullDimensionList('referrers', S, D1, D1, 250, F, 5)),
  armed('useFullDimensionList#languages-grouped', 'demo', () => hooks.useFullDimensionList('languages-grouped', S, D1, D2, 250)),
  idle('useFullDimensionList#closed', 'demo', () => hooks.useFullDimensionList(null, S, D1, D2, 250)),
  armed('useOutboundLinks#dated', 'demo', () => hooks.useOutboundLinks(S, D1, D2, 'today')),
  armed('useOutboundLinks#live', 'demo', () => hooks.useOutboundLinks(S, D1, D1, 'today', 5)),
  armed('usePagePreview#member', 'customer', () => hooks.usePagePreview(S)),
  armed('usePagePreview#anonymous', 'customer', () => hooks.usePagePreview(S, false)),
  idle('usePagePreview#noSite', 'customer', () => hooks.usePagePreview('')),
  armed('useVisitors', 'member', () => hooks.useVisitors(S, RANGE, VISITOR_OPTS)),
  armed('useVisitors#live', 'member', () => hooks.useVisitors(S, LIVE_RANGE, { ...VISITOR_OPTS, enabled: true })),
  idle('useVisitors#off', 'member', () => hooks.useVisitors(S, RANGE, { ...VISITOR_OPTS, enabled: false })),
  armed('useVisitorProfile', 'member', () => hooks.useVisitorProfile(S, 'visitor-1', RANGE)),
  armed('useVisitorVisits', 'member', () => hooks.useVisitorVisits(S, 'visitor-1', RANGE, 2, 10)),
  armed('useVisitEvents', 'member', () => hooks.useVisitEvents(S, 'visitor-1', 'visit-1', RANGE, 1)),
  idle('useVisitEvents#collapsed', 'member', () => hooks.useVisitEvents(S, 'visitor-1', null, RANGE, 1)),
]

/** The hooks the module exports, for the "every hook is covered" guard. */
export function exportedHookNames(): string[] {
  return Object.keys(hooks).filter((name) => /^use[A-Z]/.test(name))
}

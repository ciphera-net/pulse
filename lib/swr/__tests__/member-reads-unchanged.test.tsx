import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// PUL-34 Phase 2 (data layer). The hooks in lib/swr/dashboard.ts now resolve their read
// from the nearest site scope, and a MEMBER read must come out exactly as it did before:
//
//  - the same SWR key, byte for byte. Callers elsewhere in the app call mutate() with these
//    keys (mutate(['funnels', siteId]) is one), and a key that moved by one element would
//    leave them revalidating nothing, with no error anywhere;
//  - the same SWR options (cadence, dedupe, focus revalidation, retry), so no card starts
//    polling faster or slower;
//  - the same API function called with the same arguments, the plain site id first.
//
// The golden file beside this test was recorded from the hooks as they were BEFORE the
// scope work (the commit that added this test precedes the change that must keep it green).
// It is not a snapshot to refresh when a diff looks harmless: a changed line here is a
// member read that changed. A NEW hook adds a case and its recorded line.
//
// To re-record after an intentional change: GOLDEN_OUT=<path> npx vitest run <this file>, then
// copy the written file over member-reads-unchanged.golden.json and read the whole diff.

const rec = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = []
  const make = (mod: string, names: string[]) =>
    Object.fromEntries(
      names.map((name) => [
        name,
        (...args: unknown[]) => {
          calls.push([`${mod}.${name}`, args])
          return Promise.resolve(undefined)
        },
      ]),
    )
  return { calls, make }
})

vi.mock('@/lib/api/dataWindow', () => rec.make('dataWindow', ['getDataWindow']))
vi.mock('@/lib/api/bing', () => rec.make('bing', ['getBingStatus', 'getBingOverview', 'getBingDailyTotals']))
vi.mock('@/lib/api/visitors', () => rec.make('visitors', ['getVisitors', 'getVisitorProfile', 'getVisitorVisits', 'getVisitEvents']))
vi.mock('@/lib/api/stats', () => rec.make('stats', [
  'getDashboard', 'getPagesTable', 'getCampaigns', 'getRealtime', 'getStats', 'getDailyStats', 'getTopPages',
  'getEntryPages', 'getExitPages', 'getTopReferrers', 'getCountries', 'getCities', 'getRegions', 'getLanguages',
  'getLanguageGroups', 'getBrowsers', 'getOS', 'getDevices', 'getScreenResolutions', 'getTimezones',
  'getEventPropertyValues',
]))
vi.mock('@/lib/api/journeys', () => rec.make('journeys', ['getJourneyFlow', 'getJourneyEntryPoints']))
vi.mock('@/lib/api/sites', () => rec.make('sites', ['getSite', 'getSiteTeam', 'getInstallStatus', 'getIngestHealth', 'getTrafficStatus']))
vi.mock('@/lib/api/funnels', () => rec.make('funnels', ['listFunnels', 'getFunnel', 'getFunnelStats', 'getAllFunnelStats', 'getFunnelTrends', 'getFunnelBreakdown']))
vi.mock('@/lib/api/uptime', () => rec.make('uptime', ['getUptimeStatus', 'getUptimeIncidents', 'getUptimeResponseTimes', 'getMonitorChecks']))
vi.mock('@/lib/api/performance', () => rec.make('performance', ['getPerformanceConfig', 'getPerformanceLatest', 'getPerformanceHistory', 'getPagePreview', 'getPublicPagePreview']))
vi.mock('@/lib/api/goals', () => rec.make('goals', ['listGoals']))
vi.mock('@/lib/api/quarantine', () => rec.make('quarantine', ['getQuarantineStats']))
vi.mock('@/lib/api/gsc', () => rec.make('gsc', [
  'getGSCStatus', 'getGSCOverview', 'getGSCTopQueries', 'getGSCTopPages', 'getGSCDailyTotals', 'getGSCNewQueries',
  'getGSCTopCountries', 'getGSCTopDevices', 'getGSCOpportunities', 'getGSCQueryPages', 'getGSCPageQueries', 'getGSCQueryTrend',
]))
vi.mock('@/lib/api/bunny', () => rec.make('bunny', ['getBunnyStatus', 'getBunnyOverview', 'getBunnyDailyStats', 'getBunnyRegions', 'getBunnyLive']))
vi.mock('@/lib/api/billing', () => rec.make('billing', ['getSubscription']))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))

// The mocked swr answers the two connection-status keys as "connected", because the Search
// Console and Bing data hooks arm their own key only once their status says so.
const swrSpy = vi.fn((...args: unknown[]) => {
  const key = args[0]
  const connected = Array.isArray(key) && (key[0] === 'gscStatus' || key[0] === 'bingStatus')
  return { data: connected ? { connected: true } : undefined, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }
})
vi.mock('swr', () => ({ default: (...args: unknown[]) => swrSpy(...args) }))
vi.mock('swr/infinite', () => ({ default: vi.fn(() => ({ data: undefined, size: 0, setSize: vi.fn() })) }))

import * as hooks from '../dashboard'
import type { VisitorRange } from '@/lib/api/visitors'

const S = 'site-1'
const D1 = '2026-10-01'
const D2 = '2026-10-07'
const F = 'v2:country|is|NL'
const RANGE: VisitorRange = { startDate: D1, endDate: D2 }
const LIVE_RANGE: VisitorRange = { minutes: 5 }
const VISITOR_OPTS = { sort: 'last_seen', order: 'desc' as const, page: 1, pageSize: 25 }

// Every exported hook, each with the argument shapes that change its key.
const CASES: Array<[string, () => unknown]> = [
  ['useDataWindow', () => hooks.useDataWindow(S, 'dashboard')],
  ['useSite', () => hooks.useSite(S)],
  ['useSiteTeam#enabled', () => hooks.useSiteTeam(S, true)],
  ['useSiteTeam#disabled', () => hooks.useSiteTeam(S, false)],
  ['useInstallStatus', () => hooks.useInstallStatus(S)],
  ['useInstallStatus#poll', () => hooks.useInstallStatus(S, { poll: true })],
  ['useInstallStatus#noSite', () => hooks.useInstallStatus(undefined)],
  ['useIngestHealth', () => hooks.useIngestHealth(S)],
  ['useTrafficStatus', () => hooks.useTrafficStatus(S)],
  ['useDashboard#period', () => hooks.useDashboard(S, D1, D2, 'day', F, 'today')],
  ['useDashboard#dates', () => hooks.useDashboard(S, D1, D2, 'hour', undefined, undefined)],
  ['useDashboard#live', () => hooks.useDashboard(S, D1, D1, 'minute', undefined, undefined, 5)],
  ['useDashboard#withheld', () => hooks.useDashboard(S, '', '', 'day', undefined, undefined)],
  ['useStats', () => hooks.useStats(S, D1, D2, F, '7d')],
  ['useStats#dates', () => hooks.useStats(S, D1, D2)],
  ['usePagesTable', () => hooks.usePagesTable(S, D1, D2, 250, F, '30d')],
  ['usePagesTable#defaults', () => hooks.usePagesTable(S, D1, D2)],
  ['useDailyStats', () => hooks.useDailyStats(S, D1, D2, 'day', F, 'today')],
  ['useRealtime', () => hooks.useRealtime(S)],
  ['useRealtime#interval', () => hooks.useRealtime(S, 15_000)],
  ['useCampaignsList#dated', () => hooks.useCampaignsList(S, D1, D2, 10, F, true, '7d')],
  ['useCampaignsList#live', () => hooks.useCampaignsList(S, D1, D1, 10, F, true, undefined, 5)],
  ['useCampaignsList#disarmed', () => hooks.useCampaignsList(S, D1, D2, 10, F, false)],
  ['useCampaigns', () => hooks.useCampaigns(S, D1, D2, 100, '30d')],
  ['useJourneyFlow', () => hooks.useJourneyFlow(S, D1, D2, 4, '/pricing', F, '30d')],
  ['useJourneyEntryPoints', () => hooks.useJourneyEntryPoints(S, D1, D2, F, '30d')],
  ['useFunnels', () => hooks.useFunnels(S)],
  ['useFunnelDetail', () => hooks.useFunnelDetail(S, 'funnel-1')],
  ['useFunnelListStats', () => hooks.useFunnelListStats(S, D1, D2, F, '30d')],
  ['useFunnelStats', () => hooks.useFunnelStats(S, 'funnel-1', D1, D2, F, '30d')],
  ['useFunnelTrends', () => hooks.useFunnelTrends(S, 'funnel-1', D1, D2, F, 3, '30d')],
  ['useFunnelBreakdown', () => hooks.useFunnelBreakdown(S, 'funnel-1', 2, 'country', D1, D2, F, 3, '30d')],
  ['useUptimeStatus', () => hooks.useUptimeStatus(S, D1, D2, '30d')],
  ['useUptimeIncidents', () => hooks.useUptimeIncidents(S, D1, D2, '30d')],
  ['useUptimeResponseTimes', () => hooks.useUptimeResponseTimes(S, 'monitor-1', D1, D2, '30d')],
  ['useUptimeResponseTimes#noMonitor', () => hooks.useUptimeResponseTimes(S, undefined, D1, D2)],
  ['useUptimeChecks', () => hooks.useUptimeChecks(S, 'monitor-1', 25)],
  ['useGoals', () => hooks.useGoals(S)],
  ['useGSCStatus', () => hooks.useGSCStatus(S)],
  ['useGSCOverview', () => hooks.useGSCOverview(S, D1, D2)],
  ['useGSCTopQueries', () => hooks.useGSCTopQueries(S, D1, D2, 20, 40)],
  ['useGSCTopPages', () => hooks.useGSCTopPages(S, D1, D2, 20, 40)],
  ['useGSCDailyTotals', () => hooks.useGSCDailyTotals(S, D1, D2)],
  ['useGSCNewQueries', () => hooks.useGSCNewQueries(S, D1, D2)],
  ['useGSCTopCountries', () => hooks.useGSCTopCountries(S, D1, D2, 20, 40)],
  ['useGSCTopDevices', () => hooks.useGSCTopDevices(S, D1, D2)],
  ['useGSCOpportunities', () => hooks.useGSCOpportunities(S, D1, D2, 30)],
  ['useGSCQueryPages', () => hooks.useGSCQueryPages(S, 'privacy analytics', D1, D2)],
  ['useGSCPageQueries', () => hooks.useGSCPageQueries(S, '/pricing', D1, D2)],
  ['useGSCQueryTrend', () => hooks.useGSCQueryTrend(S, 'privacy analytics', D1, D2)],
  ['useBunnyStatus', () => hooks.useBunnyStatus(S)],
  ['useBunnyOverview', () => hooks.useBunnyOverview(S, D1, D2, '30d')],
  ['useBunnyDailyStats', () => hooks.useBunnyDailyStats(S, D1, D2, '30d')],
  ['useBunnyRegions', () => hooks.useBunnyRegions(S, D1, D2, '30d')],
  ['useBunnyLive', () => hooks.useBunnyLive(S)],
  ['useSubscription', () => hooks.useSubscription()],
  ['useQuarantineStats', () => hooks.useQuarantineStats(S)],
  ['usePerformanceConfig', () => hooks.usePerformanceConfig(S)],
  ['usePerformanceLatest', () => hooks.usePerformanceLatest(S)],
  ['usePerformanceHistory', () => hooks.usePerformanceHistory(S, 'mobile', 30)],
  ['usePerformanceHistory#defaults', () => hooks.usePerformanceHistory(S, 'desktop')],
  ['useBingStatus', () => hooks.useBingStatus(S)],
  ['useBingOverview', () => hooks.useBingOverview(S, D1, D2)],
  ['useBingDailyTotals', () => hooks.useBingDailyTotals(S, D1, D2)],
  ['useFullDimensionList#dated', () => hooks.useFullDimensionList('countries', S, D1, D2, 250, F)],
  ['useFullDimensionList#live', () => hooks.useFullDimensionList('referrers', S, D1, D1, 250, F, 5)],
  ['useFullDimensionList#languages-grouped', () => hooks.useFullDimensionList('languages-grouped', S, D1, D2, 250)],
  ['useFullDimensionList#closed', () => hooks.useFullDimensionList(null, S, D1, D2, 250)],
  ['useOutboundLinks#dated', () => hooks.useOutboundLinks(S, D1, D2, 'today')],
  ['useOutboundLinks#live', () => hooks.useOutboundLinks(S, D1, D1, 'today', 5)],
  ['usePagePreview#member', () => hooks.usePagePreview(S)],
  ['usePagePreview#anonymous', () => hooks.usePagePreview(S, false)],
  ['usePagePreview#noSite', () => hooks.usePagePreview('')],
  ['useVisitors', () => hooks.useVisitors(S, RANGE, VISITOR_OPTS)],
  ['useVisitors#live', () => hooks.useVisitors(S, LIVE_RANGE, { ...VISITOR_OPTS, enabled: true })],
  ['useVisitors#off', () => hooks.useVisitors(S, RANGE, { ...VISITOR_OPTS, enabled: false })],
  ['useVisitorProfile', () => hooks.useVisitorProfile(S, 'visitor-1', RANGE)],
  ['useVisitorVisits', () => hooks.useVisitorVisits(S, 'visitor-1', RANGE, 2, 10)],
  ['useVisitEvents', () => hooks.useVisitEvents(S, 'visitor-1', 'visit-1', RANGE, 1)],
  ['useVisitEvents#collapsed', () => hooks.useVisitEvents(S, 'visitor-1', null, RANGE, 1)],
]

/** JSON with `undefined` kept distinct from `null`, so an argument that disappeared is visible. */
function serialise(value: unknown): unknown {
  if (value === undefined) return '__undefined__'
  if (Array.isArray(value)) return value.map(serialise)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialise(v)]))
  }
  return value
}

const CONFIG_FIELDS = [
  'refreshInterval', 'dedupingInterval', 'revalidateOnFocus', 'revalidateOnReconnect', 'focusThrottleInterval',
  'keepPreviousData', 'shouldRetryOnError', 'errorRetryCount', 'errorRetryInterval', 'onErrorRetry',
] as const

function configSummary(config: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const c = (config ?? {}) as Record<string, unknown>
  for (const field of CONFIG_FIELDS) {
    if (!(field in c)) continue
    out[field] = typeof c[field] === 'function' ? 'fn' : c[field]
  }
  return out
}

interface Recorded {
  key: unknown
  config: Record<string, unknown>
  api: unknown
}

async function record(call: () => unknown): Promise<Recorded> {
  swrSpy.mockClear()
  rec.calls.length = 0
  renderHook(() => call())
  const last = swrSpy.mock.calls[swrSpy.mock.calls.length - 1]
  const entry: Recorded = { key: serialise(last?.[0] ?? null), config: configSummary(last?.[2]), api: [] }
  // The fetcher is what puts a request on the wire: run it and note which API function it reached, and with what.
  if (last && last[0] !== null && last[0] !== undefined) {
    rec.calls.length = 0
    await (last[1] as () => Promise<unknown>)()
    entry.api = serialise(rec.calls.map(([name, args]) => [name, args]))
  }
  return entry
}

const GOLDEN_FILE = path.join(__dirname, 'member-reads-unchanged.golden.json')

beforeEach(() => {
  swrSpy.mockClear()
  rec.calls.length = 0
})

describe('member reads are unchanged by the site scope (PUL-34 Phase 2)', () => {
  it('covers every hook the module exports that reads through SWR', () => {
    const covered = new Set(CASES.map(([name]) => name.split('#')[0]))
    const exported = Object.keys(hooks).filter((name) => /^use[A-Z]/.test(name))
    expect(exported.filter((name) => !covered.has(name))).toEqual([])
  })

  it('every hook asks SWR for the same key, with the same options, and calls the same API function the same way', async () => {
    const actual: Record<string, Recorded> = {}
    for (const [name, call] of CASES) actual[name] = await record(call)

    if (process.env.GOLDEN_OUT) {
      writeFileSync(process.env.GOLDEN_OUT, JSON.stringify(actual, null, 2) + '\n')
      return
    }
    const golden = JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')) as Record<string, Recorded>
    expect(Object.keys(actual).sort()).toEqual(Object.keys(golden).sort())
    for (const name of Object.keys(golden)) {
      expect({ name, ...actual[name] }).toEqual({ name, ...golden[name] })
    }
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { publicSiteRef, type SiteRef } from '@/lib/scope/site-ref'

// PUL-34 Phase 2 (data layer). Every site read that has a public route takes a SiteRef:
//
//  - a plain id is the member read and must produce exactly the URL it always did, with
//    the session's bearer and team;
//  - a public ref reads the SAME path under /public/sites/<id>, with no credential at all
//    (a signed-in visitor's token and team must not travel with an anonymous read).
//
// The table is the public route list of pulse-backend internal/api/public_share_routes.go,
// one row per client function. The last test fails when a function is added to one of these
// modules without being classified, which is the drift this layer exists to stop: a read that
// never learned the public surface would 403 on /demo with nothing in the diff to say why.

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

import { markTeamResolved, setAccessToken, setActiveTeam } from '../client'
import * as stats from '../stats'
import * as sites from '../sites'
import * as journeys from '../journeys'
import * as funnels from '../funnels'
import * as uptime from '../uptime'
import * as performance from '../performance'
import * as bing from '../bing'
import * as bunny from '../bunny'
import * as gsc from '../gsc'
import * as goals from '../goals'
import * as dataWindow from '../dataWindow'
import * as quarantine from '../quarantine'
import * as visitors from '../visitors'

const D1 = '2026-10-01'
const D2 = '2026-10-07'
const RANGE = `start_date=${D1}&end_date=${D2}`

interface ReadCase {
  /** `module.function`, the name the classification test checks. */
  name: string
  call: (site: SiteRef) => Promise<unknown>
  /** What follows `/sites/<id>` on the member read. */
  rest: string
  /** What follows `/public/sites/<id>` when it differs from `rest` (the page preview). */
  publicRest?: string
}

const READS: ReadCase[] = [
  // The five routes a share link is served (route class 'customer').
  { name: 'stats.getStats', call: (s) => stats.getStats(s, D1, D2), rest: `/stats?${RANGE}` },
  { name: 'stats.getStats#period', call: (s) => stats.getStats(s, undefined, undefined, undefined, '7d'), rest: '/stats?period=7d' },
  { name: 'stats.getRealtime', call: (s) => stats.getRealtime(s), rest: '/realtime' },
  { name: 'stats.getDailyStats', call: (s) => stats.getDailyStats(s, D1, D2, 'day'), rest: `/daily?${RANGE}&interval=day` },
  { name: 'stats.getDashboard', call: (s) => stats.getDashboard(s, undefined, undefined, 10, 'day', undefined, '7d'), rest: '/dashboard?period=7d&limit=10&interval=day' },
  { name: 'stats.getDashboard#live', call: (s) => stats.getDashboard(s, D1, D1, 10, 'minute', undefined, undefined, 5), rest: '/dashboard?minutes=5&limit=10&interval=minute' },
  // The scroll-depth card's capture: the member route lives under /performance, the public one is the dashboard's.
  { name: 'performance.getPagePreview', call: (s) => performance.getPagePreview(s), rest: '/performance/page-preview', publicRest: '/page-preview' },

  // Every other public route (class 'demo').
  { name: 'sites.getSite', call: (s) => sites.getSite(s), rest: '' },
  { name: 'dataWindow.getDataWindow', call: (s) => dataWindow.getDataWindow(s), rest: '/data-window' },
  { name: 'goals.listGoals', call: (s) => goals.listGoals(s), rest: '/goals' },

  { name: 'stats.getTopPages', call: (s) => stats.getTopPages(s, D1, D2, 25), rest: `/pages?${RANGE}&limit=25` },
  { name: 'stats.getTopReferrers', call: (s) => stats.getTopReferrers(s, D1, D2, 25), rest: `/referrers?${RANGE}&limit=25` },
  { name: 'stats.getCountries', call: (s) => stats.getCountries(s, D1, D2, 25), rest: `/countries?${RANGE}&limit=25` },
  { name: 'stats.getCities', call: (s) => stats.getCities(s, D1, D2, 25), rest: `/cities?${RANGE}&limit=25` },
  { name: 'stats.getRegions', call: (s) => stats.getRegions(s, D1, D2, 25), rest: `/regions?${RANGE}&limit=25` },
  { name: 'stats.getBrowsers', call: (s) => stats.getBrowsers(s, D1, D2, 25), rest: `/browsers?${RANGE}&limit=25` },
  { name: 'stats.getOS', call: (s) => stats.getOS(s, D1, D2, 25), rest: `/os?${RANGE}&limit=25` },
  { name: 'stats.getDevices', call: (s) => stats.getDevices(s, D1, D2, 25), rest: `/devices?${RANGE}&limit=25` },
  { name: 'stats.getEntryPages', call: (s) => stats.getEntryPages(s, D1, D2, 25), rest: `/entry-pages?${RANGE}&limit=25` },
  { name: 'stats.getExitPages', call: (s) => stats.getExitPages(s, D1, D2, 25), rest: `/exit-pages?${RANGE}&limit=25` },
  { name: 'stats.getScreenResolutions', call: (s) => stats.getScreenResolutions(s, D1, D2, 25), rest: `/screen-resolutions?${RANGE}&limit=25` },
  { name: 'stats.getLanguages', call: (s) => stats.getLanguages(s, D1, D2, 25), rest: `/languages?${RANGE}&limit=25` },
  { name: 'stats.getLanguageGroups', call: (s) => stats.getLanguageGroups(s, D1, D2, 25), rest: `/languages?${RANGE}&limit=25&group=language` },
  { name: 'stats.getTimezones', call: (s) => stats.getTimezones(s, D1, D2, 25), rest: `/timezones?${RANGE}&limit=25` },
  { name: 'stats.getChannels', call: (s) => stats.getChannels(s, D1, D2, 25), rest: `/channels?${RANGE}&limit=25` },
  { name: 'stats.getCampaigns', call: (s) => stats.getCampaigns(s, D1, D2, 25), rest: `/campaigns?${RANGE}&limit=25` },
  { name: 'stats.getGoalStats', call: (s) => stats.getGoalStats(s, D1, D2, 25), rest: `/goals/stats?${RANGE}&limit=25` },
  { name: 'stats.getCampaigns#live', call: (s) => stats.getCampaigns(s, D1, D1, 25, undefined, undefined, 5), rest: '/campaigns?minutes=5&limit=25' },
  { name: 'stats.getPagesTable', call: (s) => stats.getPagesTable(s, D1, D2, 500), rest: `/pages/table?${RANGE}&limit=500` },
  { name: 'stats.getEventPropertyKeys', call: (s) => stats.getEventPropertyKeys(s, 'signup', D1, D2), rest: `/goals/signup/properties?${RANGE}` },
  { name: 'stats.getEventPropertyValues', call: (s) => stats.getEventPropertyValues(s, 'outbound_link', 'url', D1, D2, 20), rest: `/goals/outbound_link/properties/url?${RANGE}&limit=20` },

  { name: 'journeys.getJourneyFlow', call: (s) => journeys.getJourneyFlow(s, D1, D2, { depth: 4 }), rest: `/journeys/flow?${RANGE}&depth=4` },
  { name: 'journeys.getJourneyEntryPoints', call: (s) => journeys.getJourneyEntryPoints(s, D1, D2), rest: `/journeys/entry-points?${RANGE}` },

  { name: 'funnels.listFunnels', call: (s) => funnels.listFunnels(s), rest: '/funnels' },
  { name: 'funnels.getFunnel', call: (s) => funnels.getFunnel(s, 'f1'), rest: '/funnels/f1' },
  { name: 'funnels.getAllFunnelStats', call: (s) => funnels.getAllFunnelStats(s, D1, D2), rest: `/funnels/stats?${RANGE}` },
  { name: 'funnels.getFunnelStats', call: (s) => funnels.getFunnelStats(s, 'f1', D1, D2), rest: `/funnels/f1/stats?${RANGE}` },
  { name: 'funnels.getFunnelTrends', call: (s) => funnels.getFunnelTrends(s, 'f1', D1, D2), rest: `/funnels/f1/trends?${RANGE}&interval=day` },
  { name: 'funnels.getFunnelBreakdown', call: (s) => funnels.getFunnelBreakdown(s, 'f1', 2, 'country', D1, D2), rest: `/funnels/f1/breakdown?step=2&dimension=country&${RANGE}` },

  { name: 'uptime.getUptimeStatus', call: (s) => uptime.getUptimeStatus(s, D1, D2), rest: `/uptime/status?${RANGE}` },
  { name: 'uptime.getUptimeIncidents', call: (s) => uptime.getUptimeIncidents(s, D1, D2), rest: `/uptime/incidents?${RANGE}&limit=200` },
  { name: 'uptime.getUptimeResponseTimes', call: (s) => uptime.getUptimeResponseTimes(s, 'm1', D1, D2), rest: `/uptime/monitors/m1/response-times?${RANGE}` },
  { name: 'uptime.getMonitorChecks', call: (s) => uptime.getMonitorChecks(s, 'm1', 50), rest: '/uptime/monitors/m1/checks?limit=50' },

  { name: 'performance.getPerformanceConfig', call: (s) => performance.getPerformanceConfig(s), rest: '/performance/config' },
  { name: 'performance.getPerformanceLatest', call: (s) => performance.getPerformanceLatest(s), rest: '/performance/latest' },
  { name: 'performance.getPerformanceHistory', call: (s) => performance.getPerformanceHistory(s, 'mobile', 90), rest: '/performance/history?strategy=mobile&days=90' },
  { name: 'performance.getPerformanceCheck', call: (s) => performance.getPerformanceCheck(s, 'c1'), rest: '/performance/checks/c1' },

  { name: 'gsc.getGSCStatus', call: (s) => gsc.getGSCStatus(s), rest: '/integrations/gsc/status' },
  { name: 'gsc.getGSCOverview', call: (s) => gsc.getGSCOverview(s, D1, D2), rest: `/gsc/overview?${RANGE}` },
  { name: 'gsc.getGSCTopQueries', call: (s) => gsc.getGSCTopQueries(s, D1, D2, 50, 0), rest: `/gsc/top-queries?${RANGE}&limit=50&offset=0` },
  { name: 'gsc.getGSCTopPages', call: (s) => gsc.getGSCTopPages(s, D1, D2, 50, 0), rest: `/gsc/top-pages?${RANGE}&limit=50&offset=0` },
  { name: 'gsc.getGSCQueryPages', call: (s) => gsc.getGSCQueryPages(s, 'privacy', D1, D2), rest: `/gsc/query-pages?query=privacy&${RANGE}` },
  { name: 'gsc.getGSCPageQueries', call: (s) => gsc.getGSCPageQueries(s, '/pricing', D1, D2), rest: `/gsc/page-queries?page=%2Fpricing&${RANGE}` },
  { name: 'gsc.getGSCDailyTotals', call: (s) => gsc.getGSCDailyTotals(s, D1, D2), rest: `/gsc/daily-totals?${RANGE}` },
  { name: 'gsc.getGSCNewQueries', call: (s) => gsc.getGSCNewQueries(s, D1, D2), rest: `/gsc/new-queries?${RANGE}` },
  { name: 'gsc.getGSCTopCountries', call: (s) => gsc.getGSCTopCountries(s, D1, D2, 50, 0), rest: `/gsc/top-countries?${RANGE}&limit=50&offset=0` },
  { name: 'gsc.getGSCTopDevices', call: (s) => gsc.getGSCTopDevices(s, D1, D2), rest: `/gsc/top-devices?${RANGE}` },
  { name: 'gsc.getGSCOpportunities', call: (s) => gsc.getGSCOpportunities(s, D1, D2, 50), rest: `/gsc/opportunities?${RANGE}&limit=50` },
  { name: 'gsc.getGSCQueryTrend', call: (s) => gsc.getGSCQueryTrend(s, 'privacy', D1, D2), rest: `/gsc/query-trend?query=privacy&${RANGE}` },

  { name: 'bing.getBingStatus', call: (s) => bing.getBingStatus(s), rest: '/integrations/bing/status' },
  { name: 'bing.getBingOverview', call: (s) => bing.getBingOverview(s, D1, D2), rest: `/bing/overview?${RANGE}` },
  { name: 'bing.getBingDailyTotals', call: (s) => bing.getBingDailyTotals(s, D1, D2), rest: `/bing/daily-totals?${RANGE}` },

  { name: 'bunny.getBunnyStatus', call: (s) => bunny.getBunnyStatus(s), rest: '/integrations/bunny/status' },
  { name: 'bunny.getBunnyOverview', call: (s) => bunny.getBunnyOverview(s, D1, D2), rest: `/bunny/overview?${RANGE}` },
  { name: 'bunny.getBunnyDailyStats', call: (s) => bunny.getBunnyDailyStats(s, D1, D2), rest: `/bunny/daily-stats?${RANGE}` },
  { name: 'bunny.getBunnyRegions', call: (s) => bunny.getBunnyRegions(s, D1, D2), rest: `/bunny/regions?${RANGE}` },
  { name: 'bunny.getBunnyLive', call: (s) => bunny.getBunnyLive(s), rest: '/bunny/live' },
]

/**
 * Reads with NO public route: the site id stays a plain string, so handing one a public ref is a
 * type error (the next block), not a request that 404s on the demo. Each row is the member URL.
 */
const MEMBER_ONLY_READS: Array<{ name: string; call: (id: string) => Promise<unknown>; rest: string }> = [
  { name: 'sites.getSiteTeam', call: (id) => sites.getSiteTeam(id), rest: '/team' },
  { name: 'sites.getInstallStatus', call: (id) => sites.getInstallStatus(id), rest: '/install-status' },
  { name: 'sites.getIngestHealth', call: (id) => sites.getIngestHealth(id), rest: '/ingest-health' },
  { name: 'sites.getTrafficStatus', call: (id) => sites.getTrafficStatus(id), rest: '/traffic-status' },
  { name: 'quarantine.getQuarantineStats', call: (id) => quarantine.getQuarantineStats(id), rest: '/quarantine/stats' },
  { name: 'visitors.getVisitors', call: (id) => visitors.getVisitors(id, { startDate: D1, endDate: D2 }), rest: `/visitors?${RANGE}` },
  { name: 'visitors.getVisitorProfile', call: (id) => visitors.getVisitorProfile(id, 'v1', { startDate: D1, endDate: D2 }), rest: `/visitors/v1?${RANGE}` },
  { name: 'visitors.getVisitorVisits', call: (id) => visitors.getVisitorVisits(id, 'v1', { startDate: D1, endDate: D2 }), rest: `/visitors/v1/visits?${RANGE}` },
  { name: 'visitors.getVisitEvents', call: (id) => visitors.getVisitEvents(id, 'v1', 'k1', { startDate: D1, endDate: D2 }), rest: `/visitors/v1/visits/k1/events?${RANGE}` },
]

let fetchSpy: ReturnType<typeof vi.fn>
let seq = 0
/** A fresh site id per call: the client keeps a 2 s response cache keyed by URL, and one case must not answer another. */
const nextId = () => `site-${++seq}`

function sent() {
  const [url, init] = fetchSpy.mock.calls.at(-1) as [string, RequestInit]
  const at = url.indexOf('/api/v1')
  return { endpoint: url.slice(at + '/api/v1'.length), headers: (init.headers ?? {}) as Record<string, string> }
}

beforeEach(() => {
  fetchSpy = vi.fn().mockImplementation(async () =>
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', fetchSpy)
  markTeamResolved()
  setAccessToken('member-token')
  setActiveTeam('team-1')
})

afterEach(() => {
  setAccessToken(null)
  setActiveTeam(null)
  vi.unstubAllGlobals()
})

describe('a member id reads exactly what it always did', () => {
  it.each(READS)('$name', async ({ call, rest }) => {
    const id = nextId()
    await call(id)
    const { endpoint, headers } = sent()
    expect(endpoint).toBe(`/sites/${id}${rest}`)
    expect(headers['Authorization']).toBe('Bearer member-token')
    expect(headers['X-Pulse-Team']).toBe('team-1')
  })

  it.each(MEMBER_ONLY_READS)('$name (member only)', async ({ call, rest }) => {
    const id = nextId()
    await call(id)
    expect(sent().endpoint).toBe(`/sites/${id}${rest}`)
  })
})

describe('a public ref reads the same page under /public/sites, with no credential', () => {
  it.each(READS)('$name', async ({ call, rest, publicRest }) => {
    const id = nextId()
    await call(publicSiteRef(id))
    const { endpoint, headers } = sent()
    expect(endpoint).toBe(`/public/sites/${id}${publicRest ?? rest}`)
    const names = Object.keys(headers).map((h) => h.toLowerCase())
    expect(names).not.toContain('authorization')
    expect(names).not.toContain('x-pulse-team')
    expect(names).not.toContain('x-csrf-token')
  })

  it('keeps the member and public reads of one site apart on the wire', async () => {
    const id = nextId()
    await stats.getDashboard(id, undefined, undefined, 10, 'day', undefined, '7d')
    const member = sent().endpoint
    await stats.getDashboard(publicSiteRef(id), undefined, undefined, 10, 'day', undefined, '7d')
    expect(sent().endpoint).toBe(member.replace('/sites/', '/public/sites/'))
  })
})

describe('a read with no public route refuses a public ref at compile time', () => {
  // Never called: the assertions are the @ts-expect-error lines, which `tsc --noEmit` fails on if a
  // function here starts accepting a SiteRef (an unused directive is itself an error).
  const compileTimeGuards = () => {
    const ref = publicSiteRef('site')
    // @ts-expect-error member-only: no public route serves the site team
    void sites.getSiteTeam(ref)
    // @ts-expect-error member-only: install status is not public
    void sites.getInstallStatus(ref)
    // @ts-expect-error member-only: ingest health is not public
    void sites.getIngestHealth(ref)
    // @ts-expect-error member-only: traffic status is not public
    void sites.getTrafficStatus(ref)
    // @ts-expect-error member-only: quarantine is not public
    void quarantine.getQuarantineStats(ref)
    // @ts-expect-error member-only: Visitors is never public
    void visitors.getVisitors(ref, {})
    // @ts-expect-error a write: a goal is created by a member only
    void goals.createGoal(ref, { name: 'n', event_name: 'e' })
    // @ts-expect-error a write: a funnel is created by a member only
    void funnels.createFunnel(ref, { name: 'n', description: '', steps: [] })
    // @ts-expect-error a write: a check is triggered by a member only
    void performance.triggerPerformanceCheck(ref)
    // @ts-expect-error a write: a connection is removed by a member only
    void gsc.disconnectGSC(ref)
    // @ts-expect-error a write: a connection is removed by a member only
    void bunny.disconnectBunny(ref)
    // @ts-expect-error a write: a connection is removed by a member only
    void bing.disconnectBing(ref)
  }

  it('is enforced by the type checker', () => {
    expect(typeof compileTimeGuards).toBe('function')
  })
})

describe('every function of the site API modules is classified', () => {
  // A function added to one of these modules has to say which kind it is. A public read that is
  // not in READS would never be exercised against the public surface; a write must stay a string.
  const WRITES_AND_OTHERS = new Set([
    'stats.authenticatePublicDashboard',
    'stats.getPublicStats', 'stats.getPublicRealtime', 'stats.getPublicDailyStats', 'stats.getPublicDashboard',
    'sites.listSites', 'sites.getSitesOverview', 'sites.createSite', 'sites.updateSite', 'sites.deleteSite',
    'sites.resetSiteData', 'sites.verifySite', 'sites.setSiteFramework', 'sites.restoreSite',
    'sites.permanentDeleteSite', 'sites.listDeletedSites', 'sites.detectFramework',
    'funnels.createFunnel', 'funnels.updateFunnel', 'funnels.deleteFunnel', 'funnels.previewFunnel',
    'performance.updatePerformanceConfig', 'performance.triggerPerformanceCheck', 'performance.getPublicPagePreview',
    'bing.listBingSites', 'bing.connectBing', 'bing.disconnectBing',
    'bunny.getBunnyPullZones', 'bunny.connectBunny', 'bunny.disconnectBunny',
    'gsc.getGSCAuthURL', 'gsc.disconnectGSC',
    'goals.createGoal', 'goals.updateGoal', 'goals.deleteGoal',
  ])
  const classified = new Set([
    ...READS.map((r) => r.name.split('#')[0]),
    ...MEMBER_ONLY_READS.map((r) => r.name),
    ...WRITES_AND_OTHERS,
  ])
  const modules = { stats, sites, journeys, funnels, uptime, performance, bing, bunny, gsc, goals, dataWindow, quarantine, visitors }

  it('leaves no exported function unclassified', () => {
    const unclassified: string[] = []
    for (const [mod, exports] of Object.entries(modules)) {
      for (const [fn, value] of Object.entries(exports)) {
        if (typeof value === 'function' && !classified.has(`${mod}.${fn}`)) unclassified.push(`${mod}.${fn}`)
      }
    }
    expect(unclassified).toEqual([])
  })

  it('names only functions that exist', () => {
    const present = new Set<string>()
    for (const [mod, exports] of Object.entries(modules)) {
      for (const [fn, value] of Object.entries(exports)) if (typeof value === 'function') present.add(`${mod}.${fn}`)
    }
    expect([...classified].filter((name) => !present.has(name))).toEqual([])
  })
})

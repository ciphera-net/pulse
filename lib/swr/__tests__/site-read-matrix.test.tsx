import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { SiteScopeProvider, memberScope, SITE_PAGES, type SiteScope } from '@/lib/scope/SiteScope'
import { isPublicSiteRef, publicSiteRef, type SiteRef } from '@/lib/scope/site-ref'

// PUL-34 Phase 2 (data layer): what every site hook does under each kind of scope.
//
//   none / member   every read, as a member read (the keys and calls the golden file pins).
//   demo            the sample site: public scope, full fidelity. The five routes every share link is
//                   served ('customer') and every other public route ('demo'); never a 'member' read.
//   link            a site's own share link: public scope, scoped fidelity. The five routes only.
//   elsewhere       a public scope for ANOTHER site: nothing, because a read of a site the page is not about
//                   could only go out as a member read, and a public page never makes one.
//
// A read that is not available must make no request (a null SWR key) and say so (`available: false`) with
// no data and no error. A read that is available must go out through the public ref under a public scope:
// the API function receives the ref, not the bare id, or the page would send a MEMBER request (a bearer, a
// team) from a public page, and the golden test, which only sees member reads, would not notice.

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

// The two connection-status keys answer "connected": the Search Console and Bing data hooks arm their own
// key only once their status says so.
const swrSpy = vi.fn((...args: unknown[]) => {
  const key = args[0]
  const connected = Array.isArray(key) && (key[0] === 'gscStatus' || key[0] === 'bingStatus')
  return { data: connected ? { connected: true } : undefined, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }
})
vi.mock('swr', () => ({ default: (...args: unknown[]) => swrSpy(...args) }))
vi.mock('swr/infinite', () => ({ default: vi.fn(() => ({ data: undefined, size: 0, setSize: vi.fn() })) }))

import { siteReadAvailable, useSiteRead, type SiteRouteClass } from '../site-read'
import { HOOK_CASES, S } from './hook-cases'

const OTHER = 'site-2'

type ScopeKind = 'none' | 'member' | 'demo' | 'link' | 'elsewhere'

const SCOPES: Record<ScopeKind, SiteScope | null> = {
  none: null,
  member: memberScope(S),
  demo: { siteId: S, mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' },
  link: { siteId: S, mode: 'public', basePath: `/share/${S}`, pages: ['dashboard'], demo: false, fidelity: 'scoped' },
  elsewhere: { siteId: OTHER, mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' },
}

/** The rule, written out by hand (not derived from the code under test). */
const AVAILABLE: Record<SiteRouteClass, Record<ScopeKind, boolean>> = {
  customer: { none: true, member: true, demo: true, link: true, elsewhere: false },
  demo: { none: true, member: true, demo: true, link: false, elsewhere: false },
  member: { none: true, member: true, demo: false, link: false, elsewhere: false },
}

function wrapperFor(kind: ScopeKind) {
  const scope = SCOPES[kind]
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    scope ? <SiteScopeProvider scope={scope}>{children}</SiteScopeProvider> : <>{children}</>
  return Wrapper
}

/** The ref a hook for site S resolves under this scope: public only under a public scope for S itself. */
function refUnder(kind: ScopeKind): SiteRef {
  return kind === 'demo' || kind === 'link' ? publicSiteRef(S) : S
}

beforeEach(() => {
  swrSpy.mockClear()
  rec.calls.length = 0
})

describe('siteReadAvailable: the rule', () => {
  const classes = Object.keys(AVAILABLE) as SiteRouteClass[]
  const kinds = Object.keys(SCOPES) as ScopeKind[]
  for (const routeClass of classes) {
    for (const kind of kinds) {
      it(`${routeClass} read under ${kind} scope: ${AVAILABLE[routeClass][kind] ? 'available' : 'not available'}`, () => {
        expect(siteReadAvailable(SCOPES[kind], refUnder(kind), routeClass)).toBe(AVAILABLE[routeClass][kind])
      })
    }
  }

  it('never makes a read that has no site from a public scope', () => {
    expect(siteReadAvailable(SCOPES.demo, null, 'member')).toBe(false)
    expect(siteReadAvailable(SCOPES.member, null, 'member')).toBe(true)
    expect(siteReadAvailable(null, null, 'member')).toBe(true)
  })

  it('useSiteRead resolves the same ref, key part and availability the hooks use', () => {
    const demo = renderHook(() => useSiteRead(S, 'demo'), { wrapper: wrapperFor('demo') }).result.current
    expect(demo).toEqual({ ref: publicSiteRef(S), siteKey: `public:${S}`, available: true })
    const link = renderHook(() => useSiteRead(S, 'demo'), { wrapper: wrapperFor('link') }).result.current
    expect(link.available).toBe(false)
    const member = renderHook(() => useSiteRead(S, 'member'), { wrapper: wrapperFor('member') }).result.current
    expect(member).toEqual({ ref: S, siteKey: S, available: true })
  })
})

describe('every site hook under every scope', () => {
  const kinds = Object.keys(SCOPES) as ScopeKind[]

  // Hooks that are given no site read nothing whatever the scope, so there is no availability to assert.
  const withSite = HOOK_CASES.filter((c) => !c.name.includes('#noSite'))

  for (const kind of kinds) {
    describe(`${kind} scope`, () => {
      it.each(withSite.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
        const expected = AVAILABLE[c.routeClass][kind]
        const { result } = renderHook(() => c.call(), { wrapper: wrapperFor(kind) })
        const last = swrSpy.mock.calls[swrSpy.mock.calls.length - 1]
        const key = last?.[0] ?? null

        if (c.name === 'useDataWindow') {
          // The one hook that returns a WindowState, not a response: null means "no window known, load anyway",
          // undefined means "still loading". An unavailable window must not hold a page on loading for ever.
          expect(result.current === null).toBe(!expected)
        } else {
          const read = result.current as { available: boolean; data: unknown; error: unknown; isLoading: boolean }
          expect(read.available).toBe(expected)
          if (!expected) {
            expect(read.data).toBeUndefined()
            expect(read.error).toBeUndefined()
            expect(read.isLoading).toBe(false)
          }
        }

        if (!expected || !c.armed) {
          expect(key).toBeNull()
          return
        }
        expect(key).not.toBeNull()
        if (typeof key !== 'string') {
          // The site part of the key says which surface answered, so a member and a public read of one
          // site can never share a cache entry.
          const publicRead = kind === 'demo' || kind === 'link'
          expect(key).toContain(publicRead ? `public:${S}` : S)
          if (publicRead) expect(key).not.toContain(S)
        }

        // The fetcher must reach the API with the ref its scope resolves, the public one on a public scope.
        rec.calls.length = 0
        await (last![1] as () => Promise<unknown>)()
        expect(rec.calls.length).toBeGreaterThan(0)
        for (const [fn, args] of rec.calls) {
          const first = args[0] as SiteRef
          if (kind === 'demo' || kind === 'link') {
            expect(isPublicSiteRef(first), `${fn} must be handed the public ref`).toBe(true)
            expect(first).toEqual(publicSiteRef(S))
          } else if (c.name !== 'useSubscription') {
            expect(first, `${fn} must be handed the plain id`).toBe(S)
          }
        }
      })
    })
  }

  it('a member read of one site and a public read of it never share a key', () => {
    const keyUnder = (kind: ScopeKind, call: () => unknown): unknown[] | null => {
      swrSpy.mockClear()
      renderHook(() => call(), { wrapper: wrapperFor(kind) })
      return (swrSpy.mock.calls[swrSpy.mock.calls.length - 1]?.[0] ?? null) as unknown[] | null
    }
    const shared = HOOK_CASES.filter((c) => c.armed && c.routeClass !== 'member' && c.name !== 'useDataWindow')
    expect(shared.length).toBeGreaterThan(40)
    for (const c of shared) {
      const member = keyUnder('member', c.call)
      const demo = keyUnder('demo', c.call)
      expect(JSON.stringify(demo), c.name).not.toBe(JSON.stringify(member))
      // Same key, except the site part, which names the public surface. (The page preview also drops its
      // member flag: a public read is anonymous.)
      const expected = (member as unknown[]).map((part) => (part === S ? `public:${S}` : part))
      if (c.name.startsWith('usePagePreview')) expected[2] = false
      expect(demo, c.name).toEqual(expected)
    }
  })
})

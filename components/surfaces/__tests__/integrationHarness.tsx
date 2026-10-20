import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { ApiError } from '@/lib/api/client'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'
import type { Site } from '@/lib/api/sites'
import type {
  GSCDailyTotal, GSCDataRow, GSCNewQueries, GSCOpportunityRow, GSCOverview, GSCQueryTrendPoint, GSCStatus,
} from '@/lib/api/gsc'
import type { BingDailyRow, BingOverview, BingStatus } from '@/lib/api/bing'
import type { BunnyDailyRow, BunnyLiveResponse, BunnyOverview, BunnyRegionsResponse, BunnyStatus } from '@/lib/api/bunny'

// ---------------------------------------------------------------------------
// The test seam for the Search and CDN surfaces (PUL-34 Phase 2).
//
// The surfaces are rendered with their REAL children and their REAL data hooks. The one
// thing replaced is `apiRequest` (each test file points the module mock at `recorder()`),
// so what a page asks the API for is observed where it leaves the app, not guessed from
// which hook it called. Each read is reduced to its ROUTE, the path relative to its site
// (`/gsc/overview`, '' for the site record), so an assertion about WHICH routes a scope
// reads does not depend on how the data layer spells the site in front of it.
// ---------------------------------------------------------------------------

export const SITE_ID = '7d1c6f0e-4b86-4a3c-9a0b-0f1e2d3c4b5a'

/** A member of the site's team: every page, every control. */
export const MEMBER: SiteScope = memberScope(SITE_ID)

/** The sample site at /demo: public, read-only, served at full fidelity. */
export const DEMO: SiteScope = {
  siteId: SITE_ID, mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full',
}

/** A share link on any other site: public-scoped, the dashboard only. */
export const SHARE_LINK: SiteScope = {
  siteId: SITE_ID, mode: 'public', basePath: `/share/${SITE_ID}`, pages: ['dashboard'], demo: false, fidelity: 'scoped',
}

// ─── The recorder ────────────────────────────────────────────────

export type Canned = unknown | Error | ((endpoint: string) => unknown)
export type Routes = Record<string, Canned>

const SITE_READ = new RegExp(`^/(?:public/)?sites/${SITE_ID}(/[^?]*)?(?:\\?.*)?$`)

/**
 * The route of a read: `/gsc/overview` for `/sites/<id>/gsc/overview?…` and for the same
 * path under `/public`, '' for the site record. Anything that is not a read of this site
 * keeps its own path (`/permissions`), so it shows up in an assertion instead of hiding.
 */
export function routeOf(endpoint: string): string {
  const m = SITE_READ.exec(endpoint)
  return m ? (m[1] ?? '') : endpoint.split('?')[0]
}

export interface Recorder {
  /** Stand-in for `apiRequest`. */
  request: (endpoint: string, options?: RequestInit) => Promise<unknown>
  /** Every request, in order. */
  reads: { endpoint: string; route: string; method: string }[]
  /** The distinct routes read so far, sorted. */
  routes: () => string[]
  /** Which API surface the requests went to: the member one, the public group, or both. */
  prefixes: () => Set<'public' | 'member'>
  /** Anything that was not a GET: a page load must never send one. */
  writes: () => string[]
}

export function recorder(canned: Routes): Recorder {
  const reads: Recorder['reads'] = []
  return {
    reads,
    routes: () => [...new Set(reads.map((r) => r.route))].sort(),
    prefixes: () => new Set(reads.map((r) => (r.endpoint.startsWith('/public/') ? 'public' : 'member'))),
    writes: () => reads.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.endpoint}`),
    async request(endpoint, options) {
      const route = routeOf(endpoint)
      reads.push({ endpoint, route, method: (options?.method ?? 'GET').toUpperCase() })
      if (!(route in canned)) throw new ApiError(`No canned response for ${route}`, 404)
      const body = canned[route]
      if (body instanceof Error) throw body
      return typeof body === 'function' ? (body as (e: string) => unknown)(endpoint) : body
    },
  }
}

export function renderInScope(ui: ReactNode, scope: SiteScope) {
  return render(
    // A fresh cache per render, and no deduping: one test's reads never answer the next.
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SiteScopeProvider scope={scope}>{ui}</SiteScopeProvider>
    </SWRConfig>,
  )
}

// ─── Canned bodies, typed against the real API types ─────────────

const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}

export const SITE = {
  id: SITE_ID,
  user_id: 'u1',
  domain: 'shop.example',
  name: 'Example shop',
  timezone: 'Europe/Oslo',
  uptime_enabled: true,
  created_at: '2025-09-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
} satisfies Site

// A window that reaches today, so the default range is served as asked.
const WINDOW = { from: '2025-01-01', through: day(-1), from_reason: 'first_data' as const }
export const DATA_WINDOW = { surfaces: { search: WINDOW, search_bing: WINDOW, cdn: WINDOW } }

const GSC_ROWS: GSCDataRow[] = [
  { query: 'city bike repair', page: 'https://shop.example/repair', impressions: 1200, clicks: 90, ctr: 0.075, position: 3.4 },
  { query: 'second hand bikes', page: 'https://shop.example/used', impressions: 800, clicks: 40, ctr: 0.05, position: 6.2 },
]

export const QUERY = GSC_ROWS[0].query
export const PAGE = GSC_ROWS[0].page

const DAILY: GSCDailyTotal[] = [3, 2, 1].map((offset, i) => ({
  date: day(offset + 2), clicks: 10 + i, impressions: 200 + i * 10, ctr: (10 + i) / (200 + i * 10), position: 5 + i,
}))

const GSC_STATUS: GSCStatus = { connected: true, status: 'active', last_synced_at: '2026-10-19T04:00:00Z' }
const BING_STATUS: BingStatus = { connected: true, status: 'active', last_synced_at: '2026-10-19T04:10:00Z' }

/** Every read the Search page makes, with a plausible answer. Override per test. */
export function searchRoutes(overrides: Routes = {}): Routes {
  return {
    '': SITE,
    '/data-window': DATA_WINDOW,
    '/integrations/gsc/status': GSC_STATUS,
    '/integrations/bing/status': BING_STATUS,
    '/gsc/overview': {
      total_clicks: 120, total_impressions: 2400, avg_ctr: 0.05, avg_position: 5.5,
      prev_clicks: 100, prev_impressions: 2200, prev_avg_ctr: 0.045, prev_avg_position: 6,
    } satisfies GSCOverview,
    '/gsc/daily-totals': { daily_totals: DAILY },
    '/gsc/top-queries': { queries: GSC_ROWS, total: GSC_ROWS.length },
    '/gsc/top-pages': { pages: GSC_ROWS, total: GSC_ROWS.length },
    '/gsc/new-queries': { count: 1, queries: ['velo shop'] } satisfies GSCNewQueries,
    '/gsc/top-countries': { countries: [{ country: 'NOR', clicks: 70, impressions: 1500, ctr: 0.046, position: 4.8 }], total: 1 },
    '/gsc/top-devices': { devices: [{ device: 'MOBILE', clicks: 80, impressions: 1700, ctr: 0.047, position: 5.1 }] },
    '/gsc/opportunities': {
      opportunities: [{ query: 'bike lights', clicks: 4, impressions: 300, position: 11.2, potential_clicks: 25 } satisfies GSCOpportunityRow],
      total: 1,
    },
    '/gsc/query-pages': { pages: GSC_ROWS, total: GSC_ROWS.length },
    '/gsc/page-queries': { queries: GSC_ROWS, total: GSC_ROWS.length },
    '/gsc/query-trend': {
      trend: [
        { date: day(5), position: 4.1, clicks: 3, impressions: 40, ctr: 0.075 },
        { date: day(4), position: 3.6, clicks: 4, impressions: 41, ctr: 0.097 },
      ] satisfies GSCQueryTrendPoint[],
    },
    '/bing/overview': {
      overview: {
        total_clicks: 12, total_impressions: 340, ctr: 0.035,
        prev_total_clicks: 10, prev_total_impressions: 320, prev_ctr: 0.031,
      } satisfies BingOverview,
      date_basis: 'bing_local',
    },
    '/bing/daily-totals': {
      daily_totals: [{ date: day(3), clicks: 4, impressions: 110, ctr: 0.036 }, { date: day(2), clicks: 5, impressions: 120, ctr: 0.041 }] satisfies BingDailyRow[],
      date_basis: 'bing_local',
    },
    ...overrides,
  }
}

const BUNNY_STATUS: BunnyStatus = {
  connected: true, status: 'active', pull_zone_id: 4120001, pull_zone_name: 'shop-assets', last_synced_at: '2026-10-19T03:00:00Z',
}

const BUNNY_DAILY: BunnyDailyRow[] = [3, 2, 1].map((offset, i) => ({
  date: day(offset),
  bandwidth_used: 5_000_000 + i * 100_000,
  bandwidth_cached: 4_500_000 + i * 90_000,
  requests_served: 9000 + i * 100,
  requests_cached: 8200 + i * 90,
  error_3xx: 40,
  error_4xx: 12 + i,
  error_5xx: i,
  origin_response_time_avg: 80 + i * 5,
}))

/** Every read the CDN page makes, with a plausible answer. Override per test. */
export function cdnRoutes(overrides: Routes = {}): Routes {
  return {
    '': SITE,
    '/data-window': DATA_WINDOW,
    '/integrations/bunny/status': BUNNY_STATUS,
    '/bunny/overview': {
      total_bandwidth: 15_300_000, total_bandwidth_cached: 13_770_000, total_requests: 27_300, cache_hit_rate: 91,
      avg_origin_response: 85, total_errors: 40, total_3xx: 120,
      prev_total_bandwidth: 14_000_000, prev_total_bandwidth_cached: 12_000_000, prev_total_requests: 25_000,
      prev_cache_hit_rate: 89, prev_avg_origin_response: 90, prev_total_errors: 55,
    } satisfies BunnyOverview,
    '/bunny/daily-stats': { daily_stats: BUNNY_DAILY },
    '/bunny/regions': {
      regions: [{ region: 'EU: Oslo, NO', bandwidth: 9_000_000 }, { region: 'EU: Frankfurt, DE', bandwidth: 4_000_000 }],
      total_bandwidth: 13_000_000,
      range: { start: day(3), end: day(1) },
    } satisfies BunnyRegionsResponse,
    '/bunny/live': {
      hours: [{
        hour: '2026-10-19T05:00:00Z', bandwidth: 1000, bandwidth_cached: 900, requests: 300, requests_cached: 270,
        error_3xx: 0, error_4xx: 1, error_5xx: 0, origin_response_ms: null,
      }],
      in_progress: null,
      totals: { requests: 300, requests_cached: 270, bandwidth: 1000, bandwidth_cached: 900, error_4xx: 1, error_5xx: 0 },
      range: { start: '2026-10-18T06:00:00Z', end: '2026-10-19T06:00:00Z' },
    } satisfies BunnyLiveResponse,
    ...overrides,
  }
}

// ─── What each scope is allowed to read ──────────────────────────

/** The routes the backend serves the sample site that the Search page can read. */
export const PUBLIC_SEARCH_ROUTES = [
  '', '/data-window',
  '/integrations/gsc/status', '/integrations/bing/status',
  '/gsc/overview', '/gsc/top-queries', '/gsc/top-pages', '/gsc/query-pages', '/gsc/page-queries', '/gsc/daily-totals',
  '/gsc/new-queries', '/gsc/top-countries', '/gsc/top-devices', '/gsc/opportunities', '/gsc/query-trend',
  '/bing/overview', '/bing/daily-totals',
]

/** The routes the backend serves the sample site that the CDN page can read. */
export const PUBLIC_CDN_ROUTES = [
  '', '/data-window',
  '/integrations/bunny/status',
  '/bunny/overview', '/bunny/daily-stats', '/bunny/regions', '/bunny/live',
]

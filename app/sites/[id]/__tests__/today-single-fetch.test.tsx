// PULSE-201 — a cold Today load fired TWO /sites/:id/dashboard requests, one
// with interval=hour and one with interval=minute, for the same (site, date
// range). The old code decided the bucket granularity from the FETCHED
// response (`firstHourOfDay`, flipped in a useEffect once `daily_stats`
// arrived), so the first request always went out with the state's startup
// default ('hour') and a second one followed the instant the effect flipped
// it for a young day — a doubled fan-out that pushed a 10-20M pv/month
// customer's cold load past the server's 8s limit.
//
// This file pins the fix: the interval is decided BEFORE the first request,
// from the site's timezone and the requested day, so a Today load — young or
// not — asks `useDashboard` with exactly ONE interval, every render.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import type { DashboardData } from '@/lib/api/stats'

// ─── next/navigation — a real ?period=today link, like the bug report ──────
let mockSearchParams = new URLSearchParams('period=today')
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'site-1' }),
  usePathname: () => '/sites/site-1',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}))

// ─── The data layer — the ONE seam that matters here ───────────────────────
// useUrlDateRange is the REAL hook (so periodReady/dateRange settle exactly as
// in production); only the fetch layer is faked, and useDashboard is a spy
// that records the SWR-key shape of every call it is given.
const SITE = {
  id: 'site-1',
  user_id: 'u1',
  domain: 'acme.com',
  name: 'Acme',
  timezone: 'UTC',
  visitor_views_enabled: true,
  identity_window_days: 0,
  data_retention_months: 0,
  collect_referrers: true,
  show_referrer_domains: false,
  collect_geo_data: 'city',
  collect_audience_data: true,
  collect_device_info: true,
  collect_screen_resolution: true,
  collect_page_paths: true,
}

type DashboardCall = {
  siteId: string
  start: string
  end: string
  interval?: string
  filters?: string
  period?: string
  minutes?: number
}

let dashboardCalls: DashboardCall[] = []
/** Two buckets ~1h apart — a young day's zero-filled span, whatever interval was asked for
 * (GetTimeSeriesStats zero-fills from local midnight to now regardless of bucket width). */
let cannedDailyStats: DashboardData['daily_stats'] = [
  { date: '2026-10-01T00:00:00+00:00', pageviews: 3, visitors: 2, visits: 2, bounce_rate: 0, avg_duration: 12, avg_scroll_depth: 40, avg_visible_duration: 10 },
  { date: '2026-10-01T01:00:00+00:00', pageviews: 2, visitors: 2, visits: 2, bounce_rate: 0, avg_duration: 12, avg_scroll_depth: 40, avg_visible_duration: 10 },
]

function dashboardResponse(start: string, end: string): DashboardData {
  return {
    site: SITE,
    stats: { pageviews: 5, visitors: 4, bounce_rate: 0, avg_duration: 12, avg_scroll_depth: 40, avg_visible_duration: 10 },
    realtime_visitors: 0,
    daily_stats: cannedDailyStats,
    top_pages: [],
    entry_pages: [],
    exit_pages: [],
    top_referrers: [],
    countries: [],
    cities: [],
    regions: [],
    languages: [],
    timezones: [],
    browsers: [],
    os: [],
    devices: [],
    screen_resolutions: [],
    goal_counts: [],
    date_range: { start, end },
  } as unknown as DashboardData
}

vi.mock('@/lib/swr/dashboard', () => ({
  isLiveListKey: () => false,
  useSite: () => ({ data: SITE, error: undefined, mutate: vi.fn() }),
  // null = "known, no data window" — periodReady does not wait on it (matches
  // the Visitors page's own test harness for this hook).
  useDataWindow: () => null,
  useRealtime: () => ({ data: undefined }),
  useStats: () => ({ data: undefined }),
  useDashboard: (
    siteId: string,
    start: string,
    end: string,
    interval?: string,
    filters?: string,
    period?: string,
    minutes?: number,
  ) => {
    dashboardCalls.push({ siteId, start, end, interval, filters, period, minutes })
    if (!siteId || (!start && !end && !period && minutes == null)) {
      return { data: undefined, isLoading: false, error: undefined, mutate: vi.fn() }
    }
    return { data: dashboardResponse(start, end), isLoading: false, error: undefined, mutate: vi.fn() }
  },
}))

vi.mock('@/lib/hooks/useRealtimeSync', () => ({ useRealtimeSync: () => {} }))
vi.mock('@/lib/live-indicator-context', () => ({ useLiveIndicator: () => ({ markUpdated: () => {} }) }))
vi.mock('@ciphera-net/facet', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/skeletons', () => ({
  DashboardSkeleton: () => null,
  useMinimumLoading: (v: boolean) => v,
  useSkeletonFade: () => '',
}))

// Every card/control below the toolbar is visual noise for this test — stubbed
// to keep the harness to the one seam under test (lib/swr/dashboard's useDashboard).
vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => null }))
vi.mock('@/components/dashboard/FilterButton', () => ({ default: () => null }))
vi.mock('@/components/dashboard/RealtimeOrb', () => ({ default: () => null }))
vi.mock('@/components/dashboard/FilterPills', () => ({ default: () => null }))
vi.mock('@/components/dashboard/filter/FilterBuilder', () => ({ default: () => null }))
vi.mock('@/components/dashboard/CommandDeck', () => ({ default: () => null }))
vi.mock('@/components/dashboard/ContentStats', () => ({ default: () => null }))
vi.mock('@/components/dashboard/Sources', () => ({ default: () => null }))
vi.mock('@/components/dashboard/Locations', () => ({ default: () => null }))
vi.mock('@/components/dashboard/TechSpecs', () => ({ default: () => null }))
vi.mock('@/components/dashboard/Outbound', () => ({ default: () => null }))
vi.mock('@/components/dashboard/SectionHeader', () => ({ default: () => null }))
vi.mock('@/components/dashboard/ContentSignals', () => ({ default: () => null }))
vi.mock('@/components/dashboard/PeakHours', () => ({ default: () => null }))
vi.mock('@/lib/tour/TourController', () => ({ default: () => null }))
vi.mock('@/components/dashboard/InstallBanner', () => ({ default: () => null }))
vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))
vi.mock('@/components/ui/ErrorCard', () => ({ ErrorCard: () => null }))

import SiteDashboardPage from '../page'

/** The real SWR key shape (lib/swr/dashboard.ts useDashboard), stringified. */
function keyOf(c: DashboardCall): string {
  return JSON.stringify(['dashboard', c.siteId, c.period ?? '', c.start, c.end, c.interval, c.filters, c.minutes ?? ''])
}

beforeEach(() => {
  dashboardCalls = []
  mockSearchParams = new URLSearchParams('period=today')
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Today loads with one dashboard request, not two (PULSE-201)', () => {
  it('a young day (< 3h of data) asks for minute buckets from the FIRST request — one SWR key throughout', async () => {
    vi.setSystemTime(new Date('2026-10-01T01:30:00.000Z')) // 01:30 UTC = 1.5h into the UTC site's day
    cannedDailyStats = [
      { date: '2026-10-01T00:00:00+00:00', pageviews: 3, visitors: 2, visits: 2, bounce_rate: 0, avg_duration: 12, avg_scroll_depth: 40, avg_visible_duration: 10 },
      { date: '2026-10-01T01:00:00+00:00', pageviews: 2, visitors: 2, visits: 2, bounce_rate: 0, avg_duration: 12, avg_scroll_depth: 40, avg_visible_duration: 10 },
    ]

    render(<SiteDashboardPage />)
    // Flush mount effects and any dynamic (next/dynamic) children settling —
    // the old code's bug was exactly a SECOND render landing here with a
    // different interval, so this tick is where it would show up.
    await act(async () => {})
    await act(async () => {})

    const ready = dashboardCalls.filter(c => c.start && c.end)
    expect(ready.length).toBeGreaterThan(0)

    // THE regression check: every ready call describes the SAME SWR key. Two
    // distinct keys here is exactly the bug — a second /dashboard request
    // firing mid-render with a different interval.
    const keys = new Set(ready.map(keyOf))
    expect(keys.size).toBe(1)

    // And the one key it settled on is the right one for a young day.
    expect(ready[ready.length - 1].interval).toBe('minute')
  })

  it('an older single day (≥ 3h elapsed) still draws hourly buckets — also one request', async () => {
    vi.setSystemTime(new Date('2026-10-01T10:00:00.000Z')) // 10:00 UTC = 10h into the day
    cannedDailyStats = [
      { date: '2026-10-01T00:00:00+00:00', pageviews: 30, visitors: 20, visits: 20, bounce_rate: 0, avg_duration: 12, avg_scroll_depth: 40, avg_visible_duration: 10 },
      { date: '2026-10-01T09:00:00+00:00', pageviews: 25, visitors: 18, visits: 18, bounce_rate: 0, avg_duration: 12, avg_scroll_depth: 40, avg_visible_duration: 10 },
    ]

    render(<SiteDashboardPage />)
    await act(async () => {})
    await act(async () => {})

    const ready = dashboardCalls.filter(c => c.start && c.end)
    expect(ready.length).toBeGreaterThan(0)

    const keys = new Set(ready.map(keyOf))
    expect(keys.size).toBe(1)
    expect(ready[ready.length - 1].interval).toBe('hour')
  })
})

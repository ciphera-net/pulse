// What the dashboard surface tells its blocks about WHY one of them may be empty (lib/dashboard/emptyFacts.tsx).
//
// The words live in components/dashboard/CardEmptyState.tsx and are tested there. This file pins that the surface
// hands them the right facts: a filter is on, the site has never had a visit, the range can be widened, and (to the
// Pages block's Outbound tab alone) that outbound links are switched off for the site. The seams are those of
// dashboard-scopes.test.tsx; one stub card reads the facts the way a real block's empty state does.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, act, screen } from '@testing-library/react'
import React from 'react'
import type { DashboardData } from '@/lib/api/stats'
import type { SiteScope } from '@/lib/scope/SiteScope'
import { SiteScopeProvider, memberScope, SITE_PAGES } from '@/lib/scope/SiteScope'
import { serializeFilters } from '@/lib/filters'
import { useEmptyFacts, type EmptyFacts } from '@/lib/dashboard/emptyFacts'

let mockSearchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'site-1' }),
  usePathname: () => '/facts-under-test',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}))

const h = vi.hoisted(() => ({
  useSite: vi.fn(),
  useDataWindow: vi.fn(),
  useDashboard: vi.fn(),
  useRealtime: vi.fn(),
  useStats: vi.fn(),
  useDailyStats: vi.fn(),
  useInstallStatus: vi.fn(),
  facts: null as EmptyFacts | null,
  /** The props the Pages block (ContentStats) was handed: its `outbound` is the Outbound tab's. */
  pages: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/swr/dashboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/swr/dashboard')>()),
  useSite: (...a: unknown[]) => h.useSite(...a),
  useDataWindow: (...a: unknown[]) => h.useDataWindow(...a),
  useDashboard: (...a: unknown[]) => h.useDashboard(...a),
  useRealtime: (...a: unknown[]) => h.useRealtime(...a),
  useStats: (...a: unknown[]) => h.useStats(...a),
  useDailyStats: (...a: unknown[]) => h.useDailyStats(...a),
  useInstallStatus: (...a: unknown[]) => h.useInstallStatus(...a),
}))
vi.mock('swr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('swr')>()),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/lib/hooks/useRealtimeSync', () => ({ useRealtimeSync: () => undefined }))
vi.mock('@/lib/scope/embed', () => ({ postEmbedReady: () => undefined }))
vi.mock('@ciphera-net/facet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ciphera-net/facet')>()),
  toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('@/components/skeletons', () => ({
  DashboardSkeleton: () => <div data-testid="skeleton" />,
  useMinimumLoading: (v: boolean) => v,
  useSkeletonFade: () => '',
}))

// (Each stub is written out: a vi.mock factory is hoisted above every top-level constant.)
vi.mock('@/components/dashboard/CommandDeck', () => ({ default: () => null }))
// One block reads the facts, as CardEmptyState does inside a real one.
vi.mock('@/components/dashboard/Sources', () => ({
  default: function FactsProbe() {
    h.facts = useEmptyFacts()
    return <div data-testid="probe" />
  },
}))
vi.mock('@/components/dashboard/Locations', () => ({ default: () => null }))
vi.mock('@/components/dashboard/TechSpecs', () => ({ default: () => null }))
vi.mock('@/components/dashboard/ContentStats', () => ({
  default: (p: Record<string, unknown>) => { h.pages = p; return null },
}))
vi.mock('@/components/dashboard/ContentSignals', () => ({ default: () => null }))
// Today's Outbound block: still imported by the surface, never drawn in the frame.
vi.mock('@/components/dashboard/Outbound', () => ({ default: () => null }))
vi.mock('@/components/dashboard/PeakHours', () => ({ default: () => null }))
vi.mock('@/components/dashboard/DashboardBottom', () => ({ default: () => null }))
vi.mock('@/components/dashboard/FilterButton', () => ({ default: () => null }))
vi.mock('@/components/dashboard/FilterPills', () => ({ default: () => null }))
vi.mock('@/components/dashboard/filter/FilterBuilder', () => ({ default: () => null }))
vi.mock('@/components/dashboard/InstallBanner', () => ({ default: () => null }))
vi.mock('@/lib/tour/TourController', () => ({ default: () => null }))

import DashboardSurface from '@/components/surfaces/DashboardSurface'

const SITE = {
  id: 'site-1',
  user_id: 'u1',
  domain: 'haldencycles.example',
  name: 'Halden Cycles',
  timezone: 'Europe/Oslo',
  is_public: true,
  collect_referrers: true,
  show_referrer_domains: false,
  collect_geo_data: 'city',
  collect_audience_data: true,
  collect_device_info: true,
  collect_screen_resolution: true,
  collect_page_paths: true,
}
const demoScope: SiteScope = { siteId: 'site-1', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' }
const shareScope: SiteScope = { siteId: 'site-1', mode: 'public', basePath: '/share/site-1', pages: ['dashboard'], demo: false, fidelity: 'scoped' }

function payload(): DashboardData {
  return {
    site: SITE,
    date_range: { start: '2026-09-21', end: '2026-10-20' },
    stats: { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null, avg_scroll_depth: null, avg_visible_duration: null },
    realtime_visitors: 0,
    daily_stats: [],
    top_pages: [], entry_pages: [], exit_pages: [], top_referrers: [], channels: [],
    countries: [], cities: [], regions: [], languages: [], timezones: [],
    browsers: [], os: [], devices: [], screen_resolutions: [],
    goal_counts: [],
    campaigns: [],
  } as unknown as DashboardData
}

let siteRecord: Record<string, unknown> = SITE

beforeAll(async () => {
  await Promise.all([
    import('@/components/dashboard/CommandDeck'),
    import('@/components/dashboard/ContentSignals'),
    import('@/components/dashboard/PeakHours'),
    import('@/components/dashboard/DashboardBottom'),
    import('@/lib/tour/TourController'),
  ])
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
  vi.clearAllMocks()
  mockSearchParams = new URLSearchParams()
  h.facts = null
  h.pages = null
  siteRecord = SITE
  h.useSite.mockImplementation(() => ({ data: siteRecord, error: undefined, mutate: vi.fn() }))
  h.useDataWindow.mockImplementation(() => null)
  h.useRealtime.mockImplementation(() => ({ data: { visitors: 0 } }))
  h.useStats.mockImplementation(() => ({ data: undefined }))
  h.useDailyStats.mockImplementation(() => ({ data: undefined }))
  h.useInstallStatus.mockImplementation(() => ({ data: { install_status: 'active' } }))
  h.useDashboard.mockImplementation(() => ({ data: payload(), isLoading: false, error: undefined, mutate: vi.fn() }))
})

afterEach(() => {
  vi.useRealTimers()
})

async function mount(scope: SiteScope = memberScope('site-1')) {
  const view = render(
    <SiteScopeProvider scope={scope}>
      <DashboardSurface />
    </SiteScopeProvider>,
  )
  await act(async () => {})
  await act(async () => {})
  expect(screen.getByTestId('probe')).toBeTruthy()
  return view
}
const filterParam = () => new URLSearchParams({ filters: serializeFilters([{ dimension: 'country', operator: 'is', values: ['NO'] }]) })

describe('a member\'s dashboard', () => {
  it('with nothing special: no filter, a site with visits, a range that can be widened', async () => {
    await mount()
    expect(h.facts).toMatchObject({ filtered: false, neverVisited: false, canWiden: true })
    expect(typeof h.facts?.clearFilters).toBe('function')
  })

  it('knows a filter is on, and its clearFilters takes every filter off', async () => {
    mockSearchParams = filterParam()
    await mount()
    expect(h.facts?.filtered).toBe(true)
    await act(async () => { h.facts?.clearFilters?.() })
    expect(h.facts?.filtered).toBe(false)
  })

  it('knows the site has never had a visit from the live install status, the banner\'s own read', async () => {
    h.useInstallStatus.mockImplementation(() => ({ data: { install_status: 'never_installed' } }))
    await mount()
    expect(h.facts?.neverVisited).toBe(true)
    // The same entry the banner reads: the site, and no polling asked for a second time.
    expect(h.useInstallStatus).toHaveBeenCalledWith('site-1')
  })

  it('answers from the site record while the live status has not arrived', async () => {
    h.useInstallStatus.mockImplementation(() => ({ data: undefined }))
    siteRecord = { ...SITE, install_status: 'never_installed' }
    await mount()
    expect(h.facts?.neverVisited).toBe(true)
  })

  it('lets the live status overrule a site record that is behind it', async () => {
    siteRecord = { ...SITE, install_status: 'never_installed' }
    await mount()
    expect(h.facts?.neverVisited).toBe(false)
  })

  it('does not say so of a site whose history is imported: its chart has visits before its script ever reports', async () => {
    // The server gives an import-only site a data window on purpose (reason `from_import`). "No visitors yet" in a
    // block beside a chart full of imported visits would be false.
    h.useInstallStatus.mockImplementation(() => ({ data: { install_status: 'never_installed' } }))
    h.useDataWindow.mockImplementation(() => ({ from: '2025-01-01', through: '2026-10-20', from_reason: 'from_import' }))
    const imported = await mount()
    expect(h.facts?.neverVisited).toBe(false)
    imported.unmount()
    // The control: the same site with no day of history at all.
    h.useDataWindow.mockImplementation(() => null)
    await mount()
    expect(h.facts?.neverVisited).toBe(true)
  })

  it.each([['stalled'], ['active'], [undefined]])('does not call a site with status %s never visited', async (status) => {
    h.useInstallStatus.mockImplementation(() => ({ data: status ? { install_status: status } : undefined }))
    await mount()
    expect(h.facts?.neverVisited).toBe(false)
  })

  it('knows nobody is on the site only from a live count that is known and at zero', async () => {
    // The first frame's default: the payload says 0.
    await mount()
    expect(h.facts?.nobodyLive).toBe(true)
  })

  it.each([
    ['the live read says somebody is there', { visitors: 3 }, 0, false],
    ['the live read says nobody, whatever the older payload says', { visitors: 0 }, 2, true],
    ['only the payload knows, and it says somebody', undefined, 1, false],
    ['nothing is known yet', undefined, undefined, false],
  ])('nobodyLive when %s', async (_name, live, payloadCount, want) => {
    h.useRealtime.mockImplementation(() => ({ data: live }))
    h.useDashboard.mockImplementation(() => ({ data: { ...payload(), realtime_visitors: payloadCount }, isLoading: false, error: undefined, mutate: vi.fn() }))
    await mount()
    expect(h.facts?.nobodyLive).toBe(want)
  })

  it('knows All time cannot be widened', async () => {
    mockSearchParams = new URLSearchParams('period=all')
    await mount()
    expect(h.facts?.canWiden).toBe(false)
  })
})

describe('the Pages block\'s Outbound tab is told when outbound links are switched off for the site', () => {
  it.each([
    ['switched off', { outbound: false }, true],
    ['switched on', { outbound: true }, false],
    ['never set (on by default)', {}, false],
    ['no options stored at all', undefined, false],
  ])('%s', async (_name, script_features, off) => {
    siteRecord = { ...SITE, script_features }
    await mount()
    expect((h.pages?.outbound as { trackingOff?: boolean } | undefined)?.trackingOff).toBe(off)
  })

  it('a share link\'s Pages block has no Outbound tab to tell', async () => {
    await mount(shareScope)
    expect(h.pages).not.toBeNull()
    expect(h.pages?.outbound).toBeUndefined()
  })
})

describe('a public page', () => {
  it('the demo: its install status is not read, and it never says the site has no visits', async () => {
    h.useInstallStatus.mockImplementation((siteId?: string) => ({ data: siteId ? { install_status: 'never_installed' } : undefined }))
    await mount(demoScope)
    for (const call of h.useInstallStatus.mock.calls) expect(call[0]).toBeUndefined()
    expect(h.facts?.neverVisited).toBe(false)
  })

  it('the demo lets a reader filter, so it lets them clear the filter', async () => {
    mockSearchParams = filterParam()
    await mount(demoScope)
    expect(h.facts?.filtered).toBe(true)
    expect(typeof h.facts?.clearFilters).toBe('function')
  })

  it('a share link carries no filter and offers none to clear', async () => {
    mockSearchParams = filterParam()
    await mount(shareScope)
    expect(h.facts?.filtered).toBe(false)
    expect(h.facts?.clearFilters).toBeUndefined()
  })
})

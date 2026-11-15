// The new dashboard frame on the ONE dashboard surface, for every reader since 15-11-2026 (the beta `new-dashboard`
// until then: the flag went to every team, and public pages draw the frame too).
//
// The surface mounts components/surfaces/DashboardFrame.tsx whatever /me says, and asks it nothing. This file pins
// what a reader gets: the new order, no section titles, the toolbar that stays, no bucket picker on the chart, and
// the Events block without scroll depth.
//
// The seams are those of dashboard-scopes.test.tsx: the data hooks are spies and the cards are prop-capturing
// stubs (their own files test what a block does inside the frame).
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, act, screen } from '@testing-library/react'
import React from 'react'
import type { DashboardData } from '@/lib/api/stats'
import { SiteScopeProvider, memberScope } from '@/lib/scope/SiteScope'
import { useDashboardFrame } from '@/lib/dashboard/frame'
import { useEmptyFacts, type EmptyFacts } from '@/lib/dashboard/emptyFacts'
import { serializeFilters } from '@/lib/filters'

let mockSearchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'site-1' }),
  usePathname: () => '/frame-under-test',
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
  /** The banner's live install status, which the surface reads for its blocks' empty states. A spy: no request leaves the test. */
  useInstallStatus: vi.fn(),
  /** What /me says about a flag: true, false, or null while it is loading (or after it failed). */
  feature: vi.fn<(flag: string) => boolean | null>(),
  captured: {} as Record<string, Record<string, unknown>>,
  /** What each stub card read from the frame's context when it rendered. */
  inFrame: {} as Record<string, boolean>,
  /** What each stub card read of the page's empty facts, the way a real block's empty state does. */
  facts: {} as Record<string, EmptyFacts>,
}))

vi.mock('@/lib/features', () => ({ useFeature: (flag: string) => h.feature(flag) }))
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
  DashboardSkeleton: (props: Record<string, unknown>) => <div data-testid="skeleton" data-props={Object.keys(props).join(',')} />,
  useMinimumLoading: (v: boolean) => v,
  useSkeletonFade: () => '',
}))

/** A stub card: records its props, whether the frame's context reached it, and the empty facts it stands in. */
function stub(name: string, testid: string) {
  return {
    default: function Stub(p: Record<string, unknown>) {
      h.captured[name] = p
      h.inFrame[name] = useDashboardFrame()
      h.facts[name] = useEmptyFacts()
      return <div data-testid={testid} data-block={name} />
    },
  }
}
vi.mock('@/components/dashboard/CommandDeck', () => stub('CommandDeck', 'deck'))
vi.mock('@/components/dashboard/Sources', () => stub('Sources', 'card'))
vi.mock('@/components/dashboard/Locations', () => stub('Audience', 'card'))
vi.mock('@/components/dashboard/TechSpecs', () => stub('TechSpecs', 'card'))
vi.mock('@/components/dashboard/ContentStats', () => stub('ContentStats', 'card'))
vi.mock('@/components/dashboard/ContentSignals', () => stub('ContentSignals', 'card'))
vi.mock('@/components/dashboard/Outbound', () => stub('Outbound', 'card'))
vi.mock('@/components/dashboard/PeakHours', () => stub('PeakHours', 'peak-hours'))
// The new frame's bottom (what converts, the week, the three tiles): today's heat map is today's arrangement's alone.
vi.mock('@/components/dashboard/DashboardBottom', () => stub('DashboardBottom', 'bottom'))
vi.mock('@/components/dashboard/SectionHeader', () => ({
  default: ({ title }: { title: string }) => <h2 data-testid="section">{title}</h2>,
}))
vi.mock('@/components/dashboard/FilterButton', () => ({ default: () => <button data-testid="filter-button" /> }))
vi.mock('@/components/dashboard/FilterPills', () => ({ default: () => <div data-testid="filter-pills" /> }))
vi.mock('@/components/dashboard/filter/FilterBuilder', () => ({ default: () => <div data-testid="filter-builder" /> }))
vi.mock('@/components/dashboard/InstallBanner', () => ({ default: () => <div data-testid="install-banner" /> }))
vi.mock('@/lib/tour/TourController', () => ({ default: () => <div data-testid="tour" /> }))

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

function payload(): DashboardData {
  return {
    site: SITE,
    date_range: { start: '2026-09-21', end: '2026-10-20' },
    stats: { pageviews: 1234, visitors: 567, bounce_rate: 40, avg_duration: 30, avg_scroll_depth: 50, avg_visible_duration: 20 },
    realtime_visitors: 4,
    daily_stats: [],
    top_pages: [], entry_pages: [], exit_pages: [], top_referrers: [], channels: [],
    countries: [], cities: [], regions: [], languages: [], timezones: [],
    browsers: [], os: [], devices: [], screen_resolutions: [],
    goal_counts: [],
    scroll_depth: { total_sessions: 12, buckets: [] },
    campaigns: [],
  } as unknown as DashboardData
}

let intervals: Array<string | undefined> = []
let siteRecord: Record<string, unknown> = SITE

beforeAll(async () => {
  // The deck, the tour and two cards are next/dynamic: load them once, so every test finds them settled.
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
  h.captured = {}
  h.inFrame = {}
  h.facts = {}
  intervals = []
  siteRecord = SITE
  h.feature.mockImplementation(() => true)
  h.useSite.mockImplementation(() => ({ data: siteRecord, error: undefined, mutate: vi.fn() }))
  h.useInstallStatus.mockImplementation(() => ({ data: { install_status: 'active' } }))
  h.useDataWindow.mockImplementation(() => null)
  h.useRealtime.mockImplementation(() => ({ data: { visitors: 4 } }))
  h.useStats.mockImplementation(() => ({ data: { pageviews: 1000, visitors: 400 } }))
  h.useDailyStats.mockImplementation(() => ({ data: undefined }))
  h.useDashboard.mockImplementation((_siteId: string, _start: string, _end: string, interval?: string) => {
    intervals.push(interval)
    return { data: payload(), isLoading: false, error: undefined, mutate: vi.fn() }
  })
})

afterEach(() => {
  vi.useRealTimers()
})

async function mount() {
  const view = render(
    <SiteScopeProvider scope={memberScope('site-1')}>
      <DashboardSurface />
    </SiteScopeProvider>,
  )
  await act(async () => {})
  await act(async () => {})
  return view
}
const sectionTitles = () => screen.queryAllByTestId('section').map((n) => n.textContent)
const blockOrder = () => screen.queryAllByTestId('card').map((n) => n.getAttribute('data-block'))

describe('every reader gets the frame, whatever /me says (15-11-2026)', () => {
  it.each([
    ['on', true],
    ['off', false],
    ['still loading, or /me failed', null],
  ])('/me says %s: the frame, and the flag is not asked for', async (_name, value) => {
    h.feature.mockImplementation(() => value)
    await mount()
    expect(h.feature).not.toHaveBeenCalledWith('new-dashboard')
    expect(document.querySelector('[data-dashboard-frame]')).toBeTruthy()
    expect(sectionTitles()).toEqual([])
    expect(blockOrder()).toEqual(['Sources', 'ContentStats', 'Audience', 'TechSpecs', 'ContentSignals'])
    expect(h.captured.CommandDeck.intervalPicker).toBe(false)
  })
})

describe('while the dashboard loads', () => {
  it('draws the one skeleton, the frame\'s, with no shape to choose', async () => {
    h.useDashboard.mockImplementation(() => ({ data: undefined, isLoading: true, error: undefined, mutate: vi.fn() }))
    await mount()
    expect(screen.getByTestId('skeleton').getAttribute('data-props')).toBe('')
  })
})

describe('the new frame', () => {
  it('orders the blocks Sources, Pages, Locations, Technology, Events and draws no section title', async () => {
    await mount()
    expect(sectionTitles()).toEqual([])
    // Five blocks: Outbound is no block of its own in the frame, its links are the Pages block's fourth tab.
    expect(blockOrder()).toEqual(['Sources', 'ContentStats', 'Audience', 'TechSpecs', 'ContentSignals'])
    // Events closes the grid across both columns.
    const events = document.querySelector('[data-frame-events]') as HTMLElement
    expect(events.className).toBe('lg:col-span-2')
    expect(events.querySelector('[data-block="ContentSignals"]')).toBeTruthy()
    // The deck first, the bottom last, all inside the frame; today's heat map is not drawn in it.
    const frame = document.querySelector('[data-dashboard-frame]') as HTMLElement
    expect(frame).toBeTruthy()
    const marks = [...frame.querySelectorAll('[data-testid="deck"], [data-testid="card"], [data-testid="peak-hours"], [data-testid="bottom"]')].map((n) => n.getAttribute('data-block'))
    expect(marks[0]).toBe('CommandDeck')
    expect(marks[marks.length - 1]).toBe('DashboardBottom')
    expect(marks).not.toContain('PeakHours')
  })

  it('tells the deck, every block and the bottom that they are in the frame', async () => {
    await mount()
    expect(h.inFrame).toEqual({
      CommandDeck: true, Sources: true, ContentStats: true, Audience: true, TechSpecs: true, ContentSignals: true, DashboardBottom: true,
    })
  })

  it('keeps the toolbar at the top, with the member\'s controls in it', async () => {
    await mount()
    const toolbar = screen.getByTestId('frame-toolbar')
    expect(toolbar.className).toContain('sticky')
    // The new dashboard's filter (R36): the Search filter's button, in place of today's.
    expect(toolbar.contains(screen.getByTestId('search-filter-button'))).toBe(true)
    expect(screen.queryByTestId('filter-button')).toBeNull()
    expect(toolbar.contains(screen.getByRole('button', { name: /^Date range:/ }))).toBe(true)
    // The band is its own element behind the controls, invisible at rest.
    const band = screen.getByTestId('frame-toolbar-band')
    expect(toolbar.contains(band)).toBe(true)
    expect(band.className).toContain('glass-band')
    expect(band.style.opacity).toBe('0')
  })

  it('takes the bucket picker off the chart and asks a range of several days in days', async () => {
    await mount()
    expect(h.captured.CommandDeck.intervalPicker).toBe(false)
    expect(intervals.length).toBeGreaterThan(0)
    expect(new Set(intervals)).toEqual(new Set(['day']))
  })

  it('hands the Events block no scroll depth', async () => {
    await mount()
    expect('scrollDepth' in h.captured.ContentSignals).toBe(false)
    expect(h.captured.ContentSignals.goalCounts).toEqual([])
  })

  it('hands the Events block the range\'s true totals, the denominator of its conversion', async () => {
    await mount()
    expect(h.captured.ContentSignals.totals).toEqual({ pageviews: 1234, visitors: 567 })
  })

  it('wires every block as today: totals, the live window, the member\'s full lists, the filter', async () => {
    await mount()
    for (const name of ['Sources', 'ContentStats', 'Audience', 'TechSpecs']) {
      expect(h.captured[name].totals, name).toEqual({ pageviews: 1234, visitors: 567 })
      expect(h.captured[name].memberFeatures, name).toBe(true)
      expect(typeof h.captured[name].onFilter, name).toBe('function')
    }
    expect(h.captured.Audience.previousVisitors).toBe(400)
    expect(h.captured.Sources.campaigns).toBeUndefined()
    // Outbound's links ride in the Pages block: it is handed what their tab needs, and no Outbound block is drawn.
    expect(h.captured.ContentStats.dateRange).toEqual({ start: '2026-09-21', end: '2026-10-20' })
    expect(h.captured.ContentStats.outbound).toMatchObject({ goalCounts: [], trackingOff: false })
    expect(h.captured.Outbound).toBeUndefined()
    expect(h.captured.DashboardBottom.dateRange).toEqual({ start: '2026-09-21', end: '2026-10-20' })
    expect(h.captured.DashboardBottom.siteId).toBe('site-1')
  })

  it('stands every block inside the page\'s empty facts, so an empty block can say why', async () => {
    // The frame is mounted INSIDE the surface's EmptyFactsProvider. Outside it a block knows nothing: a filter
    // that matches nothing would read "Try a longer range." and offer no way to clear it.
    mockSearchParams = new URLSearchParams({ filters: serializeFilters([{ dimension: 'country', operator: 'is', values: ['NO'] }]) })
    await mount()
    const blocks = ['Sources', 'ContentStats', 'Audience', 'TechSpecs', 'ContentSignals']
    for (const name of blocks) {
      expect(h.facts[name]?.filtered, name).toBe(true)
      expect(typeof h.facts[name]?.clearFilters, name).toBe('function')
    }
    // And the facts are the page's own: clearing through one block clears the filter for all of them.
    await act(async () => { h.facts.Sources.clearFilters?.() })
    for (const name of blocks) expect(h.facts[name]?.filtered, name).toBe(false)
  })

  it('knows a site that never had a visit, from the banner\'s own live read', async () => {
    h.useInstallStatus.mockImplementation(() => ({ data: { install_status: 'never_installed' } }))
    await mount()
    expect(h.useInstallStatus).toHaveBeenCalledWith('site-1')
    expect(h.facts.Sources?.neverVisited).toBe(true)
    expect(h.facts.ContentSignals?.neverVisited).toBe(true)
  })

  it.each([
    ['switched off', { outbound: false }, true],
    ['switched on', { outbound: true }, false],
    ['never set (on by default)', {}, false],
  ])('tells the Pages block\'s Outbound tab that the site\'s outbound links are %s', async (_name, script_features, off) => {
    siteRecord = { ...SITE, script_features }
    await mount()
    expect((h.captured.ContentStats.outbound as { trackingOff: boolean }).trackingOff).toBe(off)
  })

  it('keeps what belongs to a member: the tour and the install banner', async () => {
    await mount()
    expect(screen.getByTestId('tour')).toBeTruthy()
    expect(screen.getByTestId('install-banner')).toBeTruthy()
    // The filter is the member's too: the Search filter, whose panel is its own; today's popover is not drawn.
    expect(screen.getByTestId('search-filter-button')).toBeTruthy()
    expect(screen.queryByTestId('filter-builder')).toBeNull()
  })

  it('draws no heat map in realtime, as today', async () => {
    mockSearchParams = new URLSearchParams('period=realtime')
    await mount()
    expect(screen.queryByTestId('peak-hours')).toBeNull()
    expect(blockOrder()).toEqual(['Sources', 'ContentStats', 'Audience', 'TechSpecs', 'ContentSignals'])
    for (const name of ['Sources', 'ContentStats', 'Audience', 'TechSpecs', 'ContentSignals']) {
      expect(typeof h.captured[name].liveMinutes, name).toBe('number')
    }
  })
})

// PUL-34 Phase 2 — the ONE dashboard surface under its three scopes.
//
// The product's dashboard, the demo and a customer's share link render the same
// component (components/surfaces/DashboardSurface.tsx); the scope decides what it shows
// (lib/dashboard/capabilities.ts). This file pins the three readers:
//
//   member            the product, unchanged (today-single-fetch.test.tsx pins its requests)
//   public, full      the demo site: the whole member dashboard, minus the member's own
//                     affordances (install banner, tour, socket, links to settings)
//   public, scoped    a customer's share link: today's share page rebuilt INSIDE the surface
//                     (four fixed windows, a period token alone, no filters, no comparison,
//                     no hourly buckets, no Outbound, no Behaviour)
//
// The real DateRangePicker and RealtimeOrb render (what a reader SEES is the subject, as in
// the share page's own tests it replaces); the data hooks are spies, so every read the page
// makes is on the record; the cards are prop-capturing stubs (their own files test them,
// components/dashboard/__tests__/public-scope-cards.test.tsx renders the real ones).
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, act, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { DashboardData } from '@/lib/api/stats'
import type { SiteScope } from '@/lib/scope/SiteScope'
import { SiteScopeProvider, memberScope, SITE_PAGES } from '@/lib/scope/SiteScope'
import { SHARE_FIXED_RANGES_REASON } from '@/lib/view/view'
import { serializeFilters } from '@/lib/filters'

// ─── The seams ───────────────────────────────────────────────────────────────────
let mockSearchParams = new URLSearchParams()
const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'site-1' }),
  usePathname: () => '/scope-under-test',
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}))

const h = vi.hoisted(() => ({
  useSite: vi.fn(),
  useDataWindow: vi.fn(),
  useDashboard: vi.fn(),
  useRealtime: vi.fn(),
  useStats: vi.fn(),
  useDailyStats: vi.fn(),
  useRealtimeSync: vi.fn(),
  postEmbedReady: vi.fn(),
  mutateLive: vi.fn(),
  captured: {} as Record<string, Record<string, unknown>>,
}))

vi.mock('@/lib/swr/dashboard', async (importOriginal) => ({
  // The real isLiveListKey: the page's live-list matcher is under test.
  ...(await importOriginal<typeof import('@/lib/swr/dashboard')>()),
  useSite: (...a: unknown[]) => h.useSite(...a),
  useDataWindow: (...a: unknown[]) => h.useDataWindow(...a),
  useDashboard: (...a: unknown[]) => h.useDashboard(...a),
  useRealtime: (...a: unknown[]) => h.useRealtime(...a),
  useStats: (...a: unknown[]) => h.useStats(...a),
  useDailyStats: (...a: unknown[]) => h.useDailyStats(...a),
}))
vi.mock('swr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('swr')>()),
  useSWRConfig: () => ({ mutate: h.mutateLive }),
}))
vi.mock('@/lib/hooks/useRealtimeSync', () => ({ useRealtimeSync: (...a: unknown[]) => h.useRealtimeSync(...a) }))
vi.mock('@/lib/scope/embed', () => ({ postEmbedReady: () => h.postEmbedReady() }))
vi.mock('@ciphera-net/facet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ciphera-net/facet')>()),
  toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('@/components/skeletons', () => ({
  DashboardSkeleton: () => <div data-testid="skeleton" />,
  useMinimumLoading: (v: boolean) => v,
  useSkeletonFade: () => '',
}))

// Cards and controls: stubs that record the props the page hands them.
vi.mock('@/components/dashboard/CommandDeck', () => ({
  default: (p: Record<string, unknown>) => { h.captured.CommandDeck = p; return <div data-testid="deck" /> },
}))
vi.mock('@/components/dashboard/Sources', () => ({
  default: (p: Record<string, unknown>) => { h.captured.Sources = p; return <div data-testid="card-sources" /> },
}))
vi.mock('@/components/dashboard/Locations', () => ({
  default: (p: Record<string, unknown>) => { h.captured.Audience = p; return <div data-testid="card-audience" /> },
}))
vi.mock('@/components/dashboard/TechSpecs', () => ({
  default: (p: Record<string, unknown>) => { h.captured.TechSpecs = p; return <div data-testid="card-techspecs" /> },
}))
vi.mock('@/components/dashboard/ContentStats', () => ({
  default: (p: Record<string, unknown>) => { h.captured.ContentStats = p; return <div data-testid="card-content-stats" /> },
}))
vi.mock('@/components/dashboard/ContentSignals', () => ({
  default: (p: Record<string, unknown>) => { h.captured.ContentSignals = p; return <div data-testid="card-content-signals" /> },
}))
vi.mock('@/components/dashboard/Outbound', () => ({
  default: (p: Record<string, unknown>) => { h.captured.Outbound = p; return <div data-testid="card-outbound" /> },
}))
vi.mock('@/components/dashboard/PeakHours', () => ({
  default: (p: Record<string, unknown>) => { h.captured.PeakHours = p; return <div data-testid="card-peak-hours" /> },
}))
vi.mock('@/components/dashboard/SectionHeader', () => ({
  default: ({ title }: { title: string }) => <h2 data-testid="section">{title}</h2>,
}))
vi.mock('@/components/dashboard/FilterButton', () => ({ default: () => <button data-testid="filter-button" /> }))
vi.mock('@/components/dashboard/FilterPills', () => ({ default: () => <div data-testid="filter-pills" /> }))
vi.mock('@/components/dashboard/filter/FilterBuilder', () => ({ default: () => <div data-testid="filter-builder" /> }))
vi.mock('@/components/dashboard/InstallBanner', () => ({ default: () => <div data-testid="install-banner" /> }))
vi.mock('@/lib/tour/TourController', () => ({ default: () => <div data-testid="tour" /> }))

import DashboardSurface from '@/components/surfaces/DashboardSurface'

// ─── Fixtures ─────────────────────────────────────────────────────────────────────
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

type Extra = Partial<DashboardData> & Record<string, unknown>
function payload(range: { start: string; end: string }, extra: Extra = {}): DashboardData {
  return {
    site: SITE,
    date_range: range,
    stats: { pageviews: 1234, visitors: 567, bounce_rate: 40, avg_duration: 30, avg_scroll_depth: 50, avg_visible_duration: 20 },
    realtime_visitors: 4,
    daily_stats: [],
    top_pages: [], entry_pages: [], exit_pages: [], top_referrers: [], channels: [],
    countries: [], cities: [], regions: [], languages: [], timezones: [],
    browsers: [], os: [], devices: [], screen_resolutions: [],
    goal_counts: [],
    campaigns: [{ source: 'newsletter', medium: 'email', campaign: 'spring', term: '', content: '', visitors: 9, pageviews: 12, bounce_rate: null, avg_duration: null }],
    ...extra,
  } as unknown as DashboardData
}

type DashboardCall = { siteId: string; start: string; end: string; interval?: string; filters?: string; period?: string; minutes?: number }
let dashboardCalls: DashboardCall[] = []
let refetchDashboard = vi.fn()
/** What the useDashboard spy answers: data, an error, or still loading. */
let dashboardState: { data?: DashboardData; error?: unknown } = {}

// The deck, the tour and two cards are next/dynamic. Their first import takes real I/O time,
// which fake timers and act() cannot wait for: load them once, up front, so every test finds
// them settled after the same two flushes.
beforeAll(async () => {
  await Promise.all([
    import('@/components/dashboard/CommandDeck'),
    import('@/components/dashboard/ContentSignals'),
    import('@/components/dashboard/PeakHours'),
    import('@/lib/tour/TourController'),
  ])
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
  vi.clearAllMocks()
  mockSearchParams = new URLSearchParams()
  dashboardCalls = []
  h.captured = {}
  refetchDashboard = vi.fn()
  dashboardState = { data: payload({ start: '2026-09-21', end: '2026-10-20' }) }

  h.useSite.mockImplementation(() => ({ data: SITE, error: undefined, mutate: vi.fn() }))
  h.useDataWindow.mockImplementation(() => null)
  h.useRealtime.mockImplementation(() => ({ data: { visitors: 4 } }))
  h.useStats.mockImplementation(() => ({ data: undefined }))
  h.useDailyStats.mockImplementation(() => ({ data: undefined }))
  h.useDashboard.mockImplementation((siteId: string, start: string, end: string, interval?: string, filters?: string, period?: string, minutes?: number) => {
    dashboardCalls.push({ siteId, start, end, interval, filters, period, minutes })
    return {
      data: dashboardState.data,
      isLoading: !dashboardState.data && !dashboardState.error,
      error: dashboardState.error,
      mutate: refetchDashboard,
    }
  })
})

afterEach(() => {
  vi.useRealTimers()
})

async function mount(scope: SiteScope) {
  const view = render(
    <SiteScopeProvider scope={scope}>
      <DashboardSurface />
    </SiteScopeProvider>,
  )
  // The deck and two cards are next/dynamic: let them settle.
  await act(async () => {})
  await act(async () => {})
  return view
}
const last = () => dashboardCalls[dashboardCalls.length - 1]
const sectionTitles = () => screen.queryAllByTestId('section').map((n) => n.textContent)
const openSwitcher = () => fireEvent.click(screen.getByRole('button', { name: /^Date range:/ }))

// ═══════════════════════════════════════════════════════════════════════════════
describe('the member dashboard is the product, with the member\'s own affordances', () => {
  it('mounts the tour and the install banner, and the controls a member filters with', async () => {
    await mount(memberScope('site-1'))
    expect(screen.getByTestId('tour')).toBeTruthy()
    expect(screen.getByTestId('install-banner')).toBeTruthy()
    expect(screen.getByTestId('filter-button')).toBeTruthy()
    expect(screen.getByTestId('filter-builder')).toBeTruthy()
    expect(sectionTitles()).toEqual(['Acquisition', 'Audience', 'Outbound', 'Content', 'Behaviour'])
  })

  it('stays silent to the hero: a member page is never framed by it', async () => {
    await mount(memberScope('site-1'))
    expect(h.postEmbedReady).not.toHaveBeenCalled()
  })

  it('learns of live changes from the realtime socket, never from a timer', async () => {
    mockSearchParams = new URLSearchParams('period=realtime')
    await mount(memberScope('site-1'))
    expect(h.useRealtimeSync).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, siteId: 'site-1' }))
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(refetchDashboard).not.toHaveBeenCalled()
    // …and the socket's signal does the one refresh, dashboard and live lists together.
    const { onChanged } = h.useRealtimeSync.mock.calls[0][0] as { onChanged: () => void }
    act(() => onChanged())
    expect(refetchDashboard).toHaveBeenCalledTimes(1)
    expect(h.mutateLive).toHaveBeenCalledTimes(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('the demo (public, full): the whole member dashboard without the member\'s affordances', () => {
  it('shows no install banner and no tour, and nothing that leads to Visitors or settings', async () => {
    await mount(demoScope)
    expect(screen.queryByTestId('install-banner')).toBeNull()
    expect(screen.queryByTestId('tour')).toBeNull()
    expect(document.querySelector('a[href*="/settings"]')).toBeNull()
    expect(document.querySelector('a[href*="/visitors"]')).toBeNull()
  })

  it('keeps every card and section a member has, Outbound and Behaviour included', async () => {
    await mount(demoScope)
    expect(sectionTitles()).toEqual(['Acquisition', 'Audience', 'Outbound', 'Content', 'Behaviour'])
    expect(screen.getByTestId('card-outbound')).toBeTruthy()
    expect(screen.getByTestId('card-peak-hours')).toBeTruthy()
  })

  it('filters like a member: the controls are there, the rows filter, a filtered URL is read and sent', async () => {
    const filter = { dimension: 'country', operator: 'is' as const, values: ['NO'] }
    mockSearchParams = new URLSearchParams({ filters: serializeFilters([filter]) })
    await mount(demoScope)
    expect(screen.getByTestId('filter-button')).toBeTruthy()
    expect(screen.getByTestId('filter-pills')).toBeTruthy()
    expect(screen.getByTestId('filter-builder')).toBeTruthy()
    expect(typeof h.captured.Sources.onFilter).toBe('function')
    expect(typeof h.captured.ContentStats.onFilter).toBe('function')
    expect(last().filters).toBe(serializeFilters([filter]))
  })

  it('offers the whole menu: a custom range, the arrows, every row served', async () => {
    await mount(demoScope)
    openSwitcher()
    expect((document.querySelector('[data-row="custom"]') as HTMLButtonElement).disabled).toBe(false)
    expect((document.querySelector('[data-row="3m"]') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Shift range back' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Shift range forward' })).toBeTruthy()
  })

  it('serves the full lists and the drill-downs the demo is served, and asks the site record for its timezone', async () => {
    await mount(demoScope)
    for (const card of ['Sources', 'Audience', 'TechSpecs', 'ContentStats', 'ContentSignals']) {
      expect(h.captured[card].memberFeatures, card).toBe(true)
    }
    // The campaigns read is served to the demo: the card fetches its own rows.
    expect(h.captured.Sources.campaigns).toBeUndefined()
    expect(h.useSite).toHaveBeenCalledWith('site-1')
    expect(h.useDataWindow).toHaveBeenCalledWith('site-1', 'dashboard')
  })

  it('compares with the previous period, as a member does', async () => {
    await mount(demoScope)
    const ranges = h.useStats.mock.calls.filter((c) => c[1] && c[2])
    expect(ranges.length).toBeGreaterThan(0)
  })

  it('opens no realtime socket, even in realtime mode: it refreshes the dashboard and the live lists every 15 s', async () => {
    mockSearchParams = new URLSearchParams('period=realtime')
    await mount(demoScope)
    expect(h.useRealtimeSync).not.toHaveBeenCalled()
    // The live fan-out asks for the live window, not for dates.
    expect(last().minutes).toBe(5)

    await act(async () => { vi.advanceTimersByTime(14_999) })
    expect(refetchDashboard).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(refetchDashboard).toHaveBeenCalledTimes(1)
    expect(h.mutateLive).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(15_000) })
    expect(refetchDashboard).toHaveBeenCalledTimes(2)
  })

  it('refreshes every live list of THIS site, whichever way its key was written, and no other site\'s', async () => {
    mockSearchParams = new URLSearchParams('period=realtime')
    await mount(demoScope)
    await act(async () => { vi.advanceTimersByTime(15_000) })
    const matches = h.mutateLive.mock.calls[0][0] as (key: unknown) => boolean
    expect(matches(['fullList', 'countries', 'site-1', '__live__', 5, 100, undefined])).toBe(true)
    expect(matches(['outbound', 'public:site-1', '__live__', 5])).toBe(true)
    expect(matches(['campaignsList', 'public:site-1', '__live__', 5, 10, undefined])).toBe(true)
    expect(matches(['fullList', 'countries', 'site-2', '__live__', 5, 100, undefined])).toBe(false)
    expect(matches(['dashboard', 'site-1', '__live__'])).toBe(false)
  })

  it('does not poll when it is not live', async () => {
    await mount(demoScope)
    await act(async () => { vi.advanceTimersByTime(120_000) })
    expect(refetchDashboard).not.toHaveBeenCalled()
  })

  it('tells the hero its page has drawn, once, when the payload first renders — never on the skeleton, never again', async () => {
    dashboardState = {}
    const view = await mount(demoScope)
    expect(screen.getByTestId('skeleton')).toBeTruthy()
    expect(h.postEmbedReady).not.toHaveBeenCalled()

    dashboardState = { data: payload({ start: '2026-09-21', end: '2026-10-20' }) }
    view.rerender(<SiteScopeProvider scope={demoScope}><DashboardSurface /></SiteScopeProvider>)
    await act(async () => {})
    expect(h.postEmbedReady).toHaveBeenCalledTimes(1)

    // A period change sends the page back through the skeleton and out again.
    dashboardState = {}
    view.rerender(<SiteScopeProvider scope={demoScope}><DashboardSurface /></SiteScopeProvider>)
    await act(async () => {})
    dashboardState = { data: payload({ start: '2026-10-14', end: '2026-10-20' }) }
    view.rerender(<SiteScopeProvider scope={demoScope}><DashboardSurface /></SiteScopeProvider>)
    await act(async () => {})
    expect(h.postEmbedReady).toHaveBeenCalledTimes(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('a share link (public, scoped): today\'s share page, inside the surface', () => {
  it('asks only what a share link is served: no site record, no data window', async () => {
    await mount(shareScope)
    expect(h.useSite).not.toHaveBeenCalled()
    expect(h.useDataWindow).not.toHaveBeenCalled()
  })

  it('sends the period token alone: day buckets, no dates, no filters, no live window', async () => {
    await mount(shareScope)
    expect(last()).toEqual({ siteId: 'site-1', start: '', end: '', interval: 'day', filters: undefined, period: '30d', minutes: undefined })
  })

  it('reads ?period= only as one of the four windows, and anything else as 30 days', async () => {
    const cases: Array<[string, string]> = [
      ['period=today', 'today'],
      ['period=yesterday', 'yesterday'],
      ['period=7', '7d'],
      ['period=30', '30d'],
      ['period=3m', '30d'],
      ['period=all', '30d'],
      ['period=1h', '30d'],
      ['period=realtime', '30d'],
      ['period=custom&start=2026-10-01&end=2026-10-05', '30d'],
      ['period=nonsense', '30d'],
    ]
    for (const [query, token] of cases) {
      dashboardCalls = []
      mockSearchParams = new URLSearchParams(query)
      const view = await mount(shareScope)
      expect(last().period, query).toBe(token)
      expect(last().minutes, query).toBeUndefined()
      view.unmount()
    }
  })

  it('asks for day buckets in every window, a single day included', async () => {
    for (const query of ['period=today', 'period=yesterday', 'period=7', 'period=30']) {
      dashboardCalls = []
      mockSearchParams = new URLSearchParams(query)
      const view = await mount(shareScope)
      expect(dashboardCalls.length, query).toBeGreaterThan(0)
      expect(dashboardCalls.every((c) => c.interval === 'day'), query).toBe(true)
      view.unmount()
    }
  })

  it('never reads a filter from the URL, whatever the link carries', async () => {
    mockSearchParams = new URLSearchParams({ filters: serializeFilters([{ dimension: 'country', operator: 'is', values: ['NO'] }]) })
    await mount(shareScope)
    expect(dashboardCalls.every((c) => c.filters === undefined)).toBe(true)
  })

  it('asks for no previous period, whichever window is chosen', async () => {
    for (const query of ['', 'period=today', 'period=7', 'period=yesterday']) {
      h.useStats.mockClear()
      h.useDailyStats.mockClear()
      mockSearchParams = new URLSearchParams(query)
      const view = await mount(shareScope)
      for (const c of [...h.useStats.mock.calls, ...h.useDailyStats.mock.calls]) {
        expect(c[1], query).toBe('')
        expect(c[2], query).toBe('')
      }
      view.unmount()
    }
  })

  it('shows the same menu as every page with only the four fixed windows available, "Custom range…" included in the greyed', async () => {
    await mount(shareScope)
    openSwitcher()
    const all = ['today', 'yesterday', '7', '30', '3m', '12m', 'all', 'month', 'last-month', 'year', 'last-year']
    const enabled = ['today', 'yesterday', '7', '30']
    expect(document.querySelectorAll('[data-row]')).toHaveLength(all.length + 1)
    for (const key of all) {
      const row = document.querySelector(`[data-row="${key}"]`) as HTMLButtonElement
      expect(row, key).toBeTruthy()
      expect(row.disabled, key).toBe(!enabled.includes(key))
      if (!enabled.includes(key)) expect(row.title, key).toBe(SHARE_FIXED_RANGES_REASON)
    }
    const custom = document.querySelector('[data-row="custom"]') as HTMLButtonElement
    expect(custom.disabled).toBe(true)
    expect(custom.title).toBe(SHARE_FIXED_RANGES_REASON)
    expect(screen.getByText(SHARE_FIXED_RANGES_REASON)).toBeTruthy()
  })

  it('has no arrows: nothing here can ask for a window outside the four', async () => {
    await mount(shareScope)
    expect(screen.queryByRole('button', { name: /shift range/i })).toBeNull()
  })

  it('writes a pick to ?period= and never touches the reader\'s view memory', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await mount(shareScope)
    openSwitcher()
    fireEvent.click(document.querySelector('[data-row="7"]') as HTMLButtonElement)
    expect(mockReplace).toHaveBeenCalledWith('/scope-under-test?period=7', { scroll: false })
    const touched = [...getItem.mock.calls, ...setItem.mock.calls].map((c) => String(c[0]))
    expect(touched).not.toContain('pulse_view')
    expect(touched).not.toContain('pulse_view_range')
    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('renders the orb for display only: the count, no toggle, no way into realtime', async () => {
    await mount(shareScope)
    const orb = document.querySelector('[data-live-orb]')
    expect(orb?.tagName).toBe('SPAN')
    expect(orb?.getAttribute('data-live-orb')).toBe('display')
    expect(orb?.getAttribute('role')).toBe('status')
    expect(orb?.textContent).toContain('4')
    expect(screen.queryByRole('button', { name: /realtime/i })).toBeNull()
    expect(h.useRealtimeSync).not.toHaveBeenCalled()
  })

  it('offers no filter control and hands no card a way to filter', async () => {
    await mount(shareScope)
    expect(screen.queryByTestId('filter-button')).toBeNull()
    expect(screen.queryByTestId('filter-pills')).toBeNull()
    expect(screen.queryByTestId('filter-builder')).toBeNull()
    for (const card of ['Sources', 'Audience', 'TechSpecs', 'ContentStats']) {
      expect(h.captured[card].onFilter, card).toBeUndefined()
      expect(h.captured[card].filters, card).toBeUndefined()
    }
  })

  it('shows no Outbound and no Behaviour, and no member affordance', async () => {
    await mount(shareScope)
    expect(sectionTitles()).toEqual(['Acquisition', 'Audience', 'Content'])
    expect(screen.queryByTestId('card-outbound')).toBeNull()
    expect(screen.queryByTestId('card-peak-hours')).toBeNull()
    expect(screen.queryByTestId('install-banner')).toBeNull()
    expect(screen.queryByTestId('tour')).toBeNull()
  })

  it('turns the full lists and drill-downs off, and pages the campaign rows its own payload carries', async () => {
    await mount(shareScope)
    for (const card of ['Sources', 'Audience', 'TechSpecs', 'ContentStats', 'ContentSignals']) {
      expect(h.captured[card].memberFeatures, card).toBe(false)
    }
    expect(h.captured.Sources.campaigns).toEqual(dashboardState.data?.campaigns)
  })

  it('draws the deck without an interval picker and without a comparison', async () => {
    await mount(shareScope)
    expect(h.captured.CommandDeck.intervalPicker).toBe(false)
    expect(h.captured.CommandDeck.interval).toBe('day')
    expect(h.captured.CommandDeck.prevStats).toBeUndefined()
    expect(h.captured.CommandDeck.prevData).toBeNull()
    expect(h.captured.CommandDeck.identityWindowDays).toBeUndefined()
  })

  it('takes the range from the server\'s echo of the window, not from a clock of its own', async () => {
    dashboardState = { data: payload({ start: '2026-10-14', end: '2026-10-20' }) }
    mockSearchParams = new URLSearchParams('period=7')
    await mount(shareScope)
    expect(h.captured.CommandDeck.dateRange).toEqual({ start: '2026-10-14', end: '2026-10-20' })
    expect(h.captured.Sources.dateRange).toEqual({ start: '2026-10-14', end: '2026-10-20' })
  })

  it('hands the Languages tab the grouped rows beside the per-locale list, and the per-locale list alone from an older backend (PULSE-173)', async () => {
    const range = { start: '2026-09-21', end: '2026-10-20' }
    const groups = [{ language: 'en', pageviews: 283, visitors: 144, bounce_rate: null, avg_duration: null, flag_region: 'US' }]
    dashboardState = { data: payload(range, { languages: [], language_groups: groups }) }
    const grouped = await mount(shareScope)
    expect(h.captured.Audience.languageGroups).toEqual(groups)
    expect(h.captured.Audience.languages).toEqual([])
    grouped.unmount()

    const languages = [
      { language: 'en-US', pageviews: 189, visitors: 110, bounce_rate: null, avg_duration: null },
      { language: 'en-GB', pageviews: 59, visitors: 21, bounce_rate: null, avg_duration: null },
    ]
    dashboardState = { data: payload(range, { languages }) }
    await mount(shareScope)
    expect(h.captured.Audience.languageGroups).toBeUndefined()
    expect(h.captured.Audience.languages).toEqual(languages)
  })

  it('tells the hero when its page has drawn, so the fallback demo can be framed too', async () => {
    await mount(shareScope)
    expect(h.postEmbedReady).toHaveBeenCalledTimes(1)
  })

  it('says a lapsed password plainly and offers no retry that cannot work', async () => {
    dashboardState = { error: Object.assign(new Error('locked'), { status: 401, data: { error: 'password required', is_protected: true } }) }
    await mount(shareScope)
    expect(screen.getByText('This dashboard is password protected')).toBeTruthy()
    expect(screen.getByText('Reload the page and enter the password again.')).toBeTruthy()
    expect(screen.queryByText('Retry')).toBeNull()
  })

  it('stops painting hour-old numbers when a protected share\'s unlock lapses mid-session (SWR keeps the stale payload beside the error)', async () => {
    const view = await mount(shareScope)
    expect(screen.getByTestId('deck')).toBeTruthy()

    dashboardState = {
      data: payload({ start: '2026-09-21', end: '2026-10-20' }),
      error: Object.assign(new Error('locked'), { status: 401, data: { error: 'password required', is_protected: true } }),
    }
    view.rerender(<SiteScopeProvider scope={shareScope}><DashboardSurface /></SiteScopeProvider>)
    await act(async () => {})
    expect(screen.getByText('This dashboard is password protected')).toBeTruthy()
    expect(screen.queryByTestId('deck')).toBeNull()
    expect(screen.queryByTestId('card-sources')).toBeNull()

    // Entered again elsewhere, the next refresh succeeds and the numbers come back.
    dashboardState = { data: payload({ start: '2026-09-21', end: '2026-10-20' }) }
    view.rerender(<SiteScopeProvider scope={shareScope}><DashboardSurface /></SiteScopeProvider>)
    await act(async () => {})
    expect(screen.getByTestId('deck')).toBeTruthy()
    expect(screen.queryByText('This dashboard is password protected')).toBeNull()
  })

  it('keeps showing a member the numbers they have when a refresh fails: only a lapsed share lock replaces them', async () => {
    const view = await mount(memberScope('site-1'))
    dashboardState = {
      data: payload({ start: '2026-09-21', end: '2026-10-20' }),
      error: Object.assign(new Error('locked'), { status: 401, data: { is_protected: true } }),
    }
    view.rerender(<SiteScopeProvider scope={memberScope('site-1')}><DashboardSurface /></SiteScopeProvider>)
    await act(async () => {})
    expect(screen.getByTestId('deck')).toBeTruthy()
    expect(screen.queryByText('This dashboard is password protected')).toBeNull()
  })

  it('does not tell a public reader that "your data is intact"', async () => {
    dashboardState = { error: Object.assign(new Error('boom'), { status: 500 }) }
    await mount(shareScope)
    expect(screen.getByText('Couldn’t load the dashboard')).toBeTruthy()
    expect(screen.getByText('The analytics request failed (HTTP 500).')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
    // The toolbar stays, so the reader can choose another window (pulse#893).
    expect(document.querySelector('[data-live-orb]')).toBeTruthy()
  })
})

describe('the member keeps the reassurance on a failed load', () => {
  it('says the data is intact', async () => {
    dashboardState = { error: Object.assign(new Error('boom'), { status: 500 }) }
    await mount(memberScope('site-1'))
    expect(
      screen.getByText('The analytics request failed (HTTP 500). Your data is intact — this is a loading problem, not a data problem.'),
    ).toBeTruthy()
  })
})

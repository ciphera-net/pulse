import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'

// The Search page in its three scopes (PUL-34 Phase 2): a member, the sample site at
// /demo (public, read-only, full fidelity) and a share link on another site (public-scoped,
// which is not served this page). The page is rendered with its real children and its
// real data hooks; only `apiRequest` is replaced, so the reads asserted here are the
// ones that actually leave the app.

let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
  usePathname: () => '/demo/search',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const mockUseCan = vi.fn<(permission: string) => boolean>(() => true)
vi.mock('@/lib/auth/permissions', () => ({ useCan: (permission: string) => mockUseCan(permission) }))

let rec: Recorder
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  default: (endpoint: string, options?: RequestInit) => rec.request(endpoint, options),
}))

// Not under test here: the range picker, glossary glyphs, number animation and the chart
// primitives (the instruments' own suites draw those on a real chart).
vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => <div data-testid="range-picker" /> }))
vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))
vi.mock('@/components/ui/UpdatingChip', () => ({ UpdatingChip: () => null }))
vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({ value, format }: { value: number; format: (v: number) => string }) => <span>{format(value)}</span>,
}))
vi.mock('@/components/ui/area-chart', () => ({
  AreaChart: ({ children }: { children?: ReactNode }) => <div data-testid="strip">{children}</div>,
  Area: () => null, Grid: () => null, YAxis: () => null, ChartTooltip: () => null, ChartCrosshair: () => null,
}))
vi.mock('@/components/ui/chart-stack', () => ({
  STRIP_INK: '#b3b1ad',
  STRIP_MARKER: '#b3b1ad',
  ChartStack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ChartStackAxis: () => null,
  useChartStack: () => ({
    hoverIndex: null, setHoverIndex: () => {}, innerWidth: 0,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }, xScale: () => 0, resolveIndex: () => null,
  }),
}))

import SearchSurface from '../SearchSurface'
import {
  DEMO, MEMBER, SHARE_LINK, PAGE, QUERY, PUBLIC_SEARCH_ROUTES,
  recorder, renderInScope, searchRoutes, type Recorder,
} from './integrationHarness'

const MAIN_MARKER = 'Search traffic'

beforeEach(() => {
  search = new URLSearchParams()
  mockUseCan.mockReset().mockReturnValue(true)
  rec = recorder(searchRoutes())
})

afterEach(() => {
  cleanup()
})

describe('Search surface: a member (unchanged)', () => {
  it('reads the member API only, and sends nothing but GETs', async () => {
    renderInScope(<SearchSurface />, MEMBER)
    await screen.findByText(MAIN_MARKER)
    await waitFor(() => expect(rec.routes()).toContain('/gsc/top-queries'))
    expect(rec.prefixes()).toEqual(new Set(['member']))
    expect(rec.writes()).toEqual([])
  })

  it('shows a failed sync with the provider text and the way to fix it', async () => {
    rec = recorder(searchRoutes({
      '/integrations/gsc/status': { connected: true, status: 'error', error_message: 'token revoked' },
    }))
    renderInScope(<SearchSurface />, MEMBER)
    expect(await screen.findByText(/Sync failed — token revoked/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fix in Settings' })).toHaveAttribute('href', '/settings/site/integrations')
  })

  it('offers to connect Search Console, when it is not connected and the member may', async () => {
    rec = recorder(searchRoutes({
      '/integrations/gsc/status': { connected: false },
      '/integrations/bing/status': { connected: false },
    }))
    renderInScope(<SearchSurface />, MEMBER)
    expect(await screen.findByRole('heading', { name: 'Connect Google Search Console' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect in Settings' })).toHaveAttribute('href', '/settings/site/integrations')
    expect(mockUseCan).toHaveBeenCalledWith('integrations.manage')
  })

  it('says who can connect it, when the member may not', async () => {
    mockUseCan.mockReturnValue(false)
    rec = recorder(searchRoutes({
      '/integrations/gsc/status': { connected: false },
      '/integrations/bing/status': { connected: false },
    }))
    renderInScope(<SearchSurface />, MEMBER)
    expect(await screen.findByText('An owner or admin can connect it.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Connect in Settings' })).toBeNull()
  })

  it('keeps the reassurance on a failed status check', async () => {
    rec = recorder(searchRoutes({ '/integrations/gsc/status': new Error('down') }))
    renderInScope(<SearchSurface />, MEMBER)
    expect(await screen.findByText(/Your data is intact — this is a loading problem, not a data problem\./)).toBeInTheDocument()
  })

  it('keeps the reassurance on a view that failed to load', async () => {
    rec = recorder(searchRoutes({ '/gsc/top-queries': new Error('down') }))
    renderInScope(<SearchSurface />, MEMBER)
    expect(await screen.findByText(/Your data is safe — this is a loading problem\./)).toBeInTheDocument()
  })
})

describe('Search surface: the sample site at /demo (public, full fidelity)', () => {
  it('draws the instrument with no link at all, so none into settings, and asks the member API nothing', async () => {
    const { container } = renderInScope(<SearchSurface />, DEMO)
    await screen.findByText(MAIN_MARKER)
    await waitFor(() => expect(rec.routes()).toContain('/gsc/top-queries'))
    expect(screen.getAllByText('Clicks').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('a[href]')).toHaveLength(0)
    expect(mockUseCan).not.toHaveBeenCalled()
    expect(rec.routes()).not.toContain('/permissions')
    expect(rec.writes()).toEqual([])
  })

  it('says a sync failed, without the provider text or a link to fix it', async () => {
    rec = recorder(searchRoutes({
      '/integrations/gsc/status': { connected: true, status: 'error', error_message: 'token revoked' },
    }))
    const { container } = renderInScope(<SearchSurface />, DEMO)
    expect(await screen.findByText('Sync failed')).toBeInTheDocument()
    expect(screen.queryByText(/token revoked/)).toBeNull()
    expect(screen.queryByText('Fix in Settings')).toBeNull()
    expect(container.querySelectorAll('a[href]')).toHaveLength(0)
  })

  it('says Search Console is not connected, with nothing to click', async () => {
    rec = recorder(searchRoutes({
      '/integrations/gsc/status': { connected: false },
      '/integrations/bing/status': { connected: false },
    }))
    const { container } = renderInScope(<SearchSurface />, DEMO)
    expect(await screen.findByRole('heading', { name: 'Search Console is not connected' })).toBeInTheDocument()
    expect(screen.getByText('Nothing to show yet.')).toBeInTheDocument()
    expect(screen.queryByText(/Connect/)).toBeNull()
    expect(container.querySelectorAll('a[href], button')).toHaveLength(0)
    expect(mockUseCan).not.toHaveBeenCalled()
  })

  it('words a failed status check for a visitor, who has no data of their own to be reassured about', async () => {
    rec = recorder(searchRoutes({ '/integrations/gsc/status': new Error('down') }))
    renderInScope(<SearchSurface />, DEMO)
    expect(await screen.findByText('The connection status request failed.')).toBeInTheDocument()
    expect(screen.queryByText(/Your data/)).toBeNull()
  })

  it('words a view that failed to load for a visitor too', async () => {
    rec = recorder(searchRoutes({ '/gsc/top-queries': new Error('down') }))
    renderInScope(<SearchSurface />, DEMO)
    expect(await screen.findByText('The Search Console request failed for this period.')).toBeInTheDocument()
    expect(screen.queryByText(/Your data/)).toBeNull()
  })

  it('reads only the routes the sample site is served, in every view the page has', async () => {
    // Every view the page can show, each by its URL. One recorder across them all, so the
    // union of what the page reads is compared with the backend's list in BOTH directions:
    // a route outside the list fails it, and so does a list that has gone stale.
    const views: { params: Record<string, string>; reads: string[] }[] = [
      { params: {}, reads: ['/gsc/overview', '/gsc/daily-totals', '/gsc/top-queries', '/gsc/new-queries'] },
      { params: { view: 'queries', expand: QUERY }, reads: ['/gsc/query-pages', '/gsc/query-trend'] },
      { params: { view: 'pages' }, reads: ['/gsc/top-pages'] },
      { params: { view: 'pages', expand: PAGE }, reads: ['/gsc/page-queries'] },
      { params: { view: 'countries' }, reads: ['/gsc/top-countries'] },
      { params: { view: 'devices' }, reads: ['/gsc/top-devices'] },
      { params: { view: 'days' }, reads: ['/gsc/daily-totals'] },
      { params: { view: 'opportunities' }, reads: ['/gsc/opportunities'] },
      { params: { engine: 'bing' }, reads: ['/bing/overview', '/bing/daily-totals'] },
    ]
    for (const view of views) {
      search = new URLSearchParams(view.params)
      renderInScope(<SearchSurface />, DEMO)
      await waitFor(() => expect(rec.routes()).toEqual(expect.arrayContaining(view.reads)))
      cleanup()
    }
    expect(rec.routes()).toEqual([...PUBLIC_SEARCH_ROUTES].sort())
    expect(rec.writes()).toEqual([])
    // One API surface for the whole page: a data hook still reading the member routes
    // beside the others would show up here as a second prefix.
    expect(rec.prefixes().size).toBe(1)
  })

  it('shows Bing from its overview and its daily totals', async () => {
    search = new URLSearchParams({ engine: 'bing' })
    renderInScope(<SearchSurface />, DEMO)
    expect(await screen.findByText(/Site totals only\./)).toBeInTheDocument()
    await waitFor(() => expect(rec.routes()).toEqual(expect.arrayContaining(['/bing/overview', '/bing/daily-totals'])))
    // Bing's rail: three metrics, no position.
    expect(screen.getByText('Clicks')).toBeInTheDocument()
    expect(screen.queryByText('Avg position')).toBeNull()
  })
})

describe('Search surface: a share link on another site (public-scoped)', () => {
  it('says the page is not shared, and reads nothing', async () => {
    const { container } = renderInScope(<SearchSurface />, SHARE_LINK)
    expect(await screen.findByText('This page is not shared')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Search Console' })).toBeInTheDocument()
    expect(container.querySelectorAll('a[href], button')).toHaveLength(0)
    // Let anything that would have fired fire.
    await new Promise((r) => setTimeout(r, 100))
    expect(rec.reads).toEqual([])
    expect(mockUseCan).not.toHaveBeenCalled()
  })
})

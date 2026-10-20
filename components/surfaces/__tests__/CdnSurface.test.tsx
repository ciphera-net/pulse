import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'

// The CDN page in its three scopes (PUL-34 Phase 2): a member, the sample site at /demo
// (public, read-only, full fidelity) and a share link on another site (public-scoped,
// which is not served this page). The page is rendered with its real children and its real data
// hooks; only `apiRequest` is replaced, so the reads asserted here are the ones that
// actually leave the app.

let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
  usePathname: () => '/demo/cdn',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const mockUseCan = vi.fn<(permission: string) => boolean>(() => true)
vi.mock('@/lib/auth/permissions', () => ({ useCan: (permission: string) => mockUseCan(permission) }))

let rec: Recorder
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  default: (endpoint: string, options?: RequestInit) => rec.request(endpoint, options),
}))

// Not under test here: the range picker, glossary glyphs, number animation, flags and the
// chart primitives (the instruments' own suites draw those on a real chart).
vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => <div data-testid="range-picker" /> }))
vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))
vi.mock('@/components/ui/UpdatingChip', () => ({ UpdatingChip: () => null }))
vi.mock('@/components/ui/CountryFlag', () => ({ CountryFlag: () => null }))
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

import CdnSurface from '../CdnSurface'
import {
  DEMO, MEMBER, SHARE_LINK, PUBLIC_CDN_ROUTES,
  cdnRoutes, recorder, renderInScope, type Recorder,
} from './integrationHarness'

const NOT_CONNECTED = { '/integrations/bunny/status': { connected: false } }

// The page asks for Bunny's data with an empty site id until it knows the zone is
// connected, which every data hook must read as "no request", whichever scope it is in.
async function expectNoBunnyDataReads() {
  await new Promise((r) => setTimeout(r, 100))
  expect(rec.routes().filter((route) => route.startsWith('/bunny/'))).toEqual([])
}

beforeEach(() => {
  search = new URLSearchParams()
  mockUseCan.mockReset().mockReturnValue(true)
  rec = recorder(cdnRoutes())
})

afterEach(() => {
  cleanup()
})

describe('CDN surface: a member (unchanged)', () => {
  it('draws both cards and the zone, reading the member API only and sending nothing but GETs', async () => {
    renderInScope(<CdnSurface />, MEMBER)
    expect(await screen.findByText('what Bunny absorbed')).toBeInTheDocument()
    expect(screen.getByText('what got through to you')).toBeInTheDocument()
    expect(screen.getByText('shop-assets · zone 4120001')).toBeInTheDocument()
    await waitFor(() => expect(rec.routes()).toContain('/bunny/live'))
    expect(rec.prefixes()).toEqual(new Set(['member']))
    expect(rec.writes()).toEqual([])
  })

  it('shows a failed sync with the provider text and the way to fix it', async () => {
    rec = recorder(cdnRoutes({
      '/integrations/bunny/status': { connected: true, status: 'error', error_message: 'key rejected', pull_zone_id: 1, pull_zone_name: 'z' },
    }))
    renderInScope(<CdnSurface />, MEMBER)
    expect(await screen.findByText(/Sync failed — key rejected/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fix in Settings' })).toHaveAttribute('href', '/settings/site/integrations')
  })

  it('offers to connect Bunny, when it is not connected and the member may', async () => {
    rec = recorder(cdnRoutes(NOT_CONNECTED))
    renderInScope(<CdnSurface />, MEMBER)
    expect(await screen.findByRole('heading', { name: 'Connect Bunny CDN' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect in Settings' })).toHaveAttribute('href', '/settings/site/integrations')
    expect(mockUseCan).toHaveBeenCalledWith('integrations.manage')
    await expectNoBunnyDataReads()
  })

  it('says who can connect it, when the member may not', async () => {
    mockUseCan.mockReturnValue(false)
    rec = recorder(cdnRoutes(NOT_CONNECTED))
    renderInScope(<CdnSurface />, MEMBER)
    expect(await screen.findByText('An owner or admin can connect it.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Connect in Settings' })).toBeNull()
  })

  it('keeps the reassurance on a failed status check', async () => {
    rec = recorder(cdnRoutes({ '/integrations/bunny/status': new Error('down') }))
    renderInScope(<CdnSurface />, MEMBER)
    expect(await screen.findByText(/Your data is intact — this is a loading problem, not a data problem\./)).toBeInTheDocument()
  })
})

describe('CDN surface: the sample site at /demo (public, full fidelity)', () => {
  it('draws both cards with no link at all, so none into settings, and asks the member API nothing', async () => {
    const { container } = renderInScope(<CdnSurface />, DEMO)
    expect(await screen.findByText('what Bunny absorbed')).toBeInTheDocument()
    expect(screen.getByText('what got through to you')).toBeInTheDocument()
    await waitFor(() => expect(rec.routes()).toContain('/bunny/live'))
    expect(container.querySelectorAll('a[href]')).toHaveLength(0)
    expect(mockUseCan).not.toHaveBeenCalled()
    expect(rec.routes()).not.toContain('/permissions')
    expect(rec.writes()).toEqual([])
  })

  it('reads only the routes the sample site is served: its status, the four Bunny reads and the live read', async () => {
    renderInScope(<CdnSurface />, DEMO)
    await waitFor(() => expect(rec.routes()).toEqual([...PUBLIC_CDN_ROUTES].sort()))
    // The same list in the other direction: nothing outside it, however long it settles.
    await new Promise((r) => setTimeout(r, 100))
    expect(rec.routes()).toEqual([...PUBLIC_CDN_ROUTES].sort())
    expect(rec.writes()).toEqual([])
    // One API surface for the whole page: a data hook still reading the member routes
    // beside the others would show up here as a second prefix.
    expect(rec.prefixes().size).toBe(1)
  })

  it('says a sync failed, without the provider text or a link to fix it', async () => {
    rec = recorder(cdnRoutes({
      '/integrations/bunny/status': { connected: true, status: 'error', error_message: 'key rejected', pull_zone_id: 1, pull_zone_name: 'z' },
    }))
    const { container } = renderInScope(<CdnSurface />, DEMO)
    expect(await screen.findByText('Sync failed')).toBeInTheDocument()
    expect(screen.queryByText(/key rejected/)).toBeNull()
    expect(screen.queryByText('Fix in Settings')).toBeNull()
    expect(container.querySelectorAll('a[href]')).toHaveLength(0)
  })

  it('says Bunny CDN is not connected, with nothing to click', async () => {
    rec = recorder(cdnRoutes(NOT_CONNECTED))
    const { container } = renderInScope(<CdnSurface />, DEMO)
    expect(await screen.findByRole('heading', { name: 'Bunny CDN is not connected' })).toBeInTheDocument()
    expect(screen.getByText('Nothing to show yet.')).toBeInTheDocument()
    expect(screen.queryByText(/Connect/)).toBeNull()
    expect(container.querySelectorAll('a[href], button')).toHaveLength(0)
    expect(mockUseCan).not.toHaveBeenCalled()
    await expectNoBunnyDataReads()
  })

  it('words a failed status check for a visitor, who has no data of their own to be reassured about', async () => {
    rec = recorder(cdnRoutes({ '/integrations/bunny/status': new Error('down') }))
    renderInScope(<CdnSurface />, DEMO)
    expect(await screen.findByText('The connection status request failed.')).toBeInTheDocument()
    expect(screen.queryByText(/Your data/)).toBeNull()
  })
})

describe('CDN surface: a share link on another site (public-scoped)', () => {
  it('says the page is not shared, and reads nothing', async () => {
    const { container } = renderInScope(<CdnSurface />, SHARE_LINK)
    expect(await screen.findByText('This page is not shared')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'CDN' })).toBeInTheDocument()
    expect(container.querySelectorAll('a[href], button')).toHaveLength(0)
    // Let anything that would have fired fire.
    await new Promise((r) => setTimeout(r, 100))
    expect(rec.reads).toEqual([])
    expect(mockUseCan).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// One funnel's page under each scope (PUL-34 Phase 2). The funnel is the route's own
// parameter and arrives as a PROP; the site comes from the scope. What this pins:
//   - neither is read from useParams (it throws here), so the same body can sit under
//     /sites/<id>/funnels/<funnel>, /demo/funnels/<funnel> and /share/<id>/funnels/<funnel>;
//   - the way back to the list goes through the scope's base path and carries the range only;
//   - Edit and Delete are ABSENT outside a member scope, even for a signed-in visitor who
//     holds the permission in their own team;
//   - a scope that does not serve the page mounts no data hook, and says so plainly, and a
//     funnel that was never requested is "not available", never a skeleton that waits forever.
// The 404-vs-error split and the delete flow are app/sites/[id]/funnels/[funnelId]/__tests__/.

const mockFunnelDetail = vi.fn()
const mockFunnelStats = vi.fn()
const mockUseSite = vi.fn()
const mockUseDataWindow = vi.fn()
const routerPush = vi.fn()
let mockCan = true
let mockSearch = ''

vi.mock('next/navigation', () => ({
  useParams: () => {
    throw new Error('a surface reads the site from the scope and the funnel from its prop, never from useParams')
  },
  usePathname: () => '/demo/funnels/funnel-1',
  useRouter: () => ({ replace: vi.fn(), push: (...a: unknown[]) => routerPush(...a) }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (...a: unknown[]) => mockUseSite(...a),
  useDataWindow: (...a: unknown[]) => mockUseDataWindow(...a),
  useFunnelDetail: (...a: unknown[]) => mockFunnelDetail(...a),
  useFunnelStats: (...a: unknown[]) => mockFunnelStats(...a),
}))

vi.mock('@/lib/api/funnels', () => ({ deleteFunnel: vi.fn(), updateFunnel: vi.fn() }))

// The signed-in visitor's permission in THEIR team: true on purpose, in every test.
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => mockCan }))

vi.mock('@/lib/hooks/useUrlDateRange', () => ({
  useUrlDateRange: () => ({
    period: '30',
    dateRange: { start: '2026-07-27', end: '2026-08-26' },
    periodReady: true,
    picker: {},
  }),
}))
vi.mock('@/lib/hooks/useFilterSuggestions', () => ({ useFilterSuggestions: () => async () => [] }))
vi.mock('@/components/dashboard/filter/useFilterBuilder', () => ({ useFilterBuilder: () => ({}) }))

vi.mock('@/components/skeletons', () => ({ FunnelDetailSkeleton: () => <div data-testid="skeleton" /> }))
vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))
vi.mock('@/components/dashboard/FilterButton', () => ({ default: () => null }))
vi.mock('@/components/dashboard/FilterPills', () => ({ default: () => null }))
vi.mock('@/components/dashboard/filter/FilterBuilder', () => ({ default: () => null }))
vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => null }))
vi.mock('@/components/ui/compact-number', () => ({ CompactNumber: ({ value }: { value: number }) => <span>{value}</span> }))
vi.mock('@/components/funnels/FunnelModal', () => ({ default: () => <div data-testid="funnel-modal" /> }))
vi.mock('@/components/funnels/FunnelColumns', () => ({
  FunnelColumns: () => null,
  formatFunnelPct: (v: number) => `${v}%`,
}))
// The two panes and the daily chart own their own suites; here they only say which site and
// funnel they were handed.
vi.mock('@/components/funnels/FunnelStepStrip', () => ({
  FunnelStepStrip: (p: { siteId: string; funnelId: string }) => (
    <div data-testid="strip" data-site={p.siteId} data-funnel={p.funnelId} />
  ),
}))
vi.mock('@/components/funnels/FunnelDailyInstrument', () => ({
  FunnelDailyInstrument: (p: { siteId: string; funnelId: string }) => (
    <div data-testid="daily" data-site={p.siteId} data-funnel={p.funnelId} />
  ),
}))

vi.mock('framer-motion', () => ({
  motion: { div: ({ className }: { className?: string }) => <div className={className} /> },
}))

vi.mock('@ciphera-net/facet', () => ({
  toast: { success: () => {}, error: () => {} },
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(' '),
  getAuthErrorMessage: (e: Error) => e?.message ?? '',
}))

vi.mock('@ciphera-net/facet-hold', async () =>
  (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

import FunnelDetailSurface from '../FunnelDetailSurface'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'
import { resetDeferred } from '@/lib/hold/__tests__/facetHoldStandIn'

const member = memberScope('site-1')
const demo: SiteScope = {
  siteId: 'demo-site', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full',
}
const customerLink: SiteScope = {
  siteId: 'cust-site', mode: 'public', basePath: '/share/cust-site', pages: ['dashboard'], demo: false, fidelity: 'scoped',
}
// The case the design says cannot happen yet and must still be safe: a scoped link whose shared
// pages list this one. The server serves a scoped link the dashboard family only, so the page
// must not ask for what it would be refused.
const scopedLinkListingThePage: SiteScope = { ...customerLink, pages: SITE_PAGES }
const demoWithoutFunnels: SiteScope = { ...demo, pages: ['dashboard', 'journeys'] }

const FUNNEL = { id: 'funnel-1', site_id: 'demo-site', name: 'Signup flow', description: '', steps: [], created_at: '', updated_at: '' }
const STATS = {
  funnel_id: 'funnel-1',
  steps: [
    { step: { order: 0, name: 'Pricing', value: '/pricing', type: 'exact' }, visitors: 100, dropoff: null, conversion: 100, exit_pages: [] },
    { step: { order: 1, name: 'Signup', value: '/signup', type: 'exact' }, visitors: 40, dropoff: 60, conversion: 40, exit_pages: [] },
  ],
}

const funnelState = (over: Record<string, unknown> = {}) => ({
  data: FUNNEL, error: undefined, isLoading: false, mutate: vi.fn(), ...over,
})

const renderUnder = (scope: SiteScope, funnelId = 'funnel-1') =>
  render(
    <SiteScopeProvider scope={scope}>
      <FunnelDetailSurface funnelId={funnelId} />
    </SiteScopeProvider>,
  )

beforeEach(() => {
  mockCan = true
  mockSearch = ''
  mockFunnelDetail.mockReset().mockReturnValue(funnelState())
  mockFunnelStats.mockReset().mockReturnValue({ data: STATS, error: undefined, isValidating: false, mutate: vi.fn() })
  mockUseSite.mockReset().mockReturnValue({ data: { id: 'x', timezone: 'Europe/Oslo' } })
  mockUseDataWindow.mockReset().mockReturnValue(null)
  routerPush.mockReset()
  resetDeferred()
})

describe('member scope: the page as it was', () => {
  it('goes back to the list under /sites/<id>/funnels, carrying the range and nothing else', () => {
    // ?step= and ?filters= are THIS funnel's state; carried back they would open the next
    // funnel with this one's filters.
    mockSearch = 'period=custom&start=2026-07-01&end=2026-07-31&step=2&filters=country%3Ais%3ANO'
    renderUnder(member)
    expect(screen.getByRole('link', { name: 'Funnels' })).toHaveAttribute(
      'href',
      '/sites/site-1/funnels?period=custom&start=2026-07-01&end=2026-07-31',
    )
  })

  it('offers Edit and Delete to a member who holds the permission, and none to one without it', () => {
    const { unmount } = renderUnder(member)
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    unmount()

    mockCan = false
    renderUnder(member)
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('reads the member\'s site and the funnel it was given', () => {
    renderUnder(member, 'funnel-9')
    expect(mockFunnelDetail).toHaveBeenCalledWith('site-1', 'funnel-9')
    expect(screen.getByTestId('strip')).toHaveAttribute('data-funnel', 'funnel-9')
  })

  it('keeps the member wording of a failed request', () => {
    mockFunnelDetail.mockReturnValue(funnelState({ data: undefined, error: new Error('boom') }))
    renderUnder(member)
    expect(screen.getByText(/Your data is safe/)).toBeInTheDocument()
  })
})

describe('public full scope (the demo)', () => {
  it('takes the site from the scope and the funnel from the prop, never from the route', () => {
    renderUnder(demo, 'funnel-9')
    expect(mockFunnelDetail).toHaveBeenCalledWith('demo-site', 'funnel-9')
    expect(mockFunnelStats.mock.calls.every(([site, funnel]) => site === 'demo-site' && funnel === 'funnel-9')).toBe(true)
    expect(mockUseSite).toHaveBeenCalledWith('demo-site')
    expect(mockUseDataWindow).toHaveBeenCalledWith('demo-site', 'funnels')
    const strip = screen.getByTestId('strip')
    expect(strip).toHaveAttribute('data-site', 'demo-site')
    expect(strip).toHaveAttribute('data-funnel', 'funnel-9')
    const daily = screen.getByTestId('daily')
    expect(daily).toHaveAttribute('data-site', 'demo-site')
    expect(daily).toHaveAttribute('data-funnel', 'funnel-9')
  })

  it('goes back to the list under /demo/funnels, carrying the range and nothing else', () => {
    mockSearch = 'period=7&step=2&filters=country%3Ais%3ANO'
    renderUnder(demo)
    expect(screen.getByRole('link', { name: 'Funnels' })).toHaveAttribute('href', '/demo/funnels?period=7')
  })

  it('has no Edit, Delete, dialog or modal, even for a visitor who holds the permission in their own team', () => {
    renderUnder(demo)
    expect(screen.getByRole('heading', { name: 'Signup flow' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByTestId('funnel-modal')).toBeNull()
  })

  it('answers a missing funnel with a way back to the demo\'s own list', () => {
    mockFunnelDetail.mockReturnValue(funnelState({ data: undefined, error: { status: 404 } }))
    renderUnder(demo)
    expect(screen.getByText('Funnel not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to funnels' })).toHaveAttribute('href', '/demo/funnels')
  })

  it('words a failed request without a member\'s reassurance about their own data', () => {
    mockFunnelDetail.mockReturnValue(funnelState({ data: undefined, error: new Error('boom') }))
    renderUnder(demo)
    expect(screen.getByText('The funnel request failed. This is usually temporary.')).toBeInTheDocument()
    expect(screen.queryByText(/Your data is safe/)).toBeNull()
  })

  it('says not available, never a skeleton that waits forever, when the read was not made', () => {
    mockFunnelDetail.mockReturnValue(funnelState({ data: undefined }))
    renderUnder(demo)
    expect(screen.getByText('This page is not available')).toBeInTheDocument()
    expect(screen.queryByTestId('skeleton')).toBeNull()
  })

  it('shows the skeleton while the funnel loads', () => {
    mockFunnelDetail.mockReturnValue(funnelState({ data: undefined, isLoading: true }))
    renderUnder(demo)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
  })
})

describe('a scope that does not serve the page', () => {
  it.each([
    ['a customer link (scoped fidelity)', customerLink],
    ['a scoped link that lists the page anyway', scopedLinkListingThePage],
    ['a scope whose owner did not share funnels', demoWithoutFunnels],
  ])('%s says so plainly and mounts no data hook', (_name, scope) => {
    renderUnder(scope)
    expect(screen.getByText('This page is not available')).toBeInTheDocument()
    expect(screen.getByText('The site owner has not shared it.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(mockFunnelDetail).not.toHaveBeenCalled()
    expect(mockFunnelStats).not.toHaveBeenCalled()
    expect(mockUseSite).not.toHaveBeenCalled()
    expect(mockUseDataWindow).not.toHaveBeenCalled()
  })
})

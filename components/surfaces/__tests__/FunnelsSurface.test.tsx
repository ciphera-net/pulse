import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The funnels list under each scope (PUL-34 Phase 2). One page body serves a member
// (/sites/<id>/funnels), the demo (/demo/funnels, full fidelity) and, never, a customer's
// share link (scoped: the dashboard family only). What this pins:
//   - the site comes from the scope, never from the route: useParams throws here;
//   - links go through the scope's base path;
//   - write controls are ABSENT outside a member scope, even for a signed-in visitor who
//     holds the permission in their own team (the scope decides before the permission);
//   - an empty state says there is nothing yet, without a call to action;
//   - a scope that does not serve the page mounts no data hook, and says so plainly.
// The delete flow itself is app/sites/[id]/funnels/__tests__/page.test.tsx.

const mockUseFunnels = vi.fn()
const mockUseSite = vi.fn()
const mockUseFunnelListStats = vi.fn()
const mockUseDataWindow = vi.fn()
let mockCan = true
let mockSearch = ''

vi.mock('next/navigation', () => ({
  useParams: () => {
    throw new Error('a surface reads the site from the scope, never from useParams')
  },
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (...a: unknown[]) => mockUseSite(...a),
  useFunnels: (...a: unknown[]) => mockUseFunnels(...a),
  useFunnelListStats: (...a: unknown[]) => mockUseFunnelListStats(...a),
  useDataWindow: (...a: unknown[]) => mockUseDataWindow(...a),
}))

vi.mock('@/lib/api/funnels', () => ({
  deleteFunnel: vi.fn(),
  createFunnel: vi.fn(),
  updateFunnel: vi.fn(),
}))

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

vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => null }))
vi.mock('@/components/skeletons', () => ({ FunnelsListSkeleton: () => <div data-testid="skeleton" /> }))
vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))
vi.mock('@/components/funnels/FunnelModal', () => ({ default: () => <div data-testid="funnel-modal" /> }))

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div className={className}>{children}</div> },
}))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: unknown[]) => args.flat(Infinity).filter(Boolean).join(' '),
  toast: { success: vi.fn(), error: vi.fn() },
  PlusIcon: () => null,
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
  getAuthErrorMessage: (e: Error) => e?.message ?? '',
}))

vi.mock('@ciphera-net/facet-hold', async () =>
  (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

import FunnelsSurface from '../FunnelsSurface'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'
import { resetDeferred } from '@/lib/hold/__tests__/facetHoldStandIn'

const member = memberScope('site-1')
const demo: SiteScope = {
  siteId: 'demo-site', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full',
}
// A customer's link shares the dashboard only and answers the other pages with 404.
const customerLink: SiteScope = {
  siteId: 'cust-site', mode: 'public', basePath: '/share/cust-site', pages: ['dashboard'], demo: false, fidelity: 'scoped',
}
// The case the design says cannot happen yet and must still be safe: a scoped link whose shared
// pages list this one. The server serves a scoped link the dashboard family only, so the page
// must not ask for what it would be refused.
const scopedLinkListingThePage: SiteScope = { ...customerLink, pages: SITE_PAGES }
// Full fidelity, but the page is not among the ones shared.
const demoWithoutFunnels: SiteScope = { ...demo, pages: ['dashboard', 'pages'] }

const FUNNEL = {
  id: 'f1',
  site_id: 'demo-site',
  name: 'Signup flow',
  description: '',
  steps: [
    { order: 0, name: 'Step 1', value: '/pricing', type: 'exact', category: 'page' },
    { order: 1, name: 'Step 2', value: 'signup', type: 'exact', category: 'event' },
  ],
  created_at: '',
  updated_at: '',
}

const loaded = (data: unknown, over: Record<string, unknown> = {}) => ({
  data, error: undefined, isLoading: false, mutate: vi.fn(), ...over,
})

const renderUnder = (scope: SiteScope) =>
  render(
    <SiteScopeProvider scope={scope}>
      <FunnelsSurface />
    </SiteScopeProvider>,
  )

beforeEach(() => {
  mockCan = true
  mockSearch = ''
  mockUseFunnels.mockReset().mockReturnValue(loaded([FUNNEL]))
  mockUseSite.mockReset().mockReturnValue({ data: { id: 'x', timezone: 'Europe/Oslo' } })
  mockUseFunnelListStats.mockReset().mockReturnValue({ data: {}, error: undefined })
  mockUseDataWindow.mockReset().mockReturnValue(null)
  resetDeferred()
})

describe('member scope: the page as it was', () => {
  it('links each funnel under /sites/<id>/funnels and carries the range query on', () => {
    mockSearch = 'period=7'
    renderUnder(member)
    expect(screen.getByRole('link', { name: /Signup flow/ })).toHaveAttribute('href', '/sites/site-1/funnels/f1?period=7')
  })

  it('offers create, edit and delete to a member who holds the permission', () => {
    renderUnder(member)
    expect(screen.getByRole('button', { name: 'Create funnel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Signup flow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Signup flow' })).toBeInTheDocument()
  })

  it('offers none of them to a member without it', () => {
    mockCan = false
    renderUnder(member)
    expect(screen.queryByRole('button', { name: 'Create funnel' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit Signup flow' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Signup flow' })).toBeNull()
  })

  it('opens the create modal from ?create=1 for a member who holds the permission', () => {
    mockSearch = 'create=1'
    renderUnder(member)
    expect(screen.getByTestId('funnel-modal')).toBeInTheDocument()
  })

  it('keeps the empty state, with its create action, and the way back from a missing site', () => {
    mockUseFunnels.mockReturnValue(loaded([]))
    const { unmount } = renderUnder(member)
    expect(screen.getByText('No funnels yet')).toBeInTheDocument()
    expect(screen.getByText(/Create a funnel to track how visitors move through your site/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create funnel' })).toBeInTheDocument()
    unmount()

    mockUseFunnels.mockReturnValue(loaded(undefined, { error: { status: 404 } }))
    renderUnder(member)
    expect(screen.getByText('Site not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to your sites' })).toHaveAttribute('href', '/')
  })

  it('keeps the member wording of a failed request', () => {
    mockUseFunnels.mockReturnValue(loaded(undefined, { error: new Error('boom') }))
    renderUnder(member)
    expect(screen.getByText(/Your funnels are safe/)).toBeInTheDocument()
  })

  it('shows the skeleton on the first load', () => {
    mockUseFunnels.mockReturnValue(loaded(undefined, { isLoading: true }))
    renderUnder(member)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
  })
})

describe('public full scope (the demo)', () => {
  it('reads the site from the scope, never from the route', () => {
    renderUnder(demo)
    expect(mockUseFunnels).toHaveBeenCalledWith('demo-site')
    expect(mockUseSite).toHaveBeenCalledWith('demo-site')
    expect(mockUseDataWindow).toHaveBeenCalledWith('demo-site', 'funnels')
    expect(mockUseFunnelListStats.mock.calls.every(([site]) => site === 'demo-site')).toBe(true)
  })

  it('links each funnel under /demo/funnels and carries the range query on', () => {
    mockSearch = 'period=7'
    renderUnder(demo)
    expect(screen.getByRole('link', { name: /Signup flow/ })).toHaveAttribute('href', '/demo/funnels/f1?period=7')
  })

  it('has no create, edit or delete, even for a visitor who holds the permission in their own team', () => {
    renderUnder(demo)
    expect(screen.getByText('Signup flow')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens no create modal from ?create=1 or ?prefill=', () => {
    mockSearch = `create=1&prefill=${encodeURIComponent(JSON.stringify({ name: 'x' }))}`
    renderUnder(demo)
    expect(screen.queryByTestId('funnel-modal')).toBeNull()
  })

  it('says there is nothing yet, with no call to action', () => {
    mockUseFunnels.mockReturnValue(loaded([]))
    renderUnder(demo)
    expect(screen.getByText('No funnels yet')).toBeInTheDocument()
    expect(screen.getByText('This site has not set up any funnels yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('answers a 404 with the plain not-available state and no way back into a member\'s sites', () => {
    mockUseFunnels.mockReturnValue(loaded(undefined, { error: { status: 404 } }))
    renderUnder(demo)
    expect(screen.getByText('This page is not available')).toBeInTheDocument()
    expect(screen.queryByText('Site not found')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('words a failed request without a member\'s reassurance about their own data', () => {
    mockUseFunnels.mockReturnValue(loaded(undefined, { error: new Error('boom') }))
    renderUnder(demo)
    expect(screen.getByText('The funnels request failed. This is usually temporary.')).toBeInTheDocument()
    expect(screen.queryByText(/Your funnels are safe/)).toBeNull()
  })

  it('says not available, never "No funnels yet", when the read was not made', () => {
    mockUseFunnels.mockReturnValue(loaded(undefined))
    renderUnder(demo)
    expect(screen.getByText('This page is not available')).toBeInTheDocument()
    expect(screen.queryByText('No funnels yet')).toBeNull()
    expect(screen.queryByTestId('skeleton')).toBeNull()
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
    expect(mockUseFunnels).not.toHaveBeenCalled()
    expect(mockUseSite).not.toHaveBeenCalled()
    expect(mockUseFunnelListStats).not.toHaveBeenCalled()
    expect(mockUseDataWindow).not.toHaveBeenCalled()
  })
})

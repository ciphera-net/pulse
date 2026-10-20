import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Journeys under each scope (PUL-34 Phase 2). What this pins:
//   - the site comes from the scope, never from the route (useParams throws here);
//   - "Create funnel from this path" is ABSENT outside a member scope, and in a member scope it
//     goes to the funnels page under the scope's base path;
//   - the empty state offers the setup guide to a member only: a public view says there is
//     nothing yet and offers no way out of it (the guide is a member's page);
//   - filters, the lens and the entry page still work in the demo: they are URL state, not writes;
//   - a scope that does not serve the page mounts no data hook, and says so plainly.

const mockUseJourneyFlow = vi.fn()
const mockUseSite = vi.fn()
const mockUseDataWindow = vi.fn()
const routerPush = vi.fn()
let mockSearch = ''

vi.mock('next/navigation', () => ({
  useParams: () => {
    throw new Error('a surface reads the site from the scope, never from useParams')
  },
  useRouter: () => ({ push: (...a: unknown[]) => routerPush(...a), replace: vi.fn() }),
  usePathname: () => '/demo/journeys',
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (...a: unknown[]) => mockUseSite(...a),
  useDataWindow: (...a: unknown[]) => mockUseDataWindow(...a),
  useJourneyFlow: (...a: unknown[]) => mockUseJourneyFlow(...a),
}))

vi.mock('@/lib/hooks/useUrlDateRange', () => ({
  useUrlDateRange: () => ({
    period: '30',
    dateRange: { start: '2026-07-27', end: '2026-08-26' },
    periodReady: true,
    picker: {},
  }),
}))
vi.mock('@/lib/hooks/useFilterSuggestions', () => ({ useFilterSuggestions: () => async () => [] }))
vi.mock('@/components/dashboard/filter/useFilterBuilder', () => ({
  useFilterBuilder: () => ({ open: false, openCreate: vi.fn(), openEdit: vi.fn() }),
}))

// The layout of the flow is the Sankey's own suite; here it is a marker.
vi.mock('@/lib/journeys/aggregate', () => ({ aggregateJourney: () => [] }))
vi.mock('@/lib/journeys/chain', () => ({ buildLinks: () => ({ links: [] }), spineThrough: () => ['/pricing', '/signup'] }))
vi.mock('@/components/journeys/SankeyJourney', () => ({ default: () => <div data-testid="sankey" /> }))

vi.mock('@/components/skeletons', () => ({ JourneysSkeleton: () => <div data-testid="skeleton" /> }))
vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))
vi.mock('@/components/dashboard/FilterButton', () => ({ default: () => <button type="button">Filter</button> }))
vi.mock('@/components/dashboard/FilterPills', () => ({ default: () => null }))
vi.mock('@/components/dashboard/filter/FilterBuilder', () => ({ default: () => null }))
vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => null }))
vi.mock('@/components/ui/UpdatingChip', () => ({ UpdatingChip: () => null }))

vi.mock('@ciphera-net/facet', () => ({
  Switcher: () => null,
  cn: (...parts: unknown[]) => parts.flat(Infinity).filter(Boolean).join(' '),
}))

import JourneysSurface from '../JourneysSurface'
import { serializeFilters } from '@/lib/filters'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'

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
const demoWithoutJourneys: SiteScope = { ...demo, pages: ['dashboard', 'funnels'] }

const FLOW = { depth: 4, total_sessions: 12, columns: [], links: [] }
const NO_FLOW = { depth: 4, total_sessions: 0, columns: [], links: [] }

const flowState = (data: unknown, over: Record<string, unknown> = {}) => ({
  data, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn(), ...over,
})

const renderUnder = (scope: SiteScope) =>
  render(
    <SiteScopeProvider scope={scope}>
      <JourneysSurface />
    </SiteScopeProvider>,
  )

beforeEach(() => {
  mockSearch = ''
  mockUseJourneyFlow.mockReset().mockReturnValue(flowState(FLOW))
  mockUseSite.mockReset().mockReturnValue({ data: { id: 'x', timezone: 'Europe/Oslo' } })
  mockUseDataWindow.mockReset().mockReturnValue(null)
  routerPush.mockReset()
})

describe('member scope: the page as it was', () => {
  it('says "your site" and offers to create a funnel from the pinned path, under /sites/<id>', () => {
    mockSearch = 'lens=%2Fpricing'
    renderUnder(member)
    expect(screen.getByText('How visitors navigate through your site')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create funnel from this path' }))
    expect(routerPush).toHaveBeenCalledTimes(1)
    const [href] = routerPush.mock.calls[0] as [string]
    expect(href.startsWith('/sites/site-1/funnels?prefill=')).toBe(true)
    const prefill = JSON.parse(decodeURIComponent(href.split('?prefill=')[1]))
    expect(prefill.name).toBe('Journey via /pricing')
    expect(prefill.steps).toEqual([
      { value: '/pricing', type: 'exact', category: 'page' },
      { value: '/signup', type: 'exact', category: 'page' },
    ])
  })

  it('keeps the setup guide in the empty state', () => {
    mockUseJourneyFlow.mockReturnValue(flowState(NO_FLOW))
    renderUnder(member)
    expect(screen.getByText('No journey data yet')).toBeInTheDocument()
    expect(screen.getByText('Navigation flows will appear here as visitors browse through your site.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View setup guide' })).toHaveAttribute('href', '/installation')
  })

  it('keeps the member wording of a failed request', () => {
    mockUseJourneyFlow.mockReturnValue(flowState(undefined, { error: new Error('boom') }))
    renderUnder(member)
    expect(screen.getByText(/Your data is safe/)).toBeInTheDocument()
  })

  it('shows the skeleton on the first load', () => {
    mockUseJourneyFlow.mockReturnValue(flowState(undefined, { isLoading: true }))
    renderUnder(member)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
  })

  it('reads the member\'s site', () => {
    renderUnder(member)
    expect(mockUseSite).toHaveBeenCalledWith('site-1')
    expect(mockUseJourneyFlow.mock.calls.at(-1)?.[0]).toBe('site-1')
  })
})

describe('public full scope (the demo)', () => {
  it('reads the site from the scope, never from the route', () => {
    renderUnder(demo)
    expect(mockUseSite).toHaveBeenCalledWith('demo-site')
    expect(mockUseDataWindow).toHaveBeenCalledWith('demo-site', 'journeys')
    expect(mockUseJourneyFlow.mock.calls.at(-1)?.[0]).toBe('demo-site')
    expect(screen.getByTestId('sankey')).toBeInTheDocument()
  })

  it('speaks of "this site", not of the visitor\'s own', () => {
    renderUnder(demo)
    expect(screen.getByText('How visitors navigate through this site')).toBeInTheDocument()
    expect(screen.queryByText('How visitors navigate through your site')).toBeNull()
  })

  it('has no way to create a funnel from the pinned path, but the lens can still be cleared', () => {
    mockSearch = 'lens=%2Fpricing'
    renderUnder(demo)
    expect(screen.getByRole('button', { name: 'Clear lens' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create funnel from this path' })).toBeNull()
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('says there is nothing yet, with no setup guide and no call to action', () => {
    mockUseJourneyFlow.mockReturnValue(flowState(NO_FLOW))
    renderUnder(demo)
    expect(screen.getByText('No journey data yet')).toBeInTheDocument()
    expect(screen.getByText('Navigation flows will appear here as visitors browse through this site.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View setup guide' })).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('still lets a visitor drop an entry-page filter that matched nothing', () => {
    mockSearch = new URLSearchParams({ filters: serializeFilters([{ dimension: 'entry_path', operator: 'is', values: ['/nowhere'] }]) }).toString()
    mockUseJourneyFlow.mockReturnValue(flowState(NO_FLOW))
    renderUnder(demo)
    expect(screen.getByText('No journeys start at /nowhere')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove the entry page filter' })).toBeInTheDocument()
  })

  it('words a failed request without a member\'s reassurance about their own data', () => {
    mockUseJourneyFlow.mockReturnValue(flowState(undefined, { error: new Error('boom') }))
    renderUnder(demo)
    expect(screen.getByText('The journey data request failed. This is usually temporary.')).toBeInTheDocument()
    expect(screen.queryByText(/Your data is safe/)).toBeNull()
  })

  it('says not available, never "No journey data yet", when the read was not made', () => {
    mockUseJourneyFlow.mockReturnValue(flowState(undefined))
    renderUnder(demo)
    expect(screen.getByText('This page is not available')).toBeInTheDocument()
    expect(screen.queryByText('No journey data yet')).toBeNull()
    expect(screen.queryByTestId('skeleton')).toBeNull()
  })

  it('shows the skeleton while the flow loads', () => {
    mockUseJourneyFlow.mockReturnValue(flowState(undefined, { isLoading: true }))
    renderUnder(demo)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
  })
})

describe('a scope that does not serve the page', () => {
  it.each([
    ['a customer link (scoped fidelity)', customerLink],
    ['a scoped link that lists the page anyway', scopedLinkListingThePage],
    ['a scope whose owner did not share journeys', demoWithoutJourneys],
  ])('%s says so plainly and mounts no data hook', (_name, scope) => {
    renderUnder(scope)
    expect(screen.getByText('This page is not available')).toBeInTheDocument()
    expect(screen.getByText('The site owner has not shared it.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(mockUseJourneyFlow).not.toHaveBeenCalled()
    expect(mockUseSite).not.toHaveBeenCalled()
    expect(mockUseDataWindow).not.toHaveBeenCalled()
  })
})

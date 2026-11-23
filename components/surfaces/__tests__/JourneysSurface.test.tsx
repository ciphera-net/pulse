import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Journeys under each scope, on the page every team has since 23-11-2026 (components/journeys/flow/JourneysFlowPage.tsx;
// the page it replaced pinned the same promises until then). What this pins:
//   - the site comes from the scope, never from the route (useParams throws here);
//   - making a funnel of a pressed route is a member's action: offered to a member, and it opens the funnels page under
//     the scope's base path; a public view (the demo) reads only;
//   - the empty state offers the setup guide to a member only, and speaks of "this site" to a public view;
//   - a read that was not made says "not available", never "No journey data yet", which would claim an empty site;
//   - a scope that does not serve the page says so plainly and reads nothing.

const mockUseJourneyFlow = vi.fn()
const mockUseSite = vi.fn()
const mockUseDataWindow = vi.fn()
const routerPush = vi.fn()

vi.mock('next/navigation', () => ({
  useParams: () => {
    throw new Error('a surface reads the site from the scope, never from useParams')
  },
  useRouter: () => ({ push: (...a: unknown[]) => routerPush(...a), replace: vi.fn() }),
  usePathname: () => '/demo/journeys',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (...a: unknown[]) => mockUseSite(...a),
  useDataWindow: (...a: unknown[]) => mockUseDataWindow(...a),
  useJourneyFlow: (...a: unknown[]) => mockUseJourneyFlow(...a),
}))
vi.mock('@/lib/hooks/useUrlDateRange', () => ({
  useUrlDateRange: () => ({ period: '30', dateRange: { start: '2026-07-27', end: '2026-08-26' }, periodReady: true, picker: {} }),
}))
vi.mock('@/lib/hooks/useFilterSuggestions', () => ({ useFilterSuggestions: () => async () => [] }))
vi.mock('@/lib/features', () => ({ useFeature: () => false }))
// The toolbar's parts are their own suites; here they are markers.
vi.mock('@/components/dashboard/FrameToolbar', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/dashboard/filter/search/SearchFilter', () => ({ default: () => <button type="button">Filter</button> }))
vi.mock('@/components/dashboard/filter/search/FiltersBox', () => ({ default: () => null }))
vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => null }))
vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))
vi.mock('@/components/ui/UpdatingChip', () => ({ UpdatingChip: () => null }))
// The chart is its own suite (components/journeys/flow/__tests__/FlowChart.test.tsx): here it says whether it was
// handed the funnel action, and presses it on a route.
vi.mock('@/components/journeys/flow/FlowChart', () => ({
  default: ({ onFunnel }: { onFunnel?: (route: string[], via: string) => void }) => (
    <div data-testid="flow" data-funnel={onFunnel ? 'yes' : 'no'}>
      {onFunnel && <button type="button" onClick={() => onFunnel(['/pricing', '/signup'], '/pricing')}>Make a funnel</button>}
    </div>
  ),
}))
vi.mock('@/components/journeys/flow/flowMath', () => ({ sliceFlow: () => ({ columns: [] }), entryOnlyTotal: () => 0 }))

import JourneysSurface from '../JourneysSurface'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'

const member = memberScope('site-1')
const demo: SiteScope = { siteId: 'demo-site', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' }
const customerLink: SiteScope = { siteId: 'cust-site', mode: 'public', basePath: '/share/cust-site', pages: ['dashboard'], demo: false, fidelity: 'scoped' }
const scopedLinkListingThePage: SiteScope = { ...customerLink, pages: SITE_PAGES }
const demoWithoutJourneys: SiteScope = { ...demo, pages: ['dashboard', 'funnels'] }

const FLOW = { total_sessions: 12 }
const flowState = (data: unknown, over: Record<string, unknown> = {}) => ({ data, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn(), ...over })
const hrefsIn = (container: HTMLElement) => Array.from(container.querySelectorAll('a[href]')).map((a) => a.getAttribute('href') ?? '')
const renderUnder = (scope: SiteScope) =>
  render(
    <SiteScopeProvider scope={scope}>
      <JourneysSurface />
    </SiteScopeProvider>,
  )

beforeEach(() => {
  routerPush.mockReset()
  mockUseJourneyFlow.mockReset().mockReturnValue(flowState(FLOW))
  mockUseSite.mockReset().mockReturnValue({ data: { id: 'x', domain: 'example.com', timezone: 'Europe/Oslo' } })
  mockUseDataWindow.mockReset().mockReturnValue(null)
})

describe('a member', () => {
  it('reads the member\'s site, draws the flow with the funnel action, and opens the funnels page under /sites/<id>', () => {
    renderUnder(member)
    expect(mockUseSite).toHaveBeenCalledWith('site-1')
    expect(mockUseDataWindow).toHaveBeenCalledWith('site-1', 'journeys')
    expect(mockUseJourneyFlow.mock.calls.at(-1)?.[0]).toBe('site-1')
    expect(screen.getByTestId('flow').getAttribute('data-funnel')).toBe('yes')
    fireEvent.click(screen.getByRole('button', { name: 'Make a funnel' }))
    expect(String(routerPush.mock.calls[0]?.[0])).toMatch(/^\/sites\/site-1\/funnels\?prefill=/)
  })

  it('offers the setup guide when there are no journeys yet, in a member\'s words', () => {
    mockUseJourneyFlow.mockReturnValue(flowState({ total_sessions: 0 }))
    renderUnder(member)
    expect(screen.getByText('No journey data yet')).toBeInTheDocument()
    expect(screen.getByText('Journeys appear here as visitors move through your site.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View setup guide' })).toHaveAttribute('href', '/installation')
  })

  it('says a failed request failed', () => {
    mockUseJourneyFlow.mockReturnValue(flowState(undefined, { error: new Error('boom') }))
    renderUnder(member)
    expect(screen.getByText('Could not load journeys')).toBeInTheDocument()
  })
})

describe('a public view (the demo)', () => {
  it('reads the site from the scope and draws the flow with no funnel action', () => {
    renderUnder(demo)
    expect(mockUseSite).toHaveBeenCalledWith('demo-site')
    expect(mockUseJourneyFlow.mock.calls.at(-1)?.[0]).toBe('demo-site')
    expect(screen.getByTestId('flow').getAttribute('data-funnel')).toBe('no')
    expect(screen.queryByRole('button', { name: 'Make a funnel' })).toBeNull()
  })

  it('says there is nothing yet in its own words, with no setup guide and no link out', () => {
    mockUseJourneyFlow.mockReturnValue(flowState({ total_sessions: 0 }))
    const { container } = renderUnder(demo)
    expect(screen.getByText('Journeys appear here as visitors move through this site.')).toBeInTheDocument()
    expect(screen.queryByText('View setup guide')).toBeNull()
    expect(hrefsIn(container)).toEqual([])
  })

  it('says not available, never "No journey data yet", when the read was not made', () => {
    mockUseJourneyFlow.mockReturnValue(flowState(undefined))
    renderUnder(demo)
    expect(screen.getByText('This page is not available')).toBeInTheDocument()
    expect(screen.queryByText('No journey data yet')).toBeNull()
  })
})

describe('a scope that does not serve the page', () => {
  it.each([
    ['a customer link (scoped fidelity)', customerLink],
    ['a scoped link that lists the page anyway', scopedLinkListingThePage],
    ['a scope whose owner did not share journeys', demoWithoutJourneys],
  ])('%s says so plainly and reads nothing', (_name, scope) => {
    renderUnder(scope)
    expect(screen.getByRole('heading', { name: "This page isn't shared." })).toBeInTheDocument()
    expect(mockUseJourneyFlow).not.toHaveBeenCalled()
    expect(mockUseSite).not.toHaveBeenCalled()
  })
})

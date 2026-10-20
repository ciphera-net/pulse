import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The Pages table under each scope (PUL-34 Phase 2). It has no write control and no link of
// its own to hide, so what this pins is the rest of the contract: the site comes from the
// scope and never from the route (useParams throws here), and a scope that does not serve the
// page mounts no data hook and says so plainly, instead of drawing an empty table that would
// claim the site has no pages.

const mockUsePagesTable = vi.fn()
const mockUseSite = vi.fn()
const mockUseDataWindow = vi.fn()
let mockPeriodReady = true

vi.mock('next/navigation', () => ({
  useParams: () => {
    throw new Error('a surface reads the site from the scope, never from useParams')
  },
}))

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (...a: unknown[]) => mockUseSite(...a),
  useDataWindow: (...a: unknown[]) => mockUseDataWindow(...a),
  usePagesTable: (...a: unknown[]) => mockUsePagesTable(...a),
}))

vi.mock('@/lib/hooks/useUrlDateRange', () => ({
  useUrlDateRange: () => ({
    period: '30',
    dateRange: { start: '2026-07-27', end: '2026-08-26' },
    periodReady: mockPeriodReady,
    picker: {},
  }),
}))

// The table is PagesTable's own suite; here it says how many rows it was handed.
vi.mock('@/components/pages/PagesTable', () => ({
  default: ({ rows }: { rows: unknown[] }) => <div data-testid="table">{rows.length} rows</div>,
}))
vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => null }))

import PagesSurface from '../PagesSurface'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'

const member = memberScope('site-1')
const demo: SiteScope = {
  siteId: 'demo-site', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full',
}
const customerLink: SiteScope = {
  siteId: 'cust-site', mode: 'public', basePath: '/share/cust-site', pages: ['dashboard'], demo: false, fidelity: 'scoped',
}
const demoWithoutPages: SiteScope = { ...demo, pages: ['dashboard', 'funnels'] }

const ROW = { path: '/a', pageviews: 1, visitors: 1, entries: 1, exits: 1, exit_rate: null, avg_time_on_page: null, entry_bounce_rate: null, avg_scroll_depth: null, trend: [], delta: null }
const tableState = (data: unknown, over: Record<string, unknown> = {}) => ({
  data, error: undefined, isLoading: false, ...over,
})

const renderUnder = (scope: SiteScope) =>
  render(
    <SiteScopeProvider scope={scope}>
      <PagesSurface />
    </SiteScopeProvider>,
  )

beforeEach(() => {
  mockPeriodReady = true
  mockUsePagesTable.mockReset().mockReturnValue(tableState({ pages: [ROW, { ...ROW, path: '/b' }] }))
  mockUseSite.mockReset().mockReturnValue({ data: { id: 'x', timezone: 'Europe/Oslo' } })
  mockUseDataWindow.mockReset().mockReturnValue(null)
})

describe('member scope: the page as it was', () => {
  it('reads the member\'s site and draws the table', () => {
    renderUnder(member)
    expect(mockUseSite).toHaveBeenCalledWith('site-1')
    expect(mockUseDataWindow).toHaveBeenCalledWith('site-1', 'pages')
    expect(mockUsePagesTable.mock.calls.at(-1)?.[0]).toBe('site-1')
    expect(screen.getByTestId('table')).toHaveTextContent('2 rows')
  })

  it('shows the skeleton on the first load, and an error card for a failed request', () => {
    mockUsePagesTable.mockReturnValue(tableState(undefined, { isLoading: true }))
    const { container, unmount } = renderUnder(member)
    expect(screen.queryByTestId('table')).toBeNull()
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
    unmount()

    mockUsePagesTable.mockReturnValue(tableState(undefined, { error: new Error('boom') }))
    renderUnder(member)
    expect(screen.getByText('Could not load pages')).toBeInTheDocument()
  })

  it('draws the table while the view is still being resolved, as it always did', () => {
    // The request is switched off until the period is known (its key is null), so there is
    // no data and nothing in flight: that is "not yet", not "not available".
    mockPeriodReady = false
    mockUsePagesTable.mockReturnValue(tableState(undefined))
    renderUnder(member)
    expect(screen.getByTestId('table')).toHaveTextContent('0 rows')
    expect(screen.queryByText('This page is not available')).toBeNull()
  })
})

describe('public full scope (the demo)', () => {
  it('reads the site from the scope, never from the route', () => {
    renderUnder(demo)
    expect(mockUseSite).toHaveBeenCalledWith('demo-site')
    expect(mockUseDataWindow).toHaveBeenCalledWith('demo-site', 'pages')
    expect(mockUsePagesTable.mock.calls.at(-1)?.[0]).toBe('demo-site')
    expect(screen.getByTestId('table')).toHaveTextContent('2 rows')
  })

  it('has nothing to write and nothing to follow out of the page', () => {
    renderUnder(demo)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('says not available, not an empty table, when the read was not made', () => {
    mockUsePagesTable.mockReturnValue(tableState(undefined))
    renderUnder(demo)
    expect(screen.getByText('This page is not available')).toBeInTheDocument()
    expect(screen.queryByTestId('table')).toBeNull()
  })
})

describe('a scope that does not serve the page', () => {
  it.each([
    ['a customer link (scoped fidelity)', customerLink],
    ['a scope whose owner did not share pages', demoWithoutPages],
  ])('%s says so plainly and mounts no data hook', (_name, scope) => {
    renderUnder(scope)
    expect(screen.getByText('This page is not available')).toBeInTheDocument()
    expect(screen.getByText('The site owner has not shared it.')).toBeInTheDocument()
    expect(screen.queryByTestId('table')).toBeNull()
    expect(mockUsePagesTable).not.toHaveBeenCalled()
    expect(mockUseSite).not.toHaveBeenCalled()
    expect(mockUseDataWindow).not.toHaveBeenCalled()
  })
})

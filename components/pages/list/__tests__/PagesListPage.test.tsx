import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { ApiError } from '@/lib/api/client'
import type { ReactElement, ReactNode } from 'react'

// ---------------------------------------------------------------------------
// The Pages page's reads (components/pages/list/PagesListPage.tsx). The page must never ask the server once a row:
// what it asks is pinned here, read by read.
//   the pages read, with each row's hours ONLY on a range of one day old enough to be drawn by the hour;
//   the same read for the period before, without them;
//   the dashboard's read and the stats of the period before, for the strip.
// And its link to the dashboard: the page's filter added, the list's own words left behind.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  usePagesTable: vi.fn(),
  useDashboard: vi.fn(),
  useStats: vi.fn(),
  range: { period: '30', dateRange: { start: '2026-10-19', end: '2026-11-17' }, siteNow: new Date(2026, 10, 17, 14, 30) },
  /** Whether the period is known (the site's timezone and data window have arrived). */
  ready: true,
  list: null as Record<string, unknown> | null,
  strip: null as Record<string, unknown> | null,
}))

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }))
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => ({ data: { id: 's', domain: 'example.com', timezone: 'Europe/Oslo' } }),
  useDataWindow: () => ({ from: '2026-01-01' }),
  usePagesTable: (...a: unknown[]) => h.usePagesTable(...a),
  useDashboard: (...a: unknown[]) => h.useDashboard(...a),
  useStats: (...a: unknown[]) => h.useStats(...a),
}))
vi.mock('@/lib/hooks/useUrlDateRange', () => ({
  useUrlDateRange: () => ({ period: h.range.period, dateRange: h.range.dateRange, periodReady: h.ready, picker: {}, siteNow: h.range.siteNow }),
}))
vi.mock('@/lib/hooks/useFilterSuggestions', () => ({ useFilterSuggestions: () => vi.fn() }))
vi.mock('@/lib/import/core/dates', () => ({ todayIn: () => '2026-11-17' }))
vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => null }))
vi.mock('@/components/dashboard/FrameToolbar', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/dashboard/filter/search/SearchFilter', () => ({ default: () => null }))
vi.mock('@/components/dashboard/filter/search/FiltersBox', () => ({ default: () => null }))
vi.mock('../PagesList', () => ({
  LIST_PARAMS: ['q', 'sort', 'show', 'tab', 'col'],
  default: (props: Record<string, unknown>) => { h.list = props; return <div data-testid="list" /> },
}))
vi.mock('../PagesStrip', () => ({ default: (props: Record<string, unknown>) => { h.strip = props; return <div data-testid="strip" /> } }))
vi.mock('../PageHours', () => ({ default: () => null }))
vi.mock('../ScrollWho', () => ({ default: () => null }))

import PagesListPage from '../PagesListPage'
import { SiteScopeProvider, memberScope } from '@/lib/scope/SiteScope'

const ROW = { path: '/a', pageviews: 10, visitors: 9, entries: 5, exits: 2, exit_rate: 20, avg_time_on_page: 30, entry_bounce_rate: 40, avg_scroll_depth: 50, trend: [10], delta: null }
const show = () => render(<SiteScopeProvider scope={memberScope('s')}><PagesListPage siteId="s" /></SiteScopeProvider>)
/** The pages read's calls, as (start, end, include). */
const tableReads = () => h.usePagesTable.mock.calls.map((c) => [c[1], c[2], c[6]])

beforeEach(() => {
  window.history.replaceState({}, '', '/sites/s/pages')
  h.range = { period: '30', dateRange: { start: '2026-10-19', end: '2026-11-17' }, siteNow: new Date(2026, 10, 17, 14, 30) }
  h.ready = true
  h.list = null
  h.strip = null
  h.usePagesTable.mockReset().mockReturnValue({ data: { pages: [ROW] }, error: undefined, isLoading: false })
  h.useDashboard.mockReset().mockImplementation((_site: string, start: string, end: string) => ({ data: { stats: { pageviews: 10 }, date_range: { start, end } } }))
  h.useStats.mockReset().mockReturnValue({ data: { pageviews: 8 } })
})

describe('the reads', () => {
  it('over several days asks the pages read once for the range and once for the period before, with no hours', () => {
    show()
    expect(tableReads()).toContainEqual(['2026-10-19', '2026-11-17', undefined])
    expect(tableReads()).toContainEqual(['2026-09-19', '2026-10-18', undefined])
    expect(h.usePagesTable.mock.calls.every((c) => c[3] === 500)).toBe(true)
    expect(h.list).toMatchObject({ hourly: false, limit: 500, start: '2026-10-19', prevStart: '2026-09-19', live: true })
    expect(h.list?.renderHours).toBeUndefined()
  })

  it('on a day that is over asks for each row\'s hours, in the same one read', () => {
    h.range = { period: 'yesterday', dateRange: { start: '2026-11-16', end: '2026-11-16' }, siteNow: new Date(2026, 10, 17, 14, 30) }
    show()
    expect(tableReads()).toContainEqual(['2026-11-16', '2026-11-16', 'hours'])
    // The day before is read for the change alone: no hours.
    expect(tableReads()).toContainEqual(['2026-11-15', '2026-11-15', undefined])
    expect(h.list).toMatchObject({ hourly: true, live: false, hoursCompare: true })
    expect(h.list?.nowHour).toBeUndefined()
    expect(typeof h.list?.renderHours).toBe('function')
  })

  it('on today hands the list the hour the day has reached', () => {
    h.range = { period: 'today', dateRange: { start: '2026-11-17', end: '2026-11-17' }, siteNow: new Date(2026, 10, 17, 14, 30) }
    show()
    expect(tableReads()).toContainEqual(['2026-11-17', '2026-11-17', 'hours'])
    expect(h.list).toMatchObject({ hourly: true, live: true, nowHour: 14 })
  })

  it('on a today younger than three hours asks for no hours a row: the day is drawn by the minute, in the opened page', () => {
    h.range = { period: 'today', dateRange: { start: '2026-11-17', end: '2026-11-17' }, siteNow: new Date(2026, 10, 17, 1, 30) }
    show()
    expect(tableReads()).toContainEqual(['2026-11-17', '2026-11-17', undefined])
    expect(h.list).toMatchObject({ hourly: false, hoursCompare: false })
    const hours = (h.list?.renderHours as (path: string) => ReactElement<{ bucket: string; filters: string }>)('/a')
    expect(hours.props.bucket).toBe('minute')
    expect(hours.props.filters).toBe('v2:page|is|/a')
  })

  it('reads the site\'s figures once and the period before\'s once, for the strip', () => {
    show()
    expect(h.useDashboard).toHaveBeenLastCalledWith('s', '2026-10-19', '2026-11-17', 'day', undefined, undefined)
    expect(h.useStats).toHaveBeenLastCalledWith('s', '2026-09-19', '2026-10-18', undefined)
    expect(h.strip).toMatchObject({ limit: 500, stats: { pageviews: 10 }, prevStats: { pageviews: 8 } })
  })

  it('sends the page\'s filters with every read, and no event condition', () => {
    window.history.replaceState({}, '', '/sites/s/pages?filters=v2%3Acountry%7Cis%7CNO%2Cevent%7Cis%7Csignup')
    show()
    expect(h.usePagesTable.mock.calls.every((c) => c[4] === 'v2:country|is|NO')).toBe(true)
    expect(h.useDashboard.mock.calls.at(-1)?.[4]).toBe('v2:country|is|NO')
  })
})

describe('an opened page\'s scroll depth', () => {
  type ScrollProps = { path: string; by: string; onBy: (by: string) => void; filters?: string }
  const scrollOf = (path: string) => (h.list?.renderScroll as (path: string) => ReactElement<ScrollProps>)(path).props

  it('is split by the dimension the page holds: the choice made on one page is the next page\'s too', () => {
    show()
    expect(scrollOf('/a').by).toBe('device')
    act(() => scrollOf('/a').onBy('country'))
    expect(scrollOf('/a').by).toBe('country')
    expect(scrollOf('/b').by).toBe('country')
    expect(scrollOf('/b').path).toBe('/b')
  })
})

describe('what it knows of the period before', () => {
  /** The period before's reads answer as `prev`; the range's own as before. */
  const prevAnswers = (prev: { data?: unknown; error?: unknown; isLoading?: boolean }) => {
    h.usePagesTable.mockImplementation((_s: string, start: string) => (start === '2026-09-19' ? { data: undefined, error: undefined, isLoading: false, ...prev } : { data: { pages: [ROW] }, error: undefined, isLoading: false }))
    h.useStats.mockImplementation((_s: string, start: string) => (start === '2026-09-19' ? { data: undefined, error: undefined, ...prev } : { data: { pageviews: 8 } }))
  }

  it('says it is on its way while its reads are, to the list and the strip alike', () => {
    prevAnswers({ isLoading: true })
    show()
    expect(h.list).toMatchObject({ before: 'loading', prevRows: undefined })
    expect(h.strip).toMatchObject({ beforeRows: 'loading', beforeStats: 'loading' })
  })

  it('says its read failed', () => {
    prevAnswers({ error: new Error('boom') })
    show()
    expect(h.list).toMatchObject({ before: 'failed' })
    expect(h.strip).toMatchObject({ beforeRows: 'failed', beforeStats: 'failed' })
  })

  it('hands the rows over once they are in', () => {
    show()
    expect(h.list).toMatchObject({ before: 'ready', prevRows: [ROW] })
    expect(h.strip).toMatchObject({ beforeRows: 'ready', beforeStats: 'ready' })
  })

  it('says there is none over All time', () => {
    h.range = { period: 'all', dateRange: { start: '2026-01-01', end: '2026-11-17' }, siteNow: new Date(2026, 10, 17, 14, 30) }
    show()
    expect(h.list).toMatchObject({ before: 'none', prevRows: undefined })
    expect(h.strip).toMatchObject({ beforeRows: 'none', beforeStats: 'none' })
  })
})

describe('the way out', () => {
  it('links a page to the dashboard filtered to it, with the range and none of the list\'s own words', () => {
    window.history.replaceState({}, '', '/sites/s/pages?period=7&q=blog&sort=change.asc&show=%2Fa&tab=scroll&col=exit_rate')
    show()
    const href = (h.list?.dashboardHref as (path: string) => string)('/a')
    const [path, query] = href.split('?')
    const at = new URLSearchParams(query)
    expect(path).toBe('/sites/s')
    expect(at.get('period')).toBe('7')
    expect(at.get('filters')).toBe('v2:page|is|/a')
    for (const word of ['q', 'sort', 'show', 'tab', 'col']) expect(at.has(word), word).toBe(false)
  })

  it('names the browser tab after the page', () => {
    show()
    expect(document.title).toBe('Pages · example.com | Pulse')
  })
})

describe('what is drawn', () => {
  it('says the page is not available where the read was not made, never an empty list', () => {
    h.usePagesTable.mockReturnValue({ data: undefined, error: undefined, isLoading: false })
    const { getByText, queryByTestId } = show()
    expect(getByText('This page is not available')).toBeInTheDocument()
    expect(queryByTestId('list')).toBeNull()
  })

  it('draws its skeleton until the period is known, never an empty list', () => {
    // The site's timezone or its data window is still on the way: there is no range, so no read is asked, and a read
    // that was not asked is "not loading, nothing in hand".
    h.ready = false
    h.usePagesTable.mockReturnValue({ data: undefined, error: undefined, isLoading: false })
    const { queryByTestId, queryByText } = show()
    expect(document.querySelector('[data-pages-skeleton]')).not.toBeNull()
    expect(queryByTestId('list')).toBeNull()
    expect(queryByTestId('strip')).toBeNull()
    expect(queryByText('This page is not available')).toBeNull()
  })

  it('shows an error card for a failed read and a skeleton for the first load', () => {
    h.usePagesTable.mockReturnValue({ data: undefined, error: new Error('boom'), isLoading: false })
    const failed = show()
    expect(failed.getByText('Could not load pages')).toBeInTheDocument()
    failed.unmount()
    h.usePagesTable.mockReturnValue({ data: undefined, error: undefined, isLoading: true })
    show()
    expect(document.querySelector('[data-pages-skeleton]')).not.toBeNull()
  })

  it('says a range the server refuses as too large is a limit, never "usually temporary"', () => {
    h.usePagesTable.mockReturnValue({ data: undefined, error: new ApiError('too large', 422, { error: 'This range is too large to break down. Choose a shorter range.' }), isLoading: false })
    const refused = show()
    expect(refused.getByText("Pages can't be shown for this range")).toBeInTheDocument()
    expect(refused.getByText('Choose a shorter range.')).toBeInTheDocument()
    expect(refused.queryByText(/usually temporary/)).toBeNull()
  })
})

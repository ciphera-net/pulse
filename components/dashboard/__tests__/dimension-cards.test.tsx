import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import GoalStats from '@/components/dashboard/GoalStats'
import Campaigns from '@/components/dashboard/Campaigns'

// Campaigns fetches its own rows; pin the fetcher so its F9 denominator is
// testable without a network.
vi.mock('@/lib/api/stats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/stats')>()),
  getCampaigns: vi.fn().mockResolvedValue([
    { source: 'google', medium: 'cpc', campaign: 'launch', term: '', content: '', visitors: 157, pageviews: 200 },
    { source: 'linkedin', medium: 'social', campaign: 'launch', term: '', content: '', visitors: 31, pageviews: 40 },
  ]),
}))

// Shared F9/F14/F17 assertions for the remaining list cards. ContentStats has
// its own file; this one pins the same contract on TopReferrers, Audience,
// TechSpecs — and GoalStats' deliberate absence of percentages.
const useFullDimensionList = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useFullDimensionList: (...args: unknown[]) => useFullDimensionList(...args),
}))
vi.mock('@/components/dashboard/VirtualList', () => ({
  default: ({ items, renderItem }: { items: unknown[]; renderItem: (item: never, index: number) => React.ReactNode }) => (
    <div>{items.map((item, index) => renderItem(item as never, index))}</div>
  ),
}))
// MapView pulls a browser-only globe lib; the Audience tests use list tabs.
vi.mock('@/components/dashboard/MapView', () => ({ default: () => null }))

// jsdom has no IntersectionObserver (Audience lazy-loads its map with one).
vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
const totals = { pageviews: 453, visitors: 314 }
const dateRange = { start: '2026-07-20', end: '2026-08-18' }

beforeEach(() => {
  useFullDimensionList.mockReset().mockReturnValue(idle)
})

describe('TopReferrers', () => {
  const referrers = [
    { referrer: 'google.com', pageviews: 142 }, { referrer: 'linkedin.com', pageviews: 43 },
    { referrer: 'chatgpt.com', pageviews: 11 }, { referrer: 'bing.com', pageviews: 5 },
    { referrer: 'ddg.gg', pageviews: 4 }, { referrer: 'x.com', pageviews: 3 },
    { referrer: 'reddit.com', pageviews: 2 }, { referrer: 'news.ycombinator.com', pageviews: 1 },
  ]

  it('divides by the true total (142/453 = 31%), not the row sum (142/211 = 67%)', () => {
    render(<TopReferrers referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(screen.getByText('31%')).toBeTruthy()
    expect(screen.queryByText('67%')).toBeNull()
    // Header note removed by owner call — the modal keeps its explanation.
    expect(screen.queryByText(/share of 453 pageviews/)).toBeNull()
  })

  it('threads filters into the modal fetch', () => {
    render(<TopReferrers referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} filters="page:is:/" />)
    fireEvent.click(screen.getByLabelText('View all referrers'))
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      'referrers', 'site-1', '2026-07-20', '2026-08-18', 100, 'page:is:/',
    )
  })

  it('hides view-all when memberFeatures is false', () => {
    render(<TopReferrers referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} memberFeatures={false} />)
    expect(screen.queryByLabelText('View all referrers')).toBeNull()
  })

  it('shows an error with retry when the modal fetch fails', () => {
    const mutate = vi.fn()
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { data: undefined, error: new Error('boom'), isLoading: false, mutate } : idle)
    render(<TopReferrers referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} />)
    fireEvent.click(screen.getByLabelText('View all referrers'))
    expect(screen.getByText(/Couldn.t load the full list/)).toBeTruthy()
    fireEvent.click(screen.getByText('Retry'))
    expect(mutate).toHaveBeenCalled()
  })
})

describe('Audience', () => {
  const countries = [
    { country: 'US', pageviews: 115 }, { country: 'DE', pageviews: 42 },
    { country: 'BE', pageviews: 34 }, { country: 'NL', pageviews: 31 },
    { country: 'TR', pageviews: 22 }, { country: 'GB', pageviews: 19 },
    { country: 'FR', pageviews: 12 }, { country: 'ES', pageviews: 9 },
  ]
  const baseProps = {
    countries, cities: [], regions: [], languages: [], timezones: [],
    siteId: 'site-1', dateRange,
  }

  it('divides by the true total (115/453 = 25%), not the row sum (115/284 = 40%)', () => {
    render(<Audience {...baseProps} totals={totals} />)
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.queryByText('40%')).toBeNull()
  })

  it('threads filters and the 250 limit into the modal fetch', () => {
    render(<Audience {...baseProps} totals={totals} filters="browser:is:Chrome" />)
    fireEvent.click(screen.getByLabelText('View all audience data'))
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      'countries', 'site-1', '2026-07-20', '2026-08-18', 250, 'browser:is:Chrome',
    )
  })

  it('hides view-all when memberFeatures is false', () => {
    render(<Audience {...baseProps} totals={totals} memberFeatures={false} />)
    expect(screen.queryByLabelText('View all audience data')).toBeNull()
  })

  it('shows an error with retry when the modal fetch fails', () => {
    const mutate = vi.fn()
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { data: undefined, error: new Error('boom'), isLoading: false, mutate } : idle)
    render(<Audience {...baseProps} totals={totals} />)
    fireEvent.click(screen.getByLabelText('View all audience data'))
    expect(screen.getByText(/Couldn.t load the full list/)).toBeTruthy()
    fireEvent.click(screen.getByText('Retry'))
    expect(mutate).toHaveBeenCalled()
  })
})

describe('TechSpecs', () => {
  const browsers = [
    { browser: 'Chrome', pageviews: 296 }, { browser: 'Safari', pageviews: 63 },
    { browser: 'Firefox', pageviews: 46 }, { browser: 'Edge', pageviews: 17 },
    { browser: 'LinkedIn Browser', pageviews: 17 }, { browser: 'Opera', pageviews: 6 },
    { browser: 'Brave', pageviews: 4 }, { browser: 'Vivaldi', pageviews: 2 },
  ]
  const baseProps = {
    browsers, os: [], devices: [], screenResolutions: [],
    siteId: 'site-1', dateRange,
  }

  it('divides by the true total (296/453 = 65%), not the row sum (296/451 = 66%)', () => {
    render(<TechSpecs {...baseProps} totals={totals} />)
    expect(screen.getByText('65%')).toBeTruthy()
    expect(screen.queryByText('66%')).toBeNull()
  })

  it('threads filters and maps raw rows in the modal', () => {
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { ...idle, data: [{ browser: 'Chrome', pageviews: 296 }] } : idle)
    render(<TechSpecs {...baseProps} totals={totals} filters="country:is:DE" />)
    fireEvent.click(screen.getByLabelText('View all technology'))
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      'browsers', 'site-1', '2026-07-20', '2026-08-18', 100, 'country:is:DE',
    )
    // The mapped row renders with the true-denominator share.
    expect(screen.getAllByText('65%').length).toBeGreaterThan(0)
  })

  it('shows an error with retry when the modal fetch fails', () => {
    const mutate = vi.fn()
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { data: undefined, error: new Error('boom'), isLoading: false, mutate } : idle)
    render(<TechSpecs {...baseProps} totals={totals} />)
    fireEvent.click(screen.getByLabelText('View all technology'))
    expect(screen.getByText(/Couldn.t load the full list/)).toBeTruthy()
    fireEvent.click(screen.getByText('Retry'))
    expect(mutate).toHaveBeenCalled()
  })
})

describe('Campaigns', () => {
  it('divides by the true visitor total (157/314 = 50%), not the row sum (157/188 = 84%)', async () => {
    render(<Campaigns siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(await screen.findByText('50%')).toBeTruthy()
    expect(screen.queryByText('84%')).toBeNull()
    expect(screen.queryByText(/share of 314 visitors/)).toBeNull()
  })

  it('renders NO percentages without totals', async () => {
    render(<Campaigns siteId="site-1" dateRange={dateRange} />)
    expect(await screen.findByText('157')).toBeTruthy()
    expect(screen.queryByText(/\d+%/)).toBeNull()
  })
})

describe('GoalStats', () => {
  it('renders event counts with NO percentage — the events total is not on the wire', () => {
    render(<GoalStats
      goalCounts={[
        { event_name: 'signup', count: 30 },
        { event_name: 'download', count: 10 },
      ]}
      siteId="site-1"
      dateRange={dateRange}
    />)
    expect(screen.getByText('30')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
    // The old card printed 75% / 25% here — share-of-visible-rows.
    expect(screen.queryByText(/\d+%/)).toBeNull()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TopReferrers from '@/components/dashboard/TopReferrers'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import GoalStats from '@/components/dashboard/GoalStats'
import Campaigns from '@/components/dashboard/Campaigns'

// Campaigns gets its rows from SWR like every other card in the row (it was
// the last one still on a bare useEffect fetch). Pin the HOOK, not the
// fetcher, so its F9 denominator is testable without a network.
const CAMPAIGN_ROWS = [
  { source: 'google', medium: 'cpc', campaign: 'launch', term: '', content: '', visitors: 157, pageviews: 200 },
  { source: 'linkedin', medium: 'social', campaign: 'launch', term: '', content: '', visitors: 31, pageviews: 40 },
]
const useCampaignsList = vi.fn()

// Shared F9/F14/F17 assertions for the remaining list cards. ContentStats has
// its own file; this one pins the same contract on TopReferrers, Audience,
// TechSpecs — and GoalStats' deliberate absence of percentages.
const useFullDimensionList = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useFullDimensionList: (...args: unknown[]) => useFullDimensionList(...args),
  useCampaignsList: (...args: unknown[]) => useCampaignsList(...args),
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
    { referrer: 'google.com', pageviews: 142, visitors: 97 }, { referrer: 'linkedin.com', pageviews: 43, visitors: 30 },
    { referrer: 'chatgpt.com', pageviews: 11, visitors: 8 }, { referrer: 'bing.com', pageviews: 5, visitors: 3 },
    { referrer: 'ddg.gg', pageviews: 4, visitors: 3 }, { referrer: 'x.com', pageviews: 3, visitors: 2 },
    { referrer: 'reddit.com', pageviews: 2, visitors: 1 }, { referrer: 'news.ycombinator.com', pageviews: 1, visitors: 1 },
  ]

  it('divides by the true visitor total (97/314 = 31%), not the row sum (97/145 = 67%)', () => {
    render(<TopReferrers referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(screen.getByText('31%')).toBeTruthy()
    expect(screen.queryByText('67%')).toBeNull()
    // Header note removed by owner call — the modal keeps its explanation.
    expect(screen.queryByText(/Shares are of all 314 visitors/)).toBeNull()
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
    { country: 'US', pageviews: 115, visitors: 78 }, { country: 'DE', pageviews: 42, visitors: 28 },
    { country: 'BE', pageviews: 34, visitors: 23 }, { country: 'NL', pageviews: 31, visitors: 21 },
    { country: 'TR', pageviews: 22, visitors: 15 }, { country: 'GB', pageviews: 19, visitors: 13 },
    { country: 'FR', pageviews: 12, visitors: 8 }, { country: 'ES', pageviews: 9, visitors: 6 },
  ]
  const baseProps = {
    countries, cities: [], regions: [], languages: [], timezones: [],
    siteId: 'site-1', dateRange,
  }

  it('divides by the true visitor total (78/314 = 25%), not the row sum (78/192 = 41%)', () => {
    render(<Audience {...baseProps} totals={totals} />)
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.queryByText('41%')).toBeNull()
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
    { browser: 'Chrome', pageviews: 296, visitors: 204 }, { browser: 'Safari', pageviews: 63, visitors: 43 },
    { browser: 'Firefox', pageviews: 46, visitors: 31 }, { browser: 'Edge', pageviews: 17, visitors: 12 },
    { browser: 'LinkedIn Browser', pageviews: 17, visitors: 11 }, { browser: 'Opera', pageviews: 6, visitors: 4 },
    { browser: 'Brave', pageviews: 4, visitors: 3 }, { browser: 'Vivaldi', pageviews: 2, visitors: 1 },
  ]
  const baseProps = {
    browsers, os: [], devices: [], screenResolutions: [],
    siteId: 'site-1', dateRange,
  }

  it('divides by the true visitor total (204/314 = 65%), not the row sum (204/309 = 66%)', () => {
    render(<TechSpecs {...baseProps} totals={totals} />)
    expect(screen.getByText('65%')).toBeTruthy()
    expect(screen.queryByText('66%')).toBeNull()
  })

  it('threads filters and maps raw rows in the modal', () => {
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { ...idle, data: [{ browser: 'Chrome', pageviews: 296, visitors: 204 }] } : idle)
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
  beforeEach(() => {
    useCampaignsList.mockReturnValue({
      data: CAMPAIGN_ROWS, error: undefined, isLoading: false, mutate: vi.fn(),
    })
  })

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

  // 🔴 THE ANTI-FAKE-EMPTY. Reported by a customer on 20-08-2026 as "Campaigns
  // shows no data": a failed fetch used to render the identical "No UTM data
  // yet" empty state as a genuinely empty range, and its only handling was
  // logger.error — a NO-OP in a production browser build. Nothing in the DOM
  // or in state could tell "we could not find out" from "you have none".
  it('states an ERROR rather than claiming there is no campaign traffic', () => {
    const mutate = vi.fn()
    useCampaignsList.mockReturnValue({
      data: undefined, error: new Error('boom'), isLoading: false, mutate,
    })
    render(<Campaigns siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(screen.getByText(/Couldn.t load campaigns/)).toBeTruthy()
    expect(screen.queryByText(/No UTM data yet/)).toBeNull()
    fireEvent.click(screen.getByText('Retry'))
    expect(mutate).toHaveBeenCalled()
  })

  // The paired positive: a genuinely empty range must STILL say so, or the fix
  // above would just have swapped one lie for another.
  it('still shows the empty state for a genuinely empty range', () => {
    useCampaignsList.mockReturnValue({
      data: [], error: undefined, isLoading: false, mutate: vi.fn(),
    })
    render(<Campaigns siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(screen.getByText(/No UTM data yet/)).toBeTruthy()
    expect(screen.queryByText(/Couldn.t load campaigns/)).toBeNull()
  })

  // The card is handed already-resolved dates, so the DATES are its cache
  // identity. Keying on less is how one range's rows get served for another —
  // the 30-day window that produced the original report.
  it('keys its request on the resolved dates', () => {
    render(<Campaigns siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(useCampaignsList).toHaveBeenCalledWith(
      'site-1', dateRange.start, dateRange.end, 10, undefined,
    )
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

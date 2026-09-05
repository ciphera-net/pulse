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
  { source: 'google', medium: 'cpc', campaign: 'launch', term: '', content: '', visitors: 157, pageviews: 200, bounce_rate: null, avg_duration: null },
  { source: 'linkedin', medium: 'social', campaign: 'launch', term: '', content: '', visitors: 31, pageviews: 40, bounce_rate: null, avg_duration: null },
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
// Pin data behaviour, not motion: the cascade renders plain in tests so
// AnimatePresence exit timing can never make a page flip flaky in jsdom.
vi.mock('@/components/dashboard/Cascade', () => ({
  CascadeGroup: ({ className, children }: { className?: string; children: React.ReactNode }) => (
    <div className={className}>{children}</div>
  ),
  CascadeRow: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RowBar: ({ width }: { width: number }) => <div data-testid="row-bar" style={{ width: `${width}%` }} />,
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
    { referrer: 'reddit.com', pageviews: 2, visitors: 2 }, { referrer: 'startpage.com', pageviews: 1, visitors: 1 },
  ]

  it('divides by the true visitor total (97/314 = 31%), not the row sum (97/145 = 67%)', () => {
    render(<TopReferrers referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(screen.getByText('31%')).toBeTruthy()
    expect(screen.queryByText('67%')).toBeNull()
    // Header note removed by owner call — the modal keeps its explanation.
    expect(screen.queryByText(/Shares are of all 314 visitors/)).toBeNull()
  })

  it('arms the full-list fetch with filters as soon as the list overflows', () => {
    render(<TopReferrers referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} filters="page:is:/" />)
    // 8 rows > LIMIT 7 — no interaction needed.
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      'referrers', 'site-1', '2026-07-20', '2026-08-18', 100, 'page:is:/',
    )
  })

  it('never arms the fetch on the share surface, but still pages its payload', () => {
    render(<TopReferrers referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} memberFeatures={false} />)
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      null, 'site-1', '2026-07-20', '2026-08-18', 100, undefined,
    )
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Startpage')).toBeTruthy()
  })

  it('falls back to paging the fan-out rows when the full-list fetch fails', () => {
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { data: undefined, error: new Error('boom'), isLoading: false, mutate: vi.fn() } : idle)
    render(<TopReferrers referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} />)
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Startpage')).toBeTruthy()
  })

  // The frozen-blocks bug (01-09-2026): full-list rows retained from another
  // range must never outrank a fan-out that no longer overflows.
  it('ignores leftover full-list rows when the list no longer overflows', () => {
    useFullDimensionList.mockImplementation(() => ({ ...idle, data: referrers }))
    render(<TopReferrers referrers={referrers.slice(0, 4)} siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(screen.getByText('Google')).toBeTruthy()
    expect(screen.queryByText('Startpage')).toBeNull()
    expect(screen.queryByLabelText('Next page')).toBeNull()
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

  it('arms the full-list fetch with the 250 limit and filters on overflow', () => {
    render(<Audience {...baseProps} totals={totals} filters="browser:is:Chrome" />)
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      'countries', 'site-1', '2026-07-20', '2026-08-18', 250, 'browser:is:Chrome',
    )
  })

  it('never arms the fetch on the share surface, but still pages its payload', () => {
    render(<Audience {...baseProps} totals={totals} memberFeatures={false} />)
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      null, 'site-1', '2026-07-20', '2026-08-18', 250, undefined,
    )
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Spain')).toBeTruthy()
  })

  it('falls back to paging the fan-out rows when the full-list fetch fails', () => {
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { data: undefined, error: new Error('boom'), isLoading: false, mutate: vi.fn() } : idle)
    render(<Audience {...baseProps} totals={totals} />)
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Spain')).toBeTruthy()
  })

  it('ignores leftover full-list rows when the list no longer overflows', () => {
    useFullDimensionList.mockImplementation(() => ({ ...idle, data: countries }))
    render(<Audience {...baseProps} countries={countries.slice(0, 4)} totals={totals} />)
    expect(screen.getByText('United States')).toBeTruthy()
    expect(screen.queryByText('Spain')).toBeNull()
    expect(screen.queryByLabelText('Next page')).toBeNull()
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

  it('arms the full-list fetch on overflow and pages the mapped raw rows', () => {
    const fullList = [
      ...browsers.map(b => ({ ...b })),
      { browser: 'Arc', pageviews: 2, visitors: 1 }, { browser: 'Ladybird', pageviews: 1, visitors: 1 },
    ]
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { ...idle, data: fullList } : idle)
    render(<TechSpecs {...baseProps} totals={totals} filters="country:is:DE" />)
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      'browsers', 'site-1', '2026-07-20', '2026-08-18', 100, 'country:is:DE',
    )
    // 10 mapped rows → page 2 carries the tail the card never showed before.
    expect(screen.queryByText('Ladybird')).toBeNull()
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Ladybird')).toBeTruthy()
  })

  it('falls back to paging the fan-out rows when the full-list fetch fails', () => {
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { data: undefined, error: new Error('boom'), isLoading: false, mutate: vi.fn() } : idle)
    render(<TechSpecs {...baseProps} totals={totals} />)
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Vivaldi')).toBeTruthy()
  })

  it('ignores leftover full-list rows when the list no longer overflows', () => {
    useFullDimensionList.mockImplementation(() => ({ ...idle, data: browsers }))
    render(<TechSpecs {...baseProps} browsers={browsers.slice(0, 4)} totals={totals} />)
    expect(screen.getByText('Chrome')).toBeTruthy()
    expect(screen.queryByText('Vivaldi')).toBeNull()
    expect(screen.queryByLabelText('Next page')).toBeNull()
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
  it('keys its request on the resolved dates AND the period token', () => {
    // Dates alone are only a sufficient identity for day-granular ranges: a
    // sub-day rolling window that crosses midnight resolves to TWO whole
    // days of dates (04-09-2026 — yesterday's campaigns on the 1h view).
    render(<Campaigns siteId="site-1" dateRange={dateRange} period="1h" totals={totals} />)
    expect(useCampaignsList).toHaveBeenCalledWith(
      'site-1', dateRange.start, dateRange.end, 10, undefined, true, '1h',
    )
  })

  // The share surface's diet: rows arrive on the floored dashboard payload,
  // and the `campaigns` prop must keep BOTH member-only fetches unarmed —
  // every hook call carries enabled=false, so no request can ever leave a
  // share view for an endpoint that would 403 it.
  it('payload rows keep the member-only endpoint unarmed', () => {
    useCampaignsList.mockClear()
    render(
      <Campaigns siteId="site-1" dateRange={dateRange} totals={totals} campaigns={CAMPAIGN_ROWS} />,
    )
    expect(useCampaignsList).toHaveBeenCalled()
    for (const call of useCampaignsList.mock.calls) {
      expect(call[5]).toBe(false)
    }
    // And the payload rows actually render.
    expect(screen.queryByText(/No UTM data yet/)).toBeNull()
  })

  // 05-09-2026: the card's own CSV export and the in-dashboard UTM builder are
  // gone (owner ruling). The header holds the five dimension tabs and the unit
  // label, nothing else, and the empty state carries no builder action. The
  // public /tools/utm-builder page is a separate component and is untouched.
  it('offers neither an Export nor a Build URL action, with rows or without', () => {
    const { unmount } = render(<Campaigns siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Build URL' })).toBeNull()
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    unmount()

    useCampaignsList.mockReturnValue({
      data: [], error: undefined, isLoading: false, mutate: vi.fn(),
    })
    render(<Campaigns siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(screen.getByText(/No UTM data yet/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Build a UTM URL/ })).toBeNull()
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

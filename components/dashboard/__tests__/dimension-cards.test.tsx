import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import Sources from '@/components/dashboard/Sources'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import GoalStats from '@/components/dashboard/GoalStats'
import Outbound from '@/components/dashboard/Outbound'

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
// Outbound reads two property lists through one hook; pin the hook so the
// card's grouping, share denominator and honesty labels are testable offline.
const useOutboundLinks = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useFullDimensionList: (...args: unknown[]) => useFullDimensionList(...args),
  useCampaignsList: (...args: unknown[]) => useCampaignsList(...args),
  useOutboundLinks: (...args: unknown[]) => useOutboundLinks(...args),
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
  // Sources always calls the campaigns hook (armed only on its Campaigns
  // view), so every block needs an idle return, not just the campaigns one.
  useCampaignsList.mockReset().mockReturnValue(idle)
})

describe('Sources — referrers view', () => {
  const referrers = [
    { referrer: 'google.com', pageviews: 142, visitors: 97 }, { referrer: 'linkedin.com', pageviews: 43, visitors: 30 },
    { referrer: 'chatgpt.com', pageviews: 11, visitors: 8 }, { referrer: 'bing.com', pageviews: 5, visitors: 3 },
    { referrer: 'ddg.gg', pageviews: 4, visitors: 3 }, { referrer: 'x.com', pageviews: 3, visitors: 2 },
    { referrer: 'reddit.com', pageviews: 2, visitors: 2 }, { referrer: 'startpage.com', pageviews: 1, visitors: 1 },
  ]

  it('divides by the true visitor total (97/314 = 31%), not the row sum (97/145 = 67%)', () => {
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(screen.getByText('31%')).toBeTruthy()
    expect(screen.queryByText('67%')).toBeNull()
    // Header note removed by owner call — the modal keeps its explanation.
    expect(screen.queryByText(/Shares are of all 314 visitors/)).toBeNull()
  })

  it('arms the full-list fetch with filters as soon as the list overflows', () => {
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} filters="page:is:/" />)
    // 8 rows > LIMIT 7 — no interaction needed.
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      'referrers', 'site-1', '2026-07-20', '2026-08-18', 100, 'page:is:/',
    )
  })

  it('never arms the fetch on the share surface, but still pages its payload', () => {
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} memberFeatures={false} />)
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      null, 'site-1', '2026-07-20', '2026-08-18', 100, undefined,
    )
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Startpage')).toBeTruthy()
  })

  it('falls back to paging the fan-out rows when the full-list fetch fails', () => {
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { data: undefined, error: new Error('boom'), isLoading: false, mutate: vi.fn() } : idle)
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} />)
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Startpage')).toBeTruthy()
  })

  // The frozen-blocks bug (01-09-2026): full-list rows retained from another
  // range must never outrank a fan-out that no longer overflows.
  it('ignores leftover full-list rows when the list no longer overflows', () => {
    useFullDimensionList.mockImplementation(() => ({ ...idle, data: referrers }))
    render(<Sources referrers={referrers.slice(0, 4)} siteId="site-1" dateRange={dateRange} totals={totals} />)
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

describe('Sources — campaigns view', () => {
  // The Campaigns card folded into Sources (owner pick BH, 06-09-2026): the
  // UTM rows live behind the third view, so every case opens it first. The
  // campaigns hook is armed only while that view is open.
  const Campaigns = (props: Omit<React.ComponentProps<typeof Sources>, 'referrers'>) => (
    <Sources referrers={[]} {...props} />
  )
  const openCampaigns = () => fireEvent.click(screen.getByRole('radio', { name: 'Campaigns' }))
  beforeEach(() => {
    useCampaignsList.mockReturnValue({
      data: CAMPAIGN_ROWS, error: undefined, isLoading: false, mutate: vi.fn(),
    })
  })

  it('divides by the true visitor total (157/314 = 50%), not the row sum (157/188 = 84%)', async () => {
    render(<Campaigns siteId="site-1" dateRange={dateRange} totals={totals} />)
    openCampaigns()
    expect(await screen.findByText('50%')).toBeTruthy()
    expect(screen.queryByText('84%')).toBeNull()
    expect(screen.queryByText(/share of 314 visitors/)).toBeNull()
  })

  it('renders NO percentages without totals', async () => {
    render(<Campaigns siteId="site-1" dateRange={dateRange} />)
    openCampaigns()
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
    openCampaigns()
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
    openCampaigns()
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
    openCampaigns()
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
    openCampaigns()
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
    openCampaigns()
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Build URL' })).toBeNull()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    unmount()

    useCampaignsList.mockReturnValue({
      data: [], error: undefined, isLoading: false, mutate: vi.fn(),
    })
    render(<Campaigns siteId="site-1" dateRange={dateRange} totals={totals} />)
    openCampaigns()
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

describe('Outbound', () => {
  const lists = {
    urls: [
      { value: 'https://pulse.ciphera.net/', count: 12 },
      { value: 'https://www.linkedin.com/company/ciphera/', count: 3 },
      { value: 'https://pulse.ciphera.net/login', count: 2 },
      { value: 'https://github.com/ciphera-net/pulse', count: 2 },
      { value: 'https://github.com/ciphera-net', count: 1 },
    ],
    paths: [
      { value: '/products/pulse', count: 13 },
      { value: '/', count: 5 },
    ],
  }
  const goalCounts = [{ event_name: 'outbound_link', count: 20, visitors: 14 }]
  const baseProps = { siteId: 'site-1', dateRange, goalCounts }

  it('groups links by host (www stripped) and shows CLICKS, with the share of ALL clicks on hover', () => {
    useOutboundLinks.mockReturnValue({ data: lists, error: undefined, isLoading: false })
    render(<Outbound {...baseProps} />)
    // pulse.ciphera.net = 12 + 2, github.com = 2 + 1, linkedin.com = 3 (www. stripped)
    expect(screen.getByText('pulse.ciphera.net')).toBeTruthy()
    expect(screen.getByText('14')).toBeTruthy()
    expect(screen.getByText('github.com')).toBeTruthy()
    expect(screen.getByText('linkedin.com')).toBeTruthy()
    expect(screen.queryByText('www.linkedin.com')).toBeNull()
    // 14 of 20 clicks = 70% — the denominator is every click, not the visible rows.
    expect(screen.getByText('70%')).toBeTruthy()
    expect(screen.getByTestId('metric-unit').textContent).toBe('clicks')
    // The unit lives in the header. There is no footnote restating it — see the
    // dedicated test below.
    expect(screen.queryByTestId('outbound-footnote')).toBeNull()
  })

  it('divides by the goal count (every click in the range), not by the capped rows it received', () => {
    // 20 clicks in the rows, 25 on the goal count: a site with more distinct
    // destinations than the row limit must not inflate every share.
    useOutboundLinks.mockReturnValue({ data: lists, error: undefined, isLoading: false })
    render(<Outbound {...baseProps} goalCounts={[{ event_name: 'outbound_link', count: 25, visitors: 14 }]} />)
    expect(screen.getByText('56%')).toBeTruthy() // 14 / 25
    expect(screen.queryByText('70%')).toBeNull()
  })

  it('falls back to the summed rows when the goal count is not on the payload', () => {
    useOutboundLinks.mockReturnValue({ data: lists, error: undefined, isLoading: false })
    render(<Outbound {...baseProps} goalCounts={[]} />)
    expect(screen.getByText('70%')).toBeTruthy() // 14 / 20
    expect(screen.queryByTestId('outbound-footnote')).toBeNull()
  })

  it('the Links view keeps one row per link, opens it in a new tab, and dims the path', () => {
    useOutboundLinks.mockReturnValue({ data: lists, error: undefined, isLoading: false })
    render(<Outbound {...baseProps} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Links' }))
    const link = screen.getByTitle('https://github.com/ciphera-net/pulse') as HTMLElement
    const anchor = link.closest('a') as HTMLAnchorElement
    expect(anchor.getAttribute('href')).toBe('https://github.com/ciphera-net/pulse')
    expect(anchor.getAttribute('target')).toBe('_blank')
    expect(anchor.getAttribute('rel')).toContain('noopener')
    expect(link.textContent).toBe('github.com/ciphera-net/pulse')
    expect(screen.getAllByText('12')).toHaveLength(1)
  })

  it('the From page view filters the dashboard by the page the click happened on', () => {
    useOutboundLinks.mockReturnValue({ data: lists, error: undefined, isLoading: false })
    const onFilter = vi.fn()
    render(<Outbound {...baseProps} onFilter={onFilter} />)
    fireEvent.click(screen.getByRole('radio', { name: 'From page' }))
    fireEvent.click(screen.getByText('/products/pulse'))
    expect(onFilter).toHaveBeenCalledWith({ dimension: 'page', operator: 'is', values: ['/products/pulse'] })
  })

  it('says it is whole-site under page filters instead of pretending the rows are filtered', () => {
    useOutboundLinks.mockReturnValue({ data: lists, error: undefined, isLoading: false })
    render(<Outbound {...baseProps} filters="country:is:DE" />)
    expect(screen.getByTestId('outbound-footnote').textContent).toMatch(/not filtered yet/)
    expect(screen.queryByText(/of visitors left through a link/)).toBeNull()
  })

  // ── The footnote (owner, 10-09-2026) ──────────────────────────────────────
  // "i wanna get rid of 4% of visitors left through a link · clicks, not people
  // — a visitor who clicked twice counts twice". The unit is stated once, in the
  // header, and the paragraph under the rows is gone.
  it('shows NO footnote when the card is answering the question that was asked', () => {
    useOutboundLinks.mockReturnValue({ data: lists, error: undefined, isLoading: false })
    render(<Outbound {...baseProps} />)
    expect(screen.queryByTestId('outbound-footnote')).toBeNull()
    expect(screen.queryByText(/of visitors left through a link/)).toBeNull()
    expect(screen.queryByText(/clicks, not people/i)).toBeNull()
    expect(screen.queryByText(/counts twice/i)).toBeNull()
    // The unit still has exactly one home.
    expect(screen.getByTestId('metric-unit').textContent).toBe('clicks')
  })

  // ── Pagination (owner, 10-09-2026: "make sure the users can also click through
  // multiple pages of options in the outbound block like the other blocks") ────
  // The card pages at 7 rows like every other dimension card. It was never
  // broken — the pager correctly renders nothing at a single page, and the sites
  // it was looked at had 7 destinations or fewer. These pin it so a regression
  // is a red test rather than another report.
  const manyLists = {
    urls: Array.from({ length: 18 }, (_, i) => ({ value: `https://dest-${i}.example/x`, count: 18 - i })),
    paths: Array.from({ length: 12 }, (_, i) => ({ value: `/page-${i}`, count: 12 - i })),
  }

  it('pages through the rows, seven at a time, on every view', () => {
    useOutboundLinks.mockReturnValue({ data: manyLists, error: undefined, isLoading: false })
    render(<Outbound {...baseProps} />)

    // Domains: 18 distinct hosts → 3 pages.
    const pager = screen.getByRole('navigation', { name: /Pages of domains/i })
    expect(pager).toBeTruthy()
    expect(screen.getByText('dest-0.example')).toBeTruthy()
    expect(screen.queryByText('dest-7.example')).toBeNull()

    fireEvent.click(within(pager).getByRole('button', { name: 'Page 2' }))
    expect(screen.getByText('dest-7.example')).toBeTruthy()
    expect(screen.queryByText('dest-0.example')).toBeNull()

    // From page: 12 paths → 2 pages, and switching views starts at page 1.
    fireEvent.click(screen.getByRole('radio', { name: 'From page' }))
    expect(screen.getByText('/page-0')).toBeTruthy()
    const pagesPager = screen.getByRole('navigation', { name: /Pages of pages/i })
    fireEvent.click(within(pagesPager).getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('/page-7')).toBeTruthy()
  })

  it('renders no pager when everything fits on one page', () => {
    useOutboundLinks.mockReturnValue({ data: lists, error: undefined, isLoading: false })
    render(<Outbound {...baseProps} />)
    // 3 hosts — a pager here would be chrome with nothing to do.
    expect(screen.queryByRole('navigation', { name: /Pages of/i })).toBeNull()
  })

  it('states an ERROR rather than claiming there are no clicks', () => {
    useOutboundLinks.mockReturnValue({ data: undefined, error: new Error('500'), isLoading: false })
    const { unmount } = render(<Outbound {...baseProps} />)
    expect(screen.getByText(/Couldn’t load outbound links/)).toBeTruthy()
    expect(screen.queryByText(/No outbound clicks yet/)).toBeNull()
    unmount()
    // A failed revalidation after an EMPTY first fetch leaves stale empty
    // lists behind — still an error, never the empty state.
    useOutboundLinks.mockReturnValue({ data: { urls: [], paths: [] }, error: new Error('502'), isLoading: false })
    render(<Outbound {...baseProps} />)
    expect(screen.getByText(/Couldn’t load outbound links/)).toBeTruthy()
    expect(screen.queryByText(/No outbound clicks yet/)).toBeNull()
  })

  it('keeps stale rows on screen through a failed revalidation', () => {
    useOutboundLinks.mockReturnValue({ data: lists, error: new Error('502'), isLoading: false })
    render(<Outbound {...baseProps} />)
    expect(screen.getByText('pulse.ciphera.net')).toBeTruthy()
    expect(screen.queryByText(/Couldn’t load outbound links/)).toBeNull()
  })

  it('shows the empty state for a range with no outbound clicks, and nothing while loading', () => {
    useOutboundLinks.mockReturnValue({ data: undefined, error: undefined, isLoading: true })
    const { unmount } = render(<Outbound {...baseProps} />)
    expect(screen.queryByText(/No outbound clicks yet/)).toBeNull()
    unmount()
    useOutboundLinks.mockReturnValue({ data: { urls: [], paths: [] }, error: undefined, isLoading: false })
    render(<Outbound {...baseProps} />)
    expect(screen.getByText(/No outbound clicks yet/)).toBeTruthy()
  })

  it('keys its request on the resolved dates AND the period token', () => {
    useOutboundLinks.mockReturnValue({ data: lists, error: undefined, isLoading: false })
    render(<Outbound {...baseProps} period="30d" />)
    expect(useOutboundLinks).toHaveBeenCalledWith('site-1', dateRange.start, dateRange.end, '30d')
  })
})

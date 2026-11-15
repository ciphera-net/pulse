import { describe, it, expect, vi, beforeEach } from 'vitest'

// The page's filters on the two event-property reads (15-11-2026).
//
// The dashboard's events list is filtered by the server. An opened event's properties were not: neither read sent
// the page's filters (and the server took none), so under a filter a row read 1,217 and the values under it added
// up to 2,019, the whole site's. These pin the wire: given the filters, both fetchers send them as `filters=`,
// byte for byte as the dashboard read sends them; given none, the request is exactly what it was.

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const stats = await import('../stats')

function lastUrl(spy: ReturnType<typeof vi.fn>): URL {
  const [url] = spy.mock.calls.at(-1) as [string, RequestInit]
  return new URL(url, 'https://pulse-api.example')
}

// A value with every character the format escapes or the URL would mangle.
const FILTERS = 'v2:device|is|mobile;tablet,page|contains|/pricing%2Cplans'

describe("the page's filters on the event-property reads", () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy = vi.fn().mockImplementation(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchSpy)
  })

  it('the keys read sends them', async () => {
    await stats.getEventPropertyKeys('site-1', 'add_to_cart', '2026-10-17', '2026-11-15', undefined, FILTERS)
    const url = lastUrl(fetchSpy)
    expect(url.pathname).toContain('/sites/site-1/goals/add_to_cart/properties')
    expect(url.searchParams.get('filters')).toBe(FILTERS)
    expect(url.searchParams.get('start_date')).toBe('2026-10-17')
    expect(url.searchParams.get('end_date')).toBe('2026-11-15')
  })

  it('the values read sends them', async () => {
    await stats.getEventPropertyValues('site-1', 'add_to_cart', 'category', '2026-10-17', '2026-11-15', 20, undefined, undefined, FILTERS)
    const url = lastUrl(fetchSpy)
    expect(url.pathname).toContain('/sites/site-1/goals/add_to_cart/properties/category')
    expect(url.searchParams.get('filters')).toBe(FILTERS)
    expect(url.searchParams.get('limit')).toBe('20')
  })

  it('in a live window they travel with minutes=, as on the dashboard read', async () => {
    await stats.getEventPropertyKeys('site-1', 'add_to_cart', '2026-11-15', '2026-11-15', 5, FILTERS)
    let url = lastUrl(fetchSpy)
    expect(url.searchParams.get('minutes')).toBe('5')
    expect(url.searchParams.get('filters')).toBe(FILTERS)
    expect(url.searchParams.has('start_date')).toBe(false)

    await stats.getEventPropertyValues('site-1', 'add_to_cart', 'category', '2026-11-15', '2026-11-15', 20, undefined, 5, FILTERS)
    url = lastUrl(fetchSpy)
    expect(url.searchParams.get('minutes')).toBe('5')
    expect(url.searchParams.get('filters')).toBe(FILTERS)
  })

  it('with no filters the requests are what they were (the control)', async () => {
    await stats.getEventPropertyKeys('site-1', 'add_to_cart', '2026-10-17', '2026-11-15')
    expect(lastUrl(fetchSpy).search).toBe('?start_date=2026-10-17&end_date=2026-11-15')
    await stats.getEventPropertyValues('site-1', 'add_to_cart', 'category', '2026-10-17', '2026-11-15')
    expect(lastUrl(fetchSpy).search).toBe('?start_date=2026-10-17&end_date=2026-11-15&limit=20')
    // An empty string is no filter: the dashboard hands `filtersParam || undefined`, and a bare `filters=` would
    // be a parameter the server has to parse for nothing.
    await stats.getEventPropertyKeys('site-1', 'add_to_cart', '2026-10-17', '2026-11-15', undefined, '')
    expect(lastUrl(fetchSpy).searchParams.has('filters')).toBe(false)
  })

  it('the Outbound lists still send none: their footnote says they are whole-site clicks', async () => {
    // lib/swr/dashboard.ts calls the values read for outbound_link with no filters argument. This pins that the
    // argument is the LAST one, so those calls did not start sending something by position.
    await stats.getEventPropertyValues('site-1', 'outbound_link', 'url', '2026-10-17', '2026-11-15', 1000, '30d', undefined)
    const url = lastUrl(fetchSpy)
    expect(url.searchParams.has('filters')).toBe(false)
    expect(url.searchParams.get('period')).toBe('30d')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// PULSE-192: in realtime mode the KPI rail reads /dashboard?minutes=5, but every list a
// card fetched on its own (the full list behind its pagination, Outbound's two lists,
// Campaigns, a goal's property breakdown, the filter suggestions) was sent the calendar
// dates of the live view, i.e. today: a customer saw 510 visitors in the rail and one
// referrer with 9,640 below it. These pin the wire: with a live window, every one of
// those fetchers sends minutes= and NEITHER the dates NOR a period (the server refuses
// the combination); without one, the request is exactly what it was.

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const stats = await import('../stats')

const LIST_FETCHERS = [
  ['getTopPages', '/pages'], ['getTopReferrers', '/referrers'], ['getCountries', '/countries'],
  ['getCities', '/cities'], ['getRegions', '/regions'], ['getBrowsers', '/browsers'], ['getOS', '/os'],
  ['getDevices', '/devices'], ['getEntryPages', '/entry-pages'], ['getExitPages', '/exit-pages'],
  ['getScreenResolutions', '/screen-resolutions'], ['getLanguages', '/languages'], ['getTimezones', '/timezones'],
  ['getLanguageGroups', '/languages'], ['getCampaigns', '/campaigns'],
] as const

type ListFetcher = (siteId: string, start?: string, end?: string, limit?: number, filters?: string, period?: string, minutes?: number) => Promise<unknown[]>

function lastUrl(spy: ReturnType<typeof vi.fn>): URL {
  const [url] = spy.mock.calls.at(-1) as [string, RequestInit]
  return new URL(url, 'https://pulse-api.example')
}

describe('live window on the per-card list fetchers (PULSE-192)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy = vi.fn().mockImplementation(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchSpy)
  })

  it.each(LIST_FETCHERS)('%s sends minutes=5 and no dates or period in live mode', async (name, path) => {
    await (stats[name] as ListFetcher)('site-1', '2026-10-01', '2026-10-01', 100, undefined, undefined, 5)
    const url = lastUrl(fetchSpy)
    expect(url.pathname).toContain(`/sites/site-1${path}`)
    expect(url.searchParams.get('minutes')).toBe('5')
    expect(url.searchParams.has('start_date')).toBe(false)
    expect(url.searchParams.has('end_date')).toBe(false)
    expect(url.searchParams.has('period')).toBe(false)
    expect(url.searchParams.get('limit')).toBe('100')
  })

  it.each(LIST_FETCHERS)('%s is unchanged without a live window (dates, no minutes)', async (name) => {
    await (stats[name] as ListFetcher)('site-1', '2026-09-01', '2026-09-30', 100)
    const url = lastUrl(fetchSpy)
    expect(url.searchParams.get('start_date')).toBe('2026-09-01')
    expect(url.searchParams.get('end_date')).toBe('2026-09-30')
    expect(url.searchParams.has('minutes')).toBe(false)
  })

  it('keeps filters alongside the live window', async () => {
    await stats.getCountries('site-1', '2026-10-01', '2026-10-01', 250, 'v2:browser|is|Firefox', undefined, 5)
    const url = lastUrl(fetchSpy)
    expect(url.searchParams.get('minutes')).toBe('5')
    expect(url.searchParams.get('filters')).toBe('v2:browser|is|Firefox')
  })

  it('event-property values (Outbound, goal breakdowns) send minutes=5 and no dates or period', async () => {
    await stats.getEventPropertyValues('site-1', 'outbound_link', 'url', '2026-10-01', '2026-10-01', 1000, undefined, 5)
    const url = lastUrl(fetchSpy)
    expect(url.pathname).toContain('/sites/site-1/goals/outbound_link/properties/url')
    expect(url.searchParams.get('minutes')).toBe('5')
    expect(url.searchParams.has('start_date')).toBe(false)
    expect(url.searchParams.has('period')).toBe(false)
  })

  it('event-property keys (goal breakdowns) send minutes=5 and no dates', async () => {
    await stats.getEventPropertyKeys('site-1', 'signup', '2026-10-01', '2026-10-01', 5)
    const url = lastUrl(fetchSpy)
    expect(url.pathname).toContain('/sites/site-1/goals/signup/properties')
    expect(url.searchParams.get('minutes')).toBe('5')
    expect(url.searchParams.has('start_date')).toBe(false)
  })
})

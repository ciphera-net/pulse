import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { SiteScopeProvider, memberScope, SITE_PAGES, type SiteScope } from '@/lib/scope/SiteScope'
import { markTeamResolved, setAccessToken, setActiveTeam } from '@/lib/api/client'
import { useFilterSuggestions } from '../useFilterSuggestions'

// PUL-34 Phase 2: the filter builder's value lists read through the nearest site scope. On the sample site
// they are the same breakdown routes as the member's, under /public; on a share link there is no filtering at
// all, so asking is an error the picker shows, not an empty list that reads as "nothing to suggest".

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

let fetchSpy: ReturnType<typeof vi.fn>
let seq = 0
const nextId = () => `suggest-site-${++seq}`

const demoScope = (siteId: string): SiteScope => ({
  siteId, mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full',
})
const linkScope = (siteId: string): SiteScope => ({
  siteId, mode: 'public', basePath: `/share/${siteId}`, pages: ['dashboard'], demo: false, fidelity: 'scoped',
})

function wrapperFor(scope: SiteScope | null) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    scope ? <SiteScopeProvider scope={scope}>{children}</SiteScopeProvider> : <>{children}</>
  return Wrapper
}

const RANGE = { start: '2026-10-01', end: '2026-10-07' }

function sent() {
  const [url, init] = fetchSpy.mock.calls.at(-1) as [string, RequestInit]
  return { endpoint: url.slice(url.indexOf('/api/v1') + '/api/v1'.length), headers: (init.headers ?? {}) as Record<string, string> }
}

beforeEach(() => {
  fetchSpy = vi.fn().mockImplementation(async (url: string) => {
    const body = url.includes('/journeys/entry-points')
      ? { entry_points: [{ path: '/pricing', session_count: 4 }] }
      : { pages: [{ path: '/pricing', pageviews: 9, visitors: 5 }] }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchSpy)
  markTeamResolved()
  setAccessToken('member-token')
  setActiveTeam('team-1')
})

afterEach(() => {
  setAccessToken(null)
  setActiveTeam(null)
  vi.unstubAllGlobals()
})

describe('useFilterSuggestions reads through the nearest site scope', () => {
  it('reads the member routes, with the session, for a member', async () => {
    const id = nextId()
    const { result } = renderHook(() => useFilterSuggestions(id, RANGE, undefined, '30d'), { wrapper: wrapperFor(memberScope(id)) })
    await expect(result.current('page')).resolves.toEqual([{ value: '/pricing', label: '/pricing', count: 9 }])
    expect(sent().endpoint).toBe(`/sites/${id}/pages?period=30d&limit=100`)
    expect(sent().headers['Authorization']).toBe('Bearer member-token')
  })

  it('reads the same routes under /public, with no credential, on the sample site', async () => {
    const id = nextId()
    const { result } = renderHook(() => useFilterSuggestions(id, RANGE, undefined, '30d'), { wrapper: wrapperFor(demoScope(id)) })
    await expect(result.current('page')).resolves.toEqual([{ value: '/pricing', label: '/pricing', count: 9 }])
    expect(sent().endpoint).toBe(`/public/sites/${id}/pages?period=30d&limit=100`)
    expect(Object.keys(sent().headers).map((h) => h.toLowerCase())).not.toContain('authorization')

    await expect(result.current('entry_path')).resolves.toEqual([{ value: '/pricing', label: '/pricing', count: 4 }])
    expect(sent().endpoint).toBe(`/public/sites/${id}/journeys/entry-points?period=30d`)
  })

  it('refuses on a share link, loudly, and makes no request', async () => {
    const id = nextId()
    const { result } = renderHook(() => useFilterSuggestions(id, RANGE, undefined, '30d'), { wrapper: wrapperFor(linkScope(id)) })
    await expect(result.current('page')).rejects.toThrow(/not available on this shared view/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('gives a city and a region their country, for the flag the Filter menu draws (16-11-2026)', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      const body = url.includes('/cities')
        ? { cities: [{ city: 'Oslo', country: 'NO', pageviews: 9, visitors: 5 }, { city: 'Atlantis', country: '', pageviews: 1, visitors: 1 }] }
        : { regions: [{ region: 'Viken', country: 'NO', pageviews: 4, visitors: 3 }] }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const id = nextId()
    const { result } = renderHook(() => useFilterSuggestions(id, RANGE, undefined, '30d'), { wrapper: wrapperFor(memberScope(id)) })
    // A row with no country carries no country key at all.
    await expect(result.current('city')).resolves.toStrictEqual([
      { value: 'Oslo', label: 'Oslo', count: 9, country: 'NO' },
      { value: 'Atlantis', label: 'Atlantis', count: 1 },
    ])
    await expect(result.current('region')).resolves.toStrictEqual([{ value: 'Viken', label: 'Viken', count: 4, country: 'NO' }])
  })

  it('reads the event filter\'s kinds (R45): the events with their names, an outbound link as the Outbound tab writes it', async () => {
    const { OUTBOUND_KIND, eventPropertyKind } = await import('@/lib/filters')
    fetchSpy.mockImplementation(async (url: string) => {
      const body = url.includes('/goals/stats')
        ? { goal_counts: [{ event_name: 'outbound_link', count: 7, visitors: 5 }, { event_name: 'sign_up', count: 3, visitors: 3 }, { event_name: '(other)', count: 1, visitors: 1 }] }
        : url.includes('/properties/url')
          ? { values: [{ value: 'https://www.github.com/ciphera', count: 4 }, { value: 'javascript:void(0)', count: 1 }] }
          : { values: [{ value: 'pro', count: 2 }] }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const id = nextId()
    const filters = 'v2:country|is|NO'
    const { result } = renderHook(() => useFilterSuggestions(id, RANGE, filters, '30d'), { wrapper: wrapperFor(memberScope(id)) })
    await expect(result.current('event')).resolves.toEqual([
      { value: 'outbound_link', label: 'Outbound clicks', count: 7 },
      { value: 'sign_up', label: 'Sign up', count: 3 },
    ])
    expect(sent().endpoint).toBe(`/sites/${id}/goals/stats?period=30d&limit=100&filters=${encodeURIComponent(filters)}`)
    // The stored address stays the value the filter matches; a link that opens no page is not offered.
    await expect(result.current(OUTBOUND_KIND)).resolves.toEqual([{ value: 'https://www.github.com/ciphera', label: 'github.com/ciphera', count: 4 }])
    expect(sent().endpoint).toContain(`/sites/${id}/goals/outbound_link/properties/url?`)
    await expect(result.current(eventPropertyKind('signup', 'plan'))).resolves.toEqual([{ value: 'pro', label: 'pro', count: 2 }])
    expect(sent().endpoint).toContain(`/sites/${id}/goals/signup/properties/plan?`)
  })

  it('still answers [] before there is a range, in every scope', async () => {
    const id = nextId()
    const { result } = renderHook(() => useFilterSuggestions(id, null), { wrapper: wrapperFor(demoScope(id)) })
    await expect(result.current('page')).resolves.toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('useFilterSuggestions for Event property (R45, design section 8)', () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

  it('reads an event\'s keys with the page\'s period and filters, named and ordered as the Events block\'s tabs', async () => {
    const { propertyKeysScope } = await import('@/lib/filters')
    fetchSpy.mockImplementation(async () => json({ keys: [{ key: 'page_path', count: 30 }, { key: 'url', count: 30 }] }))
    const id = nextId()
    const filters = 'v2:country|is|NO'
    const { result } = renderHook(() => useFilterSuggestions(id, RANGE, filters, 'all'), { wrapper: wrapperFor(memberScope(id)) })
    // An automatic event's keys in reading order: what was pressed first, the page it was pressed on last.
    await expect(result.current(propertyKeysScope('outbound_link'))).resolves.toEqual([
      { value: 'url', label: 'Link', count: 30 },
      { value: 'page_path', label: 'Page', count: 30 },
    ])
    // All time travels as its token: sent as its dates, a history past 366 days is refused.
    expect(sent().endpoint).toBe(`/sites/${id}/goals/outbound_link/properties?period=all&filters=${encodeURIComponent(filters)}`)
    fetchSpy.mockImplementation(async () => json({ keys: [{ key: 'billing_cycle', count: 4 }] }))
    await expect(result.current(propertyKeysScope('signup'))).resolves.toEqual([{ value: 'billing_cycle', label: 'Billing cycle', count: 4 }])
  })

  it('sends the live window, never a period, in realtime', async () => {
    const { propertyKeysScope } = await import('@/lib/filters')
    fetchSpy.mockImplementation(async () => json({ keys: [] }))
    const id = nextId()
    const { result } = renderHook(() => useFilterSuggestions(id, RANGE, undefined, 'today', 30), { wrapper: wrapperFor(memberScope(id)) })
    await result.current(propertyKeysScope('signup'))
    expect(sent().endpoint).toContain('minutes=30')
    expect(sent().endpoint).not.toContain('period=')
  })

  it('offers stored values that read the same as one suggestion carrying all of them', async () => {
    const { OUTBOUND_KIND, eventPropertyKind } = await import('@/lib/filters')
    fetchSpy.mockImplementation(async (url: string) =>
      json({
        values: url.includes('/outbound_link/')
          ? [{ value: 'https://github.com/ciphera', count: 4 }, { value: 'http://www.github.com/ciphera', count: 2 }, { value: 'https://docs.example/x', count: 1 }]
          : [{ value: 'https://www.example.com/a.pdf', count: 5 }, { value: 'http://example.com/a.pdf/', count: 2 }, { value: 'Pro', count: 1 }],
      }),
    )
    const id = nextId()
    const { result } = renderHook(() => useFilterSuggestions(id, RANGE, undefined, '30d'), { wrapper: wrapperFor(memberScope(id)) })
    await expect(result.current(OUTBOUND_KIND)).resolves.toStrictEqual([
      { value: 'https://github.com/ciphera', label: 'github.com/ciphera', count: 6, values: ['https://github.com/ciphera', 'http://www.github.com/ciphera'] },
      { value: 'https://docs.example/x', label: 'docs.example/x', count: 1 },
    ])
    await expect(result.current(eventPropertyKind('file_download', 'url'))).resolves.toStrictEqual([
      { value: 'https://www.example.com/a.pdf', label: 'example.com/a.pdf', count: 7, values: ['https://www.example.com/a.pdf', 'http://example.com/a.pdf/'] },
      { value: 'Pro', label: 'Pro', count: 1 },
    ])
  })
})

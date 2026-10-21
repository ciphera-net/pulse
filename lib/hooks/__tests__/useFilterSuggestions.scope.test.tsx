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

  it('still answers [] before there is a range, in every scope', async () => {
    const id = nextId()
    const { result } = renderHook(() => useFilterSuggestions(id, null), { wrapper: wrapperFor(demoScope(id)) })
    await expect(result.current('page')).resolves.toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

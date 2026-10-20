import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { SiteScopeProvider, memberScope, SITE_PAGES, type SiteScope } from '@/lib/scope/SiteScope'
import { isLiveListKey, LIVE_LIST_KEY, useDashboard, useInstallStatus, usePagePreview, usePerformanceLatest, useSite, useVisitors, useFunnels } from '@/lib/swr/dashboard'
import { markTeamResolved, setAccessToken, setActiveTeam } from '@/lib/api/client'
import { publicSiteRef } from '@/lib/scope/site-ref'

// PUL-34 Phase 2 (data layer), against the REAL swr and the REAL client (only fetch is stubbed):
// what actually goes on the wire under each scope, and what a hook whose read is not available returns.

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
  toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))

let fetchSpy: ReturnType<typeof vi.fn>
let seq = 0
const nextId = () => `behavior-site-${++seq}`

const demoScope = (siteId: string): SiteScope => ({
  siteId, mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full',
})
const linkScope = (siteId: string): SiteScope => ({
  siteId, mode: 'public', basePath: `/share/${siteId}`, pages: ['dashboard'], demo: false, fidelity: 'scoped',
})

interface Seen { endpoint: string; headers: Record<string, string> }
const seen = (): Seen[] =>
  (fetchSpy.mock.calls as Array<[string, RequestInit]>).map(([url, init]) => ({
    endpoint: url.slice(url.indexOf('/api/v1') + '/api/v1'.length),
    headers: (init.headers ?? {}) as Record<string, string>,
  }))

// A fresh cache per render, so one test's entries can never serve another's.
const isolated = (children: React.ReactNode) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
)
const under = (scope: SiteScope | null, children: React.ReactNode) =>
  isolated(scope ? <SiteScopeProvider scope={scope}>{children}</SiteScopeProvider> : children)

/** One probe that uses a `customer`-class hook, a demo-class one and a member-class one, and reports each. */
function Probe({ siteId }: { siteId: string }) {
  const dashboard = useDashboard(siteId, '', '', 'day', undefined, '7d')
  const site = useSite(siteId)
  const install = useInstallStatus(siteId)
  const visitors = useVisitors(siteId, { period: 'all' }, { sort: 'last_seen', order: 'desc', page: 1, pageSize: 25 })
  const state = (r: { available: boolean; data: unknown; error: unknown; isLoading: boolean }) =>
    `${r.available ? 'available' : 'unavailable'}/${r.data === undefined ? 'nodata' : 'data'}/${r.error === undefined ? 'noerror' : 'error'}/${r.isLoading ? 'loading' : 'idle'}`
  return (
    <ul>
      <li data-testid="dashboard">{state(dashboard)}</li>
      <li data-testid="site">{state(site)}</li>
      <li data-testid="install">{state(install)}</li>
      <li data-testid="visitors">{state(visitors)}</li>
    </ul>
  )
}

beforeEach(() => {
  fetchSpy = vi.fn().mockImplementation(async () =>
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', fetchSpy)
  markTeamResolved()
  setAccessToken('member-token')
  setActiveTeam('team-1')
})

afterEach(() => {
  cleanup()
  setAccessToken(null)
  setActiveTeam(null)
  vi.unstubAllGlobals()
})

describe('a member (no scope, or the member scope) reads everything as a member', () => {
  it.each([['no scope', null], ['member scope', 'member']] as const)('%s', async (_label, kind) => {
    const id = nextId()
    const scope = kind === 'member' ? memberScope(id) : null
    const { getByTestId } = render(under(scope, <Probe siteId={id} />))
    await waitFor(() => expect(seen().length).toBe(4))

    const endpoints = seen().map((s) => s.endpoint).sort()
    expect(endpoints).toEqual([
      `/sites/${id}`,
      `/sites/${id}/dashboard?period=7d&limit=10&interval=day`,
      `/sites/${id}/install-status`,
      `/sites/${id}/visitors?period=all&sort=last_seen&order=desc&page=1&page_size=25`,
    ].sort())
    for (const s of seen()) {
      expect(s.headers['Authorization']).toBe('Bearer member-token')
      expect(s.headers['X-Pulse-Team']).toBe('team-1')
    }
    await waitFor(() => expect(getByTestId('dashboard').textContent).toBe('available/data/noerror/idle'))
    expect(getByTestId('install').textContent).toBe('available/data/noerror/idle')
  })
})

describe('the sample site (public scope, full fidelity)', () => {
  it('reads the share-link and demo routes through /public, with no credential, and makes no member read', async () => {
    const id = nextId()
    const { getByTestId } = render(under(demoScope(id), <Probe siteId={id} />))
    await waitFor(() => expect(seen().length).toBe(2))

    expect(seen().map((s) => s.endpoint).sort()).toEqual([
      `/public/sites/${id}`,
      `/public/sites/${id}/dashboard?period=7d&limit=10&interval=day`,
    ].sort())
    for (const s of seen()) {
      const names = Object.keys(s.headers).map((h) => h.toLowerCase())
      expect(names).not.toContain('authorization')
      expect(names).not.toContain('x-pulse-team')
    }
    await waitFor(() => expect(getByTestId('dashboard').textContent).toBe('available/data/noerror/idle'))
    expect(getByTestId('site').textContent).toBe('available/data/noerror/idle')
    // Not available: no request, no data, no error, and not "loading" either.
    expect(getByTestId('install').textContent).toBe('unavailable/nodata/noerror/idle')
    expect(getByTestId('visitors').textContent).toBe('unavailable/nodata/noerror/idle')
    expect(seen().some((s) => s.endpoint.includes('install-status') || s.endpoint.includes('visitors'))).toBe(false)
  })
})

describe("a site's own share link (public scope, scoped fidelity)", () => {
  it('reads only the five routes a share link is served, and nothing else is asked', async () => {
    const id = nextId()
    const { getByTestId } = render(under(linkScope(id), <Probe siteId={id} />))
    await waitFor(() => expect(seen().length).toBe(1))
    // A beat for any stray request a hook might still make.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(seen().map((s) => s.endpoint)).toEqual([`/public/sites/${id}/dashboard?period=7d&limit=10&interval=day`])
    expect(getByTestId('site').textContent).toBe('unavailable/nodata/noerror/idle')
    expect(getByTestId('install').textContent).toBe('unavailable/nodata/noerror/idle')
    expect(getByTestId('visitors').textContent).toBe('unavailable/nodata/noerror/idle')
  })

  it('does not ask for the site record, the data window or the funnels list, which the backend serves to the demo only', async () => {
    const id = nextId()
    function Demo() {
      useSite(id)
      useFunnels(id)
      return null
    }
    render(under(linkScope(id), <Demo />))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('a hook that is not available does not turn into one that is', () => {
  it('keeps returning no data and no error after the scope re-renders', async () => {
    const id = nextId()
    const scope = linkScope(id)
    const { getByTestId, rerender } = render(under(scope, <Probe siteId={id} />))
    await waitFor(() => expect(seen().length).toBe(1))
    rerender(under(scope, <Probe siteId={id} />))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(getByTestId('visitors').textContent).toBe('unavailable/nodata/noerror/idle')
    expect(seen().length).toBe(1)
  })
})

describe('a read that stops being available', () => {
  it('drops the data it had, even for a hook that keeps its previous data', async () => {
    // usePerformanceLatest keeps previous data across key changes. Were that left to SWR, a hook whose scope
    // stops allowing the read (here a full-fidelity scope giving way to a scoped one) would go on showing
    // what it had loaded under the wider scope, on a page that may not read it.
    const id = nextId()
    function Latest() {
      const r = usePerformanceLatest(id)
      return <p data-testid="latest">{`${r.available ? 'available' : 'unavailable'}/${r.data === undefined ? 'nodata' : 'data'}`}</p>
    }
    const { getByTestId, rerender } = render(under(demoScope(id), <Latest />))
    await waitFor(() => expect(getByTestId('latest').textContent).toBe('available/data'))
    rerender(under(linkScope(id), <Latest />))
    await waitFor(() => expect(getByTestId('latest').textContent).toBe('unavailable/nodata'))
  })
})

describe('the scroll-depth capture', () => {
  function Preview({ siteId, member }: { siteId: string; member?: boolean }) {
    usePagePreview(siteId, member)
    return null
  }

  it('reads the performance route for a member, and the public page-preview route under a public scope whatever `member` says', async () => {
    const memberId = nextId()
    render(under(memberScope(memberId), <Preview siteId={memberId} />))
    await waitFor(() => expect(seen().length).toBe(1))
    expect(seen()[0].endpoint).toBe(`/sites/${memberId}/performance/page-preview`)
    cleanup()
    fetchSpy.mockClear()

    const demoId = nextId()
    render(under(demoScope(demoId), <Preview siteId={demoId} member />))
    await waitFor(() => expect(seen().length).toBe(1))
    expect(seen()[0].endpoint).toBe(`/public/sites/${demoId}/page-preview`)
    cleanup()
    fetchSpy.mockClear()

    const linkId = nextId()
    render(under(linkScope(linkId), <Preview siteId={linkId} member />))
    await waitFor(() => expect(seen().length).toBe(1))
    expect(seen()[0].endpoint).toBe(`/public/sites/${linkId}/page-preview`)
  })

  it('keeps the old anonymous read (member=false, no scope) on the same public route', async () => {
    const id = nextId()
    render(under(null, <Preview siteId={id} member={false} />))
    await waitFor(() => expect(seen().length).toBe(1))
    expect(seen()[0].endpoint).toBe(`/public/sites/${id}/page-preview`)
  })
})

describe('isLiveListKey', () => {
  it('matches the live lists of a public read by their public key, and a member read by the id', () => {
    const publicKey = ['fullList', 'countries', 'public:site-1', LIVE_LIST_KEY, 5, 250, undefined]
    const memberKey = ['fullList', 'countries', 'site-1', LIVE_LIST_KEY, 5, 250, undefined]
    expect(isLiveListKey(publicSiteRef('site-1'))(publicKey)).toBe(true)
    expect(isLiveListKey(publicSiteRef('site-1'))(memberKey)).toBe(false)
    expect(isLiveListKey('site-1')(memberKey)).toBe(true)
    expect(isLiveListKey('site-1')(publicKey)).toBe(false)
    expect(isLiveListKey(publicSiteRef('site-2'))(publicKey)).toBe(false)
  })
})

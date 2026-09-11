import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SWRConfig, mutate as globalMutate } from 'swr'
import { useSitesCache, upsertSite } from '../sites'
import type { Site } from '@/lib/api/sites'

// The sites-list cache write (11-09-2026). Owner's fresh-account walk: after
// the wizard, /sites said "No sites yet" until a refresh. The wizard's site
// step had cached `[]` on mount, and `mutateSites()` — the GLOBAL mutate from
// 'swr' — "revalidated" the default cache, which the app's SWRProvider (a
// custom cache provider) never reads. So: a REAL provider cache here, seeded
// the way the app's is, with NO useSites() hook mounted anywhere — the state
// the wizard pages are in once the step page unmounts — and assertions on the
// cache contents themselves. Mocking the module under test is how the
// original regression got a green test (pulse#412 → #413).

const listSites = vi.fn<() => Promise<Site[]>>()
vi.mock('@/lib/api/sites', () => ({
  listSites: () => listSites(),
  getSitesOverview: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/utils/favicon', () => ({ FAVICON_SERVICE_URL: 'https://icons.example' }))

const mk = (id: string, extra: Partial<Site> = {}): Site =>
  ({ id, user_id: 'u', domain: `${id}.example`, name: id, uptime_enabled: false, created_at: '2026-09-11T20:00:00Z', ...extra }) as Site

const sitesIn = (cache: Map<string, unknown>) => (cache.get('sites') as { data?: Site[] } | undefined)?.data

function harness(seed: Site[] | undefined) {
  const cache = new Map<string, unknown>()
  if (seed !== undefined) cache.set('sites', { data: seed })
  const { result } = renderHook(() => useSitesCache(), {
    wrapper: ({ children }) => (
      <SWRConfig value={{ provider: () => cache as never }}>{children}</SWRConfig>
    ),
  })
  return { cache, addSite: (site: Site) => result.current.addSite(site) }
}

describe('upsertSite', () => {
  it('appends a site that is not in the list', () => {
    const a = mk('a')
    const b = mk('b')
    expect(upsertSite([a], b)).toEqual([a, b])
    expect(upsertSite(undefined, b)).toEqual([b])
  })

  it('replaces in place — same position, newer row — when the id is already there', () => {
    const a = mk('a')
    const b = mk('b')
    const b2 = mk('b', { name: 'renamed' })
    expect(upsertSite([b, a], b2)).toEqual([b2, a])
  })

  it('never mutates its input', () => {
    const list = [mk('a')]
    upsertSite(list, mk('b'))
    expect(list).toHaveLength(1)
  })
})

describe('useSitesCache().addSite — with no useSites() hook mounted', () => {
  beforeEach(() => listSites.mockReset())

  it('writes the site into the provider cache synchronously, without a network round trip', async () => {
    const existing = mk('old')
    const { cache, addSite } = harness([existing])
    const created = mk('new')
    let written!: Promise<unknown>
    act(() => { written = addSite(created) })
    expect(sitesIn(cache)).toEqual([existing, created]) // visible before anything resolves
    await act(async () => { await written })
    expect(sitesIn(cache)).toEqual([existing, created])
    expect(listSites).not.toHaveBeenCalled()
  })

  // Reviewed out of the first version (pulse#671): a refetch inside the write
  // let SWR's one-mutation-at-a-time rule drop the earlier site when two
  // additions overlapped. A plain write composes.
  it('two additions in a row keep both sites', async () => {
    const { cache, addSite } = harness([])
    const first = mk('first')
    const second = mk('second')
    await act(async () => { await Promise.all([addSite(first), addSite(second)]) })
    expect(sitesIn(cache)).toEqual([first, second])
  })

  it('replaces a row that is already there instead of duplicating it', async () => {
    const stale = mk('new', { name: 'before' })
    const fresh = mk('new', { name: 'after' })
    const { cache, addSite } = harness([mk('old'), stale])
    await act(async () => { await addSite(fresh) })
    expect(sitesIn(cache)).toEqual([mk('old'), fresh])
  })

  it('works on a cold cache with no list at all', async () => {
    const { cache, addSite } = harness(undefined)
    const created = mk('new')
    await act(async () => { await addSite(created) })
    expect(sitesIn(cache)).toEqual([created])
  })

  // 🔴 The regression this hook replaces. The app mounts a custom cache
  // provider, so the global mutate from 'swr' writes to a cache nothing reads.
  it("the global mutate from 'swr' never reaches the provider cache — which is why this hook exists", async () => {
    const { cache } = harness([])
    await globalMutate('sites', [mk('ghost')], { revalidate: false })
    expect(sitesIn(cache)).toEqual([])
  })
})

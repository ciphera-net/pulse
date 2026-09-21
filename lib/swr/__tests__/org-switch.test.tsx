import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { SWRConfig, useSWRConfig } from 'swr'
import { boundedCacheProvider } from '@/lib/swr/cache-provider'
import { useSites } from '@/lib/swr/sites'
import { useClearOrgScopedCaches } from '@/lib/swr/org-switch'
import { listSites } from '@/lib/api/sites'

// pulse#730 (21-09-2026): switching workspace landed on /sites with NO sites
// until the PWA was closed and reopened. The switch ran AuthProvider.refresh()
// — a cache-wide `mutate(() => true, undefined, { revalidate: true })` — and
// then the org-switch purge with `revalidate: false` right after it. SWR
// discards a revalidation whose fetch started before the key's latest
// mutation, and a `revalidate: false` mutate starts no replacement and keeps
// the dedupe entry, so every key ended empty with nothing in flight.
//
// Real SWR, the app's real provider, the real useSites(): the module under
// test is the one thing NOT mocked, because the first version of this purge
// passed a unit test that had mocked it (see lib/swr/org-switch.ts).

// Stands in for the in-memory Bearer: which org's rows the "API" answers with
// depends on what was primed BEFORE the fetch went out.
const state = vi.hoisted(() => ({ bearerOrg: 'org_a' }))

vi.mock('@/lib/api/sites', () => ({
  listSites: vi.fn(async () =>
    state.bearerOrg === 'org_a'
      ? [{ id: 'site-a', domain: 'a.example', name: 'A' }]
      : [{ id: 'site-b', domain: 'b.example', name: 'B' }],
  ),
}))

type Handles = {
  purge: () => Promise<unknown>
  mutate: ReturnType<typeof useSWRConfig>['mutate']
}
// Filled by <Wire /> once it has mounted (an effect, not render — a render
// must not write to module scope); every test reads it after its first
// waitFor, which is after mount.
const wired: { current: Handles | null } = { current: null }
const handles = new Proxy({} as Handles, {
  get: (_t, prop: keyof Handles) => {
    if (!wired.current) throw new Error('<Wire /> has not mounted')
    return wired.current[prop]
  },
})

function Probe({ id }: { id: string }) {
  const { sites, isLoading } = useSites()
  return (
    <div data-testid={id}>
      {isLoading ? 'loading' : sites.length ? sites.map((s) => s.id).join(',') : 'empty'}
    </div>
  )
}

function Wire() {
  const purge = useClearOrgScopedCaches()
  const { mutate } = useSWRConfig()
  useEffect(() => {
    wired.current = { purge, mutate }
  }, [purge, mutate])
  return null
}

function App({ second = false }: { second?: boolean }) {
  return (
    <SWRConfig value={{ provider: boundedCacheProvider }}>
      <Wire />
      <Probe id="first" />
      {second && <Probe id="second" />}
    </SWRConfig>
  )
}

const text = (id: string) => screen.getByTestId(id).textContent
const fetches = () => vi.mocked(listSites).mock.calls.length
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })

async function mountOnOrgA() {
  state.bearerOrg = 'org_a'
  const utils = render(<App />)
  await waitFor(() => expect(text('first')).toBe('site-a'))
  return utils
}

describe('useClearOrgScopedCaches', () => {
  beforeEach(() => {
    vi.mocked(listSites).mockClear()
  })

  it('CONTROL — a revalidate:false purge stacked after a clear-and-revalidate leaves the key empty with nothing in flight', async () => {
    const { rerender } = await mountOnOrgA()
    state.bearerOrg = 'org_b'
    const before = fetches()

    await act(async () => {
      // What AuthProvider.refresh() does on a workspace switch …
      void handles.mutate(() => true, undefined, { revalidate: true })
      // … followed by what the purge did until pulse#730.
      await handles.mutate(() => true, undefined, { revalidate: false })
    })

    // The refetch refresh() started did run and did resolve with the new org's rows …
    await waitFor(() => expect(fetches()).toBe(before + 1))
    // … and SWR threw them away: empty, not loading, and nothing else coming.
    await waitFor(() => expect(text('first')).toBe('empty'))
    await settle()
    expect(text('first')).toBe('empty')

    // A consumer mounting inside the 30 s dedupe window joins the doomed
    // request instead of starting its own — so it is empty too, and no
    // request went out for it.
    rerender(<App second />)
    await settle()
    expect(text('second')).toBe('empty')
    expect(fetches()).toBe(before + 1)
  })

  it('refetches every mounted key under the credential primed before it, and a consumer mounting right after gets the same rows', async () => {
    const { rerender } = await mountOnOrgA()
    state.bearerOrg = 'org_b'

    await act(async () => { await handles.purge() })

    await waitFor(() => expect(text('first')).toBe('site-b'))
    rerender(<App second />)
    await waitFor(() => expect(text('second')).toBe('site-b'))
  })

  it('stacked after a clear-and-revalidate it still converges — the later revalidation is the one SWR keeps', async () => {
    await mountOnOrgA()
    state.bearerOrg = 'org_b'

    await act(async () => {
      void handles.mutate(() => true, undefined, { revalidate: true })
      await handles.purge()
    })

    await waitFor(() => expect(text('first')).toBe('site-b'))
    await settle()
    expect(text('first')).toBe('site-b')
  })

  it('PRECONDITION — called before the credential is primed, it faithfully refetches the OLD org', async () => {
    await mountOnOrgA()

    // The purge cannot know which org the session is on; it refetches with
    // whatever the client sends. Prime the Bearer first (the switcher and the
    // wizard both do), or this is the row set the new session renders.
    await act(async () => { await handles.purge() })
    state.bearerOrg = 'org_b'

    await waitFor(() => expect(text('first')).toBe('site-a'))
  })
})

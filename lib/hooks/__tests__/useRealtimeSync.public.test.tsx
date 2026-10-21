import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SiteScopeProvider, memberScope, SITE_PAGES, type SiteScope } from '@/lib/scope/SiteScope'

// PUL-34 Phase 2: realtime mode's transport on a public page.
//
// The stream is a member surface: the page spends its bearer on an authenticated POST for a one-use ticket,
// then opens a WebSocket with it. A public scope (/demo, /share/<id>) has no bearer and no right to either,
// so useRealtimeSync does nothing there: no ticket, no socket, and no fallback timer that would call
// onChanged either. The page stays current by the polling each of its reads already carries.

const apiRequest = vi.hoisted(() => vi.fn(async () => ({ ticket: 'ticket-1', expires_in: 60 })))
vi.mock('@/lib/api/client', () => ({ default: apiRequest, API_URL: 'https://api.example.test' }))

import { useRealtimeSync } from '../useRealtimeSync'

const SITE = 'site-1'

const demo: SiteScope = { siteId: SITE, mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' }
const link: SiteScope = { siteId: SITE, mode: 'public', basePath: `/share/${SITE}`, pages: ['dashboard'], demo: false, fidelity: 'scoped' }
const elsewhere: SiteScope = { ...demo, siteId: 'site-2' }

class FakeSocket {
  static instances: FakeSocket[] = []
  onopen: (() => void) | null = null
  onmessage: (() => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  close = vi.fn()
  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }
}

function wrapperFor(scope: SiteScope | null) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    scope ? <SiteScopeProvider scope={scope}>{children}</SiteScopeProvider> : <>{children}</>
  return Wrapper
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeSocket.instances = []
  apiRequest.mockClear()
  vi.stubGlobal('WebSocket', FakeSocket)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function settle(ms = 60_000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('the realtime transport under each scope', () => {
  it.each([['no scope', null], ['the member scope', memberScope(SITE)]] as const)(
    'mints a ticket and opens the socket for %s (the control)',
    async (_label, scope) => {
      const onChanged = vi.fn()
      renderHook(() => useRealtimeSync({ enabled: true, siteId: SITE, onChanged }), { wrapper: wrapperFor(scope) })
      await settle(1_000)

      expect(apiRequest).toHaveBeenCalledWith(`/api/v1/sites/${SITE}/realtime/ticket`, { method: 'POST' })
      expect(FakeSocket.instances).toHaveLength(1)
      expect(FakeSocket.instances[0].url).toContain(`/api/v1/sites/${SITE}/realtime/stream?ticket=ticket-1`)
    },
  )

  it.each([
    ['the sample site', demo],
    ["a site's share link", link],
    ["another site's public scope", elsewhere],
  ] as const)('does nothing under %s: no ticket, no socket, no timer', async (_label, scope) => {
    const onChanged = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useRealtimeSync({ enabled, siteId: SITE, onChanged }),
      { wrapper: wrapperFor(scope), initialProps: { enabled: true } },
    )
    await settle()
    rerender({ enabled: false })
    rerender({ enabled: true })
    await settle()

    expect(apiRequest).not.toHaveBeenCalled()
    expect(FakeSocket.instances).toHaveLength(0)
    // A failed socket falls back to polling onChanged every few seconds; with no socket attempted there is no
    // failure to fall back from, and nothing calls it.
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('does nothing when the page is not live, whatever the scope', async () => {
    renderHook(() => useRealtimeSync({ enabled: false, siteId: SITE, onChanged: vi.fn() }), { wrapper: wrapperFor(memberScope(SITE)) })
    await settle()
    expect(apiRequest).not.toHaveBeenCalled()
    expect(FakeSocket.instances).toHaveLength(0)
  })
})

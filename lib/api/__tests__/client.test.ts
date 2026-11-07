import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

const { getLoginUrl, getSignupUrl, ApiError } = await import('../client')

describe('getLoginUrl', () => {
  it('builds login URL with default redirect', () => {
    const url = getLoginUrl()
    expect(url).toContain('/login')
    expect(url).toContain('client_id=pulse-app')
    expect(url).toContain('response_type=code')
    expect(url).toContain(encodeURIComponent('/auth/callback'))
  })

  it('builds login URL with custom redirect', () => {
    const url = getLoginUrl('/custom/path')
    expect(url).toContain(encodeURIComponent('/custom/path'))
  })
})

describe('getSignupUrl', () => {
  it('builds signup URL with default redirect', () => {
    const url = getSignupUrl()
    expect(url).toContain('/signup')
    expect(url).toContain('client_id=pulse-app')
    expect(url).toContain('response_type=code')
  })

  it('builds signup URL with custom redirect', () => {
    const url = getSignupUrl('/onboarding')
    expect(url).toContain(encodeURIComponent('/onboarding'))
  })
})

describe('ApiError', () => {
  it('creates error with message and status', () => {
    const err = new ApiError('Not found', 404)
    expect(err.message).toBe('Not found')
    expect(err.status).toBe(404)
    expect(err.data).toBeUndefined()
    expect(err).toBeInstanceOf(Error)
  })

  it('creates error with data payload', () => {
    const data = { retryAfter: 30 }
    const err = new ApiError('Rate limited', 429, data)
    expect(err.status).toBe(429)
    expect(err.data).toEqual({ retryAfter: 30 })
  })

  it('is catchable as a standard Error', () => {
    const fn = () => { throw new ApiError('fail', 500) }
    expect(fn).toThrow(Error)
    expect(fn).toThrow('fail')
  })
})

describe('GET dedupe bookkeeping on request failure', () => {
  it('rejects the caller exactly once — no stray unhandled rejection', async () => {
    const apiRequest = (await import('../client')).default
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => { unhandled.push(reason) }
    process.on('unhandledRejection', onUnhandled)
    const realFetch = global.fetch
    try {
      global.fetch = vi.fn().mockResolvedValue(
        new Response('{}', { status: 404 })
      ) as unknown as typeof fetch

      // The caller's promise must reject with the typed 404 (the absence
      // contract getPagePreview maps to null)…
      await expect(
        apiRequest('/sites/00000000-0000-4000-8000-000000000000/performance/page-preview')
      ).rejects.toMatchObject({ status: 404 })

      // …and the dedupe bookkeeping chain must NOT mint a second, unawaited
      // rejection (it did — cleanup re-threw into a promise nobody held,
      // surfacing "Uncaught (in promise)" on every routine 404).
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      expect(unhandled).toHaveLength(0)
    } finally {
      global.fetch = realFetch
      process.off('unhandledRejection', onUnhandled)
    }
  })
})

describe("a GET with cache: 'no-store'", () => {
  // The team-names reconcile re-reads its directory after a 409 and must see the server's answer,
  // not one the 2s micro-cache kept from before the change (lib/team-names/api.ts).
  it('always reaches the network, and leaves the micro-cache alone', async () => {
    const apiRequest = (await import('../client')).default
    let n = 0
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ n: ++n }), { status: 200 }))
    try {
      const path = '/organizations/00000000-0000-4000-8000-0000000000aa/team-names'
      const first = await apiRequest<{ n: number }>(path, { cache: 'no-store' })
      const second = await apiRequest<{ n: number }>(path, { cache: 'no-store' })
      expect([first.n, second.n]).toEqual([1, 2])
      expect(fetchSpy.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })

      // Control: the same path without it is served from the micro-cache the second time.
      const plain = '/organizations/00000000-0000-4000-8000-0000000000bb/members'
      const p1 = await apiRequest<{ n: number }>(plain)
      const p2 = await apiRequest<{ n: number }>(plain)
      expect(p2.n).toBe(p1.n)
      // And a no-store read in between did not empty it.
      await apiRequest<{ n: number }>(path, { cache: 'no-store' })
      expect((await apiRequest<{ n: number }>(plain)).n).toBe(p1.n)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})

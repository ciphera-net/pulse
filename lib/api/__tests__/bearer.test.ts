import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The in-memory Bearer (per-app sessions S3).
 *
 * Pulse's cookies are host-only on pulse.ciphera.net and the API is on another
 * host, so the credential the browser sends to pulse-api is the access token it
 * holds in memory, as `Authorization: Bearer`. Everything here is invisible to
 * a type check: a client that forgot the header would still compile and render,
 * and every dashboard call would 401.
 */

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

const { default: apiRequest, setAccessToken, getAccessToken, setRefreshHandler, API_URL, ID_API_URL } = await import('../client')

function okJson(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function lastCall(spy: ReturnType<typeof vi.fn>): { url: string; headers: Headers; init: RequestInit } {
  const [url, init] = spy.mock.calls.at(-1) as [string, RequestInit]
  return { url, headers: new Headers(init.headers), init }
}

describe('the in-memory access token', () => {
  beforeEach(() => {
    setAccessToken(null)
    setRefreshHandler(null)
    localStorage.clear()
  })

  it('is sent as Authorization: Bearer to pulse-api', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson())
    vi.stubGlobal('fetch', fetchSpy)
    setAccessToken('tok-1')

    await apiRequest(`/sites?t=${Math.random()}`)

    const { url, headers } = lastCall(fetchSpy)
    expect(url.startsWith(`${API_URL}/api/v1/sites`)).toBe(true)
    expect(headers.get('authorization')).toBe('Bearer tok-1')
  })

  it('is sent to id-backend too (the ceremony still holds the apex CSRF pair until S5)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson())
    vi.stubGlobal('fetch', fetchSpy)
    setAccessToken('tok-1')

    await apiRequest(`/auth/user/me?t=${Math.random()}`)

    const { url, headers, init } = lastCall(fetchSpy)
    expect(url.startsWith(`${ID_API_URL}/api/v1/auth/user/me`)).toBe(true)
    expect(headers.get('authorization')).toBe('Bearer tok-1')
    expect(init.credentials).toBe('include')
  })

  it('sends no Authorization when there is no token — the request fails honestly, it does not invent one', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson())
    vi.stubGlobal('fetch', fetchSpy)

    await apiRequest(`/sites?t=${Math.random()}`)

    expect(lastCall(fetchSpy).headers.get('authorization')).toBeNull()
  })

  it('never overrides an Authorization a caller set itself', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson())
    vi.stubGlobal('fetch', fetchSpy)
    setAccessToken('tok-1')

    await apiRequest(`/sites?t=${Math.random()}`, { headers: { Authorization: 'Bearer caller-owned' } })

    expect(lastCall(fetchSpy).headers.get('authorization')).toBe('Bearer caller-owned')
  })

  it('is never persisted anywhere the next page load could read', async () => {
    setAccessToken('tok-1')
    expect(getAccessToken()).toBe('tok-1')
    expect(JSON.stringify(localStorage)).not.toContain('tok-1')
    expect(JSON.stringify(sessionStorage)).not.toContain('tok-1')
    expect(document.cookie).not.toContain('tok-1')
  })

  it('the retry after a renewal carries the RENEWED token, not the one that 401d', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"Token expired"}', { status: 401, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(okJson({ n: 1 }))
    vi.stubGlobal('fetch', fetchSpy)
    setAccessToken('tok-stale')
    setRefreshHandler(async () => {
      // What the auth context does on a successful renewal: primes the new token.
      setAccessToken('tok-fresh')
      return { ok: true, transient: false }
    })

    const result = await apiRequest<{ n: number }>(`/sites?t=${Math.random()}`)

    expect(result).toEqual({ n: 1 })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(lastCall(fetchSpy).headers.get('authorization')).toBe('Bearer tok-fresh')
  })

  it('is cleared on a DEFINITIVE refusal and kept on a transient one', async () => {
    const stale401 = () => new Response('{"error":"nope"}', { status: 401, headers: { 'content-type': 'application/json' } })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(stale401()))
    setAccessToken('tok-1')
    setRefreshHandler(async () => ({ ok: false, transient: true }))
    await apiRequest(`/sites?t=${Math.random()}`).catch(() => {})
    expect(getAccessToken(), 'a transient renewal failure proves nothing about the token').toBe('tok-1')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(stale401()))
    setRefreshHandler(async () => ({ ok: false, transient: false }))
    await apiRequest(`/sites?t=${Math.random()}`).catch(() => {})
    expect(getAccessToken(), 'a definitive refusal ends the session in memory too').toBeNull()
  })
})

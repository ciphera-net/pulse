import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 🔴 THE WIPE GUARD (25-08 incident, §3). When a data 401's refresh attempt
// fails TRANSIENTLY (network down, 5xx, timeout), the session may be perfectly
// valid — the cached user must survive, because it is both the recovery path's
// seed and the thing `hadPriorSession` is derived from at next init. Wiping it
// on a transient failure made one wake-time blip a durable logged-out state
// (marketing chrome over app chrome) for the life of the browser profile.
// Only a DEFINITIVE rejection may clear it. Exercises the REAL client.
// Audit: Infra/Auth/docs/audits/25-08-2026-lost-rotation-reuse-revocation-and-half-state-chrome.md §3, §5.3

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

const { authFetch, ApiError, setRefreshHandler } = await import('../client')

function respond401(): Response {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('data-401 refresh failure — cached user survival', () => {
  beforeEach(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'x@y.z' }))
    vi.stubGlobal('fetch', vi.fn(async () => respond401()))
  })

  afterEach(() => {
    setRefreshHandler(null)
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('a TRANSIENT refresh failure must NOT wipe the cached user', async () => {
    setRefreshHandler(vi.fn(async () => ({ ok: false, transient: true })))

    await expect(
      // PUT: state-changing requests are never deduped, so the rejection stays
      // owned by this call (same reasoning as opaque-finish-no-refresh.test.ts).
      authFetch('/auth/user/display-name', { method: 'PUT', body: '{}' })
    ).rejects.toBeInstanceOf(ApiError)

    expect(localStorage.getItem('user')).not.toBeNull()
  })

  it('a DEFINITIVE refresh rejection wipes the cached user', async () => {
    setRefreshHandler(vi.fn(async () => ({ ok: false, transient: false })))

    await expect(
      authFetch('/auth/user/display-name', { method: 'PUT', body: '{}' })
    ).rejects.toBeInstanceOf(ApiError)

    expect(localStorage.getItem('user')).toBeNull()
  })

  it('the thrown ApiError carries the transient flag for callers', async () => {
    setRefreshHandler(vi.fn(async () => ({ ok: false, transient: true })))

    const err = await authFetch('/auth/user/display-name', { method: 'PUT', body: '{}' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as InstanceType<typeof ApiError>).data?.transient).toBe(true)
  })
})

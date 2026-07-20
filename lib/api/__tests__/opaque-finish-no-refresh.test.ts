import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Part (b): a 401 from an OPAQUE endpoint that was posted with skipAuthRetry MUST
// NOT trigger the injected refreshHandler. login/finish state is single-use — an
// auto-refresh retry would re-post spent OPAQUE state and clobber a real 401 (bad
// password) with a confusing session-expiry flow. This exercises the REAL client
// (apiRequest) with global fetch stubbed to 401.

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

const { authFetch, ApiError, setRefreshHandler } = await import('../client')

function respond401(): Response {
  return new Response(JSON.stringify({ error: 'invalid credentials' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('OPAQUE login/finish 401 — single-use-state protection', () => {
  const refreshHandler = vi.fn(async () => true)

  beforeEach(() => {
    refreshHandler.mockClear()
    setRefreshHandler(refreshHandler)
    vi.stubGlobal('fetch', vi.fn(async () => respond401()))
  })

  afterEach(() => {
    setRefreshHandler(null)
    vi.unstubAllGlobals()
  })

  it('never invokes refreshHandler on a 401 from /auth/opaque/login/finish', async () => {
    await expect(
      authFetch('/auth/opaque/login/finish', { method: 'POST', body: '{}', skipAuthRetry: true })
    ).rejects.toBeInstanceOf(ApiError)

    expect(refreshHandler).not.toHaveBeenCalled()
    // No auto-refresh retry fetch was issued — the single POST is the only call.
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('control: a 401 WITHOUT skipAuthRetry DOES attempt refresh (guard is meaningful)', async () => {
    // Proves the negative above is real: the same 401, on a normal authed request,
    // routes through refreshHandler — so its absence in the login/finish case is the
    // skipAuthRetry flag working, not a broken harness. A PUT (state-changing, never
    // deduped) avoids the GET dedup bookkeeping so the rejection stays owned here.
    await authFetch('/auth/user/display-name', { method: 'PUT', body: '{}' }).catch(() => {})
    expect(refreshHandler).toHaveBeenCalled()
  })
})

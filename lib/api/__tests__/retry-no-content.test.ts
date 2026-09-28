import { describe, it, expect, vi, afterEach } from 'vitest'

// A 401 → refresh → retry that the server answers 204 (leave a team, remove a
// member) is a SUCCESS. The retry path used to parse the empty body as JSON
// and throw, so a leave that had happened was reported as a failure whenever
// the access token expired first. The first-attempt path already special-cased
// 204; the retry path must agree with it. Exercises the REAL client.

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

const { authFetch, setRefreshHandler } = await import('../client')

describe('retry after refresh — 204 No Content', () => {
  afterEach(() => {
    setRefreshHandler(null)
    vi.unstubAllGlobals()
  })

  it('resolves when the retried request answers 204', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    setRefreshHandler(vi.fn(async () => ({ ok: true, transient: false })))

    await expect(authFetch('/organizations/team-a/leave', { method: 'POST' })).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

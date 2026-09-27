import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * X-Pulse-Team (Phase 2, PULSE-89). The dashboard names the active team on
 * every pulse-api request instead of the backend trusting the token's claim.
 *
 * Exercises the REAL client (buildSessionHeaders is not exported — these
 * tests pin its effect through apiRequest/apiRequestBlob, the only callers).
 */

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

const {
  default: apiRequest,
  apiRequestBlob,
  setAccessToken,
  setActiveTeam,
  getActiveTeam,
  setRefreshHandler,
  setTeamRecoveryHandler,
  API_URL,
} = await import('../client')

function okJson(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function forbidden(code: string) {
  return new Response(JSON.stringify({ error: 'team', code }), { status: 403, headers: { 'content-type': 'application/json' } })
}

function lastCall(spy: ReturnType<typeof vi.fn>): { url: string; headers: Headers } {
  const [url, init] = spy.mock.calls.at(-1) as [string, RequestInit]
  return { url, headers: new Headers(init.headers) }
}

describe('X-Pulse-Team on apiRequest', () => {
  beforeEach(() => {
    setAccessToken('tok-1')
    setActiveTeam(null)
    setRefreshHandler(null)
    setTeamRecoveryHandler(null)
  })
  afterEach(() => {
    setAccessToken(null)
    setActiveTeam(null)
  })

  it('is absent when no team is active', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson()))
    await apiRequest(`/sites?t=${Math.random()}`)
    expect(lastCall(fetch as ReturnType<typeof vi.fn>).headers.get('x-pulse-team')).toBeNull()
  })

  it('is present on the first attempt once a team is active', async () => {
    setActiveTeam('team-a')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson()))
    await apiRequest(`/sites?t=${Math.random()}`)
    expect(lastCall(fetch as ReturnType<typeof vi.fn>).headers.get('x-pulse-team')).toBe('team-a')
  })

  it('is present on the 401 refresh-and-retry too', async () => {
    setActiveTeam('team-a')
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"expired"}', { status: 401, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(okJson())
    vi.stubGlobal('fetch', fetchSpy)
    setRefreshHandler(async () => ({ ok: true, transient: false }))

    await apiRequest(`/sites?t=${Math.random()}`)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(lastCall(fetchSpy).headers.get('x-pulse-team')).toBe('team-a')
  })

  it('is absent for /auth/* — id-backend CORS would refuse the preflight', async () => {
    setActiveTeam('team-a')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson()))
    await apiRequest(`/auth/user/me?t=${Math.random()}`)
    expect(lastCall(fetch as ReturnType<typeof vi.fn>).headers.get('x-pulse-team')).toBeNull()
  })

  it('never overrides a caller-supplied X-Pulse-Team', async () => {
    setActiveTeam('team-a')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson()))
    await apiRequest(`/sites?t=${Math.random()}`, { headers: { 'X-Pulse-Team': 'caller-team' } })
    expect(lastCall(fetch as ReturnType<typeof vi.fn>).headers.get('x-pulse-team')).toBe('caller-team')
  })
})

describe('X-Pulse-Team on apiRequestBlob', () => {
  beforeEach(() => {
    setAccessToken('tok-1')
    setRefreshHandler(null)
  })
  afterEach(() => {
    setAccessToken(null)
    setActiveTeam(null)
  })

  it('is present on the download, and on its refresh-and-retry', async () => {
    setActiveTeam('team-a')
    const pdf = () =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        blob: async () => new Blob(['x']),
        json: async () => ({}),
      }) as unknown as Response
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce(pdf())
    vi.stubGlobal('fetch', fetchSpy)
    setRefreshHandler(async () => ({ ok: true, transient: false }))

    await apiRequestBlob('/billing/invoices/1/pdf')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(lastCall(fetchSpy).headers.get('x-pulse-team')).toBe('team-a')
  })
})

describe('the active-team-aware cache key', () => {
  beforeEach(() => {
    setAccessToken('tok-1')
    setRefreshHandler(null)
  })
  afterEach(() => {
    setAccessToken(null)
    setActiveTeam(null)
  })

  it('two different teams produce two network calls for the identical GET', async () => {
    const path = `/sites?fixed=${Math.random()}`
    // mockImplementation, not mockResolvedValue: a Response body can only be
    // read once, and this test wants TWO real fetches — mockResolvedValue
    // would hand the second call an already-consumed body.
    const fetchSpy = vi.fn().mockImplementation(() => okJson({ n: 1 }))
    vi.stubGlobal('fetch', fetchSpy)

    setActiveTeam('team-a')
    await apiRequest(path)
    setActiveTeam('team-b')
    await apiRequest(path)

    // Without the team in the dedupe/cache key, the second call would be
    // served team-a's in-flight/cached answer instead of firing its own.
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(lastCall(fetchSpy).headers.get('x-pulse-team')).toBe('team-b')
  })

  it('the SAME team within the 2s window is still deduped (unchanged behaviour)', async () => {
    const path = `/sites?fixed=${Math.random()}`
    const fetchSpy = vi.fn().mockResolvedValue(okJson({ n: 1 }))
    vi.stubGlobal('fetch', fetchSpy)

    setActiveTeam('team-a')
    const [a, b] = await Promise.all([apiRequest(path), apiRequest(path)])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })
})

describe('team recovery', () => {
  // 🔴 EACH TEST GETS ITS OWN FAR-APART FAKE "NOW". The 10s throttle lives in
  // module state (lib/api/client.ts's teamRecoveryLastRunAt), which nothing
  // in this file can reset directly — so two tests back-to-back on the REAL
  // clock, or sharing one frozen fake clock, would have the second one read
  // as "still inside the previous test's throttle window" and fail for a
  // reason that has nothing to do with the behaviour it is testing. Spacing
  // every test an hour apart on its own fake clock makes each one
  // independent regardless of what a previous test in this file did.
  let nextBase = Date.UTC(2026, 0, 1)
  const freshHour = () => { nextBase += 60 * 60 * 1000; return nextBase }

  beforeEach(() => {
    setAccessToken('tok-1')
    setRefreshHandler(null)
    setTeamRecoveryHandler(null)
    vi.useFakeTimers()
    vi.setSystemTime(freshHour())
  })
  afterEach(() => {
    setAccessToken(null)
    setActiveTeam(null)
    setTeamRecoveryHandler(null)
    vi.useRealTimers()
  })

  it.each(['TEAM_REQUIRED', 'NOT_A_MEMBER', 'TEAM_DELETED'])(
    'invokes the handler on a %s 403, then still throws the ApiError',
    async (code) => {
      const handler = vi.fn().mockResolvedValue(undefined)
      setTeamRecoveryHandler(handler)
      // mockImplementation: a fresh Response per call, matching apiRequestBlob's
      // and every other multi-call mock in this file — see the body-reuse note above.
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => forbidden(code)))

      await expect(apiRequest(`/stats?t=${Math.random()}`)).rejects.toMatchObject({ status: 403 })

      // Fire-and-forget: the throw above did not wait on the handler. Its
      // whole body is synchronous up to the first await inside the handler
      // (there is none here), so it has already run by the time the
      // request's own promise settles — no timer advance needed.
      expect(handler).toHaveBeenCalledTimes(1)
    },
  )

  it('does not invoke the handler for an ordinary 403 with no team code', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    setTeamRecoveryHandler(handler)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } }),
    ))

    await expect(apiRequest(`/stats?t=${Math.random()}`)).rejects.toMatchObject({ status: 403 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('never fires for /auth/*, which has no team at all', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    setTeamRecoveryHandler(handler)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => forbidden('TEAM_REQUIRED')))

    await expect(apiRequest(`/auth/user/me?t=${Math.random()}`)).rejects.toMatchObject({ status: 403 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('is single-flight and throttled to once per 10s across repeated team-shaped 403s', async () => {
    const pending: { resolve: (() => void) | null } = { resolve: null }
    const handler = vi.fn().mockImplementation(() => new Promise<void>((r) => { pending.resolve = r }))
    setTeamRecoveryHandler(handler)
    // mockImplementation, not mockResolvedValue: this test issues FOUR real
    // fetches against the same mock, each of which must get its own
    // unread Response body.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => forbidden('NOT_A_MEMBER')))

    await apiRequest(`/stats?t=${Math.random()}`).catch(() => {})
    // A second team-shaped 403 while the first recovery is still in flight —
    // single-flight, so the handler must not be called a second time.
    await apiRequest(`/stats?t=${Math.random()}`).catch(() => {})
    expect(handler).toHaveBeenCalledTimes(1)

    pending.resolve?.()
    await vi.advanceTimersByTimeAsync(0)
    // The in-flight run just finished, but the 10s throttle window has not —
    // a third 403 right away must still not re-trigger it.
    await apiRequest(`/stats?t=${Math.random()}`).catch(() => {})
    expect(handler).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10_000)
    await apiRequest(`/stats?t=${Math.random()}`).catch(() => {})
    expect(handler).toHaveBeenCalledTimes(2)
  })
})

describe('getActiveTeam / setActiveTeam', () => {
  afterEach(() => setActiveTeam(null))

  it('round-trips, and an empty string reads back as no team (same rule as the access token)', () => {
    setActiveTeam('team-a')
    expect(getActiveTeam()).toBe('team-a')
    setActiveTeam('')
    expect(getActiveTeam()).toBeNull()
    setActiveTeam(null)
    expect(getActiveTeam()).toBeNull()
  })
})

// Sanity: the base URL used above really is pulse-api, not id-backend.
describe('sanity', () => {
  it('API_URL is pulse-api', () => {
    expect(API_URL).toBeTruthy()
  })
})

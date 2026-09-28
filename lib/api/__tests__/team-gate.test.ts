import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The team-readiness gate (Fix 1, PULSE-89 review).
 *
 * On a full page load, components can fire a pulse-api request before
 * AuthProvider has resolved the active team — that request used to go out
 * with no `X-Pulse-Team`, get back 403 TEAM_REQUIRED, and never be retried.
 * `apiRequest`'s first attempt (and `apiRequestBlob`) now wait on a
 * module-level gate for every endpoint except the user-scoped ones that must
 * never wait on a team.
 *
 * 🔴 vitest.setup.ts calls `markTeamResolved()` once per test file so the
 * REST of the suite (which has never heard of teams) never waits — every
 * test here that wants the unresolved state calls `resetTeamGate()` first,
 * and restores the resolved default afterwards so later tests in THIS file
 * are unaffected by whichever ran before them.
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
  setRefreshHandler,
  markTeamResolved,
  resetTeamGate,
} = await import('../client')

function okJson(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function lastCall(spy: ReturnType<typeof vi.fn>): { headers: Headers } {
  const [, init] = spy.mock.calls.at(-1) as [string, RequestInit]
  return { headers: new Headers(init.headers) }
}

describe('the team readiness gate', () => {
  beforeEach(() => {
    setAccessToken('tok-1')
    setActiveTeam(null)
    setRefreshHandler(null)
  })
  afterEach(() => {
    setAccessToken(null)
    setActiveTeam(null)
    // Leave the gate resolved for every OTHER test in this file/suite.
    markTeamResolved()
    vi.useRealTimers()
  })

  it('a pulse-api request issued before markTeamResolved() waits, then carries the header set in between', async () => {
    resetTeamGate()
    const fetchSpy = vi.fn().mockResolvedValue(okJson())
    vi.stubGlobal('fetch', fetchSpy)

    const pending = apiRequest(`/sites?t=${Math.random()}`)

    // Nothing dispatched yet — the gate has not resolved.
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchSpy).not.toHaveBeenCalled()

    // The team becomes known IN BETWEEN — exactly AuthProvider's init timing.
    setActiveTeam('team-a')
    markTeamResolved()

    await pending
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(lastCall(fetchSpy).headers.get('x-pulse-team')).toBe('team-a')
  })

  it('a second request queued behind the same unresolved gate also proceeds once it resolves', async () => {
    resetTeamGate()
    const fetchSpy = vi.fn().mockImplementation(() => okJson())
    vi.stubGlobal('fetch', fetchSpy)

    const p1 = apiRequest(`/sites?a=${Math.random()}`)
    const p2 = apiRequest(`/stats?b=${Math.random()}`)
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchSpy).not.toHaveBeenCalled()

    setActiveTeam('team-a')
    markTeamResolved()
    await Promise.all([p1, p2])

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(lastCall(fetchSpy).headers.get('x-pulse-team')).toBe('team-a')
  })

  it.each([
    '/me', '/me/preferences', '/notifications', '/notifications/1/read', '/public/status',
    // Pulse's own team-write routes (PULSE-92 Phase 5): they name the team in
    // the URL path, never X-Pulse-Team, and several of them (creating a team,
    // listing the account's teams, accepting an invite) run before any team
    // is known at all.
    '/organizations', '/organizations/org1', '/organizations/ensure-default', '/invite-links/abc/accept',
  ])(
    '%s never waits on the gate, even while it is unresolved',
    async (endpoint) => {
      resetTeamGate()
      const fetchSpy = vi.fn().mockResolvedValue(okJson())
      vi.stubGlobal('fetch', fetchSpy)

      // No markTeamResolved() call anywhere in this test — if this endpoint
      // waited on the gate, the request would still be pending right now.
      await apiRequest(`${endpoint}?t=${Math.random()}`)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    },
  )

  it('an /auth/* request never waits on the gate, even while it is unresolved', async () => {
    resetTeamGate()
    const fetchSpy = vi.fn().mockResolvedValue(okJson())
    vi.stubGlobal('fetch', fetchSpy)

    await apiRequest(`/auth/user/me?t=${Math.random()}`)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('apiRequestBlob also never waits on the gate for /auth/*', async () => {
    resetTeamGate()
    const pdf = () =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        blob: async () => new Blob(['x']),
        json: async () => ({}),
      }) as unknown as Response
    const fetchSpy = vi.fn().mockImplementation(() => pdf())
    vi.stubGlobal('fetch', fetchSpy)

    await apiRequestBlob('/auth/some-export')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('apiRequestBlob waits on the gate for a team-scoped endpoint, then proceeds once resolved', async () => {
    resetTeamGate()
    const pdf = () =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        blob: async () => new Blob(['x']),
        json: async () => ({}),
      }) as unknown as Response
    const fetchSpy = vi.fn().mockImplementation(() => pdf())
    vi.stubGlobal('fetch', fetchSpy)

    const pending = apiRequestBlob('/billing/invoices/1/pdf')
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchSpy).not.toHaveBeenCalled()

    setActiveTeam('team-a')
    markTeamResolved()
    await pending
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(lastCall(fetchSpy).headers.get('x-pulse-team')).toBe('team-a')
  })

  it('the 10s safety-net timeout releases a waiting request when the team never resolves', async () => {
    resetTeamGate()
    vi.useFakeTimers()
    const fetchSpy = vi.fn().mockResolvedValue(okJson())
    vi.stubGlobal('fetch', fetchSpy)

    const pending = apiRequest(`/sites?t=${Math.random()}`)

    // Never call markTeamResolved() — the request must still get through,
    // without a team header, once the 10s safety net elapses.
    await vi.advanceTimersByTimeAsync(10_000)
    await pending

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(lastCall(fetchSpy).headers.get('x-pulse-team')).toBeNull()
  })

  it('does not release a moment before the 10s mark', async () => {
    resetTeamGate()
    vi.useFakeTimers()
    const fetchSpy = vi.fn().mockResolvedValue(okJson())
    vi.stubGlobal('fetch', fetchSpy)

    const pending = apiRequest(`/sites?t=${Math.random()}`)
    await vi.advanceTimersByTimeAsync(9_999)
    expect(fetchSpy).not.toHaveBeenCalled()

    // Finish the same request's own timeout cleanly INSIDE this test — never
    // leave a promise dangling across tests, or its eventual fetch() call
    // would race the NEXT test's own fetch stub.
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

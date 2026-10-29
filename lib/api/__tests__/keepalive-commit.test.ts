import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * The Undo window's commit (PUL-28). When the page is hidden or left while a
 * confirmed action waits, it is sent with `keepalive: true` from inside the
 * `pagehide` / `visibilitychange` handler, and must reach fetch() before that
 * handler returns: the page may be gone after. These tests call apiRequest
 * WITHOUT awaiting and assert fetch() was already called.
 */

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

const { default: apiRequest, setAccessToken, setActiveTeam, markTeamResolved, resetTeamGate } = await import('../client')

const ok = () => new Response(null, { status: 204 })

describe('a keepalive commit', () => {
  afterEach(() => {
    setAccessToken(null)
    setActiveTeam(null)
    markTeamResolved()
    vi.unstubAllGlobals()
  })

  it('reaches fetch() in the same tick for a team-scoped endpoint', () => {
    setAccessToken('tok-1')
    setActiveTeam('team-1')
    markTeamResolved()
    const fetchSpy = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal('fetch', fetchSpy)

    void apiRequest('/sites/site-1', { method: 'DELETE', keepalive: true })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sites/site-1')
    expect(init.keepalive).toBe(true)
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer tok-1')
    expect(headers.get('X-Pulse-Team')).toBe('team-1')
  })

  it('reaches fetch() in the same tick for a gate-exempt endpoint', () => {
    setAccessToken('tok-1')
    const fetchSpy = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal('fetch', fetchSpy)

    void apiRequest('/organizations/org-1/members/u-1', { method: 'DELETE', keepalive: true })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('a request WITHOUT keepalive still waits a tick on the gate (control)', () => {
    setActiveTeam('team-1')
    markTeamResolved()
    const fetchSpy = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal('fetch', fetchSpy)

    void apiRequest('/sites/site-1', { method: 'DELETE' })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('waits on an unresolved gate even with keepalive, rather than send without a team', async () => {
    resetTeamGate()
    const fetchSpy = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal('fetch', fetchSpy)

    const p = apiRequest('/sites/site-1', { method: 'DELETE', keepalive: true })
    expect(fetchSpy).not.toHaveBeenCalled()
    setActiveTeam('team-1')
    markTeamResolved()
    await p
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(new Headers((fetchSpy.mock.calls[0] as [string, RequestInit])[1].headers).get('X-Pulse-Team')).toBe('team-1')
  })
})

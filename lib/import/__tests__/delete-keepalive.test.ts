import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * PUL-28: an import delete sent as the page is hidden or left must reach the
 * transport, and through appTransport fetch(), in the SAME tick. The queued
 * ImportApiClient cannot (its queue, pacing and retries yield first), so a
 * keepalive delete bypasses it. Each test calls deleteImport WITHOUT awaiting.
 */

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

const { deleteImport } = await import('../index')
const { appTransport } = await import('../app-transport')
const { setAccessToken, setActiveTeam, markTeamResolved } = await import('@/lib/api/client')

describe('deleteImport with keepalive', () => {
  afterEach(() => {
    setAccessToken(null)
    setActiveTeam(null)
    vi.unstubAllGlobals()
  })

  it('calls the transport in the same tick, once, with keepalive', () => {
    const transport = vi.fn().mockResolvedValue({ status: 204, body: null, retryAfterSeconds: null })
    void deleteImport({ siteId: 's 1', importId: 'i/1', transport, keepalive: true })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]![0]).toMatchObject({ method: 'DELETE', path: '/sites/s%201/data-imports/i%2F1', body: null, keepalive: true })
  })

  it('reaches fetch() in the same tick through appTransport', () => {
    setAccessToken('tok-1')
    setActiveTeam('team-1')
    markTeamResolved()
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchSpy)
    void deleteImport({ siteId: 'site-1', importId: 'imp-1', transport: appTransport, keepalive: true })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sites/site-1/data-imports/imp-1')
    expect(init.method).toBe('DELETE')
    expect(init.keepalive).toBe(true)
  })

  it('a failed keepalive delete rejects rather than passing silently', async () => {
    const transport = vi.fn().mockResolvedValue({ status: 500, body: null, retryAfterSeconds: null })
    await expect(deleteImport({ siteId: 's', importId: 'i', transport, keepalive: true })).rejects.toThrow('500')
  })

  it('without keepalive still goes through the queued client (control: not the same tick)', () => {
    const transport = vi.fn().mockResolvedValue({ status: 204, body: null, retryAfterSeconds: null })
    void deleteImport({ siteId: 's', importId: 'i', transport })
    expect(transport).not.toHaveBeenCalled()
  })
})

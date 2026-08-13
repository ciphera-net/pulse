import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * These tests exist for one reason: the Google fallback this route used to carry
 * was invisible in production for ~3 weeks *because it worked*. Prod never set
 * `FAVICON_UPSTREAM_URL`, so every customer domain was resolved via
 * `google.com/s2/favicons` and nothing failed, nothing alerted, nothing rendered
 * wrong. The only durable guard against that returning is a test that asserts on
 * the URL the route actually dials.
 *
 * `UPSTREAM` is read at module load, so every case re-imports the module under a
 * fresh `process.env`. `vi.resetModules()` between cases is load-bearing — without
 * it the second import returns the first one's cached binding and every test
 * passes against whatever env the first one happened to set.
 */

const REAL_ENV = process.env.FAVICON_UPSTREAM_URL

/** Import the route fresh, with `FAVICON_UPSTREAM_URL` set to `upstream` (or unset). */
async function loadRoute(upstream: string | undefined) {
  vi.resetModules()
  if (upstream === undefined) delete process.env.FAVICON_UPSTREAM_URL
  else process.env.FAVICON_UPSTREAM_URL = upstream
  const mod = await import('../route')
  return mod.GET
}

function req(qs: string) {
  const { NextRequest } = require('next/server')
  return new NextRequest(`https://pulse.ciphera.net/api/favicon${qs}`)
}

/** A 1x1 PNG is enough — the route only checks `content-type` and passes bytes through. */
function pngResponse() {
  return new Response(new Uint8Array([137, 80, 78, 71]), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  })
}

describe('GET /api/favicon', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(pngResponse())
    vi.stubGlobal('fetch', fetchSpy)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (REAL_ENV === undefined) delete process.env.FAVICON_UPSTREAM_URL
    else process.env.FAVICON_UPSTREAM_URL = REAL_ENV
  })

  it('503s with no-store when FAVICON_UPSTREAM_URL is unset, and dials nothing', async () => {
    const GET = await loadRoute(undefined)
    const res = await GET(req('?domain=github.com&sz=32'))

    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    // The point of the whole change: an unconfigured route must not reach a
    // third party. A 200 here would mean a default had been reintroduced.
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('config failure outranks a bad request — an unconfigured route never 400s', async () => {
    // 503 must win over the 400 an invalid domain would otherwise get, so a
    // misconfiguration is visible regardless of what the caller sent.
    const GET = await loadRoute(undefined)
    const res = await GET(req('?domain=not a domain&sz=999'))
    expect(res.status).toBe(503)
  })

  it('dials the configured upstream, and never google', async () => {
    const GET = await loadRoute('http://sigil.apps.svc.cluster.local/icon')
    const res = await GET(req('?domain=github.com&sz=32'))

    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const dialled = String(fetchSpy.mock.calls[0][0])
    expect(dialled).toBe('http://sigil.apps.svc.cluster.local/icon?domain=github.com&sz=32')
    expect(dialled).not.toContain('google')
  })

  it('still rejects malformed input once configured', async () => {
    const GET = await loadRoute('http://sigil.apps.svc.cluster.local/icon')
    expect((await GET(req('?domain=github.com&sz=999'))).status).toBe(400)
    expect((await GET(req('?domain=127.0.0.1&sz=32'))).status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('404s (not 503) when a configured upstream fails — the two states stay distinguishable', async () => {
    // A 503 means "we are misconfigured"; a 404 means "no icon for that domain".
    // Collapsing them is what let the original gap hide.
    fetchSpy.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    const GET = await loadRoute('http://sigil.apps.svc.cluster.local/icon')
    const res = await GET(req('?domain=github.com&sz=32'))
    expect(res.status).toBe(404)
  })
})

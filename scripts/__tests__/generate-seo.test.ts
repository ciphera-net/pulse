import { describe, it, expect, vi } from 'vitest'
import os from 'os'
import fs from 'fs'
import path from 'path'
import {
  DASHBOARD_ROUTES,
  EXPECTED_ROUTES,
  ALLOWED_PATHS,
  buildRouteMap,
  validateStub,
  fetchWithRetry,
  run,
  GenerateSeoError,
  type RouteStubNode,
} from '../generate-seo'

// A valid published-and-tagged stub for a given L1 path — the shape every
// fixture below starts from and overrides.
function validNode(cipheraPath: string, overrides: Partial<RouteStubNode> = {}): RouteStubNode {
  return {
    cipheraPath,
    cipheraTitle: `Title for ${cipheraPath}`,
    cipheraDescription: `Description for ${cipheraPath}`,
    cipheraCanonical: '',
    cipheraOgTitle: '',
    cipheraOgDescription: '',
    cipheraOgImage: '',
    cipheraTwitterTitle: '',
    cipheraTwitterDescription: '',
    cipheraNoindex: false,
    cipheraNofollow: false,
    modifiedGmt: '2026-09-30T12:00:00',
    routeSites: { nodes: [{ slug: 'pulse' }] },
    ...overrides,
  }
}

// Stubs for routes ciphera-net/pulse-website renders (B7, 06-10-2026). WordPress
// returns them in the SAME response this app reads, so every realistic fixture
// carries them — and this app must skip them, valid or not.
const OTHER_APP_PATHS = ['/', '/about', '/pricing', '/cookieless-analytics', '/vs/plausible', '/tools/utm-builder']

// A realistic, healthy production response: this app's own `/demo` stub first,
// then pulse-website's. Individual tests mutate a copy of this.
function fullFixture(): RouteStubNode[] {
  return [validNode('/demo'), ...OTHER_APP_PATHS.map((p) => validNode(p))]
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body }
}

function scratchOutPath(): string {
  return path.join(os.tmpdir(), `seo-gen-test-${Math.random().toString(36).slice(2)}.ts`)
}

describe('EXPECTED_ROUTES', () => {
  it('is derived from DASHBOARD_ROUTES and equals 1 (/demo) since B7', () => {
    expect(EXPECTED_ROUTES).toBe(DASHBOARD_ROUTES.length)
    expect([...DASHBOARD_ROUTES]).toEqual(['/demo'])
  })
})

describe('buildRouteMap — this app\'s routes only, D38 exact paths, dedup', () => {
  it('keeps /demo from a full production response and skips pulse-website\'s stubs', () => {
    const seen = buildRouteMap(fullFixture())
    expect([...seen.keys()]).toEqual(['/demo'])
  })

  it('matches /demo exactly — never as a prefix', () => {
    expect(ALLOWED_PATHS.has('/demo')).toBe(true)
    for (const p of ['/', '/dem', '/demo/', '/demo/x', '//demo']) expect(ALLOWED_PATHS.has(p)).toBe(false)
    expect(buildRouteMap([validNode('/demo/')]).size).toBe(0)
  })

  // 🔴 B7 OWNERSHIP: pulse-website's generator is the one that fails its build on a
  // malformed, unknown or duplicate stub for its routes. An editing mistake there
  // must never block a dashboard deploy — so here those stubs are skipped, unread.
  it('skips — never fails on — another app\'s stub, even a malformed one', () => {
    const nodes = [
      ...fullFixture(),
      validNode(''),
      validNode('no-leading-slash'),
      validNode('/settings'),
      validNode('/integrations/nextjs'),
      validNode('/about'), // a duplicate of a pulse-website route
      validNode('/pricing', { cipheraTitle: '', cipheraOgImage: 'https://evil.example/x.png' }),
    ]
    expect(() => buildRouteMap(nodes)).not.toThrow()
    expect([...buildRouteMap(nodes).keys()]).toEqual(['/demo'])
  })

  it('fails the build on a duplicate /demo stub', () => {
    const nodes = [validNode('/demo'), validNode('/demo')]
    expect(() => buildRouteMap(nodes)).toThrow(GenerateSeoError)
    expect(() => buildRouteMap(nodes)).toThrow(/duplicate stub for \/demo/)
  })

  it('skips nodes not tagged for the pulse site, without failing', () => {
    const nodes = [validNode('/demo', { routeSites: { nodes: [{ slug: 'ciphera-net' }] } })]
    const seen = buildRouteMap(nodes)
    expect(seen.size).toBe(0)
  })

  it('does NOT fail on another site\'s malformed stub — tenant isolation', () => {
    // A ciphera.net editor's pathless stub must fail ciphera.net's build, never Pulse's.
    const nodes = [
      ...fullFixture(),
      validNode('', { routeSites: { nodes: [{ slug: 'ciphera-net' }] } }),
      validNode('no-leading-slash', { routeSites: { nodes: [{ slug: 'ciphera-net' }] } }),
    ]
    expect(buildRouteMap(nodes).size).toBe(1)
  })
})

describe('validateStub — required fields and the CDN image gate', () => {
  it('accepts a stub with a title, a description, and no OG image', () => {
    expect(() => validateStub('/demo', validNode('/demo'))).not.toThrow()
  })

  it('fails a stub with no title', () => {
    expect(() => validateStub('/demo', validNode('/demo', { cipheraTitle: '' }))).toThrow(/no title/)
  })

  it('fails a stub with no description', () => {
    expect(() =>
      validateStub('/demo', validNode('/demo', { cipheraDescription: '   ' }))
    ).toThrow(/no meta description/)
  })

  it('fails a stub whose OG image is not on cdn.ciphera.net', () => {
    expect(() =>
      validateStub('/demo', validNode('/demo', { cipheraOgImage: 'https://evil.example/x.png' }))
    ).toThrow(/not on cdn\.ciphera\.net/)
  })

  it('accepts a stub whose OG image IS on cdn.ciphera.net', () => {
    expect(() =>
      validateStub(
        '/demo',
        validNode('/demo', { cipheraOgImage: 'https://cdn.ciphera.net/pulse/og-demo.png' })
      )
    ).not.toThrow()
  })
})

describe('fetchWithRetry — D39 bounded retry with backoff', () => {
  it('returns ok immediately on a healthy first response, with no sleep', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ data: {} }))
    const sleepImpl = vi.fn().mockResolvedValue(undefined)
    const outcome = await fetchWithRetry('http://wp.test/graphql', '{}', { fetchImpl, sleepImpl })
    expect(outcome).toEqual({ kind: 'ok', body: { data: {} } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(sleepImpl).not.toHaveBeenCalled()
  })

  it('retries on a network error and eventually succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(okResponse({ data: {} }))
    const sleepImpl = vi.fn().mockResolvedValue(undefined)
    const outcome = await fetchWithRetry('http://wp.test/graphql', '{}', {
      fetchImpl,
      sleepImpl,
      totalMs: 60_000,
      baseMs: 1,
    })
    expect(outcome.kind).toBe('ok')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleepImpl).toHaveBeenCalledTimes(2)
  })

  it('retries on HTTP 5xx but not on HTTP 4xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 })
    const sleepImpl = vi.fn().mockResolvedValue(undefined)
    const outcome = await fetchWithRetry('http://wp.test/graphql', '{}', {
      fetchImpl,
      sleepImpl,
      totalMs: 60_000,
      baseMs: 1,
    })
    expect(outcome).toEqual({ kind: 'client_error', lastError: 'HTTP 400 from http://wp.test/graphql' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(sleepImpl).not.toHaveBeenCalled()
  })

  it('aborts a HANGING attempt with its own timeout, so the window really bounds', async () => {
    // Both measured outages were hangs, not refusals. This fetch never answers
    // unless its signal aborts it.
    // Without a signal it hangs for real, so removing the per-attempt timeout
    // makes this test time out rather than pass by accident.
    const fetchImpl = vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
        })
    )
    const started = Date.now()
    const outcome = await fetchWithRetry('http://wp.test/graphql', '{}', {
      fetchImpl,
      sleepImpl: async () => {},
      totalMs: 60,
      baseMs: 1,
    })
    expect(outcome.kind).toBe('unavailable')
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('treats a 200 whose body is not JSON as a contract failure, never "unavailable"', async () => {
    let now = 0
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<html>login</html>' })
    // A fake clock, so a regression that retries this ends fast and fails cleanly
    // instead of spinning against a real window.
    const sleepImpl = vi.fn().mockImplementation(async (ms: number) => { now += ms })
    const outcome = await fetchWithRetry('http://wp.test/graphql', '{}', {
      fetchImpl, sleepImpl, totalMs: 100, baseMs: 10, now: () => now,
    })
    expect(outcome.kind).toBe('client_error')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(sleepImpl).not.toHaveBeenCalled()
  })

  it('gives up as "unavailable" once the bounded window elapses', async () => {
    let now = 0
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))
    // sleepImpl advances the fake clock instead of really sleeping, so the
    // bounded ~2-minute window in the design is exercised in milliseconds.
    const sleepImpl = vi.fn().mockImplementation(async (ms: number) => {
      now += ms
    })
    const outcome = await fetchWithRetry('http://wp.test/graphql', '{}', {
      fetchImpl,
      sleepImpl,
      totalMs: 100,
      baseMs: 10,
      now: () => now,
    })
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind === 'unavailable') expect(outcome.lastError).toMatch(/ETIMEDOUT/)
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1)
  })
})

describe('run() — end to end, D39 override semantics', () => {
  it('writes lib/seo.gen.ts with /demo alone on a healthy, fully-seeded response', async () => {
    const outPath = scratchOutPath()
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse({ data: { routeStubs: { nodes: fullFixture() } } }))
    try {
      const result = await run({ fetchImpl, outPath })
      expect(result).toEqual({ routeCount: 1, watermark: '2026-09-30T12:00:00', override: false })
      const written = fs.readFileSync(outPath, 'utf-8')
      expect(written).toContain('export const SEO_ROUTE_COUNT = 1')
      expect(written).toContain('export const SEO_OVERRIDE = false')
      expect(written).toContain('export const SEO_GENERATED = true')
      expect(written).toContain('"/demo"')
      // pulse-website's routes never reach this app's generated file.
      expect(written).not.toContain('"/about"')
      expect(written).not.toContain('"/pricing"')
    } finally {
      fs.rmSync(outPath, { force: true })
    }
  })

  it('fails the count gate when the /demo stub is missing — its route would silently lose its CMS metadata', async () => {
    const outPath = scratchOutPath()
    const partial = fullFixture().slice(1) // pulse-website's stubs only
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse({ data: { routeStubs: { nodes: partial } } }))
    await expect(run({ fetchImpl, outPath })).rejects.toThrow(/expected 1 pulse stubs, found 0/)
    expect(fs.existsSync(outPath)).toBe(false)
  })

  it('fails immediately, without retrying, on a GraphQL errors[] response', async () => {
    const outPath = scratchOutPath()
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse({ errors: [{ message: 'boom' }], data: null }))
    const sleepImpl = vi.fn()
    await expect(run({ fetchImpl, sleepImpl, outPath })).rejects.toThrow(/GraphQL errors/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(sleepImpl).not.toHaveBeenCalled()
  })

  it('retries a network error, then fails loudly once the window is exhausted (no override flag)', async () => {
    const outPath = scratchOutPath()
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    let now = 0
    const sleepImpl = vi.fn().mockImplementation(async (ms: number) => {
      now += ms
    })
    await expect(
      run({ fetchImpl, sleepImpl, now: () => now, totalMs: 30, baseMs: 5, outPath })
    ).rejects.toThrow(/cannot reach WordPress/)
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1)
    expect(fs.existsSync(outPath)).toBe(false)
  })

  it('D39 override: an unreachable CMS with CMS_UNAVAILABLE_OK writes an empty, clearly-flagged file', async () => {
    const outPath = scratchOutPath()
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    let now = 0
    const sleepImpl = vi.fn().mockImplementation(async (ms: number) => {
      now += ms
    })
    try {
      const result = await run({
        fetchImpl,
        sleepImpl,
        now: () => now,
        totalMs: 30,
        baseMs: 5,
        outPath,
        cmsUnavailableOk: true,
      })
      expect(result).toEqual({ routeCount: 0, watermark: '', override: true })
      const written = fs.readFileSync(outPath, 'utf-8')
      expect(written).toContain('export const SEO_OVERRIDE = true')
      expect(written).toContain('export const SEO_ROUTE_COUNT = 0')
      expect(written).toContain('export const routeSeo: Record<string, RouteSeo> = {}')
    } finally {
      fs.rmSync(outPath, { force: true })
    }
  })

  // D39, refined 30-09-2026: on the current app this build ships the dashboard too,
  // so the override must be able to unblock a deploy whatever went wrong with the
  // CMS. It is safe to let it cover validation failures because it DISCARDS what
  // WordPress returned: each case below asserts the written file carries NO route
  // data, so no bad CMS content can ever ship through it. Without the flag, every
  // one of these still fails the build loudly.
  const BAD_RESPONSES: Array<[string, () => unknown]> = [
    ['a response with no /demo stub (only another route\'s)', () => ({ data: { routeStubs: { nodes: [validNode('/not-a-real-route')] } } })],
    ['a count shortfall (an unpublished stub)', () => ({ data: { routeStubs: { nodes: fullFixture().slice(1) } } })],
    ['a duplicate /demo stub', () => ({ data: { routeStubs: { nodes: [...fullFixture(), validNode('/demo')] } } })],
    ['a GraphQL errors[] response', () => ({ errors: [{ message: 'boom' }], data: { routeStubs: { nodes: fullFixture() } } })],
    ['a stub with an off-CDN OG image', () => ({ data: { routeStubs: { nodes: [
      ...fullFixture().filter((n) => n.cipheraPath !== '/demo'),
      validNode('/demo', { cipheraOgImage: 'https://evil.example/x.png' }),
    ] } } })],
  ]

  for (const [label, body] of BAD_RESPONSES) {
    it(`without the override, ${label} fails the build`, async () => {
      const outPath = scratchOutPath()
      const fetchImpl = vi.fn().mockResolvedValue(okResponse(body()))
      await expect(run({ fetchImpl, outPath })).rejects.toThrow(GenerateSeoError)
      expect(fs.existsSync(outPath)).toBe(false)
    })

    it(`with the override, ${label} ships NO CMS data — only built-in metadata`, async () => {
      const outPath = scratchOutPath()
      const fetchImpl = vi.fn().mockResolvedValue(okResponse(body()))
      const result = await run({ fetchImpl, outPath, cmsUnavailableOk: true })
      expect(result).toEqual({ routeCount: 0, watermark: '', override: true })
      const written = fs.readFileSync(outPath, 'utf-8')
      expect(written).toContain('export const routeSeo: Record<string, RouteSeo> = {}')
      expect(written).toContain('export const SEO_OVERRIDE = true')
      expect(written).not.toContain('not-a-real-route')
      expect(written).not.toContain('evil.example')
      fs.rmSync(outPath)
    })
  }

  it('the override is inert on a healthy CMS — a normal build ignores it', async () => {
    const outPath = scratchOutPath()
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ data: { routeStubs: { nodes: fullFixture() } } }))
    const result = await run({ fetchImpl, outPath, cmsUnavailableOk: true })
    expect(result.override).toBe(false)
    expect(result.routeCount).toBe(1)
    fs.rmSync(outPath)
  })

  it('with the override, a 200 that is not JSON also ships no CMS data', async () => {
    let now = 0
    const outPath = scratchOutPath()
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<html>nope</html>' })
    const result = await run({
      fetchImpl, outPath, cmsUnavailableOk: true,
      sleepImpl: async (ms: number) => { now += ms }, totalMs: 100, baseMs: 10, now: () => now,
    })
    expect(result.override).toBe(true)
    expect(fs.readFileSync(outPath, 'utf-8')).toContain('export const routeSeo: Record<string, RouteSeo> = {}')
    fs.rmSync(outPath)
  })

  it('without the override, a 200 that is not JSON fails the build', async () => {
    let now = 0
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<html>nope</html>' })
    await expect(
      run({ fetchImpl, outPath: scratchOutPath(), sleepImpl: async (ms: number) => { now += ms }, totalMs: 100, baseMs: 10, now: () => now })
    ).rejects.toThrow(/not JSON/)
  })
})

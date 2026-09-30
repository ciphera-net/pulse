import { describe, it, expect, vi } from 'vitest'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { MARKETING_ROUTES } from '@/lib/marketing-routes'
import {
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

// The full, valid 25-route fixture — every MARKETING_ROUTES path with a
// matching, well-formed stub. Individual tests mutate a copy of this.
function fullFixture(): RouteStubNode[] {
  return MARKETING_ROUTES.map((p) => validNode(p))
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body }
}

function scratchOutPath(): string {
  return path.join(os.tmpdir(), `seo-gen-test-${Math.random().toString(36).slice(2)}.ts`)
}

describe('EXPECTED_ROUTES', () => {
  it('is derived from lib/marketing-routes.ts and equals 25 today', () => {
    expect(EXPECTED_ROUTES).toBe(MARKETING_ROUTES.length)
    expect(EXPECTED_ROUTES).toBe(25)
  })
})

describe('buildRouteMap — D38 allowlist + dedup', () => {
  it('accepts every one of the 25 L1 routes', () => {
    const seen = buildRouteMap(fullFixture())
    expect(seen.size).toBe(25)
    for (const p of MARKETING_ROUTES) expect(seen.has(p)).toBe(true)
  })

  it('"/" matches only the literal root — not as a prefix', () => {
    expect(ALLOWED_PATHS.has('/')).toBe(true)
    expect(ALLOWED_PATHS.has('/about')).toBe(true)
    // A path that merely STARTS WITH the allowed set is not itself allowed.
    expect(ALLOWED_PATHS.has('/abou')).toBe(false)
    expect(ALLOWED_PATHS.has('//')).toBe(false)

    const seen = buildRouteMap([validNode('/')])
    expect(seen.has('/')).toBe(true)
    expect(seen.size).toBe(1)
  })

  it('fails the build on a stub path outside the L1 allowlist', () => {
    const nodes = [...fullFixture(), validNode('/settings')]
    expect(() => buildRouteMap(nodes)).toThrow(GenerateSeoError)
    expect(() => buildRouteMap(nodes)).toThrow(/not one of the 25 Level 1 marketing routes/)
  })

  it('fails the build on a stub for an excluded /integrations/[slug] guide (D35/D38)', () => {
    const nodes = [validNode('/integrations/nextjs')]
    expect(() => buildRouteMap(nodes)).toThrow(GenerateSeoError)
  })

  it('fails the build on a duplicate stub for the same path', () => {
    const nodes = [validNode('/about'), validNode('/about')]
    expect(() => buildRouteMap(nodes)).toThrow(/duplicate stub for \/about/)
  })

  it('skips nodes not tagged for the pulse site, without failing', () => {
    const nodes = [validNode('/about', { routeSites: { nodes: [{ slug: 'ciphera-net' }] } })]
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
    expect(buildRouteMap(nodes).size).toBe(25)
  })

  it('fails on an empty path', () => {
    expect(() => buildRouteMap([validNode('')])).toThrow(/empty path/)
  })

  it('fails on a path missing the leading slash', () => {
    expect(() => buildRouteMap([validNode('about')])).toThrow(/does not start with/)
  })
})

describe('validateStub — required fields and the CDN image gate', () => {
  it('accepts a stub with a title, a description, and no OG image', () => {
    expect(() => validateStub('/about', validNode('/about'))).not.toThrow()
  })

  it('fails a stub with no title', () => {
    expect(() => validateStub('/about', validNode('/about', { cipheraTitle: '' }))).toThrow(/no title/)
  })

  it('fails a stub with no description', () => {
    expect(() =>
      validateStub('/about', validNode('/about', { cipheraDescription: '   ' }))
    ).toThrow(/no meta description/)
  })

  it('fails a stub whose OG image is not on cdn.ciphera.net', () => {
    expect(() =>
      validateStub('/about', validNode('/about', { cipheraOgImage: 'https://evil.example/x.png' }))
    ).toThrow(/not on cdn\.ciphera\.net/)
  })

  it('accepts a stub whose OG image IS on cdn.ciphera.net', () => {
    expect(() =>
      validateStub(
        '/about',
        validNode('/about', { cipheraOgImage: 'https://cdn.ciphera.net/pulse/og-about.png' })
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
  it('writes lib/seo.gen.ts with all 25 routes on a healthy, fully-seeded response', async () => {
    const outPath = scratchOutPath()
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse({ data: { routeStubs: { nodes: fullFixture() } } }))
    try {
      const result = await run({ fetchImpl, outPath })
      expect(result).toEqual({ routeCount: 25, watermark: '2026-09-30T12:00:00', override: false })
      const written = fs.readFileSync(outPath, 'utf-8')
      expect(written).toContain('export const SEO_ROUTE_COUNT = 25')
      expect(written).toContain('export const SEO_OVERRIDE = false')
      expect(written).toContain('export const SEO_GENERATED = true')
      expect(written).toContain('"/about"')
    } finally {
      fs.rmSync(outPath, { force: true })
    }
  })

  it('fails the count gate when fewer than 25 routes are seeded — the correct state mid-rollout', async () => {
    const outPath = scratchOutPath()
    const partial = fullFixture().slice(0, 24) // one route not yet seeded
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse({ data: { routeStubs: { nodes: partial } } }))
    await expect(run({ fetchImpl, outPath })).rejects.toThrow(/expected 25 pulse stubs, found 24/)
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

  it('D39: the override flag NEVER masks a validation failure on a REACHABLE CMS', async () => {
    const outPath = scratchOutPath()
    // WordPress answers (reachable), but with a stub outside the allowlist —
    // a real validation failure, not an availability problem.
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse({ data: { routeStubs: { nodes: [validNode('/not-a-real-route')] } } }))
    await expect(run({ fetchImpl, outPath, cmsUnavailableOk: true })).rejects.toThrow(
      /not one of the 25 Level 1 marketing routes/
    )
    expect(fs.existsSync(outPath)).toBe(false)
  })

  it('D39: the override flag never masks the count gate either', async () => {
    const outPath = scratchOutPath()
    const partial = fullFixture().slice(0, 10)
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ data: { routeStubs: { nodes: partial } } }))
    await expect(run({ fetchImpl, outPath, cmsUnavailableOk: true })).rejects.toThrow(/expected 25/)
    expect(fs.existsSync(outPath)).toBe(false)
  })

  it('D39: the override flag never masks a 200 that is not JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<html>nope</html>' })
    let now = 0
    await expect(
      run({
        fetchImpl, outPath: scratchOutPath(), cmsUnavailableOk: true,
        sleepImpl: async (ms: number) => { now += ms }, totalMs: 100, baseMs: 10, now: () => now,
      })
    ).rejects.toThrow(/not JSON/)
  })

  it('D39: the override flag never masks a GraphQL errors[] response', async () => {
    const outPath = scratchOutPath()
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ errors: [{ message: 'boom' }] }))
    await expect(run({ fetchImpl, outPath, cmsUnavailableOk: true })).rejects.toThrow(/GraphQL errors/)
    expect(fs.existsSync(outPath)).toBe(false)
  })
})

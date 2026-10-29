// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
// Next's own schema for the config it loads. Imported rather than re-described, so a key Next
// does not know (or a value of the wrong type) fails here the way it would fail `next build`.
import { configSchema } from 'next/dist/server/config-schema'

// next.config.ts calls the PWA plugin and writes public/build-id.json when it is loaded.
vi.mock('@ducanh2912/next-pwa', () => ({ default: () => (config: unknown) => config }))
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, writeFileSync: vi.fn() }
})

/**
 * Which Origin hosts may post a Server Action to this app, as next.config.ts resolves it.
 *
 * Behind the staging app's reverse proxy the pod is asked for the origin's own name while the
 * browser's Origin is the public host, and Next 16 answers every Server Action (the sign-in code
 * exchange, the session read on every page load) with 500 "Invalid Server Actions request." unless
 * the Origin host is listed. The list is derived from NEXT_PUBLIC_APP_URL, the origin that is
 * already registered as the OAuth redirect_uri, so there is one source and no new setting.
 *
 * In production the list holds the production host, which is the Host the edge forwards anyway,
 * so the check passes with or without it.
 */
type Experimental = { serverActions?: { allowedOrigins?: string[] } }

/** next.config.ts loaded afresh, with NEXT_PUBLIC_APP_URL set to `url` (undefined removes it). */
async function experimentalFor(url: string | undefined): Promise<Experimental> {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', url)
  const config = (await import('../../next.config')).default as unknown as { experimental: Experimental }
  return config.experimental
}

const allowedFor = async (url: string | undefined) => (await experimentalFor(url)).serverActions?.allowedOrigins

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('experimental.serverActions.allowedOrigins', () => {
  it('holds the host of the staging app URL, so a proxied Origin is accepted', async () => {
    expect(await allowedFor('https://pulse-staging.teleport.ciphera.net')).toEqual(['pulse-staging.teleport.ciphera.net'])
  })

  it("holds production's own host in production, which is the Host the edge forwards: a no-op there", async () => {
    expect(await allowedFor('https://pulse.ciphera.net')).toEqual(['pulse.ciphera.net'])
  })

  it('keeps a port, because Next compares the Origin host with its port', async () => {
    expect(await allowedFor('http://localhost:3003')).toEqual(['localhost:3003'])
  })

  it('is a host and nothing more: no scheme, no path, no trailing slash', async () => {
    for (const url of ['https://pulse-staging.teleport.ciphera.net/', 'https://pulse-staging.teleport.ciphera.net/app?x=1#y']) {
      expect(await allowedFor(url), url).toEqual(['pulse-staging.teleport.ciphera.net'])
    }
    for (const url of ['https://pulse.ciphera.net', 'https://pulse-staging.teleport.ciphera.net', 'http://localhost:3003']) {
      for (const entry of (await allowedFor(url)) ?? []) expect(entry, url).toMatch(/^[a-z0-9.-]+(:\d+)?$/)
    }
  })

  it('has exactly one entry for one app URL, never a pattern', async () => {
    const list = await allowedFor('https://pulse-staging.teleport.ciphera.net')
    expect(list).toHaveLength(1)
    expect(list!.some((entry) => entry.includes('*'))).toBe(false)
  })

  // Next's own default is [], and a guess here would widen a CSRF check. Each of these has to land
  // on the empty list, not on a host.
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['not a URL', 'not a url'],
    ['a bare host with no scheme', 'pulse-staging.teleport.ciphera.net'],
    ['a host and port with no scheme', 'localhost:3003'],
  ])('is empty when the app URL is %s', async (_label, url) => {
    expect(await allowedFor(url)).toEqual([])
  })

  it('is a key Next accepts, with a value of the type Next expects', async () => {
    for (const url of ['https://pulse-staging.teleport.ciphera.net', undefined]) {
      const result = configSchema.safeParse({ experimental: await experimentalFor(url) })
      expect(result.success, JSON.stringify(result.success ? '' : result.error.issues)).toBe(true)
    }
  })

  // The controls: the checks above are only worth something if they can come out the other way.
  it('control: the schema rejects a misspelt key and a wrong type', () => {
    expect(configSchema.safeParse({ experimental: { serverAction: { allowedOrigins: [] } } }).success).toBe(false)
    expect(configSchema.safeParse({ experimental: { serverActions: { allowedOrigins: 'pulse.ciphera.net' } } }).success).toBe(false)
  })

  it('control: a different app URL gives a different list', async () => {
    const staging = await allowedFor('https://pulse-staging.teleport.ciphera.net')
    const production = await allowedFor('https://pulse.ciphera.net')
    expect(staging).not.toEqual(production)
  })
})

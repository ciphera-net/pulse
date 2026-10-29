// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCESS_PROXY_HOST, DEFAULT_BASE_URL, clientCertificates, onAccessProxy } from '../tests/support/base'

/**
 * The origin the authed Playwright suite drives and the certificate it presents there
 * (tests/support/base.ts). Playwright itself is not run here: these are the pure decisions the
 * config and the login helper make, which are what a wrong environment turns into a confusing run.
 */

const BASE = 'https://pulse-staging.teleport.ciphera.net'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('BASE_URL', () => {
  it('is the staging app, one origin, unless SMOKE_BASE_URL says otherwise', async () => {
    expect(DEFAULT_BASE_URL).toBe(BASE)
    vi.stubEnv('SMOKE_BASE_URL', undefined)
    vi.resetModules()
    expect((await import('../tests/support/base')).BASE_URL).toBe(BASE)
  })

  it('takes SMOKE_BASE_URL when it is set', async () => {
    vi.stubEnv('SMOKE_BASE_URL', 'http://localhost:3003')
    vi.resetModules()
    expect((await import('../tests/support/base')).BASE_URL).toBe('http://localhost:3003')
  })
})

describe('clientCertificates', () => {
  it('is undefined when neither path is set, so a run without a certificate is unchanged', () => {
    expect(clientCertificates({}, BASE)).toBeUndefined()
    expect(clientCertificates({ SMOKE_CLIENT_CERT: '', SMOKE_CLIENT_KEY: '' }, BASE)).toBeUndefined()
  })

  it("holds one entry, for the base URL's exact origin, carrying the two paths and nothing else", () => {
    const certs = clientCertificates({ SMOKE_CLIENT_CERT: '/run/app.crt', SMOKE_CLIENT_KEY: '/run/app.key' }, BASE)
    expect(certs).toEqual([{ origin: BASE, certPath: '/run/app.crt', keyPath: '/run/app.key' }])
  })

  // Playwright matches a certificate to an EXACT origin: a path or a trailing slash in the entry
  // would match nothing, and the run would present no certificate at all.
  it.each([
    ['https://pulse-staging.teleport.ciphera.net/', 'https://pulse-staging.teleport.ciphera.net'],
    ['https://pulse-staging.teleport.ciphera.net/sites?x=1', 'https://pulse-staging.teleport.ciphera.net'],
    ['https://localhost:8443/login', 'https://localhost:8443'],
  ])('reduces %s to the origin %s', (base, origin) => {
    const certs = clientCertificates({ SMOKE_CLIENT_CERT: '/c', SMOKE_CLIENT_KEY: '/k' }, base)
    expect(certs?.[0]?.origin).toBe(origin)
  })

  it('reads the process environment by default', () => {
    vi.stubEnv('SMOKE_CLIENT_CERT', '/from/env.crt')
    vi.stubEnv('SMOKE_CLIENT_KEY', '/from/env.key')
    expect(clientCertificates(undefined, BASE)).toEqual([{ origin: BASE, certPath: '/from/env.crt', keyPath: '/from/env.key' }])
  })

  // Half a configuration would otherwise present nothing, fall through to the proxy's sign-in page
  // and fail somewhere that says nothing about the cause.
  it.each([
    ['only the certificate', { SMOKE_CLIENT_CERT: '/c' }],
    ['only the key', { SMOKE_CLIENT_KEY: '/k' }],
    ['a certificate and an empty key', { SMOKE_CLIENT_CERT: '/c', SMOKE_CLIENT_KEY: '' }],
  ])('refuses %s', (_label, env) => {
    expect(() => clientCertificates(env, BASE)).toThrow(/go together/)
  })

  it('control: a value is passed through, not invented', () => {
    const certs = clientCertificates({ SMOKE_CLIENT_CERT: '/other.crt', SMOKE_CLIENT_KEY: '/other.key' }, BASE)
    expect(certs?.[0]?.certPath).toBe('/other.crt')
    expect(certs?.[0]?.certPath).not.toBe('/run/app.crt')
  })
})

describe('onAccessProxy', () => {
  it.each([
    'https://teleport.ciphera.net/web/login?redirect_uri=https%3A%2F%2Fpulse-staging.teleport.ciphera.net%2Fsettings',
    'https://teleport.ciphera.net/web/launch/pulse-staging.teleport.ciphera.net',
    'https://teleport.ciphera.net/',
  ])('is true on the proxy: %s', (url) => {
    expect(onAccessProxy(url)).toBe(true)
  })

  it.each([
    `${BASE}/settings`,
    'https://id.ciphera.net/login',
    'https://pulse.ciphera.net/login',
    'https://teleport.ciphera.net.example.com/',
    'https://evil-teleport.ciphera.net/',
    'http://localhost:3003/login',
    'about:blank',
    'not a url',
    '',
  ])('is false on the app, on look-alikes and on garbage: %j', (url) => {
    expect(onAccessProxy(url)).toBe(false)
  })

  it('names the proxy host the constant says', () => {
    expect(onAccessProxy(`https://${ACCESS_PROXY_HOST}/web`)).toBe(true)
    expect(ACCESS_PROXY_HOST).toBe('teleport.ciphera.net')
  })
})

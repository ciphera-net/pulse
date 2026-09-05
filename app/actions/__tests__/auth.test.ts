import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Pulse's server actions after per-app sessions S3.
 *
 * Two things are pinned here that no type check can see:
 *
 *  - THE EXCHANGE writes Pulse's OWN host-only cookies from the response BODY
 *    and discards the apex Set-Cookie trio id-backend sends on every answer.
 *    Until S3 this action MIRRORED those onto `.ciphera.net` — Pulse rewriting
 *    the estate's session on every login. A mirror that came back would pass
 *    every type check and every render.
 *
 *  - THE SIGN-OUT actually revokes. Until S3 it posted `{refresh_token}` in a
 *    body id-backend's LogoutHandler never reads (design §2) and reported
 *    success regardless. Now it presents the Bearer, a hand-built Cookie with
 *    `refresh_token` AND `csrf_token`, and a matching `X-CSRF-Token`, renews
 *    first when the access token has already expired, and says what id-backend
 *    confirmed.
 */

const ID_API_URL = 'https://api.id.example.test'
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_ID_API_URL: ID_API_URL } }))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

type SetRecord = { name: string; value: string; options: Record<string, unknown> }
type DeleteRecord = { name: string; options: Record<string, unknown> }
function makeCookieStore(initial: Record<string, string>) {
  const jar = new Map(Object.entries(initial))
  const sets: SetRecord[] = []
  const deletes: DeleteRecord[] = []
  return {
    sets,
    deletes,
    store: {
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      set: (name: string, value: string, options: Record<string, unknown> = {}) => {
        sets.push({ name, value, options })
        jar.set(name, value)
      },
      delete: (arg: { name: string } & Record<string, unknown>) => {
        const { name, ...options } = arg
        deletes.push({ name, options })
        jar.delete(name)
      },
    },
  }
}
let cookieStore: ReturnType<typeof makeCookieStore>
const BROWSER_UA = 'HarnessBrowser/1.0'
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore.store,
  headers: async () => new Headers({ 'user-agent': BROWSER_UA }),
}))

function jwt(payload: Record<string, unknown>) {
  return `h.${Buffer.from(JSON.stringify(payload)).toString('base64')}.s`
}
const ACCESS = jwt({ sub: 'user-1', org_id: 'org-1', role: 'owner' })

function tokenResponse() {
  const headers = new Headers({ 'content-type': 'application/json', 'x-csrf-token': 'csrf-1' })
  headers.append('set-cookie', 'access_token=apex-a; Path=/; Domain=ciphera.net; HttpOnly; Secure; SameSite=Strict')
  headers.append('set-cookie', 'refresh_token=apex-r; Path=/; Domain=ciphera.net; HttpOnly; Secure; SameSite=Strict')
  headers.append('set-cookie', 'csrf_token=apex-c; Path=/; Domain=ciphera.net; Secure; SameSite=Strict')
  return new Response(JSON.stringify({ access_token: ACCESS, token_type: 'Bearer', expires_in: 900, refresh_token: 'R1' }), { status: 200, headers })
}
const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } })

const APEX = ['access_token', 'refresh_token', 'csrf_token']

describe('exchangeAuthCode — Pulse writes only its own host-only cookies', () => {
  beforeEach(() => {
    vi.resetModules()
    cookieStore = makeCookieStore({})
  })

  it('writes pulse_access / pulse_refresh / pulse_csrf, host-only, from the body and the header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tokenResponse()))
    const { exchangeAuthCode } = await import('../auth')

    const result = await exchangeAuthCode('code-1', 'verifier-1', 'https://pulse.example.test/auth/callback')

    expect(result.success).toBe(true)
    expect(cookieStore.sets.map((c) => c.name).sort()).toEqual(['pulse_access', 'pulse_csrf', 'pulse_refresh'])
    for (const c of cookieStore.sets) {
      expect(c.options, `${c.name} must carry no domain`).not.toHaveProperty('domain')
      expect(c.options.httpOnly).toBe(true)
    }
    expect(cookieStore.sets.find((c) => c.name === 'pulse_refresh')?.value).toBe('R1')
    expect(cookieStore.sets.find((c) => c.name === 'pulse_csrf')?.value).toBe('csrf-1')
  })

  it('🔴 does not mirror the apex Set-Cookie trio onto this origin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tokenResponse()))
    const { exchangeAuthCode } = await import('../auth')

    await exchangeAuthCode('code-1', 'verifier-1', 'https://pulse.example.test/auth/callback')

    for (const apex of APEX) expect(cookieStore.sets.map((c) => c.name)).not.toContain(apex)
  })

  it('returns the access token for the browser\'s in-memory Bearer, and forwards the browser\'s User-Agent', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(tokenResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const { exchangeAuthCode } = await import('../auth')

    const result = await exchangeAuthCode('code-1', 'verifier-1', 'https://pulse.example.test/auth/callback')

    expect(result.success && result.access_token).toBe(ACCESS)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${ID_API_URL}/oauth/token`)
    const h = new Headers(init.headers)
    expect(h.get('user-agent')).toBe(BROWSER_UA)
    expect(h.get('cookie')).toBeNull()
    expect(JSON.parse(String(init.body))).toMatchObject({ grant_type: 'authorization_code', code: 'code-1', client_id: 'pulse-app', code_verifier: 'verifier-1' })
  })

  it('refuses a 200 that carries no refresh token — that is not a session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { access_token: ACCESS })))
    const { exchangeAuthCode } = await import('../auth')

    const result = await exchangeAuthCode('code-1', 'verifier-1', 'https://pulse.example.test/auth/callback')

    expect(result.success).toBe(false)
    expect(cookieStore.sets).toHaveLength(0)
  })
})

describe('getSessionAction — reads Pulse\'s own access cookie, never the apex one', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns the user AND the token from pulse_access', async () => {
    cookieStore = makeCookieStore({ pulse_access: ACCESS, access_token: jwt({ sub: 'someone-else' }) })
    const { getSessionAction } = await import('../auth')

    const session = await getSessionAction()

    expect(session?.id).toBe('user-1')
    expect(session?.access_token).toBe(ACCESS)
  })

  it('reports no session when only the apex access_token is present', async () => {
    cookieStore = makeCookieStore({ access_token: jwt({ sub: 'someone-else' }) })
    const { getSessionAction } = await import('../auth')

    expect(await getSessionAction()).toBeNull()
  })
})

describe('logoutAction — Pulse\'s own family, revoked for real', () => {
  beforeEach(() => {
    vi.resetModules()
    cookieStore = makeCookieStore({ pulse_access: ACCESS, pulse_refresh: 'R1', pulse_csrf: 'C1', refresh_token: 'APEX', csrf_token: 'APEX-C' })
  })

  it('presents the Bearer, a hand-built Cookie with refresh_token AND csrf_token, and X-CSRF-Token', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(json(200, { message: 'Logged out' }))
    vi.stubGlobal('fetch', fetchSpy)
    const { logoutAction } = await import('../auth')

    const result = await logoutAction()

    expect(result.revoked).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${ID_API_URL}/api/v1/auth/logout`)
    const h = new Headers(init.headers)
    expect(h.get('authorization')).toBe(`Bearer ${ACCESS}`)
    // 🔴 Pulse's values, never the browser's apex ones.
    expect(h.get('cookie')).toBe('refresh_token=R1; csrf_token=C1')
    expect(h.get('x-csrf-token')).toBe('C1')
    expect(h.get('user-agent')).toBe(BROWSER_UA)
  })

  it('expires the three pulse_* cookies and touches nothing apex', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, {})))
    const { logoutAction } = await import('../auth')

    await logoutAction()

    expect(cookieStore.deletes.map((d) => d.name).sort()).toEqual(['pulse_access', 'pulse_csrf', 'pulse_refresh'])
    for (const d of cookieStore.deletes) expect(d.options).not.toHaveProperty('domain')
  })

  it('renews and retries once when the access token has already expired', async () => {
    const rotatedAccess = jwt({ sub: 'user-1' })
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: 'Token expired' }))
      .mockResolvedValueOnce(json(200, { access_token: rotatedAccess, refresh_token: 'R2', rotated: true }, { 'x-csrf-token': 'C2' }))
      .mockResolvedValueOnce(json(200, { message: 'Logged out' }))
    vi.stubGlobal('fetch', fetchSpy)
    const { logoutAction } = await import('../auth')

    const result = await logoutAction()

    expect(result.revoked).toBe(true)
    const urls = fetchSpy.mock.calls.map((c) => c[0])
    expect(urls).toEqual([`${ID_API_URL}/api/v1/auth/logout`, `${ID_API_URL}/api/v1/auth/refresh`, `${ID_API_URL}/api/v1/auth/logout`])
    const renewal = fetchSpy.mock.calls[1][1] as RequestInit
    expect(new Headers(renewal.headers).get('cookie')).toBeNull()
    expect(JSON.parse(String(renewal.body)).refresh_token).toBe('R1')
    const retry = new Headers((fetchSpy.mock.calls[2][1] as RequestInit).headers)
    expect(retry.get('authorization')).toBe(`Bearer ${rotatedAccess}`)
    expect(retry.get('cookie')).toBe('refresh_token=R2; csrf_token=C2')
    expect(retry.get('x-csrf-token')).toBe('C2')
  })

  it('reports an already-dead credential as such, not as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, { error: 'Token revoked' })))
    const { logoutAction } = await import('../auth')

    const result = await logoutAction()

    expect(result.revoked).toBe(false)
    expect(result.already_invalid).toBe(true)
    expect(cookieStore.deletes).toHaveLength(3)
  })

  it('reports an unconfirmed revocation honestly and still clears the cookies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(503, { error: 'down' })))
    const { logoutAction } = await import('../auth')

    const result = await logoutAction()

    expect(result.revoked).toBe(false)
    expect(result.already_invalid).toBe(false)
    expect(result.status).toBe(503)
    expect(cookieStore.deletes).toHaveLength(3)
  })

  it('🔴 with no Pulse session, the apex cookies in the browser are NOT used to sign anyone out', async () => {
    cookieStore = makeCookieStore({ refresh_token: 'APEX', csrf_token: 'APEX-C', access_token: ACCESS })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { logoutAction } = await import('../auth')

    const result = await logoutAction()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.revoked).toBe(false)
  })
})

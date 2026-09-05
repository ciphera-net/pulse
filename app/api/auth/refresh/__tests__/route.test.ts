import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * These tests exist for two reasons, and both are worth stating precisely so
 * nobody "simplifies" the guards away.
 *
 * 1. THE WRITE-BACK GUARD. id-backend answers a refresh with 200 OK in two
 *    different situations:
 *
 *      ROTATED — `refresh_token` in the body is a brand-new token.
 *      ECHOED  — `refresh_token` in the body is the token we just SENT, because
 *                the server took its "benign reuse" grace path (two callers
 *                refreshed the same cookie at once; the other one won and this
 *                token is now REVOKED) — or it is absent altogether.
 *
 *    If the route stores the echoed token, the browser's session silently rolls
 *    back to a revoked token, keeps working for the 60s grace window, and then —
 *    up to 13 minutes later — trips id-backend's token-theft detection, which
 *    revokes the whole family. Measured on production 20-08-2026: 38 account-wide
 *    revocations in 10 days, with no audit entry anywhere.
 *
 * 2. THE COOKIE SHAPE (per-app sessions S3). Pulse's cookies are its OWN names
 *    (`pulse_access` / `pulse_refresh` / `pulse_csrf`), host-only — never the
 *    apex trio, never a `domain`. The browser still holds the ceremony's apex
 *    `refresh_token` until S5, so the upstream call must carry NO Cookie header:
 *    id-backend reads a cookie before the body, and the browser's would be the
 *    ceremony's token.
 */

const ID_API_URL = 'https://api.id.example.test'

vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_ID_API_URL: ID_API_URL } }))

type SetRecord = { name: string; value: string; options: Record<string, unknown> }
type DeleteRecord = { name: string; options: Record<string, unknown> }

/** Records every set/delete WITH its options so a test can assert the attributes. */
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
vi.mock('next/headers', () => ({ cookies: async () => cookieStore.store }))

const OLD_TOKEN = 'old-refresh-token-aaaaaaaa'
const NEW_TOKEN = 'new-refresh-token-bbbbbbbb'
const APEX_TOKEN = 'the-ceremonys-apex-refresh-token'

/** A JWT-shaped access token whose payload carries no org, so no org round-trip. */
function accessToken(orgId = '') {
  const payload = Buffer.from(JSON.stringify(orgId ? { org_id: orgId } : {})).toString('base64')
  return `header.${payload}.signature`
}

/** The upstream 200 the route will see — including the apex Set-Cookie id-backend always sends. */
function upstreamOk(refreshToken: string | null, extra: Record<string, unknown> = {}) {
  const body: Record<string, unknown> = { access_token: accessToken(), ...extra }
  if (refreshToken) body.refresh_token = refreshToken
  const headers = new Headers({ 'content-type': 'application/json', 'x-csrf-token': 'csrf-from-header' })
  headers.append('set-cookie', 'access_token=apex-a; Path=/; Domain=ciphera.net; HttpOnly; Secure; SameSite=Strict')
  headers.append('set-cookie', 'refresh_token=apex-r; Path=/; Domain=ciphera.net; HttpOnly; Secure; SameSite=Strict')
  headers.append('set-cookie', 'csrf_token=apex-c; Path=/; Domain=ciphera.net; Secure; SameSite=Strict')
  return new Response(JSON.stringify(body), { status: 200, headers })
}

function request() {
  return new Request('https://pulse.example.test/api/auth/refresh', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'test-agent',
      // What a real browser sends: Pulse's own cookies AND the ceremony's apex ones.
      cookie: `pulse_refresh=${OLD_TOKEN}; refresh_token=${APEX_TOKEN}; access_token=apex-access`,
    },
    body: JSON.stringify({ screen_width: 1440, screen_height: 900, timezone: 'Europe/Brussels', org_id: '' }),
  })
}

async function callRoute() {
  const { POST } = await import('../route')
  return POST(request())
}

const APEX_NAMES = ['access_token', 'refresh_token', 'csrf_token']

describe('POST /api/auth/refresh — refresh token write-back guard', () => {
  beforeEach(() => {
    vi.resetModules()
    cookieStore = makeCookieStore({ pulse_refresh: OLD_TOKEN })
  })

  it('stores the new token when the server actually rotated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamOk(NEW_TOKEN, { rotated: true })))

    const res = await callRoute()
    expect(res.status).toBe(200)

    const written = cookieStore.sets.filter((c) => c.name === 'pulse_refresh')
    expect(written).toHaveLength(1)
    expect(written[0].value).toBe(NEW_TOKEN)
  })

  it('does NOT write the cookie when the server echoes the token we sent', async () => {
    // The grace path: same token back, 200 OK — and that token is already revoked.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamOk(OLD_TOKEN, { rotated: false })))

    const res = await callRoute()
    expect(res.status).toBe(200)

    expect(cookieStore.sets.filter((c) => c.name === 'pulse_refresh')).toHaveLength(0)
    expect(cookieStore.deletes.map((d) => d.name)).not.toContain('pulse_refresh')
  })

  it('still refreshes the access token on the echoed (grace) response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamOk(OLD_TOKEN, { rotated: false })))

    await callRoute()

    expect(cookieStore.sets.filter((c) => c.name === 'pulse_access')).toHaveLength(1)
  })

  it('does not write the cookie when the server omits refresh_token entirely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamOk(null, { rotated: false })))

    await callRoute()

    expect(cookieStore.sets.filter((c) => c.name === 'pulse_refresh')).toHaveLength(0)
  })

  it('401s without calling upstream when there is no pulse_refresh cookie — the apex cookie is NOT a fallback', async () => {
    // The browser holds the ceremony's apex refresh_token (it reaches this host
    // until S5). It is not Pulse's session and must never be refreshed here.
    cookieStore = makeCookieStore({ refresh_token: APEX_TOKEN })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const res = await callRoute()

    expect(res.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/refresh — the S3 cookie shape', () => {
  beforeEach(() => {
    vi.resetModules()
    cookieStore = makeCookieStore({ pulse_refresh: OLD_TOKEN, pulse_access: accessToken() })
  })

  it('writes ONLY pulse_* cookies, every one host-only and httpOnly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamOk(NEW_TOKEN, { rotated: true })))

    await callRoute()

    const names = cookieStore.sets.map((c) => c.name).sort()
    expect(names).toEqual(['pulse_access', 'pulse_csrf', 'pulse_refresh'])
    for (const c of cookieStore.sets) {
      expect(c.options, `${c.name} must carry no domain`).not.toHaveProperty('domain')
      expect(c.options.httpOnly, `${c.name} must be httpOnly`).toBe(true)
      expect(c.options.path).toBe('/')
      expect(c.options.sameSite).toBe('lax')
    }
    expect(cookieStore.sets.find((c) => c.name === 'pulse_csrf')?.value).toBe('csrf-from-header')
  })

  it('never relays the apex Set-Cookie trio id-backend sends on every answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamOk(NEW_TOKEN, { rotated: true })))

    await callRoute()

    for (const apex of APEX_NAMES) {
      expect(cookieStore.sets.map((c) => c.name)).not.toContain(apex)
    }
  })

  it('sends the token in the BODY and NO Cookie header upstream', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(upstreamOk(NEW_TOKEN, { rotated: true }))
    vi.stubGlobal('fetch', fetchSpy)

    await callRoute()

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${ID_API_URL}/api/v1/auth/refresh`)
    const headers = new Headers(init.headers)
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('user-agent')).toBe('test-agent')
    expect(JSON.parse(String(init.body)).refresh_token).toBe(OLD_TOKEN)
  })

  it('hands the new access token to the browser for its in-memory Bearer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamOk(NEW_TOKEN, { rotated: true })))

    const res = await callRoute()
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.access_token).toBe(accessToken())
  })
})

/**
 * Cookie destruction on failure.
 *
 * 🔴 This route used to delete the access cookie on ANY non-OK upstream status,
 * and the refresh cookie too unless the status was exactly 403. A 500, a 502
 * while id-backend rolled, or a gateway blip therefore permanently destroyed a
 * session that was never invalid — very likely the origin of "I get logged out
 * when we deploy". Only a 401 is a verdict about the credential.
 * Audit: Infra/Auth/docs/audits/20-08-2026-session-loss-root-cause-audit.md §4 F-D
 */
describe('POST /api/auth/refresh — only a verdict may destroy the session', () => {
  beforeEach(() => {
    vi.resetModules()
    cookieStore = makeCookieStore({ pulse_refresh: OLD_TOKEN, pulse_access: accessToken(), pulse_csrf: 'c' })
  })

  function upstreamFailure(status: number, body: unknown = { error: 'nope' }) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }

  it('deletes the three pulse_* cookies on 401 — the credential was rejected — and nothing apex', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamFailure(401)))

    const res = await callRoute()

    expect(res.status).toBe(401)
    expect(cookieStore.deletes.map((d) => d.name).sort()).toEqual(['pulse_access', 'pulse_csrf', 'pulse_refresh'])
    for (const d of cookieStore.deletes) {
      expect(d.options, `${d.name} delete must carry no domain`).not.toHaveProperty('domain')
    }
    expect((await res.json()).transient).toBe(false)
  })

  it.each([500, 502, 503, 504, 429])(
    'keeps every cookie on %i — no verdict was reached',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamFailure(status)))

      const res = await callRoute()

      expect(cookieStore.deletes).toHaveLength(0)
      expect((await res.json()).transient).toBe(true)
    },
  )

  it('keeps the refresh token on 403 — org context is not a credential verdict', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamFailure(403, { error: 'wrong org' })))

    const res = await callRoute()
    const body = await res.json()

    expect(cookieStore.deletes.map((d) => d.name)).not.toContain('pulse_refresh')
    expect(cookieStore.deletes.map((d) => d.name)).toContain('pulse_access')
    expect(body.retryable).toBe(true)
    expect(body.transient).toBe(false)
  })

  it('keeps every cookie when the upstream call throws outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    const res = await callRoute()

    expect(res.status).toBe(500)
    expect(cookieStore.deletes).toHaveLength(0)
    expect((await res.json()).transient).toBe(true)
  })
})

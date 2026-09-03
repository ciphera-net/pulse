import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * These tests pin the REQUEST SHAPE of the sign-out, and they exist because the
 * shape was wrong in production and nothing could see it.
 *
 * `POST /api/v1/auth/logout` sits on id-backend's `protected` group —
 * `AuthMiddleware` then `CSRFMiddleware` (`cmd/server/main.go`) — and `/logout`
 * is NOT on `CSRFMiddleware`'s skip list (`internal/api/middleware.go`: login,
 * refresh, register, /oauth*, verify, authorize-session, forgot-password,
 * reset-password). Three things must arrive, and each one's absence fails
 * differently:
 *
 *   access_token   AuthMiddleware. Absent ⇒ 401, CSRFMiddleware never runs.
 *   csrf_token     CSRFMiddleware step 1. Absent ⇒ 403 "CSRF token required".
 *                  It must ALSO come back as an `X-CSRF-Token` header, compared
 *                  with `subtle.ConstantTimeCompare`.
 *   refresh_token  `LogoutHandler` (`internal/api/auth.go`) reads this COOKIE
 *                  and only this cookie; it is what
 *                  `RevokeFamilyByPresentedToken` kills.
 *
 * `logoutAction` runs on the SERVER, so there is no browser to attach cookies —
 * `credentials: 'include'` would be meaningless. Every value has to be forwarded
 * by hand on a `Cookie:` header, the way `app/api/auth/refresh/route.ts`
 * forwards the user-agent.
 *
 * Until 03-09-2026 it sent no cookie, no Authorization header and no CSRF
 * header, and put `{ refresh_token }` in the body — which `LogoutHandler` never
 * reads. id-backend answered 401, the action returned a hardcoded
 * `{ success: true }`, and the refresh family stayed live in `refresh_tokens`
 * with `revoked = FALSE` for up to 30 days while the browser looked signed out.
 *
 * Mutation checks: drop the `X-CSRF-Token` header, the `Cookie` header, or any
 * one cookie from it, and a named check below goes red. Hardcode `revoked: true`
 * and the 401/403/throw checks go red.
 */

const ID_API_URL = 'https://api.id.example.test'

vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_ID_API_URL: ID_API_URL } }))
vi.mock('@/lib/utils/cookies', () => ({ getCookieDomain: () => '.example.test' }))
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const ACCESS = 'header.eyJzdWIiOiJ1MSJ9.sig'
const REFRESH = 'refresh-token-aaaaaaaa'
/** id-backend's `GenerateCSRFToken` emits exactly this shape: nonce.hmac. */
const CSRF = 'a1b2c3d4e5f60718.9f8e7d6c5b4a39281706'

/** Records every delete so a test can assert the local teardown still ran. */
function makeCookieStore(initial: Record<string, string>) {
  const jar = new Map(Object.entries(initial))
  const deletes: string[] = []
  return {
    deletes,
    store: {
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      set: (name: string, value: string) => jar.set(name, value),
      delete: ({ name }: { name: string }) => {
        deletes.push(name)
        jar.delete(name)
      },
    },
  }
}

let cookieStore: ReturnType<typeof makeCookieStore>
vi.mock('next/headers', () => ({ cookies: async () => cookieStore.store }))

async function callLogout() {
  const { logoutAction } = await import('../auth')
  return logoutAction()
}

/** The single fetch the action makes, as `fetch` actually saw it. */
function sentRequest(fetchMock: ReturnType<typeof vi.fn>) {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  const headers = (init.headers ?? {}) as Record<string, string>
  return { url, init, headers }
}

/** Parses a `Cookie:` header into a map, the way an HTTP server would. */
function parseCookieHeader(raw: string | undefined) {
  const out: Record<string, string> = {}
  for (const pair of (raw ?? '').split(';')) {
    const trimmed = pair.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return out
}

describe('logoutAction — the sign-out must actually revoke', () => {
  beforeEach(() => {
    vi.resetModules()
    cookieStore = makeCookieStore({
      access_token: ACCESS,
      refresh_token: REFRESH,
      csrf_token: CSRF,
    })
  })

  it('sends X-CSRF-Token carrying the csrf_token cookie value', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await callLogout()

    const { headers } = sentRequest(fetchMock)
    expect(headers['X-CSRF-Token']).toBe(CSRF)
  })

  it('forwards all three cookies on a Cookie header, because a server action has no browser jar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await callLogout()

    const { headers } = sentRequest(fetchMock)
    const jar = parseCookieHeader(headers.Cookie)
    // AuthMiddleware. Absent ⇒ 401 before CSRF is even considered.
    expect(jar.access_token).toBe(ACCESS)
    // LogoutHandler reads this cookie and only this cookie.
    expect(jar.refresh_token).toBe(REFRESH)
    // CSRFMiddleware step 1, and the cookie half of the constant-time compare.
    expect(jar.csrf_token).toBe(CSRF)
  })

  it('sends the header and the cookie byte-identically (constant-time compare, no re-encoding)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await callLogout()

    const { headers } = sentRequest(fetchMock)
    expect(headers['X-CSRF-Token']).toBe(parseCookieHeader(headers.Cookie).csrf_token)
  })

  it('posts to the id-backend logout endpoint with no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await callLogout()

    const { url, init } = sentRequest(fetchMock)
    expect(url).toBe(`${ID_API_URL}/api/v1/auth/logout`)
    expect(init.method).toBe('POST')
    // LogoutHandler never reads a body. The old `{ refresh_token }` payload was
    // inert and invited the belief that it worked.
    expect(init.body).toBeUndefined()
  })

  it('reports revoked on a 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    const result = await callLogout()

    expect(result).toEqual({ success: true, revoked: true, status: 200 })
  })

  it('does NOT report revoked on a 403 — the CSRF gate refused and the family is still live', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'X-CSRF-Token header required' }), { status: 403 }),
      ),
    )

    const result = await callLogout()

    expect(result.revoked).toBe(false)
    expect(result.status).toBe(403)
  })

  it('does NOT report revoked on a 401 — the exact answer production was getting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))

    const result = await callLogout()

    expect(result.revoked).toBe(false)
    expect(result.status).toBe(401)
  })

  it('does NOT report revoked on a transport failure, and has no status — we never got a verdict', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    const result = await callLogout()

    expect(result.revoked).toBe(false)
    expect(result.status).toBeNull()
  })

  it('clears the three local cookies even when the server refuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })))

    const result = await callLogout()

    // The user asked to leave. Leaving them looking signed in is worse.
    expect(result.success).toBe(true)
    expect(cookieStore.deletes).toEqual(
      expect.arrayContaining(['access_token', 'refresh_token', 'csrf_token']),
    )
  })

  it('with no refresh_token cookie it asks nothing and claims nothing', async () => {
    cookieStore = makeCookieStore({ access_token: ACCESS, csrf_token: CSRF })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await callLogout()

    // "there was no session" must not look like "the session was revoked".
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.revoked).toBe(false)
    expect(result.status).toBeNull()
    expect(result.success).toBe(true)
  })
})

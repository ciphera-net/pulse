import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * These tests exist for one reason, and it is worth stating precisely so nobody
 * "simplifies" the guard away.
 *
 * id-backend answers a refresh with 200 OK in two different situations:
 *
 *   ROTATED — `refresh_token` in the body is a brand-new token.
 *   ECHOED  — `refresh_token` in the body is the token we just SENT, because the
 *             server took its "benign reuse" grace path (two callers refreshed the
 *             same cookie at once; the other one won and this token is now REVOKED).
 *
 * The two responses are indistinguishable by status. If the route stores the
 * echoed token, the browser's session silently rolls back to a revoked token,
 * keeps working for the 60s grace window, and then — up to 13 minutes later —
 * trips id-backend's token-theft detection, which revokes EVERY session on the
 * account, on every device. Measured on production 20-08-2026: 38 account-wide
 * revocations in 10 days, with no audit entry anywhere.
 *
 * So the assertion that matters is the negative one: on an echoed response the
 * refresh_token cookie must not be written AT ALL. Leaving it alone is correct —
 * the caller that actually rotated already put the live token in the cookie jar.
 */

const ID_API_URL = 'https://api.id.example.test'

vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_ID_API_URL: ID_API_URL } }))
vi.mock('@/lib/utils/cookies', () => ({ getCookieDomain: () => '.example.test' }))

/** Records every set/delete so a test can assert a cookie was never touched. */
function makeCookieStore(initial: Record<string, string>) {
  const jar = new Map(Object.entries(initial))
  const sets: Array<{ name: string; value: string }> = []
  const deletes: string[] = []
  return {
    sets,
    deletes,
    store: {
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      set: (name: string, value: string) => { sets.push({ name, value }); jar.set(name, value) },
      delete: ({ name }: { name: string }) => { deletes.push(name); jar.delete(name) },
    },
  }
}

let cookieStore: ReturnType<typeof makeCookieStore>
vi.mock('next/headers', () => ({ cookies: async () => cookieStore.store }))

const OLD_TOKEN = 'old-refresh-token-aaaaaaaa'
const NEW_TOKEN = 'new-refresh-token-bbbbbbbb'

/** A JWT-shaped access token whose payload carries no org, so no org round-trip. */
function accessToken(orgId = '') {
  const payload = Buffer.from(JSON.stringify(orgId ? { org_id: orgId } : {})).toString('base64')
  return `header.${payload}.signature`
}

/** Build the upstream 200 the route will see. */
function upstreamOk(refreshToken: string) {
  return new Response(
    JSON.stringify({ access_token: accessToken(), refresh_token: refreshToken }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function request() {
  return new Request('https://pulse.example.test/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'test-agent' },
    body: JSON.stringify({ screen_width: 1440, screen_height: 900, timezone: 'Europe/Brussels', org_id: '' }),
  })
}

async function callRoute() {
  const { POST } = await import('../route')
  return POST(request())
}

describe('POST /api/auth/refresh — refresh token write-back guard', () => {
  beforeEach(() => {
    vi.resetModules()
    cookieStore = makeCookieStore({ refresh_token: OLD_TOKEN })
  })

  it('stores the new token when the server actually rotated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamOk(NEW_TOKEN)))

    const res = await callRoute()
    expect(res.status).toBe(200)

    const written = cookieStore.sets.filter((c) => c.name === 'refresh_token')
    expect(written).toHaveLength(1)
    expect(written[0].value).toBe(NEW_TOKEN)
  })

  it('does NOT write the cookie when the server echoes the token we sent', async () => {
    // The grace path: same token back, 200 OK — and that token is already revoked.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamOk(OLD_TOKEN)))

    const res = await callRoute()
    expect(res.status).toBe(200)

    expect(cookieStore.sets.filter((c) => c.name === 'refresh_token')).toHaveLength(0)
    expect(cookieStore.deletes).not.toContain('refresh_token')
  })

  it('still refreshes the access token on the echoed (grace) response', async () => {
    // The grace response carries a genuinely new access token — that half is valid
    // and must still be stored, or the tab loses its session for no reason.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamOk(OLD_TOKEN)))

    await callRoute()

    expect(cookieStore.sets.filter((c) => c.name === 'access_token')).toHaveLength(1)
  })

  it('does not write the cookie when the server omits refresh_token entirely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: accessToken() }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    ))

    await callRoute()

    expect(cookieStore.sets.filter((c) => c.name === 'refresh_token')).toHaveLength(0)
  })

  it('401s without calling upstream when there is no refresh token cookie', async () => {
    cookieStore = makeCookieStore({})
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const res = await callRoute()

    expect(res.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

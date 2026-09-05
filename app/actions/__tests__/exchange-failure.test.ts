import { describe, it, expect, vi, beforeEach } from 'vitest'

// * ═══ WHICH SCREEN A FAILED EXCHANGE EARNS ═══
// *
// * Until 05-09-2026 the action mapped every non-401/403 status to 'server', and
// * the callback page sent 'server' to the marketing homepage with no word and no
// * log. id-backend answers 400 for EVERY OAuth-protocol failure, so that silent
// * bounce was the DEFAULT outcome of a failed sign-in, not an edge case.
// * Design: Infra/Auth/docs/plans/03-09-2026-per-app-sessions-design.md §10.11.12

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() })),
  headers: vi.fn(async () => ({ get: () => 'UA/1' })),
}))
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_ID_API_URL: 'https://api.id.test' } }))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

import { exchangeAuthCode } from '../auth'
import { classifyExchangeFailure } from '@/lib/auth/exchange-failure'

describe('classifyExchangeFailure — the body code decides above 400, the status below it', () => {
  it('🔴 a spent or mismatched code is a STALE ATTEMPT, not a server fault', () => {
    for (const code of ['invalid_grant', 'invalid_client', 'invalid_request', 'unsupported_grant_type']) {
      expect(classifyExchangeFailure(400, code), code).toBe('stale_attempt')
    }
  })
  it('a 400 with no recognisable code stays server — never guess a friendlier screen', () => {
    expect(classifyExchangeFailure(400, null)).toBe('server')
    expect(classifyExchangeFailure(400, 'something_new')).toBe('server')
  })
  it('the two account states keep their own screens', () => {
    expect(classifyExchangeFailure(401, 'anything')).toBe('expired')
    expect(classifyExchangeFailure(403, 'anything')).toBe('invalid')
  })
  it('rate limits and 5xx are what "server" actually describes', () => {
    expect(classifyExchangeFailure(429, 'rate_limit_exceeded')).toBe('server')
    expect(classifyExchangeFailure(500, 'server_error')).toBe('server')
    expect(classifyExchangeFailure(502, null)).toBe('server')
  })
  it('a code is only honoured on a 400 — a 500 body saying invalid_grant is still a server fault', () => {
    expect(classifyExchangeFailure(500, 'invalid_grant')).toBe('server')
  })
})

describe('exchangeAuthCode — reads the failure body and hands the raw code to telemetry', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  const failing = (status: number, body: unknown) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    )

  it('maps invalid_grant to stale_attempt and carries the raw code', async () => {
    failing(400, { error: 'invalid_grant' })
    const r = await exchangeAuthCode('spent', 'v', 'https://pulse.test/auth/callback')
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.error).toBe('stale_attempt')
    expect(r.upstream).toBe('invalid_grant')
  })

  it('a body with no error code reports http_<status> so the failure is still attributable', async () => {
    failing(502, undefined)
    const r = await exchangeAuthCode('c', 'v', 'https://pulse.test/auth/callback')
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.error).toBe('server')
    expect(r.upstream).toBe('http_502')
  })

  it('a non-JSON body does not throw — the status still decides', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }))
    const r = await exchangeAuthCode('c', 'v', 'https://pulse.test/auth/callback')
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.error).toBe('server')
    expect(r.upstream).toBe('http_502')
  })

  it('an over-long error string is not trusted as a code', async () => {
    failing(400, { error: 'x'.repeat(200) })
    const r = await exchangeAuthCode('c', 'v', 'https://pulse.test/auth/callback')
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.error).toBe('server')
    expect(r.upstream).toBe('http_400')
  })
})

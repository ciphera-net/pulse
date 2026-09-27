// @vitest-environment jsdom
//
// The app's transport adapts the REAL `apiRequest` (no mock of it here): the
// one authenticated path to the API. `fetch` is stubbed with plain objects
// exposing only what apiRequest reads — a real Response under jsdom on the CI
// image's Node 22 is not the same object as on a laptop's Node 24.
//
// What must hold: the bearer and the CSRF header ride along; the signal the
// import client handed over is the one fetch receives (apiRequest drops its own
// 30-second timer when a caller passes one, which is why the client always
// passes one WITH a timeout of its own); every failure comes back as a status
// the client's retry policy can read, a 429's Retry-After included.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_URL, setAccessToken } from '@/lib/api/client'
import { appTransport } from '../app-transport'
import { ImportApiClient } from '../client'

type FetchCall = { url: string; init: RequestInit & { headers: Record<string, string> } }

function stubFetch(answer: (call: FetchCall) => unknown) {
  const calls: FetchCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: FetchCall['init']) => {
      const call = { url, init }
      calls.push(call)
      return answer(call)
    }),
  )
  return calls
}

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null },
  json: async () => body,
})

beforeEach(() => {
  setAccessToken('access-token-1')
  document.cookie = 'csrf_token=csrf-1'
})

afterEach(() => {
  vi.unstubAllGlobals()
  setAccessToken(null)
})

describe('appTransport', () => {
  it('sends the exact body with the bearer, the CSRF header and the client\'s signal', async () => {
    const calls = stubFetch(() => reply(200, { ok: true }))
    const controller = new AbortController()
    const res = await appTransport({ method: 'POST', path: '/sites/s1/data-imports/i1/batches', body: '{"step":0}', signal: controller.signal })
    expect(res).toEqual({ status: 200, body: { ok: true }, retryAfterSeconds: null })
    expect(calls[0].url).toBe(`${API_URL}/api/v1/sites/s1/data-imports/i1/batches`)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.body).toBe('{"step":0}')
    expect(calls[0].init.headers.Authorization).toBe('Bearer access-token-1')
    expect(calls[0].init.headers['X-CSRF-Token']).toBe('csrf-1')
    expect(calls[0].init.signal).toBe(controller.signal)
  })

  it('answers a 204 as a 204 with no body', async () => {
    stubFetch(() => reply(204, null))
    const res = await appTransport({ method: 'DELETE', path: '/sites/s1/data-imports/i2', body: null, signal: new AbortController().signal })
    expect(res).toEqual({ status: 204, body: null, retryAfterSeconds: null })
  })

  it('returns a failure as its status and the server\'s body, code and extras intact', async () => {
    stubFetch(() => reply(409, { error: 'exists', code: 'import_exists', import_id: 'imp-7' }))
    const res = await appTransport({ method: 'POST', path: '/sites/s1/data-imports', body: '{}', signal: new AbortController().signal })
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'import_exists', import_id: 'imp-7' })
  })

  it('carries a 429\'s Retry-After through to the client', async () => {
    stubFetch(() => reply(429, { error: 'slow' }, { 'Retry-After': '12' }))
    const res = await appTransport({ method: 'POST', path: '/sites/s1/data-imports/i3/batches', body: '{}', signal: new AbortController().signal })
    expect(res).toMatchObject({ status: 429, retryAfterSeconds: 12 })
  })

  it('reports a network failure as status 0, which the client retries', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    const res = await appTransport({ method: 'POST', path: '/sites/s1/data-imports/i4/batches', body: '{}', signal: new AbortController().signal })
    expect(res.status).toBe(0)
  })

  it('drives the import client end to end', async () => {
    const status = {
      id: 'imp-5',
      source: 'plausible',
      kind: 'upload_aggregate',
      status: 'pending',
      error_code: null,
      source_timezone: 'UTC',
      range_start: '2026-03-01',
      range_end: '2026-03-01',
      steps_total: 1,
      cursor: { step: 0, part: 0 },
      fingerprint: 'c'.repeat(64),
      totals: {},
      skipped: { browser: {}, server: {} },
      visits_are_visitors: false,
      import_through: null,
      created_at: '2026-09-27T00:00:00Z',
      started_at: null,
      progressed_at: null,
      finished_at: null,
    }
    stubFetch(() => reply(200, status))
    const s = await new ImportApiClient(appTransport, { minIntervalMs: 0 }).status('s1', 'imp-5')
    expect(s.id).toBe('imp-5')
  })
})

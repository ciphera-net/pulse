// @vitest-environment jsdom
//
// The gate-6 harness entry (support/harness-entry.ts): its fetch transport
// carries a captured session the way apiRequest would. (Moving the fixture into
// a QA site's window is tested with the parser, in the node environment.)
// Stubbed fetch answers with plain objects (the CI image's Node 22 differs from
// a laptop's on real Responses).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchTransport, readCookie } from './support/harness-entry'

type Call = { url: string; init: RequestInit & { headers: Record<string, string> } }

function stub(answer: () => unknown) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: Call['init']) => {
      calls.push({ url, init })
      return answer()
    }),
  )
  return calls
}

const reply = (status: number, text: string, headers: Record<string, string> = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (k: string) => headers[k] ?? null },
  text: async () => text,
})

afterEach(() => vi.unstubAllGlobals())

describe('fetchTransport', () => {
  const t = fetchTransport({ apiBase: 'https://api.test.invalid', token: () => 'tok', csrf: () => 'csrf' })

  it('sends a write with the bearer, the CSRF header, the body and the client\'s signal', async () => {
    const calls = stub(() => reply(200, '{"ok":true}'))
    const signal = new AbortController().signal
    expect(await t({ method: 'POST', path: '/sites/s/data-imports', body: '{"a":1}', signal })).toEqual({
      status: 200,
      body: { ok: true },
      retryAfterSeconds: null,
    })
    expect(calls[0].url).toBe('https://api.test.invalid/api/v1/sites/s/data-imports')
    expect(calls[0].init).toMatchObject({ method: 'POST', body: '{"a":1}', credentials: 'include', signal })
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer tok', 'X-CSRF-Token': 'csrf', 'Content-Type': 'application/json' })
  })

  it('sends no CSRF header on a read', async () => {
    const calls = stub(() => reply(200, '{}'))
    await t({ method: 'GET', path: '/x', body: null, signal: new AbortController().signal })
    expect(calls[0].init.headers['X-CSRF-Token']).toBeUndefined()
  })

  it('keeps a 429\'s Retry-After, a 204\'s empty body, and an edge page\'s status', async () => {
    stub(() => reply(429, '{"code":"x"}', { 'Retry-After': '3' }))
    expect(await t({ method: 'POST', path: '/x', body: '{}', signal: new AbortController().signal })).toMatchObject({
      status: 429,
      retryAfterSeconds: 3,
    })
    stub(() => reply(204, ''))
    expect(await t({ method: 'DELETE', path: '/x', body: null, signal: new AbortController().signal })).toEqual({
      status: 204,
      body: null,
      retryAfterSeconds: null,
    })
    stub(() => reply(413, '<html>Request Entity Too Large</html>'))
    expect((await t({ method: 'POST', path: '/x', body: '{}', signal: new AbortController().signal })).status).toBe(413)
  })

  it('answers status 0 when no response arrived', async () => {
    stub(() => {
      throw new TypeError('Failed to fetch')
    })
    expect((await t({ method: 'GET', path: '/x', body: null, signal: new AbortController().signal })).status).toBe(0)
  })

  it('reads the CSRF cookie the page can see', () => {
    document.cookie = 'csrf_token=abc%3D'
    expect(readCookie('csrf_token')).toBe('abc=')
  })
})

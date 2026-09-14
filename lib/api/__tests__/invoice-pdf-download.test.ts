// @vitest-environment jsdom
//
// Downloading an invoice must carry the session.
//
// 🔴 It did not, for nine days. `downloadInvoicePDF` was a hand-rolled
// `fetch(url, { credentials: 'include' })` written in April, when a cookie
// authenticated the API. Per-app sessions (S3, 05-09-2026) moved the credential
// to an in-memory access token sent as a Bearer and made Pulse's cookies
// host-only on the app's origin — so the request reached pulse-api with no
// credential at all and returned 401 every time. `getInvoices()` kept working
// because it goes through `apiRequest`; only this one call bypassed it.
//
// The mutation these kill is any return to a bare fetch: drop the Bearer and the
// first test fails.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setAccessToken, setRefreshHandler } from '@/lib/api/client'
import { downloadInvoicePDF } from '@/lib/api/billing'

const ID = 'd51d20c3-aac6-4c70-b770-0ac958f16532'

/**
 * A fake response, NOT `new Response(blob)`.
 *
 * 🔴 `new Response(someBlob)` is not portable across Node versions under jsdom:
 * on node:22 — which is what CI runs, while this machine had 24 — undici asks
 * the body for `.stream()`, jsdom's Blob has none, and the constructor throws
 * `TypeError: object.stream is not a function`. Every test here then failed in
 * CI for a reason that could not reproduce locally.
 *
 * The code under test only ever touches `ok`, `status`, `headers.get()`,
 * `blob()` and `json()`, so supplying exactly those keeps the test honest and
 * takes the runtime's Response/Blob interop out of the picture entirely.
 */
function fakeResponse(
  { status = 200, headers = {}, body = null as unknown }: { status?: number; headers?: Record<string, string>; body?: unknown } = {},
) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    json: async () => body ?? {},
  } as unknown as Response
}

function pdfResponse(headers: Record<string, string> = {}) {
  return fakeResponse({ status: 200, headers: { 'Content-Type': 'application/pdf', ...headers } })
}

let clicked: { href: string; download: string } | null = null

beforeEach(() => {
  clicked = null
  setAccessToken('tok-abc')
  setRefreshHandler(null)
  // ⚠️ NOT Object.assign(URL, …): that mutates the real URL constructor in
  // place, and `unstubAllGlobals` restores the binding, not the object — so the
  // stub would survive into every later test file in this worker. Spy on the
  // two methods instead, which `restoreAllMocks` genuinely undoes.
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  // Capture the synthetic anchor instead of letting jsdom navigate.
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'a') return Object.getPrototypeOf(document).createElement.call(document, tag)
    const a = { href: '', download: '', click: () => { clicked = { href: a.href, download: a.download } } }
    return a as unknown as HTMLElement
  }) as typeof document.createElement)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setAccessToken(null)
})

describe('downloadInvoicePDF', () => {
  it('sends the access token as a Bearer — the whole bug in one assertion', async () => {
    const fetchMock = vi.fn(async () => pdfResponse())
    vi.stubGlobal('fetch', fetchMock)

    await downloadInvoicePDF(ID)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain(`/api/billing/invoices/${ID}/pdf`)
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer tok-abc')
  })

  it('refreshes once and retries when the token has expired', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fakeResponse({ status: 401, body: { error: 'unauthorized' } }))
      .mockResolvedValueOnce(pdfResponse())
    vi.stubGlobal('fetch', fetchMock)
    setRefreshHandler(async () => { setAccessToken('tok-new'); return { ok: true } as never })

    await downloadInvoicePDF(ID)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retry = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    // The retry must carry the RENEWED token, not the dead one.
    expect((retry[1].headers as Record<string, string>)['Authorization']).toBe('Bearer tok-new')
  })

  it('names the file from the server, which is the only side that knows the number', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      pdfResponse({ 'Content-Disposition': 'attachment; filename="VF-2026-00030.pdf"' })))

    await downloadInvoicePDF(ID)

    expect(clicked?.download).toBe('VF-2026-00030.pdf')
  })

  it('falls back to invoice.pdf when the header is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => pdfResponse()))
    await downloadInvoicePDF(ID)
    expect(clicked?.download).toBe('invoice.pdf')
  })

  it('throws with the status, so the caller can tell 404 from a real failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      fakeResponse({ status: 404, body: { error: 'invoice PDF not available yet' } })))

    // The billing tab reports "not available yet" ONLY for a 404; every other
    // failure used to wear that same calm message, including the 401.
    await expect(downloadInvoicePDF(ID)).rejects.toMatchObject({ status: 404 })
  })

  it('never follows a redirect by hand any more', async () => {
    const fetchMock = vi.fn(async () => pdfResponse())
    vi.stubGlobal('fetch', fetchMock)
    const open = vi.fn()
    vi.stubGlobal('open', open)

    await downloadInvoicePDF(ID)

    // The old code did window.open(apiUrl) on an opaque redirect — a top-level
    // navigation that carries no Bearer and 401s just the same.
    expect(open).not.toHaveBeenCalled()
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.redirect).toBeUndefined()
  })
})

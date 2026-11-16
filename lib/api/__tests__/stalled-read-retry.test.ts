/**
 * Ruling R68 (16-11-2026): a READ with no answer after 10 s is cancelled and sent once more, and the error shows only
 * when the second try fails too. Measured that day on production: a realtime read reached the cluster 28 s after it
 * was sent and the app gave up at 30 s with "Failed to load dashboard analytics", while the server answered it in
 * 0.7 s. A write is never sent twice, and a caller holding its own signal keeps deciding when its request ends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

const client = await import('../client')
const apiRequest = client.default

/**
 * A connection that never answers: the request hangs until its signal aborts it, as a held request does. A browser's
 * abort is a DOMException named AbortError, which is an Error there; this test environment's DOMException is not, so
 * the stub rejects with the Error-shaped abort the client checks for.
 */
function stalled(init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })))
  })
}
const answered = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

let realFetch: typeof fetch
let n = 0
/** Each test reads its own address, so the client's 2 s dedupe never hands one test another's answer. */
const endpoint = () => `/sites/00000000-0000-4000-8000-00000000000${n++ % 10}/dashboard?period=7d&t=${n}`

beforeEach(() => {
  client.markTeamResolved()
  realFetch = global.fetch
  vi.useFakeTimers()
})
afterEach(() => {
  global.fetch = realFetch
  vi.useRealTimers()
})

describe('a stalled read (R68)', () => {
  it('is sent again after 10 s, and the second answer is the result', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => (fetchMock.mock.calls.length === 1 ? stalled(init) : answered({ ok: 1 })))
    global.fetch = fetchMock as unknown as typeof fetch
    const result = apiRequest<{ ok: number }>(endpoint())
    await vi.advanceTimersByTimeAsync(client.STALLED_READ_RETRY_MS - 1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toEqual({ ok: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The first try was cancelled, so the server stops working on it.
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true)
  })

  it('ends in the network error only when the second try stalls too, after its full 30 s', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => stalled(init))
    global.fetch = fetchMock as unknown as typeof fetch
    const result = apiRequest(endpoint())
    const settled = result.then(() => 'resolved', (e: { status?: number; message?: string }) => e)
    await vi.advanceTimersByTimeAsync(client.STALLED_READ_RETRY_MS + 29_999)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(await settled).toMatchObject({ status: 0, message: 'Network error, please try again.' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('is answered once when the first try lands in time', async () => {
    const fetchMock = vi.fn(() => answered({ ok: 2 }))
    global.fetch = fetchMock as unknown as typeof fetch
    await expect(apiRequest(endpoint())).resolves.toEqual({ ok: 2 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is not sent again on a refused connection: that error is answered at once', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    global.fetch = fetchMock as unknown as typeof fetch
    await expect(apiRequest(endpoint())).rejects.toMatchObject({ status: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('what is never sent twice', () => {
  it('a write waits its single 30 s and fails', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => stalled(init))
    global.fetch = fetchMock as unknown as typeof fetch
    const result = apiRequest('/sites/00000000-0000-4000-8000-000000000001/saved-filters', { method: 'POST', body: '{}' })
    const settled = result.then(() => 'resolved', (e: { status?: number }) => e)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await settled).toMatchObject({ status: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a read whose caller holds its own signal: the caller ends it, no timer does', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => stalled(init))
    global.fetch = fetchMock as unknown as typeof fetch
    const own = new AbortController()
    const result = apiRequest(endpoint(), { signal: own.signal })
    const settled = result.then(() => 'resolved', (e: { status?: number }) => e)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    own.abort()
    expect(await settled).toMatchObject({ status: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

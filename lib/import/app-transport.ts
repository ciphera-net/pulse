// ─── The app's transport: `apiRequest`, adapted ───────────────────────────
//
// What M11's UI passes to the import library. Going through `apiRequest` keeps
// ONE authenticated path to the API — the in-memory bearer, the CSRF header on
// writes, and the single refresh-and-retry on a 401 — rather than a second,
// subtly different one (the lesson recorded above `apiRequestBlob`).
//
// What this adapter accounts for in `apiRequest`:
//
//   - It resolves with the body only, never the status. The import client
//     treats every 2xx alike, so a success is reported as 200 (204 when there is
//     no body); nothing downstream branches on 200 versus 201.
//   - It throws `ApiError(message, status, body)` for every failure, with
//     status 0 for a network failure or an abort. Those become the response the
//     client's retry policy reads, including the parsed `Retry-After` it copies
//     into a 429's body.
//   - 🔴 Passing `signal` DISABLES its own 30-second timer. The client's signal
//     always carries the client's own per-request timeout, so a request is never
//     left without one (lib/import/client.ts).
//   - It micro-caches GETs for 2 seconds by URL. A status read right after a
//     409 could therefore be up to 2 s old; the client bounds how many
//     consecutive resyncs it makes, so a stale read costs at most a named
//     `batch_out_of_order`, never a wrong write (the server's cursor guard
//     refuses any batch that is not the one it expects).

import apiRequest, { ApiError } from '@/lib/api/client'
import type { Transport, TransportResponse } from './client'

export const appTransport: Transport = async (request): Promise<TransportResponse> => {
  try {
    const body = await apiRequest<unknown>(request.path, {
      method: request.method,
      body: request.body ?? undefined,
      signal: request.signal,
    })
    return { status: body === undefined ? 204 : 200, body: body ?? null, retryAfterSeconds: null }
  } catch (e) {
    if (e instanceof ApiError) {
      const data = e.data ?? null
      const retryAfter = data && typeof data.retryAfter === 'number' && Number.isFinite(data.retryAfter) ? data.retryAfter : null
      return { status: e.status, body: data, retryAfterSeconds: retryAfter }
    }
    throw e
  }
}

// ─── The import API client, over an INJECTED transport ────────────────────
//
// The five routes of §3.12b M2-r: upload-window, create, batches, status and
// delete. This module knows the routes, the retry policy and the cursor; it
// does NOT know how a request is authenticated. That is the transport's job:
//
//   - in the app, app-transport.ts adapts `apiRequest` (bearer + CSRF + one
//     refresh-and-retry), which is what M11's UI passes;
//   - tests pass an in-memory server;
//   - the staging harness (gate 6) passes a fetch that carries the session it
//     captured from a logged-in page.
//
// So nothing here imports `apiRequest`, and the library runs anywhere a
// transport can be written.
//
// The policy, from M2-n:
//   - SEQUENTIAL. The cursor is ordered, so one request is in flight at a time;
//     calls made concurrently are queued, never raced.
//   - At most 4 requests a second (the batch route sits under the `standard`
//     rate-limit tier), counting retries and status reads, not just batches.
//   - Network errors, 5xx and 429 are retried with exponential backoff and
//     jitter, honouring Retry-After as a floor — 5 tries in all. Retrying a batch
//     is safe: the server applies each (step, part) exactly once and answers a
//     retry below its cursor with `already_applied` (M2-d).
//   - `409 batch_out_of_order` re-reads the cursor from status and carries on
//     from there, a bounded number of times.
//   - Every other failure is an ImportError with the server's own code.
//
// 🔴 EVERY REQUEST HAS ITS OWN TIMEOUT. `apiRequest` drops its 30-second timer
// the moment a caller passes its own `signal` (lib/api/client.ts), so passing
// one without a timeout of its own would let a stalled connection hang the
// upload for ever. The signal handed to the transport aborts on this client's
// timer OR the caller's cancel, and the client does not wait on a transport
// that ignores it: the timer settles the attempt either way.

import {
  ImportError,
  SERVER_ERROR_CODES,
  type Cursor,
  type ImportErrorCode,
  type ImportErrorDetail,
  type ServerErrorCode,
} from './errors'
import type { BatchResponse, CreateImportRequest, ImportStatus, PlanStep, UploadWindow } from './types'

export type HttpMethod = 'GET' | 'POST' | 'DELETE'

export interface TransportRequest {
  method: HttpMethod
  /** The path under the API's `/api/v1`, e.g. `/sites/<id>/data-imports`. */
  path: string
  /** The exact JSON text to send, or null for a GET or DELETE. */
  body: string | null
  /** Aborts on the client's per-request timeout or the caller's cancel. Honour it. */
  signal: AbortSignal
}

export interface TransportResponse {
  /** The HTTP status, or 0 when no response arrived (network failure, timeout). */
  status: number
  /** The parsed JSON body, or null when there was none. */
  body: unknown
  /** A 429's Retry-After, in seconds, when the server sent one. */
  retryAfterSeconds: number | null
}

/**
 * Sends one request. Resolve with the status and parsed body for EVERY HTTP
 * response, errors included; reject (or resolve status 0) only when no response
 * arrived.
 */
export type Transport = (request: TransportRequest) => Promise<TransportResponse>

export interface ClientOptions {
  maxAttempts: number
  /** The minimum gap between two request starts; 250 ms = at most 4 a second. */
  minIntervalMs: number
  requestTimeoutMs: number
  backoffBaseMs: number
  backoffMaxMs: number
  /** A Retry-After longer than this is waited out only up to this. */
  retryAfterMaxMs: number
  /** Consecutive `batch_out_of_order` resyncs without progress before giving up. */
  maxResyncs: number
  /** The caller's cancel. */
  signal?: AbortSignal
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  now: () => number
  random: () => number
}

export const DEFAULT_CLIENT_OPTIONS: Readonly<Omit<ClientOptions, 'signal'>> = {
  maxAttempts: 5,
  minIntervalMs: 250,
  requestTimeoutMs: 60_000,
  backoffBaseMs: 1_000,
  backoffMaxMs: 30_000,
  retryAfterMaxMs: 300_000,
  maxResyncs: 3,
  sleep: abortableSleep,
  now: () => Date.now(),
  random: () => Math.random(),
}

/** What `uploadParts` reports after each answered batch. */
export interface BatchProgress {
  /** The batch just sent. */
  sent: Cursor
  /** The server's cursor after it; null once the import is complete. */
  next: Cursor | null
  response: BatchResponse
}

const NO_RESPONSE: TransportResponse = { status: 0, body: null, retryAfterSeconds: null }

export class ImportApiClient {
  private readonly o: ClientOptions
  private queue: Promise<unknown> = Promise.resolve()
  private nextSlot = -Infinity

  constructor(
    private readonly transport: Transport,
    options: Partial<ClientOptions> = {},
  ) {
    this.o = { ...DEFAULT_CLIENT_OPTIONS, ...options }
  }

  /** `GET /sites/:id/data-imports/upload-window?source=…[&source_timezone=…]` */
  async uploadWindow(siteId: string, source: string, sourceTimezone?: string | null): Promise<UploadWindow> {
    const q = new URLSearchParams({ source })
    if (sourceTimezone) q.set('source_timezone', sourceTimezone)
    const body = await this.request('GET', `/sites/${enc(siteId)}/data-imports/upload-window?${q.toString()}`, null)
    return parseWindow(body)
  }

  /** `POST /sites/:id/data-imports` → the new import's status object (status `pending`). */
  async create(siteId: string, request: CreateImportRequest): Promise<ImportStatus> {
    const body = await this.request('POST', `/sites/${enc(siteId)}/data-imports`, JSON.stringify(request))
    return parseStatus(body)
  }

  /** `GET /sites/:id/data-imports/:importId` */
  async status(siteId: string, importId: string): Promise<ImportStatus> {
    const body = await this.request('GET', `/sites/${enc(siteId)}/data-imports/${enc(importId)}`, null)
    return parseStatus(body)
  }

  /** `DELETE /sites/:id/data-imports/:importId` — cancels, and the server purges the rows. */
  async remove(siteId: string, importId: string): Promise<void> {
    await this.request('DELETE', `/sites/${enc(siteId)}/data-imports/${enc(importId)}`, null)
  }

  /** `POST /sites/:id/data-imports/:importId/batches` with an exact, pre-built body. */
  async sendBatch(siteId: string, importId: string, body: string): Promise<BatchResponse> {
    const res = await this.request('POST', `/sites/${enc(siteId)}/data-imports/${enc(importId)}/batches`, body)
    return parseBatch(res)
  }

  /**
   * Sends every part from `from` to the end of the plan, in cursor order, and
   * returns the final status. The server's cursor is the truth: each answer's
   * `next` says what to send next, and a `batch_out_of_order` re-reads it.
   */
  async uploadParts(args: {
    siteId: string
    importId: string
    steps: readonly PlanStep[]
    from: Cursor
    getPart: (step: number, part: number) => Promise<string>
    onBatch?: (progress: BatchProgress) => void
  }): Promise<ImportStatus> {
    const { siteId, importId, steps } = args
    const inPlan = (c: Cursor) =>
      Number.isInteger(c.step) &&
      Number.isInteger(c.part) &&
      c.step >= 0 &&
      c.part >= 0 &&
      c.step < steps.length &&
      c.part < steps[c.step].parts
    let cursor: Cursor | null = inPlan(args.from) ? args.from : null
    let resyncs = 0

    for (;;) {
      if (!cursor) {
        // At (or past) the end of the plan: the server completes the import in
        // the same transaction as the last batch, so status must say so.
        const s = await this.status(siteId, importId)
        if (s.status === 'completed') return s
        throw new ImportError('unexpected_response', `Every batch was accepted but the import is ${s.status}.`)
      }
      const body = await args.getPart(cursor.step, cursor.part)
      let response: BatchResponse
      try {
        response = await this.sendBatch(siteId, importId, body)
      } catch (e) {
        if (e instanceof ImportError && e.code === 'batch_out_of_order' && resyncs < this.o.maxResyncs) {
          resyncs++
          const s = await this.status(siteId, importId)
          if (s.status === 'completed') return s
          if (!inPlan(s.cursor)) {
            throw new ImportError('unexpected_response', 'The server reports a cursor outside this plan.', {
              detail: { expected: s.cursor },
            })
          }
          cursor = s.cursor
          continue
        }
        throw e
      }
      resyncs = 0
      args.onBatch?.({ sent: cursor, next: response.next, response })
      if (response.next === null) {
        cursor = null
        continue
      }
      if (!inPlan(response.next)) {
        throw new ImportError('unexpected_response', 'The server asked for a batch outside this plan.', {
          detail: { expected: response.next },
        })
      }
      cursor = response.next
    }
  }

  private request(method: HttpMethod, path: string, body: string | null): Promise<unknown> {
    const run = this.queue.then(() => this.attempts(method, path, body))
    this.queue = run.catch(() => {})
    return run
  }

  private async attempts(method: HttpMethod, path: string, body: string | null): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      this.throwIfAborted()
      await this.pace()
      const res = await this.once(method, path, body)
      if (res.status >= 200 && res.status < 300) return res.body
      const retryable = res.status === 0 || res.status === 429 || res.status >= 500
      if (!retryable || attempt >= this.o.maxAttempts) throw toImportError(res)
      await this.o.sleep(this.backoff(attempt, res), this.o.signal)
    }
  }

  /** Waits for this request's slot so starts are at least minIntervalMs apart. */
  private async pace(): Promise<void> {
    const now = this.o.now()
    if (this.nextSlot > now) await this.o.sleep(this.nextSlot - now, this.o.signal)
    this.throwIfAborted()
    this.nextSlot = Math.max(now, this.nextSlot) + this.o.minIntervalMs
  }

  private backoff(attempt: number, res: TransportResponse): number {
    const exp = Math.min(this.o.backoffMaxMs, this.o.backoffBaseMs * 2 ** (attempt - 1))
    const jittered = exp / 2 + this.o.random() * (exp / 2)
    const retryAfter =
      res.retryAfterSeconds !== null && Number.isFinite(res.retryAfterSeconds) && res.retryAfterSeconds > 0
        ? Math.min(this.o.retryAfterMaxMs, res.retryAfterSeconds * 1000)
        : 0
    return Math.max(jittered, retryAfter)
  }

  private async once(method: HttpMethod, path: string, body: string | null): Promise<TransportResponse> {
    const controller = new AbortController()
    const caller = this.o.signal
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    const settled = new Promise<TransportResponse>((resolve) => {
      timer = setTimeout(() => {
        controller.abort(new DOMException('The request timed out.', 'TimeoutError'))
        resolve(NO_RESPONSE)
      }, this.o.requestTimeoutMs)
      onAbort = () => {
        controller.abort(caller?.reason)
        resolve(NO_RESPONSE)
      }
      caller?.addEventListener('abort', onAbort, { once: true })
    })
    try {
      const sent = Promise.resolve()
        .then(() => this.transport({ method, path, body, signal: controller.signal }))
        .then(
        (r) => normalizeResponse(r),
        () => NO_RESPONSE,
      )
      const res = await Promise.race([sent, settled])
      this.throwIfAborted()
      return res
    } finally {
      clearTimeout(timer)
      if (onAbort) caller?.removeEventListener('abort', onAbort)
    }
  }

  private throwIfAborted(): void {
    if (this.o.signal?.aborted) {
      throw new ImportError('aborted', 'The import was cancelled.')
    }
  }
}

function enc(s: string): string {
  return encodeURIComponent(s)
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ImportError('aborted', 'The import was cancelled.'))
      return
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new ImportError('aborted', 'The import was cancelled.'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function normalizeResponse(r: TransportResponse): TransportResponse {
  if (!r || typeof r.status !== 'number') return NO_RESPONSE
  return {
    status: r.status,
    body: r.body ?? null,
    retryAfterSeconds: typeof r.retryAfterSeconds === 'number' ? r.retryAfterSeconds : null,
  }
}

const SERVER_CODES: ReadonlySet<string> = new Set(SERVER_ERROR_CODES)

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isDateOrNull = (v: unknown): v is string | null => v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))

function isCursor(v: unknown): v is Cursor {
  return isRecord(v) && isInt(v.step) && isInt(v.part) && v.step >= 0 && v.part >= 0
}

/** A failed response as a named error, with the code the server gave when it gave one. */
export function toImportError(res: TransportResponse): ImportError {
  const body = isRecord(res.body) ? res.body : {}
  const serverCode = typeof body.code === 'string' ? body.code : null
  const message =
    typeof body.error === 'string' && body.error
      ? body.error
      : res.status === 0
        ? 'The server could not be reached.'
        : `The server answered ${res.status}.`
  let code: ImportErrorCode
  if (serverCode !== null && SERVER_CODES.has(serverCode)) code = serverCode as ServerErrorCode
  else if (res.status === 0) code = 'network'
  else if (res.status === 401) code = 'unauthorized'
  else if (res.status === 403) code = 'forbidden'
  else if (res.status === 404) code = 'not_found'
  else if (res.status === 413) code = 'batch_too_large'
  else if (res.status === 429) code = 'rate_limited'
  else if (res.status >= 500) code = 'server_error'
  else code = 'unexpected_response'

  const detail: ImportErrorDetail = {}
  if (serverCode !== null && !SERVER_CODES.has(serverCode)) detail.server_code = serverCode
  if (typeof body.import_id === 'string') detail.import_id = body.import_id
  if (isCursor(body.expected)) detail.expected = { step: body.expected.step, part: body.expected.part }
  if ('allowed_from' in body && isDateOrNull(body.allowed_from)) detail.allowed_from = body.allowed_from
  if ('allowed_through' in body && isDateOrNull(body.allowed_through)) detail.allowed_through = body.allowed_through
  if (typeof body.table === 'string') detail.table = body.table
  if (isInt(body.index)) detail.index = body.index
  return new ImportError(code, message, { status: res.status === 0 ? null : res.status, detail })
}

function malformed(what: string): ImportError {
  return new ImportError('unexpected_response', `The server's answer is not what this version expects: ${what}.`)
}

function counts(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {}
  const out: Record<string, number> = {}
  for (const [k, n] of Object.entries(v)) if (isInt(n)) out[k] = n
  return out
}

/** The status object (M2-r), checked on every field this library reads. */
export function parseStatus(v: unknown): ImportStatus {
  if (!isRecord(v)) throw malformed('the status is not an object')
  if (typeof v.id !== 'string' || !v.id) throw malformed('the status has no id')
  if (typeof v.status !== 'string') throw malformed('the status has no status')
  if (!isCursor(v.cursor)) throw malformed('the status has no cursor')
  if (typeof v.range_start !== 'string' || typeof v.range_end !== 'string') throw malformed('the status has no range')
  if (!isInt(v.steps_total)) throw malformed('the status has no steps_total')
  if (!(v.fingerprint === null || typeof v.fingerprint === 'string')) throw malformed('the fingerprint is not a string')
  if (!(v.error_code === null || v.error_code === undefined || typeof v.error_code === 'string')) {
    throw malformed('the error_code is not a string')
  }
  const skipped = isRecord(v.skipped) ? v.skipped : {}
  return {
    ...(v as unknown as ImportStatus),
    error_code: (v.error_code as string | null | undefined) ?? null,
    cursor: { step: v.cursor.step, part: v.cursor.part },
    skipped: { browser: counts(skipped.browser), server: counts(skipped.server) },
  }
}

export function parseWindow(v: unknown): UploadWindow {
  if (!isRecord(v)) throw malformed('the upload window is not an object')
  if (typeof v.site_timezone !== 'string' || typeof v.source_timezone !== 'string') {
    throw malformed('the upload window has no time zones')
  }
  if (!isDateOrNull(v.allowed_from) || !isDateOrNull(v.allowed_through)) {
    throw malformed('the upload window has no allowed range')
  }
  return {
    ...(v as unknown as UploadWindow),
    allowed_from: v.allowed_from,
    allowed_through: v.allowed_through,
    existing_import: v.existing_import == null ? null : parseStatus(v.existing_import),
  }
}

export function parseBatch(v: unknown): BatchResponse {
  if (!isRecord(v)) throw malformed('the batch answer is not an object')
  if (!(v.next === null || isCursor(v.next))) throw malformed('the batch answer has no next cursor')
  if (typeof v.status !== 'string') throw malformed('the batch answer has no status')
  const applied = isRecord(v.applied)
    ? {
        daily: isInt(v.applied.daily) ? v.applied.daily : 0,
        monthly: isInt(v.applied.monthly) ? v.applied.monthly : 0,
        dimensions: isInt(v.applied.dimensions) ? v.applied.dimensions : 0,
        acquisition: isInt(v.applied.acquisition) ? v.applied.acquisition : 0,
      }
    : null
  return {
    already_applied: v.already_applied === true,
    applied,
    skipped: counts(v.skipped),
    next: v.next === null ? null : { step: (v.next as Cursor).step, part: (v.next as Cursor).part },
    status: v.status,
  }
}

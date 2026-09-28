// @vitest-environment node
//
// The import API client (§3.12b M2-n): sequential, at most 4 requests a
// second, retries on network errors, 5xx and 429 (honouring Retry-After; 5
// tries), a timeout of its own on every request, a status resync on
// `409 batch_out_of_order`, and every M2-r code surfaced as a named error.

import { describe, expect, it } from 'vitest'
import { ImportApiClient, parseBatch, parseStatus, toImportError, type ClientOptions, type Transport, type TransportResponse } from '../client'
import { ImportError } from '../errors'
import { FakeImportServer } from './support/fake-server'

/** A clock that only moves when the client sleeps, so pacing and backoff are exact. */
function clock() {
  let now = 1_000_000
  const sleeps: number[] = []
  const options: Partial<ClientOptions> = {
    now: () => now,
    sleep: async (ms, signal) => {
      if (signal?.aborted) throw new ImportError('aborted', 'cancelled')
      sleeps.push(ms)
      now += ms
    },
    random: () => 0.5,
  }
  return { options, sleeps, now: () => now }
}

const ok = (body: unknown, status = 200): TransportResponse => ({ status, body, retryAfterSeconds: null })

async function failure(p: Promise<unknown>): Promise<ImportError> {
  try {
    await p
  } catch (e) {
    if (e instanceof ImportError) return e
    throw e
  }
  throw new Error('expected a failure')
}

const status = (over: Record<string, unknown> = {}) => ({
  id: 'imp-1',
  source: 'plausible',
  kind: 'upload_aggregate',
  status: 'running',
  error_code: null,
  source_timezone: 'UTC',
  range_start: '2026-03-01',
  range_end: '2026-03-03',
  steps_total: 1,
  cursor: { step: 0, part: 0 },
  fingerprint: 'f'.repeat(64),
  totals: {},
  skipped: { browser: {}, server: {} },
  visits_are_visitors: false,
  import_through: null,
  created_at: '2026-09-27T00:00:00Z',
  started_at: null,
  progressed_at: null,
  finished_at: null,
  ...over,
})

describe('ImportApiClient: retries', () => {
  it('retries a network failure and then succeeds', async () => {
    let calls = 0
    const t: Transport = async () => {
      calls++
      if (calls < 3) throw new TypeError('Failed to fetch')
      return ok(status())
    }
    const c = clock()
    const s = await new ImportApiClient(t, c.options).status('site-1', 'imp-1')
    expect(s.id).toBe('imp-1')
    expect(calls).toBe(3)
  })

  it('gives up on a 5xx after exactly 5 tries, with backoff between them', async () => {
    let calls = 0
    const t: Transport = async () => {
      calls++
      return ok({ error: 'boom' }, 503)
    }
    const c = clock()
    const e = await failure(new ImportApiClient(t, c.options).status('site-1', 'imp-1'))
    expect(e.code).toBe('server_error')
    expect(e.status).toBe(503)
    expect(calls).toBe(5)
    // Four waits, doubling (with random() fixed at 0.5 the jitter is 3/4 of each step).
    const backoffs = c.sleeps.filter((ms) => ms >= 500)
    expect(backoffs).toEqual([750, 1500, 3000, 6000])
  })

  it('waits out a 429\'s Retry-After before trying again', async () => {
    let calls = 0
    const t: Transport = async () => {
      calls++
      return calls === 1 ? { status: 429, body: { error: 'slow down' }, retryAfterSeconds: 7 } : ok(status())
    }
    const c = clock()
    await new ImportApiClient(t, c.options).status('site-1', 'imp-1')
    expect(calls).toBe(2)
    expect(c.sleeps.some((ms) => ms >= 7000)).toBe(true)
  })

  it('surfaces rate_limited when every try is a 429', async () => {
    const t: Transport = async () => ({ status: 429, body: {}, retryAfterSeconds: 1 })
    const e = await failure(new ImportApiClient(t, clock().options).status('site-1', 'imp-1'))
    expect(e.code).toBe('rate_limited')
  })

  it.each([
    [400, { code: 'invalid_batch', error: 'x' }, 'invalid_batch'],
    [401, {}, 'unauthorized'],
    [403, { error: 'no permission' }, 'forbidden'],
    [404, { code: 'not_found' }, 'not_found'],
    [409, { code: 'plan_mismatch' }, 'plan_mismatch'],
    [413, null, 'batch_too_large'],
    [422, { code: 'plan_too_large' }, 'plan_too_large'],
  ])('does not retry a %i, and names it', async (httpStatus, body, code) => {
    let calls = 0
    const t: Transport = async () => {
      calls++
      return ok(body, httpStatus)
    }
    const e = await failure(new ImportApiClient(t, clock().options).status('site-1', 'imp-1'))
    expect(e.code).toBe(code)
    expect(calls).toBe(1)
  })
})

describe('ImportApiClient: pacing and order', () => {
  it('starts requests at least 250 ms apart: at most 4 a second', async () => {
    const c = clock()
    const starts: number[] = []
    const t: Transport = async () => {
      starts.push(c.now())
      return ok(status())
    }
    const client = new ImportApiClient(t, c.options)
    for (let i = 0; i < 10; i++) await client.status('site-1', 'imp-1')
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(250)
  })

  it('counts retries against the pace too', async () => {
    const c = clock()
    const starts: number[] = []
    let calls = 0
    const t: Transport = async () => {
      starts.push(c.now())
      return ++calls < 3 ? ok({}, 502) : ok(status())
    }
    await new ImportApiClient(t, { ...c.options, backoffBaseMs: 1 }).status('site-1', 'imp-1')
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(250)
  })

  it('never has two requests in flight, even when called concurrently', async () => {
    let inFlight = 0
    let most = 0
    const t: Transport = async () => {
      inFlight++
      most = Math.max(most, inFlight)
      await new Promise((r) => setTimeout(r, 2))
      inFlight--
      return ok(status())
    }
    const client = new ImportApiClient(t, { ...clock().options })
    await Promise.all([client.status('s', 'a'), client.status('s', 'b'), client.status('s', 'c')])
    expect(most).toBe(1)
  })
})

describe('ImportApiClient: its own timeout, and cancel', () => {
  it('times a stalled request out on its own clock, aborts the signal it handed over, and retries', async () => {
    const signals: AbortSignal[] = []
    const t: Transport = (req) => {
      signals.push(req.signal)
      return new Promise(() => {}) // never answers, and ignores its signal
    }
    const e = await failure(
      new ImportApiClient(t, { ...clock().options, requestTimeoutMs: 20, maxAttempts: 2 }).status('site-1', 'imp-1'),
    )
    expect(e.code).toBe('network')
    expect(signals).toHaveLength(2)
    expect(signals.every((s) => s.aborted)).toBe(true)
  })

  it('always hands the transport a signal, even when the caller passed none', async () => {
    let seen: AbortSignal | null = null
    const t: Transport = async (req) => {
      seen = req.signal
      return ok(status())
    }
    await new ImportApiClient(t, clock().options).status('site-1', 'imp-1')
    expect(seen).toBeInstanceOf(AbortSignal)
  })

  it('stops at once when the caller cancels, and never retries a cancelled request', async () => {
    const controller = new AbortController()
    let calls = 0
    const t: Transport = (req) => {
      calls++
      return new Promise((_resolve, reject) => {
        req.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        setTimeout(() => controller.abort(), 1)
      })
    }
    const e = await failure(new ImportApiClient(t, { ...clock().options, signal: controller.signal }).status('site-1', 'imp-1'))
    expect(e.code).toBe('aborted')
    expect(calls).toBe(1)
  })
})

describe('ImportApiClient: the routes', () => {
  it('asks for the upload window with the source and, when given, the source zone', async () => {
    const server = new FakeImportServer()
    const client = new ImportApiClient(server.transport, clock().options)
    const w = await client.uploadWindow('site-1', 'plausible', 'America/New_York')
    expect(server.requests[0]).toMatchObject({
      method: 'GET',
      path: '/sites/site-1/data-imports/upload-window?source=plausible&source_timezone=America%2FNew_York',
      body: null,
    })
    expect(w).toMatchObject({ site_timezone: 'Europe/Brussels', source_timezone: 'America/New_York', existing_import: null, site_domain: 'example.com' })
  })

  it('refuses an upload window naming a zone the browser does not know', async () => {
    const t: Transport = async () =>
      ok({ source: 'plausible', kind: 'upload_aggregate', site_timezone: 'Mars/Olympus', source_timezone: 'UTC', allowed_from: null, allowed_through: null, collect: {}, existing_import: null })
    const e = await failure(new ImportApiClient(t, clock().options).uploadWindow('site-1', 'plausible'))
    expect(e.code).toBe('unexpected_response')
  })

  it("parses an upload window with no site_domain (an older server, M9-j') as null, not a failure", async () => {
    const t: Transport = async () =>
      ok({
        source: 'plausible',
        kind: 'upload_aggregate',
        site_timezone: 'Europe/Brussels',
        source_timezone: 'UTC',
        allowed_from: null,
        allowed_through: null,
        collect: {},
        existing_import: null,
        // no site_domain key at all
      })
    const w = await new ImportApiClient(t, clock().options).uploadWindow('site-1', 'plausible')
    expect(w.site_domain).toBeNull()
  })

  it("parses an upload window's site_domain through unchanged when the server sends one", async () => {
    const t: Transport = async () =>
      ok({
        source: 'plausible',
        kind: 'upload_aggregate',
        site_timezone: 'Europe/Brussels',
        source_timezone: 'UTC',
        allowed_from: null,
        allowed_through: null,
        collect: {},
        existing_import: null,
        site_domain: 'xn--mnchen-3ya.example',
      })
    const w = await new ImportApiClient(t, clock().options).uploadWindow('site-1', 'plausible')
    expect(w.site_domain).toBe('xn--mnchen-3ya.example')
  })

  it('refuses an upload window whose site_domain is not a string', async () => {
    const t: Transport = async () =>
      ok({
        source: 'plausible',
        kind: 'upload_aggregate',
        site_timezone: 'Europe/Brussels',
        source_timezone: 'UTC',
        allowed_from: null,
        allowed_through: null,
        collect: {},
        existing_import: null,
        site_domain: 42,
      })
    const e = await failure(new ImportApiClient(t, clock().options).uploadWindow('site-1', 'plausible'))
    expect(e.code).toBe('unexpected_response')
  })

  it('refuses an answer that is not the status object as unexpected_response', async () => {
    const t: Transport = async () => ok({ id: 'x' })
    const e = await failure(new ImportApiClient(t, clock().options).status('site-1', 'imp-1'))
    expect(e.code).toBe('unexpected_response')
  })

  it('keeps an unknown server code visible instead of flattening it', () => {
    const e = toImportError({ status: 409, body: { error: 'new thing', code: 'brand_new_code' }, retryAfterSeconds: null })
    expect(e.code).toBe('unexpected_response')
    expect(e.detail.server_code).toBe('brand_new_code')
    expect(e.message).toBe('new thing')
  })

  it('carries each code\'s extras', () => {
    expect(toImportError({ status: 409, body: { code: 'import_exists', import_id: 'imp-9' }, retryAfterSeconds: null }).detail).toEqual({
      import_id: 'imp-9',
    })
    expect(
      toImportError({ status: 409, body: { code: 'batch_out_of_order', expected: { step: 2, part: 1 } }, retryAfterSeconds: null }).detail,
    ).toEqual({ expected: { step: 2, part: 1 } })
    expect(
      toImportError({ status: 422, body: { code: 'range_outside_window', allowed_from: null, allowed_through: null }, retryAfterSeconds: null })
        .detail,
    ).toEqual({ allowed_from: null, allowed_through: null })
    expect(
      toImportError({ status: 422, body: { code: 'row_outside_step', table: 'daily', index: 3 }, retryAfterSeconds: null }).detail,
    ).toEqual({ table: 'daily', index: 3 })
  })
})

describe('ImportApiClient.uploadParts', () => {
  const FP = 'a'.repeat(64)
  const plan = [
    { start: '2026-03-01', end: '2026-03-01', parts: 2 },
    { start: '2026-03-02', end: '2026-03-03', parts: 1 },
  ]
  const body = (step: number, part: number) =>
    `{"step":${step},"part":${part},"fingerprint":"${FP}","rows":{"daily":[{"date":"${step === 0 ? '2026-03-01' : '2026-03-02'}","visitors":${part + 1},"visits":1,"pageviews":1,"src_bounces":null,"src_engagement_seconds":null}]}}`

  async function created(server: FakeImportServer, client: ImportApiClient) {
    return client.create('site-1', {
      source: 'plausible',
      source_timezone: 'UTC',
      range_start: '2026-03-01',
      range_end: '2026-03-03',
      plan,
      fingerprint: FP,
      totals: { rows: { daily: 3, monthly: 0, dimensions: 0, acquisition: 0 }, visitors: 3, pageviews: 3 },
      skipped: {},
      visits_are_visitors: false,
    })
  }

  it('sends every part once, in cursor order, byte for byte, and returns the completed status', async () => {
    const server = new FakeImportServer()
    const client = new ImportApiClient(server.transport, clock().options)
    const s = await created(server, client)
    const sent: string[] = []
    const final = await client.uploadParts({
      siteId: 'site-1',
      importId: s.id,
      steps: plan,
      from: s.cursor,
      getPart: async (step, part) => {
        sent.push(`${step}/${part}`)
        return body(step, part)
      },
    })
    expect(sent).toEqual(['0/0', '0/1', '1/0'])
    expect(final.status).toBe('completed')
    const batches = server.requests.filter((r) => r.path.endsWith('/batches'))
    expect(batches.map((r) => r.body)).toEqual([body(0, 0), body(0, 1), body(1, 0)])
  })

  it('applies a batch exactly once when its answer is lost: the retry is already_applied', async () => {
    const server = new FakeImportServer()
    const client = new ImportApiClient(server.transport, clock().options)
    const s = await created(server, client)
    let dropped = false
    server.fault = (req) => {
      if (!dropped && req.path.endsWith('/batches') && req.body?.includes('"part":1')) {
        dropped = true
        return { dropResponse: true }
      }
      return null
    }
    const final = await client.uploadParts({ siteId: 'site-1', importId: s.id, steps: plan, from: s.cursor, getPart: async (a, b) => body(a, b) })
    expect(final.status).toBe('completed')
    expect(server.imports.get(s.id)?.rows.daily).toHaveLength(3)
  })

  it('resyncs from status on 409 batch_out_of_order and carries on from the server\'s cursor', async () => {
    const server = new FakeImportServer()
    const client = new ImportApiClient(server.transport, clock().options)
    const s = await created(server, client)
    // The client believes it is at (1, 0); the server is still at (0, 0).
    const final = await client.uploadParts({ siteId: 'site-1', importId: s.id, steps: plan, from: { step: 1, part: 0 }, getPart: async (a, b) => body(a, b) })
    expect(final.status).toBe('completed')
    const paths = server.requests.map((r) => `${r.method} ${r.path.endsWith('/batches') ? 'batch' : 'status'}`)
    expect(paths.slice(1, 3)).toEqual(['POST batch', 'GET status'])
    expect(server.imports.get(s.id)?.rows.daily).toHaveLength(3)
  })

  it('gives up with batch_out_of_order when resyncing makes no progress', async () => {
    const server = new FakeImportServer()
    const client = new ImportApiClient(server.transport, clock().options)
    const s = await created(server, client)
    server.fault = (req) =>
      req.path.endsWith('/batches')
        ? { respond: { status: 409, body: { code: 'batch_out_of_order', expected: { step: 0, part: 0 } }, retryAfterSeconds: null } }
        : null
    const e = await failure(client.uploadParts({ siteId: 'site-1', importId: s.id, steps: plan, from: s.cursor, getPart: async (a, b) => body(a, b) }))
    expect(e.code).toBe('batch_out_of_order')
    expect(server.requests.filter((r) => r.method === 'GET')).toHaveLength(3)
  })

  it('surfaces plan_mismatch when the server refuses the file\'s fingerprint', async () => {
    const server = new FakeImportServer()
    const client = new ImportApiClient(server.transport, clock().options)
    const s = await created(server, client)
    const e = await failure(
      client.uploadParts({ siteId: 'site-1', importId: s.id, steps: plan, from: s.cursor, getPart: async (a, b) => body(a, b).replace(FP, 'b'.repeat(64)) }),
    )
    expect(e.code).toBe('plan_mismatch')
  })

  it('refuses a cursor that does not move past the batch just sent, instead of resending it for ever', async () => {
    const t: Transport = async (req) =>
      req.path.endsWith('/batches') ? ok({ applied: {}, skipped: {}, next: { step: 0, part: 0 }, status: 'running' }) : ok(status())
    const e = await failure(
      new ImportApiClient(t, clock().options).uploadParts({ siteId: 's', importId: 'i', steps: plan, from: { step: 0, part: 0 }, getPart: async (a, b) => body(a, b) }),
    )
    expect(e.code).toBe('unexpected_response')
  })

  it('refuses a server cursor outside the plan', async () => {
    const t: Transport = async (req) =>
      req.path.endsWith('/batches') ? ok({ applied: {}, skipped: {}, next: { step: 9, part: 0 }, status: 'running' }) : ok(status())
    const e = await failure(
      new ImportApiClient(t, clock().options).uploadParts({ siteId: 's', importId: 'i', steps: plan, from: { step: 0, part: 0 }, getPart: async (a, b) => body(a, b) }),
    )
    expect(e.code).toBe('unexpected_response')
  })
})

// M12 (contract §3.12m12b-3/4): the two additive fields a pre-M12 server never sends.
describe('M12 status and batch fields', () => {
  const status = {
    id: 'imp-1',
    status: 'running',
    cursor: { step: 0, part: 0 },
    range_start: '2026-01-01',
    range_end: '2026-01-02',
    steps_total: 1,
    fingerprint: 'a'.repeat(64),
    error_code: null,
  }

  it('reads upload.events, and an absent or malformed bit as false (a pre-M12 import resumes without events)', () => {
    expect(parseStatus({ ...status, upload: { events: true } }).upload).toEqual({ events: true })
    expect(parseStatus({ ...status, upload: { events: false } }).upload).toEqual({ events: false })
    expect(parseStatus(status).upload).toEqual({ events: false })
    expect(parseStatus({ ...status, upload: { events: 'yes' } }).upload).toEqual({ events: false })
  })

  it('reads applied.events, which the server omits when it is zero', () => {
    expect(parseBatch({ applied: { daily: 1, events: 3 }, skipped: {}, next: null, status: 'completed' }).applied?.events).toBe(3)
    expect(parseBatch({ applied: { daily: 1 }, skipped: { event_excluded: 2, folded_into_other: 1 }, next: null, status: 'completed' })).toMatchObject({
      applied: { daily: 1, events: 0 },
      skipped: { event_excluded: 2, folded_into_other: 1 },
    })
  })
})

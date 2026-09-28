// @vitest-environment node
//
// The main-thread orchestrator (§3.12b M2-n, 27-09-2026): it starts the worker,
// receives the plan, creates the import, pulls each part from the worker and
// sends it — or resumes an unfinished import from the server's cursor after a
// fingerprint check (M2-j). Driven here with the REAL worker host in process
// and an in-memory server that enforces M2-r; worker-bundle.test.ts repeats the
// happy path with the prebuilt bundle itself.

import { describe, expect, it } from 'vitest'
import { ImportError } from '../errors'
import {
  DEFAULT_WORKER_URL,
  MAX_UPLOAD_FILES,
  prepareImport,
  runImport,
  deleteImport,
  type ImportEvent,
  type ImportOptions,
} from '../index'
import { PLAN_LIMITS } from '../core/plan'
import { runPipeline } from '../pipeline'
import { PROTOCOL_VERSION, type FromWorker, type NamedFile, type PrepareRequest, type ToWorker } from '../protocol'
import { createWorkerHost } from '../worker-host'
import { plausibleFixtureFile } from './fixtures/plausible-export'
import { FakeImportServer } from './support/fake-server'
import { inProcessWorker, workerDouble, type TestWorker } from './support/workers'

const fast = { minIntervalMs: 0, backoffBaseMs: 0, sleep: async () => {} }
const NOW = () => new Date('2026-09-27T12:00:00Z')
/** Small parts, so the fixture's three days need several batches. */
const SMALL = { ...PLAN_LIMITS, partRows: 6 }

function setup(over: Partial<ImportOptions> = {}, hooks = { planLimits: SMALL }) {
  const server = new FakeImportServer()
  const events: ImportEvent[] = []
  const workers: TestWorker[] = []
  const urls: string[] = []
  const options: ImportOptions = {
    siteId: server.siteId,
    source: 'plausible',
    file: plausibleFixtureFile(),
    transport: server.transport,
    createWorker: (url) => {
      urls.push(url)
      const w = inProcessWorker(hooks)
      workers.push(w)
      return w
    },
    onEvent: (e) => events.push(e),
    client: fast,
    now: NOW,
    ...over,
  }
  return { server, events, workers, urls, options }
}

async function failure(p: Promise<unknown>): Promise<ImportError> {
  try {
    await p
  } catch (e) {
    if (e instanceof ImportError) return e
    throw e
  }
  throw new Error('expected a failure')
}

/** Every row the plan would send, table by table, for comparing with what the server stored. */
async function expectedRows(file: File) {
  const { parts } = await runPipeline(
    { source: 'plausible', files: [file], clip: null, timeZone: 'Europe/Brussels' },
    { planLimits: SMALL },
  )
  const out: Record<string, unknown[]> = { daily: [], monthly: [], dimensions: [], acquisition: [] }
  for (const p of parts) for (const [t, rows] of Object.entries(JSON.parse(p.rowsJson))) out[t].push(...(rows as unknown[]))
  return out
}

describe('runImport', () => {
  it('uploads the whole file and reports each stage, in order', async () => {
    const { server, events, workers, urls, options } = setup()
    const status = await runImport(options)
    expect(status.status).toBe('completed')
    expect(urls).toEqual([DEFAULT_WORKER_URL])
    expect(DEFAULT_WORKER_URL).toBe('/workers/import.js')
    expect(workers[0].terminated).toBe(true)

    const stored = server.imports.get(status.id)
    expect(stored?.rows).toEqual(await expectedRows(plausibleFixtureFile()))

    const stages = events.map((e) => (e.type === 'progress' ? e.stage : e.type))
    const collapsed = stages.filter((s, i) => s !== stages[i - 1])
    expect(collapsed).toEqual(['window', 'reading', 'planning', 'skipped', 'creating', 'uploading', 'done'])
    const uploading = events.filter((e) => e.type === 'progress' && e.stage === 'uploading')
    const last = uploading.at(-1) as Extract<ImportEvent, { stage: 'uploading' }>
    expect(last.partsDone).toBe(last.partsTotal)
    expect(last.partsTotal).toBeGreaterThan(2)
  })

  it('creates the import with the plan, the fingerprint, and skip COUNTS only', async () => {
    const { server, options } = setup()
    await runImport(options)
    const create = server.requests.find((r) => r.method === 'POST' && r.path === '/sites/site-1/data-imports')
    const body = JSON.parse(create?.body ?? '{}')
    expect(Object.keys(body).sort()).toEqual(
      ['fingerprint', 'plan', 'range_end', 'range_start', 'skipped', 'source', 'source_timezone', 'totals', 'visits_are_visitors'].sort(),
    )
    expect(body).toMatchObject({
      source: 'plausible',
      // An aggregate source's zone defaults to the site's (M2-g).
      source_timezone: 'Europe/Brussels',
      range_start: '2026-03-01',
      range_end: '2026-03-03',
      visits_are_visitors: false,
      skipped: { bad_number: 1, bad_timestamp: 1, missing_field: 2 },
    })
    expect(JSON.stringify(body)).not.toMatch(/"line"|imported_/)
  })

  it('carries a source zone the customer chose to the window and the create request', async () => {
    const { server, options } = setup({ sourceTimezone: 'America/New_York' })
    await runImport(options)
    expect(server.requests[0].path).toContain('source_timezone=America%2FNew_York')
    const create = server.requests.find((r) => r.method === 'POST' && r.path === '/sites/site-1/data-imports')
    expect(JSON.parse(create?.body ?? '{}').source_timezone).toBe('America/New_York')
  })

  it('refuses a zone that is not one, before asking the server anything', async () => {
    const { server, options } = setup({ sourceTimezone: 'Mars/Olympus' })
    expect((await failure(runImport(options))).code).toBe('bad_source_timezone')
    expect(server.requests).toHaveLength(0)
  })

  it('drops days outside the upload window before sending, and names why', async () => {
    const { server, events, options } = setup()
    server.allowedFrom = '2026-03-02'
    server.allowedThrough = '2026-03-02'
    const status = await runImport(options)
    expect([status.range_start, status.range_end]).toEqual(['2026-03-02', '2026-03-02'])
    const skipped = events.find((e) => e.type === 'skipped' && e.origin === 'browser') as Extract<ImportEvent, { type: 'skipped'; origin: 'browser' }>
    // Locations rows each now send country + region + city (M6), but a
    // clipped physical row still counts once, not once per dimension it
    // sends — see plausible.test.ts's own regression test for this.
    expect(skipped.counts.outside_history_window).toBe(17)
    // The window stops well before yesterday, so what lies after it is Pulse's own.
    expect(skipped.counts.pulse_measured).toBe(1)
  })

  it('names an empty window without reading the file', async () => {
    const { server, workers, options } = setup()
    server.allowedFrom = null
    server.allowedThrough = null
    const e = await failure(runImport(options))
    expect(e.code).toBe('range_outside_window')
    expect(e.detail).toMatchObject({ allowed_from: null, allowed_through: null })
    expect(workers).toHaveLength(0)
  })

  it('reports the server\'s own skips as they arrive', async () => {
    const { server, events, options } = setup()
    server.skipPerBatch = { collection_off: 2 }
    const status = await runImport(options)
    const reports = events.filter((e) => e.type === 'skipped' && e.origin === 'server') as Extract<ImportEvent, { origin: 'server' }>[]
    const parts = status.steps_total > 0 ? server.imports.get(status.id)?.plan.reduce((n, s) => n + s.parts, 0) : 0
    expect(reports.at(-1)?.counts).toEqual({ collection_off: 2 * (parts ?? 0) })
  })
})

describe('resume', () => {
  it('continues from the server\'s cursor after the first attempt failed, sending no batch twice', async () => {
    const first = setup()
    let batches = 0
    first.server.fault = (req) => {
      if (!req.path.endsWith('/batches')) return null
      batches++
      return batches > 2 ? { respond: { status: 503, body: { error: 'down' }, retryAfterSeconds: null } } : null
    }
    const e = await failure(runImport(first.options))
    expect(e.code).toBe('server_error')
    const stored = [...first.server.imports.values()][0]
    expect(stored.cursor).toEqual({ step: 0, part: 2 })

    // A new tab, the same file: prepared against the stored import.
    first.server.fault = null
    const events: ImportEvent[] = []
    const prepared = await prepareImport({ ...first.options, onEvent: (ev) => events.push(ev) })
    expect(prepared.resume?.id).toBe(stored.id)
    const status = await prepared.upload()
    prepared.dispose()
    expect(status.status).toBe('completed')
    expect(stored.rows).toEqual(await expectedRows(plausibleFixtureFile()))
    expect(events.some((ev) => ev.type === 'progress' && ev.stage === 'resuming')).toBe(true)
    expect(first.server.requests.filter((r) => r.method === 'POST' && r.path === '/sites/site-1/data-imports')).toHaveLength(1)
  })

  it('picks up again when upload() is simply called a second time', async () => {
    const { server, options } = setup()
    let batches = 0
    server.fault = (req) => (req.path.endsWith('/batches') && ++batches === 2 ? { respond: { status: 500, body: {}, retryAfterSeconds: null } } : null)
    const prepared = await prepareImport({ ...options, client: { ...fast, maxAttempts: 1 } })
    expect((await failure(prepared.upload())).code).toBe('server_error')
    const status = await prepared.upload()
    prepared.dispose()
    expect(status.status).toBe('completed')
    expect(server.imports.get(status.id)?.rows).toEqual(await expectedRows(plausibleFixtureFile()))
  })

  it('refuses a different file for an unfinished import with plan_mismatch, before sending anything', async () => {
    const { server, options } = setup()
    let batches = 0
    server.fault = (req) => (req.path.endsWith('/batches') && ++batches > 1 ? { respond: { status: 500, body: {}, retryAfterSeconds: null } } : null)
    await failure(runImport({ ...options, client: { ...fast, maxAttempts: 1 } }))
    server.fault = null
    const before = server.requests.length
    const other = plausibleFixtureFile((files) => {
      const k = Object.keys(files).find((f) => f.startsWith('imported_devices_')) as string
      files[k] = files[k].replace('Desktop,7', 'Desktop,8')
    })
    const e = await failure(prepareImport({ ...options, file: other }))
    expect(e.code).toBe('plan_mismatch')
    expect(e.detail.import_id).toBe([...server.imports.keys()][0])
    // Only the upload-window read went out.
    expect(server.requests.slice(before).map((r) => r.method)).toEqual(['GET'])
  })

  it('names a different file plan_mismatch even when none of its days fall in the stored range', async () => {
    const { server, options } = setup()
    let batches = 0
    server.fault = (req) => (req.path.endsWith('/batches') && ++batches > 1 ? { respond: { status: 500, body: {}, retryAfterSeconds: null } } : null)
    await failure(runImport({ ...options, client: { ...fast, maxAttempts: 1 } }))
    server.fault = null
    const before = server.requests.length
    // The same export shape, a month later: every day is AFTER the stored range, so
    // clipping leaves nothing, which must read as another file, not "nothing to import".
    for (const start of ['2026-04-01', '2026-01-01']) {
      const e = await failure(prepareImport({ ...options, file: plausibleFixtureFile(undefined, { start }) }))
      expect(e.code).toBe('plan_mismatch')
      expect(e.detail.import_id).toBe([...server.imports.keys()][0])
    }
    expect(server.requests.slice(before).map((r) => r.method)).toEqual(['GET', 'GET'])
  })

  it('still names an empty file for a new import no_data_in_range', async () => {
    const { server, options } = setup()
    server.allowedFrom = '2026-05-01'
    server.allowedThrough = '2026-05-31'
    expect((await failure(runImport(options))).code).toBe('no_data_in_range')
  })

  it('revives an import the server failed as abandoned', async () => {
    const { server, options } = setup()
    let batches = 0
    server.fault = (req) => (req.path.endsWith('/batches') && ++batches > 1 ? { respond: { status: 500, body: {}, retryAfterSeconds: null } } : null)
    await failure(runImport({ ...options, client: { ...fast, maxAttempts: 1 } }))
    server.fault = null
    const stored = [...server.imports.values()][0]
    stored.status = 'failed'
    stored.error_code = 'upload_abandoned'
    const status = await runImport(options)
    expect(status.id).toBe(stored.id)
    expect(status.status).toBe('completed')
  })

  it('names import_exists for a finished import, without reading the file', async () => {
    const { server, workers, options } = setup()
    const done = await runImport(options)
    const e = await failure(runImport(options))
    expect(e.code).toBe('import_exists')
    expect(e.detail.import_id).toBe(done.id)
    expect(workers).toHaveLength(1)
    // Delete it, and the site is free again.
    await deleteImport({ siteId: server.siteId, importId: done.id, transport: server.transport, client: fast })
    expect((await runImport(options)).status).toBe('completed')
  })

  it('carries on with its own import when the create answer was lost and the retry says it exists', async () => {
    const { server, options } = setup()
    let dropped = false
    server.fault = (req) => {
      if (!dropped && req.method === 'POST' && req.path === '/sites/site-1/data-imports') {
        dropped = true
        return { dropResponse: true }
      }
      return null
    }
    const status = await runImport(options)
    expect(status.status).toBe('completed')
    expect(server.imports.size).toBe(1)
  })
})

describe('failures on the worker side', () => {
  it('surfaces the file\'s own error from the worker, named', async () => {
    const { options } = setup({ file: new File(['date,visitors\n'], 'one.csv') })
    const e = await failure(runImport(options))
    expect(e.code).toBe('wrong_file')
    expect(e.detail.reason).toBe('not_an_archive')
  })

  it('names a worker that could not be loaded', async () => {
    const { options } = setup({
      createWorker: () => {
        const w = workerDouble(() => {})
        setTimeout(() => w.crash('404'), 0)
        return w
      },
    })
    const e = await failure(runImport(options))
    expect(e.code).toBe('worker_failed')
  })

  it('names a worker from another build as worker_version_mismatch', async () => {
    const { options } = setup({
      createWorker: () =>
        workerDouble((m, reply) => {
          reply({ type: 'error', id: m.id, error: { code: 'worker_version_mismatch', message: 'reload', status: null, detail: {} } })
        }),
    })
    expect((await failure(runImport(options))).code).toBe('worker_version_mismatch')
  })

  it('sends the protocol version with every prepare, and refuses an answer from another version', async () => {
    const received: number[] = []
    const { options } = setup({
      createWorker: () =>
        workerDouble((m, reply) => {
          if (m.type === 'prepare') received.push(m.protocol)
          reply({ type: 'prepared', id: m.id, protocol: PROTOCOL_VERSION + 1, plan: {} as never })
        }),
    })
    expect((await failure(runImport(options))).code).toBe('worker_version_mismatch')
    expect(received).toEqual([PROTOCOL_VERSION])
  })

  it('stops the worker and the upload when the caller cancels', async () => {
    const controller = new AbortController()
    const { server, workers, options } = setup({ signal: controller.signal })
    let batches = 0
    server.fault = (req) => {
      if (req.path.endsWith('/batches') && ++batches === 2) controller.abort()
      return null
    }
    const e = await failure(runImport(options))
    expect(e.code).toBe('aborted')
    expect(workers[0].terminated).toBe(true)
    expect(batches).toBe(2)
  })

  it('emits the error as an event too, for the UI', async () => {
    const { events, options } = setup({ file: new File(['nope'], 'x.txt') })
    await failure(runImport(options))
    const last = events.at(-1)
    expect(last?.type).toBe('error')
    expect((last as Extract<ImportEvent, { type: 'error' }>).error.code).toBe('wrong_file')
  })
})

// M7-a and §3.12c amendment 1: an import is the LIST of files the customer
// chose. `file` stays for a caller written before that (the staging harness,
// the settings screen); exactly one of `file` and `files` is set, and the
// count is checked before the worker starts or the server is asked anything.
describe('the files an import reads', () => {
  const isPrepare = (m: ToWorker): m is PrepareRequest => m.type === 'prepare'

  /** A File that fails the test if anything reads a byte of it. */
  function untouchable(name: string): File {
    const f = new File(['never read'], name)
    const boom = () => {
      throw new Error(`${name} was read`)
    }
    Object.defineProperty(f, 'slice', { value: boom })
    Object.defineProperty(f, 'stream', { value: boom })
    Object.defineProperty(f, 'arrayBuffer', { value: boom })
    Object.defineProperty(f, 'text', { value: boom })
    return f
  }

  it('reads `files: [zip]` exactly as it reads `file: zip`: the same plan, the same rows, the same create request', async () => {
    const single = setup()
    const one = await runImport(single.options)
    const list = setup({ file: undefined, files: [plausibleFixtureFile()] })
    const two = await runImport(list.options)
    expect(two.fingerprint).toBe(one.fingerprint)
    expect(list.server.imports.get(two.id)?.rows).toEqual(single.server.imports.get(one.id)?.rows)
    const body = (x: typeof single) =>
      x.server.requests.find((r) => r.method === 'POST' && r.path === '/sites/site-1/data-imports')?.body
    expect(body(list)).toBe(body(single))
  })

  it('hands the worker a list of files and never a lone `file`, at protocol version 2', async () => {
    const { workers, options } = setup()
    await runImport(options)
    const prepare = workers[0].received.find(isPrepare)
    expect(prepare).toBeDefined()
    expect(PROTOCOL_VERSION).toBe(2)
    expect(prepare).toMatchObject({ protocol: 2 })
    expect(Object.keys(prepare as object)).toContain('files')
    expect(Object.keys(prepare as object)).not.toContain('file')
    const files = prepare?.files ?? []
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('plausible-export.zip')
  })

  it('gives a bare Blob a name, so every file the worker reads has one to echo', async () => {
    const { workers, options } = setup({ file: new Blob([await plausibleFixtureFile().arrayBuffer()]) })
    expect((await runImport(options)).status).toBe('completed')
    expect(workers[0].received.find(isPrepare)?.files[0].name).toBe('export')
  })

  it.each([
    ['neither `file` nor `files`', { file: undefined }, 'Choose a file to import.'],
    ['an empty list', { file: undefined, files: [] as File[] }, 'Choose a file to import.'],
    [
      'both `file` and `files`',
      { files: [plausibleFixtureFile()] },
      'Choose the export once: as one file or as a list of files, not both.',
    ],
  ])('refuses %s as missing_file, before the worker or the server', async (_what, over, message) => {
    const { server, workers, events, options } = setup(over as Partial<ImportOptions>)
    const e = await failure(runImport(options))
    expect(e.code).toBe('wrong_file')
    expect(e.detail).toEqual({ reason: 'missing_file' })
    expect(e.message).toBe(message)
    expect(server.requests).toHaveLength(0)
    expect(workers).toHaveLength(0)
    expect(events.at(-1)).toMatchObject({ type: 'error' })
  })

  it(`refuses more than MAX_UPLOAD_FILES (${MAX_UPLOAD_FILES}) files as too_many_files, reading none of them`, async () => {
    expect(MAX_UPLOAD_FILES).toBe(16)
    const files = Array.from({ length: MAX_UPLOAD_FILES + 1 }, (_, i) => untouchable(`f${i}.csv`))
    const { server, workers, options } = setup({ file: undefined, files })
    const e = await failure(runImport(options))
    expect(e.code).toBe('too_many_files')
    expect(e.detail).toEqual({ limit: 16, observed: 17 })
    expect(server.requests).toHaveLength(0)
    expect(workers).toHaveLength(0)
  })

  it('refuses a second file for a source whose export is one file, reading neither', async () => {
    const { server, workers, options } = setup({ file: undefined, files: [untouchable('a.zip'), untouchable('b.zip')] })
    const e = await failure(runImport(options))
    expect(e.code).toBe('wrong_file')
    expect(e.detail).toEqual({ reason: 'duplicate_file', limit: 1, observed: 2 })
    expect(server.requests).toHaveLength(0)
    expect(workers).toHaveLength(0)
  })

  it('names too_many_files before a single-file source\'s second-file refusal, so the count is the first thing said', async () => {
    const files = Array.from({ length: MAX_UPLOAD_FILES + 1 }, (_, i) => untouchable(`f${i}.zip`))
    const { options } = setup({ file: undefined, files })
    expect((await failure(runImport(options))).code).toBe('too_many_files')
  })

  it.each([
    ['no list of files', undefined],
    ['a lone file where the list belongs', new File(['never read'], 'lone.zip')],
  ])('a worker handed %s refuses the prepare by name, and plans nothing', async (_what, files) => {
    const posted: FromWorker[] = []
    const host = createWorkerHost((m) => posted.push(m))
    await host({
      type: 'prepare',
      id: 7,
      protocol: PROTOCOL_VERSION,
      source: 'plausible',
      files: files as unknown as readonly NamedFile[],
      clip: null,
      timeZone: 'UTC',
    })
    expect(posted).toEqual([
      {
        type: 'error',
        id: 7,
        error: expect.objectContaining({
          code: 'worker_failed',
          message: 'The page handed the import worker no list of files to read.',
        }),
      },
    ])
  })

  it('the worker checks the count too, for a caller that went round the orchestrator', async () => {
    const none = await failure(runPipeline({ source: 'plausible', files: [], clip: null, timeZone: 'UTC' }))
    expect(none.detail).toEqual({ reason: 'missing_file' })
    const many = Array.from({ length: MAX_UPLOAD_FILES + 1 }, (_, i) => untouchable(`f${i}.csv`))
    const over = await failure(runPipeline({ source: 'plausible', files: many, clip: null, timeZone: 'UTC' }))
    expect(over.code).toBe('too_many_files')
  })
})

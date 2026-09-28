// ─── The import orchestrator: the main thread's side of an upload ─────────
//
// §3.12b M2-n (27-09-2026 amendment): the WORKER parses, folds, plans and holds
// the parts; the MAIN THREAD, which alone holds the session, uploads them. This
// module is that main-thread half. It starts the worker, receives the plan,
// creates the import (or resumes the one already there), then pulls each part
// from the worker and sends it through the injected transport.
//
// Two phases, because M11's confirm screen sits between them (M2-c: the plan is
// computed from the whole file BEFORE the first write, so the customer sees
// exactly what will be imported):
//
//   const prepared = await prepareImport({ siteId, source, files, transport, onEvent })
//   // … show prepared.plan: range, totals, skipped rows …
//   const status = await prepared.upload()
//
// `runImport` does both for a caller with nothing to confirm (the staging
// harness). Progress, skip reports, completion and failure arrive as typed
// events for the UI; the promises carry the same outcome for control flow.
//
// The export arrives as `files` (every file the customer chose, M7-a) or, for
// a caller written before multi-file sources, as one `file` (§3.12c amendment
// 1). Exactly one of the two is set; both become the same list of files, so
// the worker and the parsers only ever see a list. The file count is checked
// HERE, before the worker starts or the server is asked anything: none, more
// than MAX_UPLOAD_FILES, or a second file for a source whose export is one.
//
// Resume (M2-j): if the site already has an unfinished upload from this source,
// the file is planned against THAT import's range and must produce the stored
// fingerprint — the same file — or the error is `plan_mismatch`. The upload
// then continues from the server's cursor. A failed-by-abandonment upload
// resumes the same way (the next accepted batch revives it).
//
// 🔴 Nothing here imports `apiRequest`. The transport is injected; the app
// passes app-transport.ts, and the gate-6 harness passes its own.

import type { Clip } from './core/cap'
import { addDays, isTimeZone, todayIn } from './core/dates'
import { checkUploadCount, requireExactlyOneFile } from './core/schema'
import type { SkipSample } from './core/skipped'
import { ImportApiClient, type ClientOptions, type Transport } from './client'
import { ImportError, fromWireError, wrongFile, type Cursor } from './errors'
import { PROTOCOL_VERSION, type FromWorker, type PlanSummary, type PrepareRequest, type ToWorker } from './protocol'
import { SOURCE_META, isImportSource, type ImportSource } from './source-meta'
import type { ImportStatus, PlanStep, UploadWindow } from './types'

export { ImportError } from './errors'
export type { ImportErrorCode, ImportErrorDetail, Cursor, WrongFileReason } from './errors'
export type { Transport, TransportRequest, TransportResponse, ClientOptions } from './client'
export type { PlanSummary } from './protocol'
export type { ImportSource } from './source-meta'
export type { ImportStatus, UploadWindow, PlanStep, PlanTotals, CollectSettings } from './types'
export type { SkipSample } from './core/skipped'
export { MAX_UPLOAD_FILES } from './core/schema'

/** Where the prebuilt worker is served (scripts/build-worker.mjs), same-origin. */
export const DEFAULT_WORKER_URL = '/workers/import.js'

export type ImportEvent =
  | { type: 'progress'; stage: 'window' }
  | { type: 'progress'; stage: 'reading'; bytesRead: number; bytesTotal: number }
  | { type: 'progress'; stage: 'planning' }
  | { type: 'progress'; stage: 'creating' }
  | { type: 'progress'; stage: 'resuming'; importId: string }
  | { type: 'progress'; stage: 'uploading'; importId: string; partsDone: number; partsTotal: number }
  | { type: 'skipped'; origin: 'browser'; counts: Record<string, number>; samples: Record<string, SkipSample[]> }
  /** The server's skip counts, summed over this session's batches. */
  | { type: 'skipped'; origin: 'server'; counts: Record<string, number> }
  | { type: 'done'; status: ImportStatus }
  | { type: 'error'; error: ImportError }

/** The part of a Worker the orchestrator uses. A real `Worker` satisfies it. */
export interface WorkerLike {
  postMessage(message: ToWorker): void
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: (event: Event) => void): void
  terminate(): void
}

export interface ImportOptions {
  siteId: string
  source: ImportSource
  /**
   * The export exactly as the customer selected it, for a source whose export
   * is one file. It never leaves the browser. Set this OR `files`, not both.
   */
  file?: Blob
  /**
   * Every file the customer selected (M7-a), in the order they chose them.
   * They never leave the browser. Set this OR `file`, not both.
   */
  files?: readonly File[]
  transport: Transport
  /**
   * For an aggregate source, the zone the export's days were counted in
   * (M2-g). Defaults to the site's. Must be the site's for a raw source.
   */
  sourceTimezone?: string | null
  /** Defaults to DEFAULT_WORKER_URL. */
  workerUrl?: string
  /** Defaults to `new Worker(url)`. Tests and the harness pass their own. */
  createWorker?: (url: string) => WorkerLike
  /** Cancels the whole run: the worker is stopped and the in-flight request aborted. */
  signal?: AbortSignal
  onEvent?: (event: ImportEvent) => void
  /** Pacing and retry tuning (tests). */
  client?: Partial<Omit<ClientOptions, 'signal'>>
  /** The clock used to tell "yesterday" in the source's zone (tests). */
  now?: () => Date
}

export interface PreparedImport {
  readonly window: UploadWindow
  readonly plan: PlanSummary
  /** The zone the create request carries. */
  readonly sourceTimezone: string
  /** The existing import this file resumes, or null for a new one. */
  readonly resume: ImportStatus | null
  /** Creates (or resumes) the import and sends every part. Can be called again after a failure. */
  upload(): Promise<ImportStatus>
  /** Stops the worker and frees the parts it holds. */
  dispose(): void
}

export async function prepareImport(options: ImportOptions): Promise<PreparedImport> {
  const emit = emitter(options.onEvent)
  let channel: WorkerChannel | null = null
  try {
    if (!isImportSource(options.source)) {
      throw new ImportError('source_not_enabled', `Imports from ${String(options.source)} are not available.`)
    }
    const meta = SOURCE_META[options.source]
    const files = chosenFiles(options)
    checkUploadCount(files.length)
    if (meta.fileCount === 'single') requireExactlyOneFile(files, meta.oneFileMessage)
    const requestedZone = options.sourceTimezone ?? null
    if (requestedZone !== null && !isTimeZone(requestedZone)) {
      throw new ImportError('bad_source_timezone', `${requestedZone} is not a time zone.`)
    }
    const client = new ImportApiClient(options.transport, { ...options.client, signal: options.signal })

    emit({ type: 'progress', stage: 'window' })
    const uploadWindow = await client.uploadWindow(
      options.siteId,
      options.source,
      meta.kind === 'upload_aggregate' ? requestedZone : null,
    )
    if (meta.kind === 'upload_raw' && requestedZone !== null && requestedZone !== uploadWindow.site_timezone) {
      throw new ImportError(
        'bad_source_timezone',
        `This source is counted in the site's own time zone (${uploadWindow.site_timezone}).`,
      )
    }

    const existing = uploadWindow.existing_import
    let clip: Clip
    if (existing) {
      if (!resumable(existing, options.source)) {
        throw new ImportError('import_exists', 'This site already has an import. Delete it to start another.', {
          detail: { import_id: existing.id },
        })
      }
      // Planned against the stored range, so the same file gives the same
      // plan however many days have passed since it was first uploaded.
      clip = {
        from: existing.range_start,
        through: existing.range_end,
        before: 'outside_history_window',
        after: 'outside_history_window',
      }
    } else {
      if (uploadWindow.allowed_from === null || uploadWindow.allowed_through === null) {
        throw new ImportError('range_outside_window', 'Pulse already covers every day this site can import.', {
          detail: { allowed_from: uploadWindow.allowed_from, allowed_through: uploadWindow.allowed_through },
        })
      }
      clip = clipFromWindow(
        uploadWindow.allowed_from,
        uploadWindow.allowed_through,
        uploadWindow.source_timezone,
        options.now?.() ?? new Date(),
      )
    }

    channel = new WorkerChannel((options.createWorker ?? createBrowserWorker)(options.workerUrl ?? DEFAULT_WORKER_URL))
    const live = channel
    options.signal?.addEventListener('abort', () => live.fail(new ImportError('aborted', 'The import was cancelled.')), {
      once: true,
    })
    if (options.signal?.aborted) throw new ImportError('aborted', 'The import was cancelled.')

    const mismatch = (existingId: string) =>
      new ImportError(
        'plan_mismatch',
        'This is a different file from the one this import started with. Delete the import to start again with this file.',
        { detail: { import_id: existingId } },
      )
    let plan: PlanSummary
    try {
      plan = await channel.prepare(
        { source: options.source, files: files.map((f) => ({ name: f.name, blob: f })), clip, timeZone: uploadWindow.site_timezone },
        (message) => {
          if (message.type !== 'progress') return
          if (message.stage === 'reading') {
            emit({ type: 'progress', stage: 'reading', bytesRead: message.bytesRead, bytesTotal: message.bytesTotal })
          } else {
            emit({ type: 'progress', stage: 'planning' })
          }
        },
      )
    } catch (e) {
      // Clipped to the stored import's range, a file with no day inside it can't be
      // the file that import was planned from (that file's days ARE the range): it
      // is a different file, whichever side of the range its days fall.
      if (existing && asImportError(e).code === 'no_data_in_range') throw mismatch(existing.id)
      throw e
    }
    if (existing && plan.fingerprint !== existing.fingerprint) throw mismatch(existing.id)
    emit({ type: 'skipped', origin: 'browser', counts: plan.skipped, samples: plan.skipped_samples })

    const sourceTimezone = existing ? existing.source_timezone : uploadWindow.source_timezone
    return new Upload(options, client, channel, uploadWindow, plan, sourceTimezone, existing, emit)
  } catch (e) {
    channel?.terminate()
    const error = asImportError(e)
    emit({ type: 'error', error })
    throw error
  }
}

/** Prepare and upload in one go, for a caller with no confirm step. */
export async function runImport(options: ImportOptions): Promise<ImportStatus> {
  const prepared = await prepareImport(options)
  try {
    return await prepared.upload()
  } finally {
    prepared.dispose()
  }
}

/** Cancels an import; the server purges its rows (M2-j). */
export async function deleteImport(options: {
  siteId: string
  importId: string
  transport: Transport
  client?: Partial<ClientOptions>
}): Promise<void> {
  await new ImportApiClient(options.transport, options.client).remove(options.siteId, options.importId)
}

export async function getImportStatus(options: {
  siteId: string
  importId: string
  transport: Transport
  client?: Partial<ClientOptions>
}): Promise<ImportStatus> {
  return new ImportApiClient(options.transport, options.client).status(options.siteId, options.importId)
}

export async function getUploadWindow(options: {
  siteId: string
  source: ImportSource
  sourceTimezone?: string | null
  transport: Transport
  client?: Partial<ClientOptions>
}): Promise<UploadWindow> {
  return new ImportApiClient(options.transport, options.client).uploadWindow(
    options.siteId,
    options.source,
    options.sourceTimezone ?? null,
  )
}

/**
 * The browser's clip from the upload window. A day before `allowed_from` is
 * outside the history window. A day after `allowed_through` is a day Pulse has
 * measured when the window stops short of yesterday (that only happens because
 * Pulse's own data starts there); otherwise it is today or later, which no
 * import may claim either, and is counted with the window.
 */
export function clipFromWindow(allowedFrom: string, allowedThrough: string, sourceTimezone: string, now: Date): Clip {
  const yesterday = addDays(todayIn(sourceTimezone, now), -1)
  return {
    from: allowedFrom,
    through: allowedThrough,
    before: 'outside_history_window',
    after: allowedThrough < yesterday ? 'pulse_measured' : 'outside_history_window',
  }
}

function resumable(existing: ImportStatus, source: ImportSource): boolean {
  if (existing.source !== source || !existing.fingerprint) return false
  if (existing.status === 'pending' || existing.status === 'running') return true
  return existing.status === 'failed' && existing.error_code === 'upload_abandoned'
}

class Upload implements PreparedImport {
  private importId: string | null
  private running = false
  private disposed = false
  private readonly serverSkipped: Record<string, number> = {}

  constructor(
    private readonly options: ImportOptions,
    private readonly client: ImportApiClient,
    private readonly channel: WorkerChannel,
    readonly window: UploadWindow,
    readonly plan: PlanSummary,
    readonly sourceTimezone: string,
    readonly resume: ImportStatus | null,
    private readonly emit: (event: ImportEvent) => void,
  ) {
    this.importId = resume?.id ?? null
  }

  async upload(): Promise<ImportStatus> {
    if (this.running) throw new ImportError('unexpected_response', 'This upload is already running.')
    if (this.disposed) throw new ImportError('worker_failed', 'This import was disposed; prepare it again.')
    this.running = true
    try {
      const { siteId } = this.options
      let cursor: Cursor
      if (this.importId) {
        this.emit({ type: 'progress', stage: 'resuming', importId: this.importId })
        const s = await this.client.status(siteId, this.importId)
        this.assertSameFile(s)
        if (s.status === 'completed') return this.finish(s)
        cursor = s.cursor
      } else {
        this.emit({ type: 'progress', stage: 'creating' })
        const s = await this.create()
        this.importId = s.id
        cursor = s.cursor
      }

      const importId = this.importId
      const steps = this.plan.steps
      this.emit({
        type: 'progress',
        stage: 'uploading',
        importId,
        partsDone: partsBefore(steps, cursor),
        partsTotal: this.plan.parts_total,
      })
      const final = await this.client.uploadParts({
        siteId,
        importId,
        steps,
        from: cursor,
        getPart: (step, part) => this.channel.part(step, part),
        onBatch: ({ next, response }) => {
          const skipped = Object.entries(response.skipped)
          if (!response.already_applied && skipped.length > 0) {
            for (const [reason, n] of skipped) this.serverSkipped[reason] = (this.serverSkipped[reason] ?? 0) + n
            this.emit({ type: 'skipped', origin: 'server', counts: { ...this.serverSkipped } })
          }
          this.emit({
            type: 'progress',
            stage: 'uploading',
            importId,
            partsDone: next ? partsBefore(steps, next) : this.plan.parts_total,
            partsTotal: this.plan.parts_total,
          })
        },
      })
      return this.finish(final)
    } catch (e) {
      const error = asImportError(e)
      this.emit({ type: 'error', error })
      throw error
    } finally {
      this.running = false
    }
  }

  dispose(): void {
    this.disposed = true
    this.channel.terminate()
  }

  private async create(): Promise<ImportStatus> {
    const { siteId, source } = this.options
    const plan = this.plan
    try {
      return await this.client.create(siteId, {
        source,
        source_timezone: this.sourceTimezone,
        range_start: plan.range_start,
        range_end: plan.range_end,
        plan: plan.steps.map((s) => ({ start: s.start, end: s.end, parts: s.parts })),
        fingerprint: plan.fingerprint,
        totals: plan.totals,
        skipped: plan.skipped,
        visits_are_visitors: plan.visits_are_visitors,
      })
    } catch (e) {
      // A create whose answer was lost (a timeout after the server committed)
      // comes back from its retry as `import_exists`. If the import it names is
      // this very file's, it is ours: carry on with it.
      if (e instanceof ImportError && e.code === 'import_exists' && e.detail.import_id) {
        const s = await this.client.status(siteId, e.detail.import_id)
        if (resumable(s, source) && s.fingerprint === plan.fingerprint) return s
      }
      throw e
    }
  }

  private assertSameFile(s: ImportStatus): void {
    if (s.fingerprint !== this.plan.fingerprint) {
      throw new ImportError('plan_mismatch', 'This is a different file from the one this import started with.', {
        detail: { import_id: s.id },
      })
    }
  }

  private finish(status: ImportStatus): ImportStatus {
    this.emit({ type: 'done', status })
    return status
  }
}

/**
 * The files an import reads, from whichever of `file` and `files` the caller
 * set (§3.12c amendment 1). Exactly one must be: neither is nothing to import,
 * and both is a caller that has not decided which export it means.
 */
function chosenFiles(options: Pick<ImportOptions, 'file' | 'files'>): File[] {
  const single = options.file != null
  const several = options.files != null
  if (single === several) {
    throw wrongFile(
      'missing_file',
      single ? 'Choose the export once: as one file or as a list of files, not both.' : 'Choose a file to import.',
    )
  }
  if (single) return [asFile(options.file as Blob)]
  if (!Array.isArray(options.files)) throw wrongFile('missing_file', 'Choose a file to import.')
  return [...(options.files as readonly File[])]
}

/**
 * A File keeps its own name. A bare Blob (a caller that built the bytes
 * itself) is wrapped, by reference, never copied, in a File named for what it
 * is, so every file the worker reads has a name to echo.
 */
function asFile(blob: Blob): File {
  if (typeof (blob as Partial<File>).name === 'string') return blob as File
  return new File([blob], 'export', { type: blob.type })
}

/** How many parts precede `cursor` in plan order. */
function partsBefore(steps: readonly PlanStep[], cursor: Cursor): number {
  let n = 0
  for (let i = 0; i < cursor.step && i < steps.length; i++) n += steps[i].parts
  return n + cursor.part
}

function createBrowserWorker(url: string): WorkerLike {
  if (typeof Worker === 'undefined') {
    throw new ImportError('worker_failed', 'This browser cannot read the file in the background.')
  }
  return new Worker(url)
}

function asImportError(e: unknown): ImportError {
  if (e instanceof ImportError) return e
  return new ImportError('worker_failed', e instanceof Error ? e.message : String(e), { cause: e })
}

/** Calls the listener, and never lets a broken listener break the upload. */
function emitter(listener: ((event: ImportEvent) => void) | undefined): (event: ImportEvent) => void {
  return (event) => {
    if (!listener) return
    try {
      listener(event)
    } catch (e) {
      console.error('[import] an event listener threw', e)
    }
  }
}

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never

type Pending = {
  resolve: (message: FromWorker) => void
  reject: (error: ImportError) => void
  onProgress?: (message: FromWorker) => void
}

/** Request/response over a worker, correlated by id. A dead worker fails every waiter. */
class WorkerChannel {
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private failure: ImportError | null = null

  constructor(private readonly worker: WorkerLike) {
    worker.addEventListener('message', (event) => this.onMessage((event as MessageEvent<FromWorker>).data))
    worker.addEventListener('error', (event) => {
      const detail = (event as ErrorEvent).message
      this.fail(
        new ImportError(
          'worker_failed',
          `The import worker could not start or stopped unexpectedly${detail ? `: ${detail}` : '.'}`,
        ),
      )
    })
    worker.addEventListener('messageerror', () => {
      this.fail(new ImportError('worker_failed', 'A message from the import worker could not be read.'))
    })
  }

  async prepare(
    request: Omit<PrepareRequest, 'type' | 'id' | 'protocol'>,
    onProgress: (message: FromWorker) => void,
  ): Promise<PlanSummary> {
    const answer = await this.send({ type: 'prepare', protocol: PROTOCOL_VERSION, ...request }, onProgress)
    if (answer.type !== 'prepared') throw new ImportError('worker_failed', `The worker answered ${answer.type} to prepare.`)
    if (answer.protocol !== PROTOCOL_VERSION) {
      throw new ImportError(
        'worker_version_mismatch',
        'This page and the import worker come from different versions of Pulse. Reload the page and try again.',
      )
    }
    return answer.plan
  }

  async part(step: number, part: number): Promise<string> {
    const answer = await this.send({ type: 'part', step, part })
    if (answer.type !== 'part' || answer.step !== step || answer.part !== part) {
      throw new ImportError('worker_failed', `The worker did not return batch ${step}/${part}.`)
    }
    return answer.body
  }

  fail(error: ImportError): void {
    if (!this.failure) this.failure = error
    for (const p of this.pending.values()) p.reject(error)
    this.pending.clear()
    this.worker.terminate()
  }

  terminate(): void {
    this.fail(new ImportError('aborted', 'The import worker was stopped.'))
  }

  private send(message: WithoutId<ToWorker>, onProgress?: (message: FromWorker) => void): Promise<FromWorker> {
    if (this.failure) return Promise.reject(this.failure)
    const id = this.nextId++
    return new Promise<FromWorker>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress })
      try {
        this.worker.postMessage({ ...message, id } as ToWorker)
      } catch (e) {
        this.pending.delete(id)
        reject(new ImportError('worker_failed', `The file could not be handed to the import worker: ${String(e)}`))
      }
    })
  }

  private onMessage(message: FromWorker): void {
    const p = this.pending.get(message?.id)
    if (!p) return
    if (message.type === 'progress') {
      p.onProgress?.(message)
      return
    }
    this.pending.delete(message.id)
    if (message.type === 'error') p.reject(fromWireError(message.error))
    else p.resolve(message)
  }
}

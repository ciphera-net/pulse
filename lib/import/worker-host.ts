// ─── The worker's side of the protocol, with no worker globals ────────────
//
// worker.ts wires this to `self`; tests wire it to an in-process channel. It
// runs the pipeline once, holds the resulting parts, and hands each one out as
// the exact JSON body the orchestrator will POST.
//
// The parts stay HERE, in the worker, for the whole upload: the main thread
// asks for one at a time, so at most one batch body is ever in the page's
// memory, and the raw export never is.

import { batchBody, type PlanPart } from './core/plan'
import { ImportError, toWireError } from './errors'
import { runPipeline, type PipelineHooks } from './pipeline'
import { PROTOCOL_VERSION, type FromWorker, type ToWorker } from './protocol'
import { isImportSource } from './source-meta'

/** Progress messages are throttled: at most one per this many ms while reading. */
const PROGRESS_INTERVAL_MS = 100

export function createWorkerHost(
  post: (message: FromWorker) => void,
  options: { now?: () => number; hooks?: Pick<PipelineHooks, 'limits' | 'planLimits'> } = {},
): (message: ToWorker) => Promise<void> {
  const now = options.now ?? (() => Date.now())
  let prepared: { fingerprint: string; parts: PlanPart[][] } | null = null

  const fail = (id: number, error: unknown) => {
    const e =
      error instanceof ImportError
        ? error
        : new ImportError('worker_failed', `The import worker failed: ${error instanceof Error ? error.message : String(error)}`)
    post({ type: 'error', id, error: toWireError(e) })
  }

  return async (message: ToWorker) => {
    const id = typeof message?.id === 'number' ? message.id : -1
    try {
      if (message.type === 'prepare') {
        if (message.protocol !== PROTOCOL_VERSION) {
          throw new ImportError(
            'worker_version_mismatch',
            'This page and the import worker come from different versions of Pulse. Reload the page and try again.',
            { detail: { observed: message.protocol, limit: PROTOCOL_VERSION } },
          )
        }
        if (!isImportSource(message.source)) {
          throw new ImportError('source_not_enabled', `Imports from ${String(message.source)} are not available.`)
        }
        prepared = null
        let lastProgress = -Infinity
        const result = await runPipeline(
          { source: message.source, file: message.file, clip: message.clip, timeZone: message.timeZone },
          {
            ...options.hooks,
            onReading: (bytesRead, bytesTotal) => {
              const t = now()
              if (bytesRead < bytesTotal && t - lastProgress < PROGRESS_INTERVAL_MS) return
              lastProgress = t
              post({ type: 'progress', id, stage: 'reading', bytesRead, bytesTotal })
            },
            onPlanning: () => post({ type: 'progress', id, stage: 'planning' }),
          },
        )
        const byStep: PlanPart[][] = result.summary.steps.map(() => [])
        for (const p of result.parts) byStep[p.step][p.part] = p
        prepared = { fingerprint: result.summary.fingerprint, parts: byStep }
        post({ type: 'prepared', id, protocol: PROTOCOL_VERSION, plan: result.summary })
        return
      }
      if (message.type === 'part') {
        const part = prepared?.parts[message.step]?.[message.part]
        if (!prepared || !part) {
          throw new ImportError('worker_failed', `The worker holds no batch ${message.step}/${message.part}.`)
        }
        post({
          type: 'part',
          id,
          step: part.step,
          part: part.part,
          body: batchBody(part.step, part.part, prepared.fingerprint, part.rowsJson),
        })
        return
      }
      throw new ImportError('worker_failed', `Unknown message ${JSON.stringify((message as { type?: unknown })?.type)}.`)
    } catch (e) {
      fail(id, e)
    }
  }
}

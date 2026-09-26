// ─── File → plan, with no worker and no network in sight ──────────────────
//
// Everything the worker does, as one function over a Blob. It is Worker-
// agnostic on purpose: vitest runs it directly (jsdom has no Worker, and Node's
// worker_threads is a different API), the worker entry is a thin wrapper around
// it, and the bundle test runs the REAL built worker over the same inputs.

import { AggregateBuilder } from './core/aggregate'
import type { Clip } from './core/cap'
import { RawFolder } from './core/fold'
import { buildPlan, type PlanPart } from './core/plan'
import { SkipLedger } from './core/skipped'
import { detectInputKind, type ReadOptions } from './core/zip'
import { ImportError } from './errors'
import type { PlanSummary } from './protocol'
import { SOURCE_META, type ImportSource } from './source-meta'
import { SOURCE_PARSERS } from './sources'

export interface PipelineRequest {
  source: ImportSource
  file: Blob
  clip: Clip | null
  timeZone: string
}

export interface PipelineHooks {
  onReading?: (bytesRead: number, bytesTotal: number) => void
  onPlanning?: () => void
  /** Test seam: the archive caps. */
  limits?: ReadOptions['limits']
}

export interface PipelineResult {
  summary: PlanSummary
  parts: PlanPart[]
}

export async function runPipeline(req: PipelineRequest, hooks: PipelineHooks = {}): Promise<PipelineResult> {
  const meta = SOURCE_META[req.source]
  const parser = SOURCE_PARSERS[req.source]
  const input = await detectInputKind(req.file)
  const skipped = new SkipLedger()
  const read: ReadOptions = { onProgress: hooks.onReading, limits: hooks.limits }

  let rows
  let ignored: string[]
  if (parser.kind === 'upload_aggregate') {
    const builder = new AggregateBuilder(req.clip, skipped)
    ignored = (await parser.read(req.file, input, { rows: builder, skipped, read })).ignored
    rows = builder.build()
  } else {
    const folder = new RawFolder({ timeZone: req.timeZone, clip: req.clip, skipped })
    ignored = (await parser.read(req.file, input, { rows: folder, skipped, read })).ignored
    rows = folder.finish()
  }

  hooks.onPlanning?.()
  let plan
  try {
    plan = await buildPlan(rows)
  } catch (e) {
    // "Nothing to import" is only useful with the reasons every row was dropped.
    if (e instanceof ImportError && e.code === 'no_data_in_range') {
      throw new ImportError('no_data_in_range', e.message, { detail: { ...e.detail, skipped: skipped.toCounts() } })
    }
    throw e
  }

  return {
    summary: {
      source: req.source,
      kind: meta.kind,
      visits_are_visitors: meta.visitsAreVisitors,
      range_start: plan.range_start,
      range_end: plan.range_end,
      steps: plan.steps,
      parts_total: plan.parts.length,
      fingerprint: plan.fingerprint,
      totals: plan.totals,
      skipped: skipped.toCounts(),
      skipped_samples: skipped.toSamples(),
      ignored_files: ignored,
    },
    parts: plan.parts,
  }
}

// ─── File → plan, with no worker and no network in sight ──────────────────
//
// Everything the worker does, as one function over the chosen files. It is Worker-
// agnostic on purpose: vitest runs it directly (jsdom has no Worker, and Node's
// worker_threads is a different API), the worker entry is a thin wrapper around
// it, and the bundle test runs the REAL built worker over the same inputs.

import { AggregateBuilder } from './core/aggregate'
import type { Clip } from './core/cap'
import { RawFolder } from './core/fold'
import { capSourceEvents, sourceEventList } from './core/events'
import { buildPlan, type PlanLimits, type PlanPart } from './core/plan'
import { checkUploadCount } from './core/schema'
import { SkipLedger } from './core/skipped'
import { detectInputKind, type ReadOptions } from './core/zip'
import { ImportError } from './errors'
import type { NamedFile, PlanSummary } from './protocol'
import { SOURCE_META, type ImportSource } from './source-meta'
import { SOURCE_PARSERS } from './sources'
import type { SourceFile } from './sources/source'

export interface PipelineRequest {
  source: ImportSource
  /** Every file the customer chose (M7-a): a File, or a name beside its bytes (the worker protocol's form). */
  files: readonly (File | NamedFile)[]
  clip: Clip | null
  timeZone: string
  /** The site's own configured domain, from the upload window (M9-j'); null when the server hasn't sent one. */
  siteDomain: string | null
  /**
   * Whether the plan carries the `events` table (M12-c). True for every new
   * import; a resume of an import created before M12 (status `upload.events`
   * false) passes false, and the plan is then built WITHOUT any event row, so
   * its fingerprint is byte-identical to the one that import stored.
   */
  events: boolean
}

export interface PipelineHooks {
  onReading?: (bytesRead: number, bytesTotal: number) => void
  onPlanning?: () => void
  /** Test seams: the archive caps and the plan caps. */
  limits?: ReadOptions['limits']
  planLimits?: PlanLimits
}

export interface PipelineResult {
  summary: PlanSummary
  parts: PlanPart[]
}

export async function runPipeline(req: PipelineRequest, hooks: PipelineHooks = {}): Promise<PipelineResult> {
  const meta = SOURCE_META[req.source]
  const parser = SOURCE_PARSERS[req.source]
  // The orchestrator checks the count before it starts the worker; checked
  // again here, where the files are read, for any caller that skipped it.
  checkUploadCount(req.files.length)
  // Each file's kind from its own first bytes; the parser decides what the
  // set means (one ZIP, or several CSVs).
  const files: SourceFile[] = []
  for (const f of req.files) {
    const blob = f instanceof Blob ? f : f.blob
    files.push({ name: f.name, blob, input: await detectInputKind(blob) })
  }
  const skipped = new SkipLedger()
  const read: ReadOptions = { onProgress: hooks.onReading, limits: hooks.limits }

  let rows
  let result
  if (parser.kind === 'upload_aggregate') {
    const builder = new AggregateBuilder(req.clip, skipped)
    result = await parser.read(files, { rows: builder, skipped, read, siteDomain: req.siteDomain })
    rows = builder.build()
  } else {
    const folder = new RawFolder({ timeZone: req.timeZone, clip: req.clip, skipped, emitExitPages: meta.hasExitPages })
    result = await parser.read(files, { rows: folder, skipped, read, siteDomain: req.siteDomain })
    rows = folder.finish()
  }

  // M12-c: an import that started without events never gets them. Dropped
  // after the fold, before the plan, so nothing about them reaches a part.
  if (!req.events) rows = { ...rows, events: [] }
  // The server takes at most MAX_SOURCE_EVENTS names in one map; past that,
  // the file's smallest events travel as each day's `(other)`.
  else rows = { ...rows, events: capSourceEvents(rows.events) }

  hooks.onPlanning?.()
  let plan
  try {
    plan = await buildPlan(rows, hooks.planLimits)
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
      ignored_files: result.ignored,
      notes: sortedNotes(result.notes),
      events: sourceEventList(rows.events),
    },
    parts: plan.parts,
  }
}

/** A parser's notes with their keys sorted, so the summary is the same for the same files. */
function sortedNotes(notes: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!notes) return out
  for (const key of Object.keys(notes).sort()) out[key] = notes[key]
  return out
}

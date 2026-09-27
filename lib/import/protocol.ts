// ─── The main thread ⇄ worker protocol, typed once for both sides ─────────
//
// §3.12b M2-n (27-09-2026): the worker parses, folds, plans and HOLDS the
// parts; the main thread creates the import and uploads, because only the main
// thread has the session (the bearer token is a module variable in
// lib/api/client.ts, the CSRF token is read from document.cookie, and the
// refresh handler is registered by the auth context — none of it exists in a
// worker realm). Both sides import this module, so a message one side sends is
// a message the other side's types know.
//
//   main → worker   prepare {file, source, clip, timeZone}
//   worker → main   progress {stage: 'reading', bytesRead, bytesTotal} …
//                   progress {stage: 'planning'}
//                   prepared {plan}             (or error)
//   main → worker   part {step, part}            once per batch, in cursor order
//   worker → main   part {step, part, body}      the exact JSON body to POST
//
// Every request carries an `id`; every answer echoes it.
//
// 🔴 NEVER STALE AFTER A DEPLOY. /workers/import.js is fetched by path, and a
// progressive rollout can serve a page from one build and the worker from
// another. Both sides compile PROTOCOL_VERSION in; the worker refuses a
// `prepare` from a different version with `worker_version_mismatch`, so a
// mismatch is a named error ("reload the page"), not a malformed batch.
// Bump it whenever a message or the plan summary changes shape.

import type { Clip } from './core/cap'
import type { SkipSample } from './core/skipped'
import type { WireImportError } from './errors'
import type { ImportSource } from './source-meta'
import type { PlanStep, PlanTotals, SourceKind } from './types'

export const PROTOCOL_VERSION = 1

/** What the confirm screen (M11) shows, and what the create request is built from. */
export interface PlanSummary {
  source: ImportSource
  kind: SourceKind
  visits_are_visitors: boolean
  range_start: string
  range_end: string
  steps: PlanStep[]
  parts_total: number
  fingerprint: string
  totals: PlanTotals
  /** Rows the browser did not send, by reason. Counts only go to the server. */
  skipped: Record<string, number>
  /** Up to five file-and-line samples per reason, for the customer. Never sent. */
  skipped_samples: Record<string, SkipSample[]>
  /** Entries in the archive that were left unread (not imported), for the customer. */
  ignored_files: string[]
}

export interface PrepareRequest {
  type: 'prepare'
  id: number
  protocol: number
  source: ImportSource
  file: Blob
  /** The days the browser may send; null sends every day the file has. */
  clip: Clip | null
  /** The zone a raw source's instants are bucketed in: the site's (M2-g). */
  timeZone: string
}

export interface PartRequest {
  type: 'part'
  id: number
  step: number
  part: number
}

export type ToWorker = PrepareRequest | PartRequest

export type FromWorker =
  | { type: 'progress'; id: number; stage: 'reading'; bytesRead: number; bytesTotal: number }
  | { type: 'progress'; id: number; stage: 'planning' }
  | { type: 'prepared'; id: number; protocol: number; plan: PlanSummary }
  | { type: 'part'; id: number; step: number; part: number; body: string }
  | { type: 'error'; id: number; error: WireImportError }

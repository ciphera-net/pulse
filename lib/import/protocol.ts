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
//   main → worker   prepare {files, source, clip, timeZone}
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
//
// Version 2 (M7-a, M7-n): `prepare` carries `files`, every file the customer
// chose, instead of one `file`; the plan summary gains `notes`. Still version 2,
// unreleased (M9-j'): `prepare` additionally carries `siteDomain`, additive and
// nullable, so it does not need its own version bump.

import type { Clip } from './core/cap'
import type { SkipSample } from './core/skipped'
import type { WireImportError } from './errors'
import type { ImportSource } from './source-meta'
import type { PlanStep, PlanTotals, SourceKind } from './types'

export const PROTOCOL_VERSION = 2

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
  /**
   * Facts about the read for the confirm screen to caption, by `<source>.<fact>`
   * (M7-n); `{}` when there are none. Never sent: the create request is built
   * field by field and this is not one of them.
   */
  notes: Record<string, string>
}

/** A chosen file on the wire: its bytes, and the name the customer's file had. */
export interface NamedFile {
  name: string
  blob: Blob
}

export interface PrepareRequest {
  type: 'prepare'
  id: number
  protocol: number
  source: ImportSource
  /**
   * Every file the customer chose, in the order they chose them (M7-a), each
   * with its name beside it: a parser may echo the name, never decide by it.
   * The name is carried explicitly because a File's name does not survive
   * every structured clone (Node 22 clones a File as a nameless Blob); the
   * bytes still cross by reference, never copied.
   */
  files: readonly NamedFile[]
  /** The days the browser may send; null sends every day the files have. */
  clip: Clip | null
  /** The zone a raw source's instants are bucketed in: the site's (M2-g). */
  timeZone: string
  /**
   * The site's own configured domain, from the upload window's `site_domain`
   * (M9-j'); null when the server hasn't sent one. A source parser that
   * checks a row's hostname against the site's own uses this instead of an
   * intra-file consistency check when it is set.
   */
  siteDomain: string | null
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

// ─── What the orchestrator knows about each source ────────────────────────
//
// Metadata only — no parser is imported here, so the main thread (index.ts)
// can read a source's kind without pulling the zip and CSV code into its bundle.
// The parsers live in `sources/` and run inside the worker.
//
// M2 enables one source, the reference consumer (M2-o). M6–M9 each add theirs
// here and to the server's upload-enabled set in the same change.

import type { InputKind } from './core/zip'
import type { SourceKind } from './types'

export const IMPORT_SOURCES = ['plausible', 'simple_analytics'] as const
export type ImportSource = (typeof IMPORT_SOURCES)[number]

/**
 * Whether the export is ONE file (a ZIP, a CSV) or several the customer
 * chooses together (Fathom's per-dimension CSVs), M7-a. For 'single', the
 * orchestrator refuses a second file before the worker starts, in the
 * source's own words, and the picker (M11) allows one.
 */
export type SourceFileCount =
  | {
      fileCount: 'single'
      /**
       * The refusal of a second file. The parser says the same thing when it
       * is reached directly, so both read this one string: the orchestrator's
       * guard fires first and would otherwise say it in generic words.
       */
      oneFileMessage: string
    }
  | { fileCount: 'multiple' }

export type SourceMeta = SourceFileCount & {
  kind: SourceKind
  /** True for a source with no visit concept, which sends visits = visitors (M2-k). */
  visitsAreVisitors: boolean
  /** The file shapes the source's export arrives in. */
  accepts: readonly InputKind[]
  /**
   * Whether this source's raw fold produces `exit_page` rows (M9-e), read by
   * `pipeline.ts` into `RawFolder`'s `emitExitPages`. Irrelevant for an
   * `upload_aggregate` source (its exit pages, if any, come straight from the
   * export's own file, never from this flag) — `true` there by convention.
   */
  hasExitPages: boolean
}

/** Plausible's refusal of a second file (M7-a), said by the orchestrator and the parser alike. */
export const PLAUSIBLE_ONE_FILE_MESSAGE = "Choose one file: Plausible's export is one ZIP."

/** Simple Analytics' refusal of a second file (M7-a), said by the orchestrator and the parser alike. */
export const SIMPLE_ANALYTICS_ONE_FILE_MESSAGE = "Choose one file: Simple Analytics' export is a single CSV file."

export const SOURCE_META: Readonly<Record<ImportSource, SourceMeta>> = {
  plausible: {
    kind: 'upload_aggregate',
    visitsAreVisitors: false,
    accepts: ['zip'],
    fileCount: 'single',
    oneFileMessage: PLAUSIBLE_ONE_FILE_MESSAGE,
    hasExitPages: true,
  },
  simple_analytics: {
    kind: 'upload_raw',
    visitsAreVisitors: true,
    accepts: ['plain', 'gzip'],
    fileCount: 'single',
    oneFileMessage: SIMPLE_ANALYTICS_ONE_FILE_MESSAGE,
    hasExitPages: false,
  },
}

export function isImportSource(value: unknown): value is ImportSource {
  return typeof value === 'string' && (IMPORT_SOURCES as readonly string[]).includes(value)
}

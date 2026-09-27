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

export const IMPORT_SOURCES = ['plausible'] as const
export type ImportSource = (typeof IMPORT_SOURCES)[number]

export interface SourceMeta {
  kind: SourceKind
  /** True for a source with no visit concept, which sends visits = visitors (M2-k). */
  visitsAreVisitors: boolean
  /** The file shapes the source's export arrives in. */
  accepts: readonly InputKind[]
}

export const SOURCE_META: Readonly<Record<ImportSource, SourceMeta>> = {
  plausible: { kind: 'upload_aggregate', visitsAreVisitors: false, accepts: ['zip'] },
}

export function isImportSource(value: unknown): value is ImportSource {
  return typeof value === 'string' && (IMPORT_SOURCES as readonly string[]).includes(value)
}

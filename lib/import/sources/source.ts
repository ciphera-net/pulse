// ─── The contract every source parser implements ──────────────────────────
//
// A source parser only TRANSLATES: it reads its own export's files and pushes
// rows into the fold it is given. The fold, the window clip, the caps, the plan
// and the upload are shared, so a new source (M6–M9) is one file here plus its
// metadata in source-meta.ts.

import type { AggregateBuilder } from '../core/aggregate'
import type { RawFolder } from '../core/fold'
import type { SkipLedger } from '../core/skipped'
import type { InputKind, ReadOptions } from '../core/zip'

export interface SourceReadResult {
  /**
   * Entries in the archive that were left unread, by name: tables deliberately
   * not imported (e.g. events until D8's release), tables a newer export adds,
   * and anything else the archive carries. OS litter is not listed.
   */
  ignored: string[]
}

export interface AggregateSourceParser {
  kind: 'upload_aggregate'
  read(
    file: Blob,
    input: InputKind,
    ctx: { rows: AggregateBuilder; skipped: SkipLedger; read: ReadOptions },
  ): Promise<SourceReadResult>
}

export interface RawSourceParser {
  kind: 'upload_raw'
  read(
    file: Blob,
    input: InputKind,
    ctx: { rows: RawFolder; skipped: SkipLedger; read: ReadOptions },
  ): Promise<SourceReadResult>
}

export type SourceParser = AggregateSourceParser | RawSourceParser

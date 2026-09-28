// ─── The contract every source parser implements ──────────────────────────
//
// A source parser only TRANSLATES: it reads its own export's files and pushes
// rows into the fold it is given. The fold, the window clip, the caps, the plan
// and the upload are shared, so a new source (M6–M9) is one file here plus its
// metadata in source-meta.ts.
//
// 🔑 A parser takes EVERY file the customer chose, not one Blob (M7-a). Most
// exports are one file (Plausible's ZIP, a single CSV) and their parser calls
// `requireExactlyOneFile` first; Fathom's Custom Export is several separate
// CSVs, one per dimension, and its parser reads them all. Each file arrives
// with the input kind the pipeline sniffed from its first bytes. Its `name` is
// the customer's own file name: a parser may echo it (a skip sample, an error),
// never use it to decide what the file is, because a browser renames a
// repeated download and a customer renames whatever they like.

import type { AggregateBuilder } from '../core/aggregate'
import type { RawFolder } from '../core/fold'
import type { SkipLedger } from '../core/skipped'
import type { InputKind, ReadOptions } from '../core/zip'

/** One file the customer chose, as a parser receives it. */
export interface SourceFile {
  /** The file's own name, for messages and skip samples only. */
  name: string
  blob: Blob
  /** What its first bytes say it is. */
  input: InputKind
}

export interface SourceReadResult {
  /**
   * Entries in the archive that were left unread, by name: tables deliberately
   * not imported (e.g. events until D8's release), tables a newer export adds,
   * and anything else the archive carries. OS litter is not listed.
   */
  ignored: string[]
  /**
   * Facts about the read the confirm screen may caption, keyed by a
   * `<source>.<fact>` name (M7-n). Shown to the customer, never sent: the
   * create request names its fields one at a time and this is not one of them.
   */
  notes?: Record<string, string>
}

/**
 * The site's own configured domain, from the upload window's `site_domain`
 * (M9-j'); null when the server hasn't sent one. Every parser receives it,
 * even one that has no use for it yet, so a source that needs it (e.g. Simple
 * Analytics' hostname filter) never has to change the contract to get it.
 */
export type SiteDomain = string | null

export interface AggregateSourceParser {
  kind: 'upload_aggregate'
  read(
    files: readonly SourceFile[],
    ctx: { rows: AggregateBuilder; skipped: SkipLedger; read: ReadOptions; siteDomain: SiteDomain },
  ): Promise<SourceReadResult>
}

export interface RawSourceParser {
  kind: 'upload_raw'
  read(
    files: readonly SourceFile[],
    ctx: { rows: RawFolder; skipped: SkipLedger; read: ReadOptions; siteDomain: SiteDomain },
  ): Promise<SourceReadResult>
}

export type SourceParser = AggregateSourceParser | RawSourceParser

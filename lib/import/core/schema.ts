// ─── The strict per-source header check ───────────────────────────────────
//
// §3.12 rule 3: an upload is parsed against a strict per-source schema. A file
// whose header is not the one the source documents is the wrong file, and it
// says which columns are missing or unexpected — never a best-effort read of
// whatever columns happen to line up.
//
// Two lists per file: the columns the parser READS (all required), and every
// column the source is documented to write (the only ones allowed). A column
// outside the second list means this is not the file we think it is — or a
// newer export format nobody has checked yet — and either way reading on would
// be guessing.

import { ImportError, wrongFile } from '../errors'

export interface TableSchema {
  /** The entry's name as the customer sees it, for the error message. */
  file: string
  /** Columns the parser reads. Every one must be present. */
  required: readonly string[]
  /** Every column the source documents for this file, in its order. */
  known: readonly string[]
}

/** Column name → index, for a header that passed the check. */
export type ColumnIndex = Readonly<Record<string, number>>

export function checkHeader(schema: TableSchema, header: readonly string[]): ColumnIndex {
  const index: Record<string, number> = {}
  const duplicates: string[] = []
  header.forEach((name, i) => {
    if (name in index) duplicates.push(name)
    else index[name] = i
  })
  if (duplicates.length > 0) {
    throw wrongFile('duplicate_columns', `${schema.file} names the same column twice: ${duplicates.join(', ')}.`, {
      file: schema.file,
      columns: duplicates,
    })
  }
  const missing = schema.required.filter((c) => !(c in index))
  if (missing.length > 0) {
    throw wrongFile('missing_columns', `${schema.file} is missing ${missing.join(', ')}.`, {
      file: schema.file,
      columns: missing,
    })
  }
  const known = new Set(schema.known)
  const unexpected = header.filter((c) => !known.has(c))
  if (unexpected.length > 0) {
    throw wrongFile('unexpected_columns', `${schema.file} has columns this export never writes: ${unexpected.join(', ')}.`, {
      file: schema.file,
      columns: unexpected,
    })
  }
  return index
}

/**
 * Every file a source requires must be in the upload. `label` names a missing
 * one for the customer; `container` is what the sentence says is missing it
 * (Plausible's ZIP is "The archive"; several separate files are not one).
 */
export function requireFiles(
  found: ReadonlySet<string>,
  required: readonly string[],
  label: (name: string) => string = (name) => name,
  container = 'The archive',
): void {
  const missing = required.filter((f) => !found.has(f)).map(label)
  if (missing.length > 0) {
    throw wrongFile('missing_file', `${container} is missing ${missing.join(', ')}.`, { files: missing })
  }
}

// ─── How many files one import carries (M7-a) ─────────────────────────────
//
// An import is the files the customer chose. Most sources export ONE (a ZIP, a
// CSV); Fathom's Custom Export is seven separate CSVs. These checks live here,
// not beside the archive readers, because the main thread runs them too,
// before it starts the worker, and nothing it imports may pull the zip code
// into the page's bundle (source-meta.ts says why). core/zip.ts re-exports
// the constant beside ARCHIVE_LIMITS, where the other read limits live.

/** The most files one import may carry. Fathom needs seven; 16 leaves headroom without a per-source number. */
export const MAX_UPLOAD_FILES = 16

/** Zero files, or more than MAX_UPLOAD_FILES, is refused before any file is read. */
export function checkUploadCount(count: number): void {
  if (count === 0) throw wrongFile('missing_file', 'Choose a file to import.')
  if (count > MAX_UPLOAD_FILES) {
    throw new ImportError(
      'too_many_files',
      `You can upload at most ${MAX_UPLOAD_FILES} files at once. Choose only the files this export produced.`,
      { detail: { limit: MAX_UPLOAD_FILES, observed: count } },
    )
  }
}

/**
 * The one file of a source whose export is one file. Several are refused
 * (`duplicate_file`, with `limit` 1 and the number chosen) rather than the
 * first read and the rest silently dropped; none is `missing_file`.
 */
export function requireExactlyOneFile<T>(
  files: readonly T[],
  message = 'Choose one file: this export is a single file.',
): T {
  if (files.length === 0) throw wrongFile('missing_file', 'Choose a file to import.')
  if (files.length > 1) throw wrongFile('duplicate_file', message, { limit: 1, observed: files.length })
  return files[0]
}

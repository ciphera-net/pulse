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

import { wrongFile } from '../errors'

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

/** Every file a source requires must be in the archive. `label` names a missing one for the customer. */
export function requireFiles(
  found: ReadonlySet<string>,
  required: readonly string[],
  label: (name: string) => string = (name) => name,
): void {
  const missing = required.filter((f) => !found.has(f)).map(label)
  if (missing.length > 0) {
    throw wrongFile('missing_file', `The archive is missing ${missing.join(', ')}.`, { files: missing })
  }
}

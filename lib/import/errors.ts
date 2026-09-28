// ─── Import errors: one named vocabulary for the whole pipeline ─────────────
//
// Every failure the import library can raise carries a stable `code`, and the
// UI (M11) maps each code to a sentence. The codes come from three places and
// share one type so a caller never has to know which side of the wire a failure
// started on:
//
//   1. the server's codes (design §3.12b, M2-r), passed through verbatim;
//   2. the browser-side codes the spec names (a bad ZIP, a wrong file, a file
//      too big to fold in a tab) — these never reach the server;
//   3. the transport's own (the network, a 5xx that outlived its retries, a
//      worker that could not be loaded).
//
// 🔴 A failure is never swallowed into a generic message. If the server sends a
// code this library does not know yet, the error says `unexpected_response` AND
// keeps the server's code in `detail.server_code`, so a newer backend is visible
// rather than silently flattened.

/** The server's stable codes (M2-r, plus §3.8's `native_overlap`). */
export const SERVER_ERROR_CODES = [
  'invalid_batch',
  'invalid_plan',
  'not_found',
  'import_exists',
  'batch_out_of_order',
  'plan_mismatch',
  'import_not_active',
  'native_overlap',
  'batch_too_large',
  'range_outside_window',
  'row_outside_step',
  'duplicate_row',
  'plan_too_large',
  'bad_source_timezone',
  'source_not_enabled',
  /** M12-b: an `event_map` that is malformed, names an invalid or reserved Pulse name, or misses a source event. */
  'invalid_event_map',
  /** M12-b: a batch's `events` row names a source event the stored map doesn't (a client bug). */
  'row_outside_plan',
] as const

/** Codes raised in the browser before anything is sent (§3.12b, §3.8). */
export const BROWSER_ERROR_CODES = [
  'zip_too_large',
  'zip_too_many_entries',
  'wrong_file',
  'file_too_large_for_browser',
  'unsupported_encoding',
  'no_data_in_range',
  /** More files than MAX_UPLOAD_FILES in one upload (M7-a); `limit` and `observed` say how many. */
  'too_many_files',
] as const

/** The transport's and the worker's own failures. */
export const RUNTIME_ERROR_CODES = [
  'network',
  'server_error',
  'rate_limited',
  'unauthorized',
  'forbidden',
  'unexpected_response',
  'aborted',
  'worker_failed',
  'worker_version_mismatch',
] as const

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number]
export type BrowserErrorCode = (typeof BROWSER_ERROR_CODES)[number]
export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number]
export type ImportErrorCode = ServerErrorCode | BrowserErrorCode | RuntimeErrorCode

const KNOWN_CODES: ReadonlySet<string> = new Set<string>([
  ...SERVER_ERROR_CODES,
  ...BROWSER_ERROR_CODES,
  ...RUNTIME_ERROR_CODES,
])

export function isImportErrorCode(value: unknown): value is ImportErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value)
}

/**
 * Why a file is `wrong_file`. The code stays one word for the UI; the reason
 * says which of the file's promises it broke, for the copy and for support.
 */
export type WrongFileReason =
  | 'not_an_archive'
  | 'unreadable_archive'
  | 'truncated_archive'
  | 'unsupported_compression'
  | 'duplicate_file'
  | 'missing_file'
  | 'empty_file'
  | 'missing_columns'
  | 'unexpected_columns'
  | 'duplicate_columns'
  | 'malformed_csv'
  | 'value_out_of_range'
  /**
   * An archive or compressed file where the source exports plain files (M7-p,
   * shared with M9-c). The UI chooses the sentence by source: for Fathom it is
   * the dashboard download (a ZIP of whole-range totals), for a single-CSV
   * source the CSV inside it.
   */
  | 'unexpected_archive'
  /**
   * Rows grouped by week, month or year where the export must be daily (M7-e):
   * a longer period's total cannot be split into days without inventing them.
   * `observed` is the rounded average number of days between the file's dates.
   */
  | 'wrong_grouping'
  /**
   * A file that is no file of this export (M7-d), in one of two forms, told
   * apart by `observed`. Without it: none of the columns any file of the
   * export writes, and `columns` holds the header seen. With it: several
   * dimensions combined in one file, `columns` holds their marker columns,
   * `limit` is 1 and `observed` is how many the file combines.
   */
  | 'unrecognised_file'

/** Why the archive is `zip_too_large`: which of the four guards tripped. */
export type ZipGuard = 'entry_bytes' | 'total_bytes' | 'ratio'

export interface Cursor {
  step: number
  part: number
}

/** The extras a code may carry. Every field is optional; each code documents its own. */
export interface ImportErrorDetail {
  reason?: WrongFileReason
  guard?: ZipGuard
  file?: string
  files?: string[]
  columns?: string[]
  line?: number
  limit?: number
  observed?: number
  import_id?: string
  expected?: Cursor
  allowed_from?: string | null
  allowed_through?: string | null
  table?: string
  index?: number
  skipped?: Record<string, number>
  /** The server's own code, kept when it is one this library does not know. */
  server_code?: string
}

export class ImportError extends Error {
  readonly code: ImportErrorCode
  /** The HTTP status when the failure came from the API; null otherwise. */
  readonly status: number | null
  readonly detail: ImportErrorDetail

  constructor(
    code: ImportErrorCode,
    message: string,
    options: { status?: number | null; detail?: ImportErrorDetail; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'ImportError'
    this.code = code
    this.status = options.status ?? null
    this.detail = options.detail ?? {}
  }
}

/** The shape an ImportError takes across the worker boundary (structured clone drops prototypes). */
export interface WireImportError {
  code: ImportErrorCode
  message: string
  status: number | null
  detail: ImportErrorDetail
}

export function toWireError(error: ImportError): WireImportError {
  return { code: error.code, message: error.message, status: error.status, detail: error.detail }
}

export function fromWireError(wire: WireImportError): ImportError {
  const code = isImportErrorCode(wire.code) ? wire.code : 'worker_failed'
  return new ImportError(code, wire.message, { status: wire.status, detail: wire.detail })
}

export function wrongFile(reason: WrongFileReason, message: string, detail: ImportErrorDetail = {}): ImportError {
  return new ImportError('wrong_file', message, { detail: { reason, ...detail } })
}

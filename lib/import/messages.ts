// ─── The import's words: one sentence per code, in the house voice (M11-g) ─
//
// §3.8's rule, and the reason this file exists: the Search Console callback
// once had a code (`no_refresh_token`) with no sentence, and the customer saw
// NOTHING. Here every code the import can raise, every reason a file can be
// the wrong one and every reason a row can be skipped has a sentence, and the
// tables below are typed `Record`s over those unions, so a code added without a
// sentence fails `tsc` before any test runs; `messages.test.ts` then checks the
// words themselves. A code this map does not know (a newer backend) is never
// shown raw: it gets the `unexpected_response` sentence plus a "Details"
// disclosure carrying the server's own code.
//
// The voice (§3.10a): the outcome first, then what to do; contractions; no
// dash inside a sentence; no exclamation mark. `{tool}` is the source's name,
// read from source-display.ts, so a sentence never names a tool by hand.
//
// 🔑 ANTICIPATED VOCABULARY. Four adapter milestones are being built at the same
// time as this file, and each adds names to the unions in errors.ts and
// core/skipped.ts (design §3.12m7 M7-p, §3.12m9 M9-c/M9-j, §3.12c amendment 2).
// Their sentences are here already, keyed by the names those specs give, so the
// tables type-check against staging's unions today and cover the new members
// the moment a union gains them. Without that, whichever branch merged second
// would fail `tsc` on a sentence nobody had written.
//
// Pure functions only. No fetch, no state, no React. Never imported by the worker.

import {
  BROWSER_ERROR_CODES,
  ImportError,
  RUNTIME_ERROR_CODES,
  SERVER_ERROR_CODES,
  type ImportErrorCode,
  type ImportErrorDetail,
  type WrongFileReason,
} from './errors'
import type { SkipReason, SkipSample } from './core/skipped'
import type { ImportStatus } from './types'
import { sourceLabel } from './source-display'

/** A sentence, and what a "Details" disclosure shows under it (null: no disclosure). */
export interface ImportMessage {
  text: string
  details: string | null
}

/**
 * The pull sources' codes (§3.8): a connected import's status can carry them in
 * `error_code`, and GA4's sign-in callback raises the first three. GA4 (M5)
 * and Matomo (M10) raise them; they are listed here so a failed pull import is
 * named the day it can exist, not after.
 */
export const PULL_ERROR_CODES = [
  'denied',
  'no_refresh_token',
  'no_properties',
  'no_web_stream',
  'reconnect_required',
  'user_metrics_disabled',
  'source_unavailable',
  'connector_erased',
  'expired',
] as const
export type PullErrorCode = (typeof PULL_ERROR_CODES)[number]

/**
 * The Matomo connect route's own refusals (§3.12m10, "Error codes this source
 * adds"), plus the ones the M10 fix pass added ("As built", 28-09-2026):
 * `invalid_request`, `property_not_found` and `matomo_other_instance`.
 */
export const MATOMO_CONNECT_CODES = [
  'bad_url',
  'matomo_not_matomo',
  'matomo_private_address',
  'matomo_bad_port',
  'matomo_bad_token',
  'invalid_request',
  'property_not_found',
  'matomo_other_instance',
] as const
export type MatomoConnectCode = (typeof MATOMO_CONNECT_CODES)[number]

/** Browser codes a sibling milestone adds to errors.ts (M7-p). */
export const ANTICIPATED_BROWSER_CODES = ['too_many_files'] as const
type AnticipatedBrowserCode = (typeof ANTICIPATED_BROWSER_CODES)[number]

/** Wrong-file reasons sibling milestones add to errors.ts (M7-p; M9-c; §3.12c amendment 2). */
export const ANTICIPATED_WRONG_FILE_REASONS = ['unexpected_archive', 'wrong_grouping', 'unrecognised_file'] as const
type AnticipatedWrongFileReason = (typeof ANTICIPATED_WRONG_FILE_REASONS)[number]

/** Skip reasons only the server adds, on the batches it applies. */
export const SERVER_SKIP_REASONS = ['collection_off', 'invalid_path', 'page_rule_excluded', 'folded_into_other'] as const
export type ServerSkipReason = (typeof SERVER_SKIP_REASONS)[number]

/** Skip reasons sibling milestones add to core/skipped.ts (M7-p; M9-j). */
export const ANTICIPATED_SKIP_REASONS = ['outside_totals_range', 'hostname_mismatch'] as const
type AnticipatedSkipReason = (typeof ANTICIPATED_SKIP_REASONS)[number]

/** Every skip reason this build has words for, browser and server. */
export type KnownSkipReason = SkipReason | ServerSkipReason | AnticipatedSkipReason

// ─── Error codes ───────────────────────────────────────────────────────────

const INTERNAL =
  'Something went wrong on our side while importing. Nothing more was saved. Try again, and tell us if it keeps happening.'
const UNEXPECTED = 'Something unexpected came back from Pulse. Nothing more was saved. Try again.'

interface Vars {
  /** The source's id, as the server names it ("plausible"). */
  source: string
  /** The source's name, as its makers write it ("Plausible"). */
  tool: string
  detail: ImportErrorDetail
}
type Sentence = (v: Vars) => string

/**
 * A table's OWN entry for a key, or undefined. A code, a reason or a skip key is
 * a plain string from the server or the file, and a bare `table[key]` would hand
 * back an inherited member for `constructor`, `toString` or `__proto__` (a
 * function, or Object.prototype) instead of "not known", so the unknown-code
 * fallback would never run and the render would throw.
 */
function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}

/**
 * One entry per code. `null` means "say nothing" (the person stopped it). The
 * Record type is what makes this exhaustive: a code added to errors.ts without
 * a sentence here fails `tsc`, before any test runs.
 */
const ERROR_SENTENCES: Record<
  ImportErrorCode | AnticipatedBrowserCode | PullErrorCode | MatomoConnectCode,
  Sentence | null
> = {
  // browser
  zip_too_large: () =>
    'This file is too large to read safely in a browser. Export a shorter date range and import it in parts.',
  zip_too_many_entries: ({ tool }) =>
    `This archive holds more files than any export does. Choose the ZIP exactly as ${tool} sent it.`,
  wrong_file: (v) => wrongFileSentence(v),
  file_too_large_for_browser: () =>
    'This export holds more than a browser tab can fold at once. Export a shorter date range and import it in parts.',
  unsupported_encoding: ({ tool, detail }) => `${fileName(detail)} isn't UTF-8 text. Export it again from ${tool}.`,
  no_data_in_range: ({ detail }) => noDataSentence(detail.skipped),
  too_many_files: ({ detail }) =>
    detail.limit != null
      ? `You can upload at most ${detail.limit} files at once. Choose only the files this export produced.`
      : 'You chose more files than this export produced. Choose only its files.',

  // server
  range_outside_window: () => 'Pulse already covers every day this site can import.',
  import_exists: () => 'This site already has an import. Delete it to start another.',
  plan_mismatch: () =>
    'This is a different file from the one this import started with. Choose the same file, or delete the import to start again.',
  plan_too_large: () =>
    'This file needs more parts than one import allows. Export a shorter date range and import it in parts.',
  // Matomo (M10 fix pass) reuses this code for its own site's timezone, which
  // there is no picker for (M10-c: no customer timezone prompt) — every other
  // source keeps the original picker sentence.
  bad_source_timezone: ({ source }) =>
    source === 'matomo'
      ? "Matomo reports a time zone Pulse can't use for this site. Check the site's time zone in Matomo."
      : 'Choose a timezone from the list.',
  source_not_enabled: ({ tool }) => `Imports from ${tool} aren't available yet.`,
  import_not_active: () => 'This import has ended. Delete it to start again.',
  not_found: () => 'This import no longer exists. Refresh the page.',
  invalid_batch: () => INTERNAL,
  invalid_plan: () => INTERNAL,
  row_outside_step: () => INTERNAL,
  duplicate_row: () => INTERNAL,
  batch_too_large: () => INTERNAL,
  batch_out_of_order: () => INTERNAL,
  native_overlap: () => INTERNAL,

  // runtime
  network: () => "Pulse can't be reached. The import is paused where it was; it continues when you try again.",
  server_error: () => 'Pulse is busy right now. The import is paused where it was; try again in a minute.',
  rate_limited: () => 'Pulse is busy right now. The import is paused where it was; try again in a minute.',
  unauthorized: () => 'Your session ended. Sign in again and choose the same file to continue.',
  forbidden: () => 'Only owners and admins of this site can import history.',
  unexpected_response: () => UNEXPECTED,
  aborted: null,
  worker_failed: () => "This browser couldn't start the import. Reload the page and try again.",
  worker_version_mismatch: () => 'Pulse was updated while this page was open. Reload the page and try again.',

  // pull (GA4, M5; Matomo, M10)
  denied: () => 'Google sign-in was cancelled, so nothing was connected.',
  no_refresh_token: () => "Google didn't give Pulse lasting access. Connect again and allow access when Google asks.",
  // Matomo reuses the code for a valid token that can see no site (M10-b).
  no_properties: ({ source }) =>
    source === 'matomo'
      ? "This token can't see any Matomo sites. Create it for a user with view access to this site, then try again."
      : 'This Google account has no Google Analytics 4 properties.',
  no_web_stream: () => "This property has no web data stream, so there's nothing to import.",
  reconnect_required: ({ tool }) =>
    `${tool} no longer accepts the connection. Connect again; the import continues where it stopped.`,
  user_metrics_disabled: () =>
    'Google Analytics has user metrics turned off for this property, so visitors can\'t be imported. Turn on "Enable user metric reporting" in its settings, then continue.',
  source_unavailable: ({ tool }) =>
    `${tool} kept failing to answer. The import is paused where it was; try again later.`,
  connector_erased: ({ tool }) =>
    `The person who connected ${tool} deleted their account. Connect again to continue.`,
  // An unconfirmed connection expires after an hour for every pull source (DataImportConnectTTL).
  expired: ({ source }) =>
    source === 'matomo'
      ? 'No site was chosen within an hour, so Pulse let go of the token. Connect again to continue.'
      : 'No property was chosen within an hour, so Pulse let go of the sign-in. Connect again to continue.',

  // Matomo connect (M10)
  bad_url: () => "That doesn't look like a Matomo address. Enter it as https://yourmatomo.example.com.",
  matomo_not_matomo: () => "Pulse can't find Matomo at this address. Check the URL and try again.",
  matomo_private_address: () =>
    "That address isn't reachable from the internet. Enter the public URL your Matomo is served at.",
  matomo_bad_port: () => 'Matomo must be reachable at a normal https:// address, not a custom port.',
  matomo_bad_token: () =>
    "Pulse can't sign in with this token. Check that you copied it in full and that it's still active in Matomo.",
  // As built, M10 fix pass (28-09-2026):
  invalid_request: () => 'Something went wrong sending that request. Try again.',
  property_not_found: () => "This Matomo site no longer exists, or this token can't see it. Choose it again.",
  matomo_other_instance: () =>
    'This reconnect points at a different Matomo than the one this import started with. Use the same address, or delete the import to start again.',
}

/**
 * Codes whose sentence is followed by a "Details" disclosure: the ones that
 * mean a client bug or a guard, where the code is what support needs.
 */
const WITH_DETAILS: ReadonlySet<string> = new Set([
  'invalid_batch',
  'invalid_plan',
  'row_outside_step',
  'duplicate_row',
  'batch_too_large',
  'batch_out_of_order',
  'native_overlap',
  'unexpected_response',
])

/** Every code this map has a sentence for (the exhaustiveness test reads it). */
export const MAPPED_ERROR_CODES: readonly string[] = Object.keys(ERROR_SENTENCES)

/** What a sentence is built from: a code, its detail, and (Matomo's bad token only) the source's own words. */
export interface MessageInput {
  code: string
  detail?: ImportErrorDetail | null
  /**
   * The source's own error text, when the server passes one that is verified to
   * name no secret (Matomo's 401, M10-b). Shown only inside "Details", never as
   * the sentence (§3.10a: raw copy is never the message).
   */
  sourceMessage?: string | null
}

/**
 * The sentence for a failure, or null when there is nothing to say (`aborted`:
 * the person stopped it). Takes the code as a plain string because a status's
 * `error_code` is one, and an unknown value must still get a sentence.
 */
export function importErrorMessage(error: MessageInput, source: string): ImportMessage | null {
  const detail = error.detail ?? {}
  const entry = own<Sentence | null>(ERROR_SENTENCES, error.code)
  if (entry === null) return null
  if (entry === undefined) {
    // A code this build does not know: never the raw text, always a way to report it.
    return { text: UNEXPECTED, details: detail.server_code ?? error.code }
  }
  const text = entry({ source, tool: sourceLabel(source), detail })
  if (error.code === 'matomo_bad_token') return { text, details: error.sourceMessage?.trim() || null }
  const details = WITH_DETAILS.has(error.code) ? (detail.server_code ?? error.code) : null
  return { text, details }
}

/**
 * A failure from a route outside the upload library (the Matomo connect flow,
 * the delete button), in the error map's terms. Reads the thrown error's HTTP
 * status and body the way lib/import's client does: the server's `code` when it
 * sent one, else a code for the status, with the server's code kept for Details.
 */
export function messageInputFromApiError(e: unknown): MessageInput {
  if (e instanceof ImportError) return { code: e.code, detail: e.detail }
  const status = (e as { status?: unknown } | null)?.status
  const data = (e as { data?: unknown } | null)?.data
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const serverCode = typeof body.code === 'string' && body.code ? body.code : null
  const sourceMessage = typeof body.source_message === 'string' ? body.source_message : null
  if (serverCode) return { code: serverCode, detail: { server_code: serverCode }, sourceMessage }
  if (typeof status !== 'number' || status === 0) return { code: 'network' }
  if (status === 401) return { code: 'unauthorized' }
  if (status === 403) return { code: 'forbidden' }
  if (status === 404) return { code: 'not_found' }
  if (status === 429) return { code: 'rate_limited' }
  if (status >= 500) return { code: 'server_error' }
  return { code: 'unexpected_response', detail: { server_code: `http_${status}` } }
}

/**
 * Failures after which the SAME prepared upload can simply be sent again.
 * Never `unauthorized`: the app's transport has already tried its one session
 * refresh before the library sees a 401, so sending again fails the same way.
 * Its sentence says what works instead: sign in, then choose the same file.
 */
const RETRYABLE: ReadonlySet<string> = new Set(['network', 'server_error', 'rate_limited'])

export function isRetryableUploadError(code: string): boolean {
  return RETRYABLE.has(code)
}

// ─── Wrong files ───────────────────────────────────────────────────────────

/** The longest file or column name a sentence repeats before cutting it short. */
export const MAX_NAME_IN_SENTENCE = 80

/**
 * A name from the customer's own file (an entry in the ZIP, a column header),
 * shown so they can find it, inside a sentence that keeps the house voice
 * (M11-g: no dash inside a sentence, no exclamation mark). So a long dash
 * becomes a hyphen, an exclamation mark and control characters are dropped, and
 * a name longer than MAX_NAME_IN_SENTENCE is cut short.
 */
export function nameInSentence(value: unknown): string {
  const text = Array.from(String(value))
    .filter((c) => c.charCodeAt(0) >= 0x20 && c !== '\u007F')
    .join('')
    .replace(/[\u2012-\u2015\u2212]/g, '-')
    .replace(/[!\uFF01\u00A1]/g, '')
    .trim()
  const chars = Array.from(text)
  return chars.length > MAX_NAME_IN_SENTENCE ? `${chars.slice(0, MAX_NAME_IN_SENTENCE - 3).join('')}...` : text
}

const namedOr = (value: unknown, fallback: string): string => {
  const shown = typeof value === 'string' ? nameInSentence(value) : ''
  return shown || fallback
}
const fileName = (detail: ImportErrorDetail): string => namedOr(detail.file, 'This file')
const list = (items: readonly string[] | undefined): string =>
  Array.isArray(items)
    ? items
        .map((i) => nameInSentence(i))
        .filter(Boolean)
        .join(', ')
    : ''
const notAnExport = (tool: string) => `This doesn't look like a ${tool} export.`

/** Every wrong-file reason, each with its sentence (exhaustive by type). */
const WRONG_FILE_SENTENCES: Record<WrongFileReason | AnticipatedWrongFileReason, Sentence> = {
  not_an_archive: ({ tool }) => `This isn't a ZIP file. Choose the ZIP ${tool} emailed you, not a file from inside it.`,
  unreadable_archive: () => 'This ZIP is damaged or incomplete. Download the export again and choose the new file.',
  truncated_archive: () => 'This ZIP is damaged or incomplete. Download the export again and choose the new file.',
  unsupported_compression: () =>
    'This ZIP is damaged or incomplete. Download the export again and choose the new file.',
  missing_file: ({ tool, detail }) =>
    `${notAnExport(tool)} ${detail.files?.length ? `It has no ${list(detail.files)} file.` : 'A file it needs is missing.'}`,
  empty_file: ({ tool, detail }) => `${notAnExport(tool)} ${fileName(detail)} is empty.`,
  missing_columns: ({ tool, detail }) =>
    `${notAnExport(tool)} ${fileName(detail)} is missing the ${list(detail.columns)} columns.`,
  unexpected_columns: ({ tool, detail }) =>
    `${notAnExport(tool)} ${fileName(detail)} has columns a ${tool} export never writes: ${list(detail.columns)}.`,
  duplicate_columns: ({ tool, detail }) =>
    `${notAnExport(tool)} ${fileName(detail)} names the same column twice: ${list(detail.columns)}.`,
  duplicate_file: ({ tool, detail }) =>
    `${notAnExport(tool)} It holds two copies of ${namedOr(detail.file, 'one of its files')}.`,
  malformed_csv: ({ detail }) =>
    `${fileName(detail)} can't be read at line ${detail.line ?? 'unknown'}. Download the export again and choose the new file.`,
  value_out_of_range: ({ detail }) =>
    `${namedOr(detail.file, 'This export')} has a count larger than any day can hold. Check the export.`,
  // ONE reason, two sentences, chosen by SOURCE (§3.12c amendment 2): Fathom's dashboard
  // download is a ZIP of whole-range totals; every other upload source exports one CSV.
  unexpected_archive: ({ source, tool }) =>
    source === 'fathom'
      ? "This is Fathom's dashboard download, which holds totals for the whole range. Use Custom Export with Daily grouping instead."
      : `This looks like a ZIP archive. ${tool} exports a single CSV file, so upload that file directly.`,
  wrong_grouping: ({ detail }) =>
    detail.observed != null
      ? `This file's dates are roughly ${detail.observed} days apart. Export it again with Daily grouping.`
      : "This file's dates aren't one day apart. Export it again with Daily grouping.",
  // TWO forms (§3.12m7's "As built"): no marker column at all (detail.columns is
  // the header seen), or two or more markers in one file (detail.observed is the
  // marker count, detail.limit is 1: one file combining several dimensions).
  unrecognised_file: ({ tool, detail }) =>
    detail.observed != null
      ? `${fileName(detail)} combines several dimensions. Export each dimension as its own file.`
      : `This doesn't look like part of a ${tool} export. ${fileName(detail)} has none of the columns this export writes.`,
}

/** The wrong-file reasons this map covers (the exhaustiveness test reads it). */
export const MAPPED_WRONG_FILE_REASONS: readonly string[] = Object.keys(WRONG_FILE_SENTENCES)

function wrongFileSentence(v: Vars): string {
  const reason = v.detail.reason as string | undefined
  const entry = typeof reason === 'string' ? own<Sentence>(WRONG_FILE_SENTENCES, reason) : undefined
  return entry ? entry(v) : notAnExport(v.tool)
}

/** `no_data_in_range`: why every day was dropped, from the counts the pipeline attaches. */
function noDataSentence(skipped: Record<string, number> | undefined): string {
  const why: string[] = []
  if ((skipped?.outside_history_window ?? 0) > 0) why.push("before this site's history window")
  if ((skipped?.pulse_measured ?? 0) > 0) why.push('already measured by Pulse')
  if (why.length === 0) return "There's nothing to import in this file."
  return `There's nothing to import: every day in this file is ${why.join(' or ')}.`
}

// ─── A stopped upload ──────────────────────────────────────────────────────

/**
 * What the stopped sentence reads from a status. `steps_total` is nullable because
 * a pull import in the slot may not have been planned yet; the sentence then says
 * "part 1 of 1" rather than inventing a total.
 */
export type StoppedStatus = Pick<ImportStatus, 'progressed_at' | 'started_at' | 'created_at'> & {
  steps_total: number | null
  /** Nullable: M10's pull status may send no cursor before its first step. */
  cursor: ImportStatus['cursor'] | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "26 Sep", or "26 Sep 2025" outside the current year: the viewer's own calendar day. */
function dayOf(iso: string, now: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'an earlier day'
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${d.getFullYear()}`
}

/**
 * `upload_abandoned` (a status, not an ImportError): the upload's tab closed,
 * or it went quiet, and it can carry on from the same file (M2-j). The status
 * counts STEPS (a step is a run of days sent as one or more parts), and its
 * cursor names the next step to send, counted from zero, so the step it
 * stopped in is one more.
 */
export function stoppedUploadMessage(status: StoppedStatus, now: Date = new Date()): string {
  // Clamped both ways: whatever the status carries, the sentence names a part from 1 to its total.
  const steps = Number(status.steps_total)
  const total = Number.isFinite(steps) ? Math.max(Math.floor(steps), 1) : 1
  const step = Number(status.cursor?.step)
  const at = Math.min(Math.max((Number.isFinite(step) ? Math.floor(step) : 0) + 1, 1), total)
  const when = dayOf(status.progressed_at ?? status.started_at ?? status.created_at, now)
  return `The upload stopped at part ${at} of ${total} on ${when}. Choose the same file and it carries on where it stopped. Days already imported stay until you delete them.`
}

/** A failed import's sentence, from its status: the abandoned-upload line, or its code's. */
export function failedImportMessage(
  status: StoppedStatus & Pick<ImportStatus, 'error_code'>,
  source: string,
  now: Date = new Date(),
): ImportMessage {
  if (status.error_code === 'upload_abandoned') return { text: stoppedUploadMessage(status, now), details: null }
  // A failed import with no code, or one this build does not know, still says something true.
  return (
    importErrorMessage({ code: status.error_code ?? 'unexpected_response' }, source) ?? {
      text: UNEXPECTED,
      details: null,
    }
  )
}

// ─── Skipped rows ──────────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const count = (n: number) => n.toLocaleString('en-US')
const rows = (n: number) => `${count(n)} ${plural(n, 'row', 'rows')}`

/**
 * One phrase per reason (§3.10a), completing "{n} …". Reasons that read the
 * same ("couldn't be read") share a phrase and are shown as one line.
 */
const SKIP_PHRASES: Record<KnownSkipReason, (n: number) => string> = {
  outside_history_window: (n) => `${rows(n)} dated before this site's history window`,
  pulse_measured: (n) => `${rows(n)} on days Pulse already measured`,
  collection_off: (n) => `${rows(n)} for data this site doesn't collect`,
  invalid_path: (n) => `${count(n)} ${plural(n, "row whose page isn't", "rows whose page isn't")} a path on this site`,
  page_rule_excluded: (n) => `${rows(n)} for pages your page rules exclude`,
  folded_into_other: (n) => `${rows(n)} folded into Other (more than 1,000 values in a day)`,
  needs_place_names: (n) => `${count(n)} ${plural(n, 'region or city', 'regions or cities')} with no name Pulse knows`,
  bad_timestamp: (n) => `${rows(n)} that couldn't be read`,
  missing_field: (n) => `${rows(n)} that couldn't be read`,
  bad_number: (n) => `${rows(n)} that couldn't be read`,
  not_a_pageview: (n) => `${count(n)} ${plural(n, "row that isn't a pageview", "rows that aren't pageviews")}`,
  bot_row: (n) => `${rows(n)} the source marked as bots`,
  outside_totals_range: (n) => `${rows(n)} for dates outside this export's site-totals file`,
  hostname_mismatch: (n) => `${rows(n)} from a different website's export`,
}

/** Every skip reason this map has a phrase for (the exhaustiveness test reads it). */
export const MAPPED_SKIP_REASONS: readonly string[] = Object.keys(SKIP_PHRASES)

/** The reasons that share one "couldn't be read" line. */
const UNREADABLE: ReadonlySet<string> = new Set(['bad_timestamp', 'missing_field', 'bad_number'])

/** One reason's phrase; an unknown reason is still counted, in words, never as its raw code. */
export function skipReasonPhrase(reason: string, n: number): string {
  const entry = own<(n: number) => string>(SKIP_PHRASES, reason)
  return entry ? entry(n) : `${rows(n)} skipped for another reason`
}

export interface SkipLine {
  /** The reasons this line covers (several for "couldn't be read"). */
  reasons: string[]
  text: string
  /** File-and-line samples for these reasons (browser skips only; never row content). */
  samples: SkipSample[]
}

/**
 * The skipped rows as lines to show, largest first, zero counts dropped. The
 * counts may come from several places (the browser's plan, the server's
 * batches); they are added reason by reason.
 */
export function skipLines(
  counts: ReadonlyArray<Record<string, number> | null | undefined>,
  samples: Record<string, SkipSample[]> = {},
): SkipLine[] {
  // A Map, so a reason named like an Object member (`__proto__`) is still counted.
  const total = new Map<string, number>()
  for (const source of counts) {
    for (const [reason, n] of Object.entries(source ?? {})) {
      if (Number.isInteger(n) && n > 0) total.set(reason, (total.get(reason) ?? 0) + n)
    }
  }
  const lines: { reasons: string[]; n: number }[] = []
  let unreadable: { reasons: string[]; n: number } | null = null
  for (const [reason, n] of total) {
    if (UNREADABLE.has(reason)) {
      if (!unreadable) {
        unreadable = { reasons: [], n: 0 }
        lines.push(unreadable)
      }
      unreadable.reasons.push(reason)
      unreadable.n += n
    } else {
      lines.push({ reasons: [reason], n })
    }
  }
  return lines
    .sort((a, b) => b.n - a.n)
    .map(({ reasons, n }) => ({
      reasons,
      text: skipReasonPhrase(reasons[0], n),
      samples: reasons.flatMap((r) => own(samples, r) ?? []),
    }))
}

/**
 * The code lists the exhaustiveness test walks, re-exported so it needs one import.
 * A Set, because an anticipated code joins BROWSER_ERROR_CODES when its milestone lands.
 */
export const ALL_ERROR_CODES: readonly string[] = [
  ...new Set<string>([
    ...SERVER_ERROR_CODES,
    ...BROWSER_ERROR_CODES,
    ...RUNTIME_ERROR_CODES,
    ...ANTICIPATED_BROWSER_CODES,
    ...PULL_ERROR_CODES,
    ...MATOMO_CONNECT_CODES,
  ]),
]

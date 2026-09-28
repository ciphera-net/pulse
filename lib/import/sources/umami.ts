// ─── Umami: the raw event export (M8) ─────────────────────────────────────
//
// An `upload_raw` source: one row per tracked event, folded into per-day
// aggregates in the browser (D9), so no event ever reaches Pulse. The file is
// the output of the query Pulse publishes (umami-recipe.ts): the customer's
// own database joins `website_event` to `session`, so every row carries its
// visit's session dimensions and the browser reads ONE flat file.
//
// What arrives, and what this parser accepts (§3.12m8 §2):
//   - plain CSV: either published query's output (PostgreSQL or MySQL);
//   - gzip: the same CSV compressed (the customer's convenience, or Umami
//     Cloud's download if it turns out to be a bare `.csv.gz`, §8);
//   - ZIP: Umami Cloud's archive shape. Only the `website_event.csv` entry (or
//     `website_event_<anything>.csv`) is read; `session.csv`, `event_data.csv`
//     and anything else in the archive are named in `ignored`, never an error.
//     🔴 NO REAL CLOUD EXPORT HAS BEEN SEEN (§8, owner-held): its entry name,
//     its header and its timestamp shape are assumptions until one is, and
//     the strict header check below refuses a Cloud file whose columns differ
//     from the published query's — a named `wrong_file`, never a guessed read.
//
// Each row (M8-e, M8-f, M8-g):
//   - only `event_type` 1 is a pageview; every other type (custom events 2,
//     link 3, pixel 4, performance 5) is skipped `not_a_pageview`, counted.
//     M12 reads the custom events from this same file later (§3.12c
//     amendment 6), which is why the recipe selects `event_name`;
//   - `session_id` is the visitor and `visit_id` the visit. Both are interned
//     by the fold and never sent (M2-q);
//   - `url_path` is the page, as Umami stored it (a hash-router's `#fragment`
//     included: the server drops everything from the first `?` or `#`, as
//     native ingest does, so the page lands on its bare path);
//   - browser, OS, device, screen, language and country are the row's session
//     labels as Umami wrote them. Region and city are sent UNCONDITIONALLY, as
//     Umami wrote them, keyed under the row's country (M8-l): Umami's region is
//     always an ISO 3166-2 code and its city an English name, and the server
//     resolves both through M6's place-name index. A blank value is sent blank
//     and stored as the server's Unknown, so each dimension still adds up to
//     the day. `hostname` and `event_name` are checked in the header and never
//     read (the hostname filter runs in the customer's query, M8-b);
//   - the visit's origin is reconstructed per row, and the fold keeps the one
//     on the visit's earliest pageview (see `umamiOrigin`).
//
// Umami's session id is salted by calendar MONTH, so it is a visitor within a
// month, and its visit id is a real visit: `visits_are_visitors` is false.
// There is no month-level unique count Pulse could honour (the salt's month
// is the Umami server's, not the site's), so no monthly rows are sent and every
// month is the sum of its days (M8-h, M2-k). Every value is normalised on the
// SERVER (M2-l) — device, browser and OS through Umami's vocabulary table
// (M8-i/j/k), region and city through the place-name index — so this parser
// sends each one as the file has it.

import { CsvByteParser } from '../core/csv'
import { isCalendarDate } from '../core/dates'
import type { RawAcquisition } from '../core/fold'
import { checkHeader, requireExactlyOneFile, type ColumnIndex } from '../core/schema'
import type { RowRef } from '../core/skipped'
import { readGzip, readPlain, readZip, type EntrySink } from '../core/zip'
import { wrongFile } from '../errors'
import { UMAMI_ONE_FILE_MESSAGE } from '../source-meta'
import type { RawSourceParser, SourceReadResult } from './source'
import { UMAMI_COLUMNS, type UmamiColumn } from './umami-recipe'

export { UMAMI_COLUMNS } from './umami-recipe'

// ─── Timestamps (M8-d) ────────────────────────────────────────────────────
//
// Three shapes, tried in this order; anything else is `bad_timestamp`:
//
//   1. strict  `2026-09-22T09:00:00Z`: what both published queries write. UTC.
//   2. offset  `2026-09-22 09:00:00+00`, `…09:00:00.123456+05:30`: Postgres's
//      own text form for a timestamptz, which a query that selects
//      `created_at` without the recipe's `to_char` writes. Read with its OWN
//      offset, never assumed to be UTC.
//   3. bare    `2026-09-22 09:00:00`: no zone at all, the shape the two
//      reference importers read from Umami Cloud's download. ASSUMED to be
//      UTC (§8: unconfirmed until a real Cloud export is seen), and never
//      silently: every row read this way is counted into the plan's notes
//      (`UMAMI_ASSUMED_UTC_NOTE`), so the confirm screen can say so.

const STRICT_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/
const OFFSET_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([+-])(\d{2})(?::(\d{2}))?$/
const BARE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/

/** The most hours a UTC offset can carry: PostgreSQL's own limit is 15:59. */
const MAX_OFFSET_HOURS = 15

export type UmamiTimestampShape = 'strict' | 'offset' | 'bare'

export interface UmamiTimestamp {
  /** The instant, epoch milliseconds, UTC. */
  at: number
  shape: UmamiTimestampShape
}

/**
 * The calendar day's UTC midnight in epoch ms, or null for a day that does not
 * exist. Rows arrive in time order, so the last day is kept: most rows cost a
 * string comparison here, not a Date.
 */
class DayCache {
  private day = ''
  private ms = 0

  midnight(day: string): number | null {
    if (day === this.day) return this.ms
    if (!isCalendarDate(day)) return null
    this.day = day
    this.ms = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
    return this.ms
  }
}

function clock(days: DayCache, day: string, h: string, m: string, s: string): number | null {
  const midnight = days.midnight(day)
  if (midnight === null) return null
  const hour = Number(h)
  const minute = Number(m)
  const second = Number(s)
  if (hour > 23 || minute > 59 || second > 59) return null
  return midnight + ((hour * 60 + minute) * 60 + second) * 1000
}

/** Reads one `created_at` value: its instant and which of the three shapes it was, or null. */
export function parseUmamiTimestamp(value: string): UmamiTimestamp | null {
  return readTimestamp(value, new DayCache())
}

/** `parseUmamiTimestamp` with the file's day cache (one per file). */
function readTimestamp(value: string, days: DayCache): UmamiTimestamp | null {
  let m = STRICT_RE.exec(value)
  if (m) {
    const at = clock(days, m[1], m[2], m[3], m[4])
    return at === null ? null : { at, shape: 'strict' }
  }
  m = OFFSET_RE.exec(value)
  if (m) {
    const at = clock(days, m[1], m[2], m[3], m[4])
    const offsetHours = Number(m[7])
    const offsetMinutes = m[8] === undefined ? 0 : Number(m[8])
    if (at === null || offsetHours > MAX_OFFSET_HOURS || offsetMinutes > 59) return null
    // A fraction is kept to the millisecond (truncated): it orders a visit's
    // pageviews, and no calendar day turns on less.
    const ms = m[5] === undefined ? 0 : Number((m[5] + '00').slice(0, 3))
    const offset = (m[6] === '-' ? -1 : 1) * (offsetHours * 60 + offsetMinutes) * 60_000
    return { at: at + ms - offset, shape: 'offset' }
  }
  m = BARE_RE.exec(value)
  if (m) {
    const at = clock(days, m[1], m[2], m[3], m[4])
    return at === null ? null : { at, shape: 'bare' }
  }
  return null
}


/** The plan note counting rows whose timestamp had no zone and was read as UTC (M8-d shape 3). */
export const UMAMI_ASSUMED_UTC_NOTE = 'umami.assumed_utc_rows'

// ─── Where a visit came from (M8-g) ───────────────────────────────────────

/**
 * The path native ingest compares with "/" to tell Direct from Shared Link:
 * the query and fragment cut off, an empty path read as the root, and trailing
 * slashes trimmed except the root's own (ingestnorm.URLPath and
 * TrimTrailingSlash, byte for byte: "//" trims to "", which is not the root).
 */
export function landingPath(urlPath: string): string {
  let p = urlPath
  const cut = p.search(/[?#]/)
  if (cut >= 0) p = p.slice(0, cut)
  if (p === '') return '/'
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '')
  return p
}

/**
 * The origin value a visit's acquisition row carries (design §3.12m8 M8-g,
 * binding literally — two cases only):
 *
 *   1. the referrer host, when the row has one. Umami already cleared a
 *      same-site referral before the row was written (`route.ts:251-254`),
 *      so there is nothing further to do for that case; the server's
 *      `ImportReferrer`/hostname-convention pipeline still re-applies
 *      unchanged;
 *   2. else `Direct` when the visit landed on the site's root and `Shared Link`
 *      anywhere else (native's `NoReferrerLabel`). An aggregate source cannot
 *      make this split, having no landing page (M2-l); a raw one can.
 *
 * A `utm_source` tag is NOT a third fallback here: M8-g is explicit that a
 * no-referrer row is Direct/Shared Link regardless of any UTM tag. The tag
 * still passes through verbatim in the row's own `utm_source` field (never
 * folded into `referrer`), and the fold keeps the one on the visit's
 * EARLIEST pageview for the whole visit.
 */
export function umamiOrigin(referrerDomain: string, urlPath: string): string {
  if (referrerDomain !== '') return referrerDomain
  return landingPath(urlPath) === '/' ? 'Direct' : 'Shared Link'
}

const nullIfEmpty = (s: string) => (s === '' ? null : s)

// ─── The file ─────────────────────────────────────────────────────────────

/** The archive entry this parser reads: `website_event.csv`, or `website_event_<anything>.csv`. */
const EVENT_ENTRY_RE = /^website_event(?:_[^\\/]+)?\.csv$/

type Positions = Readonly<Record<UmamiColumn, number>>

function positions(index: ColumnIndex): Positions {
  const out = {} as Record<UmamiColumn, number>
  for (const c of UMAMI_COLUMNS) out[c] = index[c]
  return out
}

interface FileRead {
  sink: EntrySink
  /** Data rows seen below the header (every row, kept or skipped). */
  rows(): number
  hasHeader(): boolean
}

function readRows(
  file: string,
  ctx: Parameters<RawSourceParser['read']>[1],
  counts: { assumedUtc: number },
): FileRead {
  const { rows, skipped } = ctx
  const days = new DayCache()
  let p: Positions | null = null
  let width = 0
  let dataRows = 0

  const csv = new CsvByteParser((fields, line) => {
    if (!p) {
      // M8-b: every published column present, no other; order is not checked.
      p = positions(checkHeader({ file, required: UMAMI_COLUMNS, known: UMAMI_COLUMNS }, fields))
      width = fields.length
      return
    }
    dataRows++
    const at: RowRef = { file, line }
    // A fixed order, so a row that breaks several rules is counted once: its
    // shape, then what kind of event it is, then its time, then its ids.
    if (fields.length !== width) {
      skipped.add('missing_field', at)
      return
    }
    const eventType = fields[p.event_type]
    if (eventType !== '1') {
      skipped.add(eventType === '' ? 'missing_field' : 'not_a_pageview', at)
      return
    }
    const time = readTimestamp(fields[p.created_at], days)
    if (!time) {
      skipped.add('bad_timestamp', at)
      return
    }
    const visitor = fields[p.session_id]
    const visit = fields[p.visit_id]
    if (visitor === '' || visit === '') {
      skipped.add('missing_field', at)
      return
    }
    if (time.shape === 'bare') counts.assumedUtc++

    const page = fields[p.url_path]
    const utmSource = fields[p.utm_source]
    const medium = fields[p.utm_medium]
    const campaign = fields[p.utm_campaign]
    const origin = umamiOrigin(fields[p.referrer_domain], page)
    // Every row carries its own origin: the fold keeps the one on the visit's
    // earliest pageview, whichever row that turns out to be. `utm_*` pass
    // through as the columns have them (M8-g). `src_*` are unconditionally
    // `''` (M8-g: Umami has no separate provenance labels beyond the
    // referrer/UTM columns already selected) — since they're also the
    // acquisition key's tiebreak (alongside `referrer`), two visits from one
    // referrer with different campaigns MERGE into one row, keeping whichever
    // visit's own `utm_*` happens to be earliest.
    const acquisition: RawAcquisition = {
      referrer: origin,
      utm_source: nullIfEmpty(utmSource),
      utm_medium: nullIfEmpty(medium),
      utm_campaign: nullIfEmpty(campaign),
      src_source: '',
      src_medium: '',
      src_campaign: '',
      src_channel_group: '',
    }
    rows.add({
      at: time.at,
      visitor,
      visit,
      page,
      acquisition,
      dimensions: {
        country: fields[p.country],
        region: fields[p.region],
        city: fields[p.city],
        device: fields[p.device],
        browser: fields[p.browser],
        os: fields[p.os],
        language: fields[p.language],
        screen_resolution: fields[p.screen],
      },
      file,
      line,
    })
  }, file)

  return {
    sink: { chunk: (bytes) => csv.push(bytes), end: () => csv.end() },
    rows: () => dataRows,
    hasHeader: () => p !== null,
  }
}

/** A header with no rows below it is an empty export (M8-o), not a file whose every row was skipped. */
function assertRead(file: string, read: FileRead): void {
  if (!read.hasHeader()) throw wrongFile('empty_file', `${file} has no header row.`, { file })
  if (read.rows() === 0) throw wrongFile('empty_file', `${file} has no rows below its header.`, { file })
}

export const umamiSource: RawSourceParser = {
  kind: 'upload_raw',
  async read(files, ctx): Promise<SourceReadResult> {
    const file = requireExactlyOneFile(files, UMAMI_ONE_FILE_MESSAGE)
    const counts = { assumedUtc: 0 }
    const ignored: string[] = []

    if (file.input === 'zip') {
      // Declared through `as`: they are assigned inside the entry callback,
      // which the compiler's narrowing does not follow.
      let chosen = null as string | null
      let read = null as FileRead | null
      await readZip(
        file.blob,
        (name) => {
          // A folder is named by the path its entries sit under, with either
          // separator (a Windows re-zip writes `\`); the entry is found by its
          // own name wherever it sits.
          const segments = name.split(/[\\/]/)
          const base = segments[segments.length - 1]
          if (base === '') return null
          // A Mac's re-zip litter: never data, skipped without a word.
          if (segments[0] === '__MACOSX' || base === '.DS_Store' || base.startsWith('._')) return null
          if (!EVENT_ENTRY_RE.test(base)) {
            // session.csv, session_data.csv, event_data.csv and anything else:
            // left unread (never decompressed) and named in the plan.
            ignored.push(base)
            return null
          }
          if (chosen !== null) {
            throw wrongFile('duplicate_file', `The archive holds two event files, ${chosen} and ${base}. Upload one export at a time.`, {
              file: base,
              files: [chosen, base],
            })
          }
          chosen = base
          read = readRows(base, ctx, counts)
          return read.sink
        },
        ctx.read,
      )
      if (chosen === null || read === null) {
        throw wrongFile('missing_file', 'The archive is missing website_event.csv.', { files: ['website_event.csv'] })
      }
      assertRead(chosen, read)
    } else {
      const read = readRows(file.name, ctx, counts)
      if (file.input === 'gzip') await readGzip(file.blob, file.name, read.sink, ctx.read)
      else await readPlain(file.blob, file.name, read.sink, ctx.read)
      assertRead(file.name, read)
    }

    const notes: Record<string, string> = {}
    if (counts.assumedUtc > 0) notes[UMAMI_ASSUMED_UTC_NOTE] = String(counts.assumedUtc)
    return { ignored, notes }
  },
}

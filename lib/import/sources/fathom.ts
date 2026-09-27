// ─── Fathom: the Custom Export CSVs (M7) ──────────────────────────────────
//
// 🔴 BUILT AND TESTED, NOT REGISTERED (M7-o). Fathom is absent from
// IMPORT_SOURCES, SOURCE_META and SOURCE_PARSERS on purpose, so nothing can
// reach this parser until a real Fathom export has confirmed the facts below
// that are still assumptions (design §3.12m7 §5). The follow-up change adds
// Fathom to those three places and to the server's upload-enabled set. Tests
// import `fathomSource` from this module directly.
//
// Fathom's Custom Export (Settings → Exports → New Export) writes ONE CSV per
// export, and each export groups by the dimensions the customer picked. The
// recipe this parser reads (M7-c) is seven exports, all with Data Type =
// Pageviews and Date Grouping = Daily:
//
//   site totals        no dimension          → daily            (required)
//   Page               pathname              → dimension `page` (folded across hostname)
//   Country[+Region][+City]  country_code, state, city
//                                            → dimensions `country`, `region`, `city`
//   Device Type        device_type           → dimension `device`
//   Browser            browser               → dimension `browser`
//   Operating System   operating_system      → dimension `os`
//   Referrer+UTM       referrer_hostname, utm_* → acquisition
//
// Every file has a `datetime` column, `YYYY-MM-DD HH:MM:SS`; only its day is
// kept, so an Hourly export's rows for one day sum into that day exactly as a
// Daily export's one row would (M7-e). Weekly, monthly and yearly exports are
// refused: a week's total cannot be split into days without inventing them.
//
// 🔑 WHICH FILE IS WHICH IS READ FROM ITS HEADER, NEVER ITS NAME (M7-d). A
// browser renames a repeated download and a customer renames what they like.
// Each dimensioned file has one MARKER column no other file writes (the API's
// own field names: `pathname`, `country_code`, `device_type`, `browser`,
// `operating_system`, `referrer_hostname`). Exactly one marker: that file.
// NO marker is what makes the site-totals file, never the name of its
// visitor-count column, which is the one column whose spelling no evidence
// settles (`visitors` or `uniques`; §3.12m7 §1 [V§1]): identified by the name,
// a totals file spelled `uniques` would look like a subset of every
// dimensioned file. Two markers is a combined export this recipe does not
// read, refused rather than routed by whichever marker was checked first.
//
// Files are read in two passes (M7-g): every header first, so every file's
// role is known and a wrong upload is refused before any row is read; then
// the site-totals file to completion, wherever it sits in the list, so its
// date range is known before any breakdown is read. A breakdown row dated
// outside that range is skipped (`outside_totals_range`): a day with a
// breakdown and no total is not a state Pulse creates.
//
// One byte budget covers all the files together (M7-b): 1 GiB is the bound on
// the upload, not on each file.
//
// Fathom's Custom Export has no visits metric, so a row's visits are its
// visitor count (`visits_are_visitors`, M7-l), and no month-level unique
// count, so it sends no monthly rows and every month is the sum of its days
// (M2-k). Values travel as the file has them; the server normalises them
// (M2-l), including region and city names (M7-i).

import { MAX_COUNT, type AggregateBuilder } from '../core/aggregate'
import { CsvByteParser } from '../core/csv'
import { dayNumber, isCalendarDate } from '../core/dates'
import { checkHeader, requireFiles, type ColumnIndex } from '../core/schema'
import type { RowRef } from '../core/skipped'
import { ARCHIVE_LIMITS, DecompressionBudget, readPlain, type EntrySink, type ReadOptions } from '../core/zip'
import { wrongFile } from '../errors'
import type { Dimension } from '../types'
import type { AggregateSourceParser, SourceFile } from './source'

/** The seven files of the recipe (M7-c). */
export const FATHOM_ROLES = ['totals', 'page', 'locations', 'device', 'browser', 'os', 'acquisition'] as const
export type FathomRole = (typeof FATHOM_ROLES)[number]
type DimensionRole = Exclude<FathomRole, 'totals'>
const DIMENSION_ROLES: readonly DimensionRole[] = ['page', 'locations', 'device', 'browser', 'os', 'acquisition']

/**
 * The site-totals file's visitor-count column, in the order it is chosen when
 * a file somehow has both (M7-d: a fixed tie-break, not a claim about which
 * spelling is right). Every dimensioned file's is `uniques`.
 */
export const FATHOM_TOTALS_VISITOR_COLUMNS = ['uniques', 'visitors'] as const

/**
 * The bounce and time metrics, under every spelling the evidence allows
 * (M7-c: ASSUMED names, §5 item 5). A customer may tick them on any export,
 * so every file accepts them; only the site-totals file reads them, into the
 * daily row's `src_*` columns, which are stored and never displayed (D2).
 */
export const FATHOM_BOUNCE_COLUMNS = ['bounce_rate'] as const
export const FATHOM_DURATION_COLUMNS = ['avg_time_on_site', 'avg_duration', 'visit_duration'] as const
const METRIC_COLUMNS: readonly string[] = [...FATHOM_BOUNCE_COLUMNS, ...FATHOM_DURATION_COLUMNS]

export interface FathomFileSpec {
  /** The one column only this file writes (M7-d); null for site totals, which is known by having none. */
  marker: string | null
  /** Columns the parser reads. The site-totals file's visitor column is resolved per file on top of these. */
  required: readonly string[]
  /** Columns the file may also carry. Anything outside required ∪ optional refuses the file (M7-c). */
  optional: readonly string[]
}

export const FATHOM_FILES: Readonly<Record<FathomRole, FathomFileSpec>> = {
  totals: {
    marker: null,
    required: ['datetime', 'pageviews'],
    optional: [...FATHOM_TOTALS_VISITOR_COLUMNS, ...METRIC_COLUMNS],
  },
  page: {
    marker: 'pathname',
    required: ['datetime', 'pathname', 'uniques', 'pageviews'],
    optional: ['hostname', ...METRIC_COLUMNS],
  },
  locations: {
    marker: 'country_code',
    required: ['datetime', 'country_code', 'uniques', 'pageviews'],
    optional: ['state', 'city', ...METRIC_COLUMNS],
  },
  device: {
    marker: 'device_type',
    required: ['datetime', 'device_type', 'uniques', 'pageviews'],
    optional: METRIC_COLUMNS,
  },
  browser: {
    marker: 'browser',
    required: ['datetime', 'browser', 'uniques', 'pageviews'],
    optional: METRIC_COLUMNS,
  },
  os: {
    marker: 'operating_system',
    required: ['datetime', 'operating_system', 'uniques', 'pageviews'],
    optional: METRIC_COLUMNS,
  },
  acquisition: {
    marker: 'referrer_hostname',
    required: ['datetime', 'referrer_hostname', 'uniques', 'pageviews'],
    optional: [
      'referrer_pathname',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      ...METRIC_COLUMNS,
    ],
  },
}

/** Each file as the customer picked it in Custom Export, for messages. */
export const FATHOM_FILE_LABELS: Readonly<Record<FathomRole, string>> = {
  totals: 'site totals',
  page: 'Page',
  locations: 'Country',
  device: 'Device Type',
  browser: 'Browser',
  os: 'Operating System',
  acquisition: 'Referrer',
}

/**
 * A site-totals file needs at least this many distinct days before the gap
 * between them says anything about its grouping (M7-e).
 */
export const GROUPING_MIN_DATES = 3
/** An average gap between the site-totals file's days above this is not a daily export (M7-e). */
export const GROUPING_MAX_AVERAGE_GAP_DAYS = 3

/**
 * Fathom's own docs: breakdowns before this day were not tied together
 * (browser, country, page…) and are less reliable. Rows are kept; the plan
 * notes how far back the affected history reaches (M7-n).
 */
export const FATHOM_ACCURACY_FLOOR = '2021-03-01'
export const FATHOM_ACCURACY_NOTE = 'fathom.pre_accuracy_floor_through'

/** At most this many of a header's columns are echoed in an error. */
const HEADER_ECHO = 20

/** What a header says a file is. */
export interface FathomHeader {
  role: FathomRole
  index: ColumnIndex
  /** The column the visitor count is read from. */
  visitors: string
}

/**
 * Decides what one file is from its header alone (M7-d), and checks the
 * header strictly against that file's columns. Throws `unrecognised_file` in
 * two forms the error map tells apart by `observed`: a header with no marker
 * and no visitor-count column (`columns` = the header seen), or one with
 * several markers (`columns` = those markers, `limit` 1, `observed` how many).
 */
export function classifyFathomHeader(file: string, header: readonly string[]): FathomHeader {
  const columns = new Set(header)
  const marked = DIMENSION_ROLES.filter((role) => columns.has(FATHOM_FILES[role].marker as string))
  if (marked.length > 1) {
    const found = marked.map((role) => FATHOM_FILES[role].marker as string)
    throw wrongFile(
      'unrecognised_file',
      `${file} combines ${found.join(', ')} in one export. Export each dimension on its own: only Country with Region and City, and Referrer with UTM Parameters, go together.`,
      { file, columns: found, limit: 1, observed: found.length },
    )
  }
  if (marked.length === 1) {
    const role = marked[0]
    const spec = FATHOM_FILES[role]
    const index = checkHeader({ file, required: spec.required, known: [...spec.required, ...spec.optional] }, header)
    return { role, index, visitors: 'uniques' }
  }
  const visitors = FATHOM_TOTALS_VISITOR_COLUMNS.find((c) => columns.has(c))
  if (!visitors) {
    throw wrongFile(
      'unrecognised_file',
      `This doesn't look like part of a Fathom export. ${file} has none of the columns this export writes.`,
      { file, columns: header.slice(0, HEADER_ECHO) },
    )
  }
  const spec = FATHOM_FILES.totals
  const required = [...spec.required.slice(0, 1), visitors, ...spec.required.slice(1)]
  const index = checkHeader({ file, required, known: [...spec.required, ...spec.optional] }, header)
  return { role: 'totals', index, visitors }
}

const COUNT_RE = /^\d{1,10}$/
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/

/**
 * The calendar day of a `datetime` value, or null when it is not one. The
 * export writes `YYYY-MM-DD HH:MM:SS`; a bare day is read too. Only the day is
 * kept (M7-e), so every hour of one day lands on that day.
 */
export function fathomDay(value: string): string | null {
  const m = DATETIME_RE.exec(value)
  if (!m || !isCalendarDate(m[1])) return null
  if (m[2] !== undefined && (Number(m[2]) > 23 || Number(m[3]) > 59)) return null
  if (m[4] !== undefined && Number(m[4]) > 59) return null
  return m[1]
}

const isCount = (s: string) => COUNT_RE.test(s) && Number(s) <= MAX_COUNT

/**
 * An optional metric for a daily row's `src_*` column: a whole number is kept
 * as the file has it; blank is null. Anything else (a rate such as `0.45`, a
 * fractional average) is null too, NOT a skipped row: these columns are
 * stored and never displayed (D2), their spelling and format are unconfirmed
 * (§3.12m7 §5 item 5), and they sit on the one required file, where refusing
 * the row for them would drop the day's visitors and pageviews with it.
 */
function metric(fields: readonly string[], index: ColumnIndex, column: string | undefined): number | null {
  if (column === undefined) return null
  const s = fields[index[column]]
  return isCount(s) ? Number(s) : null
}

/** A file whose header has been read and whose role is known. */
interface Classified extends FathomHeader {
  file: SourceFile
  width: number
}

/** Thrown from a header read's sink to stop reading once the header is in. */
class HeaderRead {
  constructor(readonly header: string[]) {}
}

/** The first CSV record of a plain file; the rest is never read. */
async function readHeader(file: SourceFile, read: ReadOptions): Promise<string[]> {
  const csv = new CsvByteParser((fields) => {
    throw new HeaderRead(fields)
  }, file.name)
  const sink: EntrySink = { chunk: (bytes) => csv.push(bytes), end: () => csv.end() }
  try {
    // Its own budget: the header pass reads a prefix of each file, and the
    // shared budget bounds the pass that reads them whole.
    await readPlain(file.blob, file.name, sink, { limits: read.limits })
  } catch (e) {
    if (e instanceof HeaderRead) return e.header
    throw e
  }
  throw wrongFile('empty_file', `${file.name} has no header row.`, { file: file.name })
}

const nullIfEmpty = (s: string) => (s === '' ? null : s)

export const fathomSource: AggregateSourceParser = {
  kind: 'upload_aggregate',
  async read(files, ctx) {
    const { rows, skipped } = ctx

    // (1) Every file is a plain CSV. A ZIP is the dashboard download, a
    // different export of whole-range totals (M7-f), refused on its format
    // before any CSV is parsed.
    for (const f of files) {
      if (f.input === 'zip') {
        throw wrongFile(
          'unexpected_archive',
          "This is Fathom's dashboard download, which holds totals for the whole range. Use Custom Export with Daily grouping instead.",
          { file: f.name },
        )
      }
      if (f.input !== 'plain') {
        throw wrongFile(
          'unexpected_archive',
          `${f.name} is compressed. Fathom's Custom Export writes plain CSV files: choose them as they downloaded.`,
          { file: f.name },
        )
      }
    }

    // (2) Every header, so every file's role is known, and a wrong or doubled
    // file is refused, before any row is read.
    const byRole = new Map<FathomRole, Classified>()
    const order: Classified[] = []
    for (const f of files) {
      const header = await readHeader(f, ctx.read)
      const c: Classified = { ...classifyFathomHeader(f.name, header), file: f, width: header.length }
      const seen = byRole.get(c.role)
      if (seen) {
        throw wrongFile(
          'duplicate_file',
          `${seen.file.name} and ${f.name} are both ${FATHOM_FILE_LABELS[c.role]} exports. Choose one of each.`,
          { file: f.name, files: [seen.file.name, f.name] },
        )
      }
      byRole.set(c.role, c)
      order.push(c)
    }
    requireFiles(new Set(byRole.keys()), ['totals'], (role) => FATHOM_FILE_LABELS[role as FathomRole], 'This upload')

    // (3) One budget for the whole upload, sized from every file together.
    const limits = ctx.read.limits ?? ARCHIVE_LIMITS
    const totalBytes = files.reduce((sum, f) => sum + f.blob.size, 0)
    const budget = new DecompressionBudget(limits, totalBytes)
    let doneBytes = 0
    const readRows = async (c: Classified, onRow: (fields: string[], at: RowRef) => void) => {
      const base = doneBytes
      let header = true
      const csv = new CsvByteParser((fields, line) => {
        if (header) {
          header = false
          return
        }
        onRow(fields, { file: c.file.name, line })
      }, c.file.name)
      await readPlain(
        c.file.blob,
        c.file.name,
        { chunk: (bytes) => csv.push(bytes), end: () => csv.end() },
        { limits, onProgress: (bytesRead) => ctx.read.onProgress?.(base + bytesRead, totalBytes) },
        budget,
      )
      doneBytes += c.file.blob.size
    }

    /**
     * The row's day and its counts, validated in a fixed order so a row that
     * breaks several rules is counted once: the width, the day, then each count.
     */
    const validate = (c: Classified, fields: string[], at: RowRef): { date: string; visitors: number; pageviews: number } | null => {
      if (fields.length !== c.width) {
        skipped.add('missing_field', at)
        return null
      }
      const date = fathomDay(fields[c.index.datetime])
      if (!date) {
        skipped.add('bad_timestamp', at)
        return null
      }
      for (const column of [c.visitors, 'pageviews']) {
        const s = fields[c.index[column]]
        if (s === '') {
          skipped.add('missing_field', at)
          return null
        }
        if (!isCount(s)) {
          skipped.add('bad_number', at)
          return null
        }
      }
      return { date, visitors: Number(fields[c.index[c.visitors]]), pageviews: Number(fields[c.index.pageviews]) }
    }

    // (4) The site totals, first and whole.
    const totals = byRole.get('totals') as Classified
    const bounceColumn = FATHOM_BOUNCE_COLUMNS.find((column) => column in totals.index)
    const durationColumn = FATHOM_DURATION_COLUMNS.find((column) => column in totals.index)
    const totalsDays = new Set<string>()
    await readRows(totals, (fields, at) => {
      const r = validate(totals, fields, at)
      if (!r) return
      totalsDays.add(r.date)
      rows.addDaily(
        {
          date: r.date,
          visitors: r.visitors,
          visits: r.visitors,
          pageviews: r.pageviews,
          src_bounces: metric(fields, totals.index, bounceColumn),
          src_engagement_seconds: metric(fields, totals.index, durationColumn),
        },
        at,
      )
    })
    assertDaily(totals.file.name, totalsDays)
    const range = dayRange(totalsDays)

    // (5) Every breakdown, in the order chosen, bounded by the totals' range.
    // The earliest kept breakdown day before Fathom's accuracy floor (M7-n).
    const floor: { earliest: string | null } = { earliest: null }
    const admit = (date: string, at: RowRef): boolean => {
      // The window's own reason wins: a row outside the site's window is
      // counted there, exactly as for every other source.
      if (range && rows.windowReason(date) === null && (date < range.from || date > range.through)) {
        skipped.add('outside_totals_range', at)
        return false
      }
      return true
    }
    const kept = (date: string) => {
      if (date < FATHOM_ACCURACY_FLOOR && (floor.earliest === null || date < floor.earliest)) floor.earliest = date
    }
    for (const c of order) {
      if (c.role === 'totals') continue
      const map = breakdown(c, rows)
      await readRows(c, (fields, at) => {
        const r = validate(c, fields, at)
        if (!r || !admit(r.date, at)) return
        if (map(fields, r.date, r.visitors, r.pageviews, at)) kept(r.date)
      })
    }

    const notes: Record<string, string> = {}
    if (floor.earliest !== null) notes[FATHOM_ACCURACY_NOTE] = floor.earliest
    return { ignored: [], notes }
  },
}

/**
 * Maps one validated breakdown row onto the fold; returns whether the fold
 * kept it (false = outside the window, already counted).
 */
function breakdown(
  c: Classified,
  rows: AggregateBuilder,
): (fields: string[], date: string, visitors: number, pageviews: number, at: RowRef) => boolean {
  const text = (fields: string[], column: string) => (column in c.index ? fields[c.index[column]] : '')
  const dimension = (dim: Dimension, column: string) => (fields: string[], date: string, visitors: number, pageviews: number, at: RowRef) =>
    rows.addDimension({ date, dimension: dim, parent: '', value: text(fields, column), visitors, visits: visitors, pageviews }, at)
  switch (c.role as DimensionRole) {
    case 'page':
      // Folded across hostname: a path is one row whichever host served it.
      return dimension('page', 'pathname')
    case 'device':
      return dimension('device', 'device_type')
    case 'browser':
      return dimension('browser', 'browser')
    case 'os':
      return dimension('os', 'operating_system')
    case 'locations': {
      // A Country[+Region][+City] export: one row per place. Its country half
      // is a country row; its region and city, when the export has them, are
      // rows under that country, sent as the file names them (blank included,
      // the server's Unknown), so each dimension still adds up to the country.
      const hasRegion = 'state' in c.index
      const hasCity = 'city' in c.index
      return (fields, date, visitors, pageviews, at) => {
        const country = text(fields, 'country_code')
        const kept = rows.addDimension({ date, dimension: 'country', parent: '', value: country, visitors, visits: visitors, pageviews }, at)
        if (kept && hasRegion) {
          rows.addDimension({ date, dimension: 'region', parent: country, value: text(fields, 'state'), visitors, visits: visitors, pageviews }, at)
        }
        if (kept && hasCity) {
          rows.addDimension({ date, dimension: 'city', parent: country, value: text(fields, 'city'), visitors, visits: visitors, pageviews }, at)
        }
        return kept
      }
    }
    case 'acquisition':
      // The referrer host AS THE FILE HAS IT, in both `referrer` and
      // `src_source`; only the server maps it (M2-l). `referrer_pathname`,
      // `utm_term` and `utm_content` have no wire field, so rows differing only
      // in them fold into one.
      return (fields, date, visitors, pageviews, at) => {
        const referrer = text(fields, 'referrer_hostname')
        const medium = text(fields, 'utm_medium')
        const campaign = text(fields, 'utm_campaign')
        return rows.addAcquisition(
          {
            date,
            referrer,
            utm_source: nullIfEmpty(text(fields, 'utm_source')),
            utm_medium: nullIfEmpty(medium),
            utm_campaign: nullIfEmpty(campaign),
            src_source: referrer,
            src_medium: medium,
            src_campaign: campaign,
            src_channel_group: '',
            visitors,
            visits: visitors,
            pageviews,
          },
          at,
        )
      }
  }
}

/**
 * M7-e: a Weekly, Monthly or Yearly export is refused. Judged on the
 * site-totals file only, whose days a real site fills nearly every day (a
 * rare page legitimately appears once a month): with at least three distinct
 * days, an average gap of more than three days between them is not daily.
 */
function assertDaily(file: string, days: ReadonlySet<string>): void {
  if (days.size < GROUPING_MIN_DATES) return
  const sorted = [...days].map(dayNumber).sort((a, b) => a - b)
  const gap = (sorted[sorted.length - 1] - sorted[0]) / (sorted.length - 1)
  if (gap > GROUPING_MAX_AVERAGE_GAP_DAYS) {
    const observed = Math.round(gap)
    throw wrongFile(
      'wrong_grouping',
      `${file}'s dates are roughly ${observed} days apart. Export it again with Daily grouping.`,
      { file, observed, limit: GROUPING_MAX_AVERAGE_GAP_DAYS },
    )
  }
}

/** The first and last day of a set of days, or null for none (M7-g: no bound). */
function dayRange(days: ReadonlySet<string>): { from: string; through: string } | null {
  let from: string | null = null
  let through: string | null = null
  for (const d of days) {
    if (from === null || d < from) from = d
    if (through === null || d > through) through = d
  }
  return from === null || through === null ? null : { from, through }
}

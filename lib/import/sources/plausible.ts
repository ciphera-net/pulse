// ─── Plausible: the Site Settings CSV export, the reference consumer (M2-o) ─
//
// Plausible's "Export to CSV" is a ZIP of per-day files, one per table, whose
// columns are the ones its own CSV importer reads (the research's
// `input_structures` map). Every file is already grouped by day, so this parser
// maps rows, it does not count events.
//
// 🔴 THE ARCHIVE IS 10 OR 11 FILES, AND THE NAMES VARY (M2-o, measured
// 27-09-2026 from the exporter's own source): `imported_custom_props` joined the
// full export on 28-08-2025, so every current Cloud export and recent CE export
// carries it and an older CE export does not; and an entry is named
// `imported_<table>_<YYYYMMDD>_<YYYYMMDD>.csv`, or `imported_<table>.csv` when
// the export had no date range. So only `imported_visitors` is required, the
// tables below are read when present, and EVERY other entry is left unread and
// named in the plan's ignored files. The archive is refused (`wrong_file`) only
// for a missing visitors table, two copies of one table, or a header that fails
// the strict check — never for carrying a file this parser does not know, which
// is how a newer export looks.
//
// Where each file goes (§3.12b M2-k, M2-o):
//
//   visitors           → daily (bounces and visit_duration kept as src_* — D2)
//   pages              → dimension `page` (folded across hostnames)
//   entry_pages        → dimension `entry_page`: the file's ENTRANCES are the
//                        row's visits and its pageviews its pageviews — never
//                        swapped, the seam's entry card reads visits
//   exit_pages         → dimension `exit_page`: EXITS → visits, pageviews → pageviews
//   sources            → acquisition: `referrer` and `src_source` both carry the
//                        file's `source` column as it is (a label such as
//                        "Google" or "Direct / None"); only the server maps it
//   devices            → dimension `device`
//   browsers           → dimension `browser` (folded across versions)
//   operating_systems  → dimension `os` (folded across versions)
//   locations          → dimension `country`, plus `region` (an ISO 3166-2
//                        code) and `city` (a GeoNames id) sent unconditionally,
//                        raw — Plausible names neither. The browser never
//                        resolves or skips them (M6): the SERVER decides what a
//                        code or id means, into a name or the Unknown
//                        convention, so the customer cannot bypass that mapping
//                        by choosing what a code means (D9)
//   custom_events      → not read (D8: events ship after v1)
//   custom_props       → not read (M12)
//
// Values travel as the file has them. Labels, hostnames, paths and codes are
// normalised on the SERVER (M2-l), once, so the browser and the server can
// never disagree about what a value means.
//
// The export has no monthly unique count, so it sends no monthly rows and every
// month of an import is the sum of its days (M2-k). Its visits are real visits:
// `visits_are_visitors` is false.

import { MAX_COUNT, type AggregateBuilder } from '../core/aggregate'
import { CsvByteParser } from '../core/csv'
import { isCalendarDate } from '../core/dates'
import { checkHeader, requireExactlyOneFile, requireFiles, type ColumnIndex, type TableSchema } from '../core/schema'
import type { RowRef, SkipLedger } from '../core/skipped'
import { readZip, type EntrySink } from '../core/zip'
import { wrongFile } from '../errors'
import type { Dimension } from '../types'
import type { AggregateSourceParser } from './source'

/** The tables this parser reads. Any other entry in the archive is left unread. */
export const PLAUSIBLE_TABLES = [
  'visitors',
  'sources',
  'pages',
  'entry_pages',
  'exit_pages',
  'locations',
  'devices',
  'browsers',
  'operating_systems',
] as const
type ReadTable = (typeof PLAUSIBLE_TABLES)[number]

/**
 * A table this parser reads, under either name the exporter writes: with the
 * export's date range, or without one. The table names are listed in full, so
 * `imported_custom_props`, `imported_custom_events` and any table a newer export
 * adds do not match and are ignored rather than read.
 */
const TABLE_FILE_RE = new RegExp(`^imported_(${PLAUSIBLE_TABLES.join('|')})(?:_\\d{8}_\\d{8})?\\.csv$`)

/** Every column Plausible documents for each file, in its order. */
export const PLAUSIBLE_COLUMNS: Readonly<Record<ReadTable, readonly string[]>> = {
  visitors: ['date', 'visitors', 'pageviews', 'bounces', 'visits', 'visit_duration'],
  sources: [
    'date',
    'source',
    'referrer',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'pageviews',
    'visitors',
    'visits',
    'visit_duration',
    'bounces',
  ],
  pages: [
    'date',
    'hostname',
    'page',
    'visits',
    'visitors',
    'pageviews',
    'total_scroll_depth',
    'total_scroll_depth_visits',
    'total_time_on_page',
    'total_time_on_page_visits',
  ],
  entry_pages: ['date', 'entry_page', 'visitors', 'entrances', 'visit_duration', 'bounces', 'pageviews'],
  exit_pages: ['date', 'exit_page', 'visitors', 'visit_duration', 'exits', 'bounces', 'pageviews'],
  locations: ['date', 'country', 'region', 'city', 'visitors', 'visits', 'visit_duration', 'bounces', 'pageviews'],
  devices: ['date', 'device', 'visitors', 'visits', 'visit_duration', 'bounces', 'pageviews'],
  browsers: ['date', 'browser', 'browser_version', 'visitors', 'visits', 'visit_duration', 'bounces', 'pageviews'],
  operating_systems: [
    'date',
    'operating_system',
    'operating_system_version',
    'visitors',
    'visits',
    'visit_duration',
    'bounces',
    'pageviews',
  ],
}

/** The columns each file's mapper actually reads. */
const READS: Readonly<Record<ReadTable, readonly string[]>> = {
  visitors: ['date', 'visitors', 'pageviews', 'bounces', 'visits', 'visit_duration'],
  sources: ['date', 'source', 'utm_source', 'utm_medium', 'utm_campaign', 'pageviews', 'visitors', 'visits'],
  pages: ['date', 'page', 'visits', 'visitors', 'pageviews'],
  entry_pages: ['date', 'entry_page', 'visitors', 'entrances', 'pageviews'],
  exit_pages: ['date', 'exit_page', 'visitors', 'exits', 'pageviews'],
  locations: ['date', 'country', 'region', 'city', 'visitors', 'visits', 'pageviews'],
  devices: ['date', 'device', 'visitors', 'visits', 'pageviews'],
  browsers: ['date', 'browser', 'visitors', 'visits', 'pageviews'],
  operating_systems: ['date', 'operating_system', 'visitors', 'visits', 'pageviews'],
}

/**
 * M2-o: the visitors table is what makes an archive this export, so it is the
 * one table required. Every other table is read when the archive has it.
 */
const REQUIRED_TABLES: readonly ReadTable[] = ['visitors']

/** One row's fields, validated: a real date, and counts that are whole numbers in range. */
class Fields {
  constructor(
    private readonly fields: readonly string[],
    private readonly index: ColumnIndex,
  ) {}

  text(column: string): string {
    return this.fields[this.index[column]]
  }

  /** The field as a count; the caller has already validated it with `countOf`. */
  count(column: string): number {
    return Number(this.text(column))
  }

  /** '' becomes null (the source did not say); anything else was validated as a count. */
  optionalCount(column: string): number | null {
    const s = this.text(column)
    return s === '' ? null : Number(s)
  }
}

const COUNT_RE = /^\d{1,10}$/

/**
 * Validates a row once, in a fixed order, so a row that breaks several rules is
 * counted under exactly one reason: the wrong number of fields, then the date,
 * then each required count, then each optional one.
 */
function validate(
  fields: readonly string[],
  width: number,
  index: ColumnIndex,
  counts: readonly string[],
  optionalCounts: readonly string[],
  at: RowRef,
  skipped: SkipLedger,
): Fields | null {
  if (fields.length !== width) {
    skipped.add('missing_field', at)
    return null
  }
  if (!isCalendarDate(fields[index.date])) {
    skipped.add('bad_timestamp', at)
    return null
  }
  for (const c of counts) {
    const s = fields[index[c]]
    if (s === '') {
      skipped.add('missing_field', at)
      return null
    }
    if (!COUNT_RE.test(s) || Number(s) > MAX_COUNT) {
      skipped.add('bad_number', at)
      return null
    }
  }
  for (const c of optionalCounts) {
    const s = fields[index[c]]
    if (s !== '' && (!COUNT_RE.test(s) || Number(s) > MAX_COUNT)) {
      skipped.add('bad_number', at)
      return null
    }
  }
  return new Fields(fields, index)
}

const nullIfEmpty = (s: string) => (s === '' ? null : s)

type Mapper = (f: Fields, at: RowRef) => void

function mappers(rows: AggregateBuilder): Record<ReadTable, { counts: string[]; optional: string[]; map: Mapper }> {
  const dimension =
    (dim: Dimension, valueColumn: string, visitsColumn: string) =>
    (f: Fields, at: RowRef) => {
      rows.addDimension(
        {
          date: f.text('date'),
          dimension: dim,
          parent: '',
          value: f.text(valueColumn),
          visitors: f.count('visitors'),
          visits: f.count(visitsColumn),
          pageviews: f.count('pageviews'),
        },
        at,
      )
    }
  return {
    visitors: {
      counts: ['visitors', 'visits', 'pageviews'],
      optional: ['bounces', 'visit_duration'],
      map: (f, at) => {
        rows.addDaily(
          {
            date: f.text('date'),
            visitors: f.count('visitors'),
            visits: f.count('visits'),
            pageviews: f.count('pageviews'),
            src_bounces: f.optionalCount('bounces'),
            src_engagement_seconds: f.optionalCount('visit_duration'),
          },
          at,
        )
      },
    },
    sources: {
      counts: ['visitors', 'visits', 'pageviews'],
      optional: [],
      map: (f, at) => {
        const source = f.text('source')
        rows.addAcquisition(
          {
            date: f.text('date'),
            referrer: source,
            utm_source: nullIfEmpty(f.text('utm_source')),
            utm_medium: nullIfEmpty(f.text('utm_medium')),
            utm_campaign: nullIfEmpty(f.text('utm_campaign')),
            src_source: source,
            src_medium: f.text('utm_medium'),
            src_campaign: f.text('utm_campaign'),
            src_channel_group: '',
            visitors: f.count('visitors'),
            visits: f.count('visits'),
            pageviews: f.count('pageviews'),
          },
          at,
        )
      },
    },
    pages: { counts: ['visitors', 'visits', 'pageviews'], optional: [], map: dimension('page', 'page', 'visits') },
    entry_pages: {
      counts: ['visitors', 'entrances', 'pageviews'],
      optional: [],
      map: dimension('entry_page', 'entry_page', 'entrances'),
    },
    exit_pages: {
      counts: ['visitors', 'exits', 'pageviews'],
      optional: [],
      map: dimension('exit_page', 'exit_page', 'exits'),
    },
    locations: {
      counts: ['visitors', 'visits', 'pageviews'],
      optional: [],
      map: (f, at) => {
        const date = f.text('date')
        const country = f.text('country')
        const visitors = f.count('visitors')
        const visits = f.count('visits')
        const pageviews = f.count('pageviews')
        // `addDimension` re-checks the clip independently on every call, and
        // `date` is identical across all three calls below, so gating region
        // and city on country's own `kept` result reproduces "skip this
        // physical row once" without any content-based check: a row outside
        // the clip counts once under its reason, not three times.
        const kept = rows.addDimension(
          { date, dimension: 'country', parent: '', value: country, visitors, visits, pageviews },
          at,
        )
        if (kept) {
          // Region and city travel as the file has them: an ISO 3166-2 code and
          // a GeoNames id (`"0"` = none), never a name. Sent unconditionally,
          // like country, even when empty or "0" — the SERVER resolves them
          // into names or the Unknown convention (M6); this parser never
          // resolves or skips them (D9: the customer cannot bypass the mapping
          // by choosing what a code means).
          rows.addDimension(
            { date, dimension: 'region', parent: country, value: f.text('region'), visitors, visits, pageviews },
            at,
          )
          rows.addDimension(
            { date, dimension: 'city', parent: country, value: f.text('city'), visitors, visits, pageviews },
            at,
          )
        }
      },
    },
    devices: { counts: ['visitors', 'visits', 'pageviews'], optional: [], map: dimension('device', 'device', 'visits') },
    browsers: { counts: ['visitors', 'visits', 'pageviews'], optional: [], map: dimension('browser', 'browser', 'visits') },
    operating_systems: {
      counts: ['visitors', 'visits', 'pageviews'],
      optional: [],
      map: dimension('os', 'operating_system', 'visits'),
    },
  }
}

export const plausibleSource: AggregateSourceParser = {
  kind: 'upload_aggregate',
  async read(files, ctx) {
    // The export is ONE ZIP (M7-a): a second file is refused, never silently
    // left unread while the first is imported.
    const file = requireExactlyOneFile(files, "Choose one file: Plausible's export is one ZIP.")
    if (file.input !== 'zip') {
      throw wrongFile(
        'not_an_archive',
        'Upload the ZIP file the export produced, not a single file from inside it.',
      )
    }
    const seen = new Set<string>()
    const ignored: string[] = []
    const map = mappers(ctx.rows)

    const entry = (name: string): EntrySink | null => {
      // A folder is named by the path its entries sit under. The ZIP format
      // separates folders with `/`, but some Windows zippers write `\`, and an
      // export unpacked and re-zipped with one of them still holds the export:
      // both separators name a folder, so a table is found by its own name
      // whichever one the archive used.
      const segments = name.split(/[\\/]/)
      const base = segments[segments.length - 1]
      if (base === '') return null
      // What an archive picks up when it is unpacked and re-zipped on a Mac:
      // resource forks and folder metadata, never data. Skipped without a word.
      if (segments[0] === '__MACOSX' || base === '.DS_Store' || base.startsWith('._')) return null
      const m = TABLE_FILE_RE.exec(base)
      if (!m) {
        // Not a table this parser reads: the custom events and custom
        // properties (D8, M12), a table a newer export adds, or a file somebody
        // put in the archive. It is left unread (so never decompressed, and
        // never counted against the byte caps) and named in the plan, so the
        // customer sees it was not imported. Refusing the archive for it would
        // refuse every export newer than this parser.
        ignored.push(base)
        return null
      }
      const table = m[1] as ReadTable
      if (seen.has(table)) {
        throw wrongFile('duplicate_file', `The archive holds two ${table} files. Upload one export at a time.`, {
          file: base,
        })
      }
      seen.add(table)
      const schema: TableSchema = { file: base, required: READS[table], known: PLAUSIBLE_COLUMNS[table] }
      const mapper = map[table]
      let index: ColumnIndex | null = null
      let width = 0
      const csv = new CsvByteParser((fields, line) => {
        if (!index) {
          index = checkHeader(schema, fields)
          width = fields.length
          return
        }
        const at = { file: base, line }
        const f = validate(fields, width, index, mapper.counts, mapper.optional, at, ctx.skipped)
        if (f) mapper.map(f, at)
      }, base)
      return {
        chunk: (bytes) => csv.push(bytes),
        end: () => {
          csv.end()
          if (!index) throw wrongFile('empty_file', `${base} has no header row.`, { file: base })
        },
      }
    }

    await readZip(file.blob, entry, ctx.read)
    requireFiles(seen, REQUIRED_TABLES, (t) => `imported_${t}`)
    return { ignored }
  },
}

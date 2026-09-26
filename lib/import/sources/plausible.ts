// ─── Plausible: the Site Settings CSV export, the reference consumer (M2-o) ─
//
// Plausible's "Export to CSV" is a ZIP of ten per-day files, named
// `imported_<table>_<YYYYMMDD>_<YYYYMMDD>.csv`, whose columns are the ones its
// own CSV importer reads (the research's `input_structures` map). Every file is
// already grouped by day, so this parser maps rows, it does not count events.
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
//   locations          → dimension `country`; the region (an ISO 3166-2 code)
//                        and city (a GeoNames id) have no names in the file, so
//                        they are skipped as `needs_place_names` until M6's
//                        place-name index — counted, never guessed
//   custom_events      → recognised and not read (D8: events ship after v1)
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
import { checkHeader, requireFiles, type ColumnIndex, type TableSchema } from '../core/schema'
import type { RowRef, SkipLedger } from '../core/skipped'
import { readZip, type EntrySink } from '../core/zip'
import { wrongFile } from '../errors'
import type { Dimension } from '../types'
import type { AggregateSourceParser } from './source'

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
  'custom_events',
] as const
export type PlausibleTable = (typeof PLAUSIBLE_TABLES)[number]
type ReadTable = Exclude<PlausibleTable, 'custom_events'>

const FILE_RE =
  /^imported_(visitors|sources|pages|entry_pages|exit_pages|locations|devices|browsers|operating_systems|custom_events)_(\d{8})_(\d{8})\.csv$/

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

const REQUIRED_TABLES: readonly ReadTable[] = [
  'visitors',
  'sources',
  'pages',
  'entry_pages',
  'exit_pages',
  'locations',
  'devices',
  'browsers',
  'operating_systems',
]

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

function mappers(rows: AggregateBuilder, skipped: SkipLedger): Record<ReadTable, { counts: string[]; optional: string[]; map: Mapper }> {
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
        const kept = rows.addDimension(
          {
            date: f.text('date'),
            dimension: 'country',
            parent: '',
            value: f.text('country'),
            visitors: f.count('visitors'),
            visits: f.count('visits'),
            pageviews: f.count('pageviews'),
          },
          at,
        )
        // The country half of the row is imported; its region and city are not
        // (codes without names), and that is counted rather than silent. A row
        // outside the window was already counted under the window's reason.
        const city = f.text('city')
        if (kept && (f.text('region') !== '' || (city !== '' && city !== '0'))) {
          skipped.add('needs_place_names', at)
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
  async read(file, input, ctx) {
    if (input !== 'zip') {
      throw wrongFile(
        'not_an_archive',
        'Upload the ZIP file the export produced, not a single file from inside it.',
      )
    }
    const seen = new Set<string>()
    const ignored: string[] = []
    const map = mappers(ctx.rows, ctx.skipped)

    const entry = (name: string): EntrySink | null => {
      if (name.endsWith('/')) return null
      const base = name.slice(name.lastIndexOf('/') + 1)
      // What an archive picks up when it is unpacked and re-zipped on a Mac:
      // resource forks and folder metadata, never data.
      if (name.startsWith('__MACOSX/') || base === '.DS_Store') return null
      const m = FILE_RE.exec(base)
      if (!m) {
        throw wrongFile('unexpected_file', `${base} is not part of this export.`, { file: base })
      }
      const table = m[1] as PlausibleTable
      if (seen.has(table)) {
        throw wrongFile('duplicate_file', `The archive holds two ${table} files. Upload one export at a time.`, {
          file: base,
        })
      }
      seen.add(table)
      if (table === 'custom_events') {
        ignored.push(base)
        return null
      }
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

    await readZip(file, entry, ctx.read)
    requireFiles(seen, REQUIRED_TABLES, (t) => `imported_${t}_<dates>.csv`)
    return { ignored }
  },
}

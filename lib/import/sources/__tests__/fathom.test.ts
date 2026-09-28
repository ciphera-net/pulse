// @vitest-environment node
//
// Fathom's Custom Export parser (design §3.12m7), on a SYNTHETIC seven-file
// export built from the spec's headers (no real Fathom export exists yet; it
// is owner-held, §5). The parser is imported straight from its module: it is
// deliberately NOT registered (M7-o), and the last block proves that too.
//
// Gates covered here: 1 (dispatch under either spelling of the totals'
// visitor column), 2 (every new refusal and skip on its own fixture, and only
// there), 3 (the shared byte budget, as the parser uses it), 8's no-change
// half for this source's shape, and 10 (dark by omission).

import { zipSync, strToU8, gzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { AggregateBuilder } from '../../core/aggregate'
import type { Clip } from '../../core/cap'
import { batchBody, buildPlan } from '../../core/plan'
import { SkipLedger } from '../../core/skipped'
import { ARCHIVE_LIMITS, detectInputKind, type ReadOptions } from '../../core/zip'
import { ImportError } from '../../errors'
import { IMPORT_SOURCES, SOURCE_META, isImportSource } from '../../source-meta'
import { SOURCE_PARSERS } from '../index'
import { createWorkerHost } from '../../worker-host'
import { PROTOCOL_VERSION, type FromWorker } from '../../protocol'
import { BATCH_FIELDS, WIRE_FIELDS, type TableName } from '../../types'
import {
  FATHOM_FIXTURE_NAMES,
  fathomFixtureFiles,
  fathomFixtureTexts,
} from '../../__tests__/fixtures/fathom-export'
import {
  FATHOM_ACCURACY_NOTE,
  FATHOM_FILES,
  FATHOM_ROLES,
  classifyFathomHeader,
  fathomDay,
  fathomSource,
  type FathomRole,
} from '../fathom'

const N = FATHOM_FIXTURE_NAMES

async function sourceFiles(files: readonly File[]) {
  const out = []
  for (const f of files) out.push({ name: f.name, blob: f as Blob, input: await detectInputKind(f) })
  return out
}

async function parse(files: readonly File[], clip: Clip | null = null, read: ReadOptions = {}) {
  const skipped = new SkipLedger()
  const rows = new AggregateBuilder(clip, skipped)
  const result = await fathomSource.read(await sourceFiles(files), { rows, skipped, read })
  return { rows: rows.build(), skipped, ignored: result.ignored, notes: result.notes ?? {} }
}

async function failure(p: Promise<unknown>): Promise<ImportError> {
  try {
    await p
  } catch (e) {
    if (e instanceof ImportError) return e
    throw e
  }
  throw new Error('expected the parse to fail')
}

function thrown(fn: () => unknown): ImportError {
  try {
    fn()
  } catch (e) {
    if (e instanceof ImportError) return e
    throw e
  }
  throw new Error('expected a throw')
}

const dim = (
  date: string,
  dimension: string,
  value: string,
  visitors: number,
  pageviews: number,
  parent = '',
) => ({ date, dimension, parent, value, visitors, visits: visitors, pageviews })

const acq = (date: string, referrer: string, visitors: number, pageviews: number, utm: [string, string, string] | null) => ({
  date,
  // The file's referrer host as it is, in both: only the server maps it.
  referrer,
  utm_source: utm ? utm[0] : null,
  utm_medium: utm ? utm[1] : null,
  utm_campaign: utm ? utm[2] : null,
  src_source: referrer,
  src_medium: utm ? utm[1] : '',
  src_campaign: utm ? utm[2] : '',
  src_channel_group: '',
  visitors,
  // No visits metric: visits are the visitor count (M7-l).
  visits: visitors,
  pageviews,
})

const EXPECTED_DAILY = [
  // Whole-number metrics kept as the file has them (M7-h).
  { date: '2026-03-01', visitors: 10, visits: 10, pageviews: 30, src_bounces: 40, src_engagement_seconds: 120 },
  // A rate and a fractional average are not counts: null, and the day is still imported.
  { date: '2026-03-02', visitors: 20, visits: 20, pageviews: 50, src_bounces: null, src_engagement_seconds: null },
  { date: '2026-03-03', visitors: 5, visits: 5, pageviews: 9, src_bounces: null, src_engagement_seconds: null },
]

const EXPECTED_DIMENSIONS = [
  dim('2026-03-01', 'browser', 'Chrome', 5, 19),
  dim('2026-03-01', 'browser', 'Firefox', 5, 11),
  // Region and city sit under their country; a blank place is sent blank (the server's Unknown).
  dim('2026-03-01', 'city', '', 1, 2, 'BE'),
  dim('2026-03-01', 'city', 'Ghent', 3, 6, 'BE'),
  dim('2026-03-01', 'city', '', 2, 4, 'DE'),
  // BE across two regions is one country row.
  dim('2026-03-01', 'country', 'BE', 4, 8),
  dim('2026-03-01', 'country', 'DE', 2, 4),
  dim('2026-03-01', 'device', 'Desktop', 7, 22),
  dim('2026-03-01', 'device', 'Mobile', 3, 8),
  dim('2026-03-01', 'os', 'Linux', 1, 2),
  // One path on two hostnames is one page row.
  dim('2026-03-01', 'page', '/', 10, 23),
  dim('2026-03-01', 'page', '/über, "quoted"', 1, 2),
  dim('2026-03-01', 'region', 'Flanders', 3, 6, 'BE'),
  dim('2026-03-01', 'region', 'Wallonia', 1, 2, 'BE'),
  dim('2026-03-01', 'region', '', 2, 4, 'DE'),
  dim('2026-03-02', 'city', 'San Francisco', 5, 8, 'US'),
  dim('2026-03-02', 'country', 'US', 5, 8),
  dim('2026-03-02', 'os', 'Mac OS X', 4, 10),
  dim('2026-03-02', 'page', '/pricing', 4, 7),
  dim('2026-03-02', 'region', 'California', 5, 8, 'US'),
]

const EXPECTED_ACQUISITION = [
  acq('2026-03-01', '', 3, 10, null),
  acq('2026-03-01', 'www.google.com', 7, 20, null),
  // Two rows differing only in utm_content and referrer_pathname are one row.
  acq('2026-03-02', 'news.example.org', 5, 11, ['newsletter', 'email', 'spring']),
]

const EXPECTED_SKIPS = { bad_number: 1, bad_timestamp: 1, missing_field: 1, outside_totals_range: 2 }

describe('the synthetic export', () => {
  it('maps to exactly the expected rows', async () => {
    const { rows, ignored, notes } = await parse(fathomFixtureFiles())
    expect(rows.daily).toEqual(EXPECTED_DAILY)
    expect(rows.dimensions).toEqual(EXPECTED_DIMENSIONS)
    expect(rows.acquisition).toEqual(EXPECTED_ACQUISITION)
    // No month-level unique count in any export: no monthly rows, ever (M7-l).
    expect(rows.monthly).toEqual([])
    // Every file was read; nothing is left over to name.
    expect(ignored).toEqual([])
    // Nothing before March 2021: no accuracy note.
    expect(notes).toEqual({})
  })

  it('never sends a dimension Fathom does not export: no entry or exit pages, language or screen (M7-k)', async () => {
    const { rows, skipped } = await parse(fathomFixtureFiles())
    const sent = new Set(rows.dimensions.map((r) => r.dimension))
    for (const d of ['entry_page', 'exit_page', 'language', 'screen_resolution']) expect(sent.has(d as never)).toBe(false)
    // And they are not counted as skipped either: nothing was dropped.
    expect(Object.keys(skipped.toCounts())).toEqual(Object.keys(EXPECTED_SKIPS))
  })

  it('counts exactly the rows it skipped, by reason, with their file and line', async () => {
    const { skipped } = await parse(fathomFixtureFiles())
    expect(skipped.toCounts()).toEqual(EXPECTED_SKIPS)
    expect(skipped.toSamples()).toEqual({
      bad_number: [{ file: N.browser, line: 4 }],
      bad_timestamp: [{ file: N.totals, line: 5 }],
      missing_field: [{ file: N.page, line: 6 }],
      outside_totals_range: [
        { file: N.page, line: 7 },
        { file: N.acquisition, line: 6 },
      ],
    })
  })

  it('plans, and every batch carries only the wire fields: no hostname, no referrer path', async () => {
    const { rows } = await parse(fathomFixtureFiles())
    const plan = await buildPlan(rows)
    expect(plan.totals).toEqual({ rows: { daily: 3, monthly: 0, dimensions: 20, acquisition: 3 }, visitors: 35, pageviews: 89 })
    expect(plan.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    for (const p of plan.parts) {
      const body = batchBody(p.step, p.part, plan.fingerprint, p.rowsJson)
      const parsed = JSON.parse(body)
      expect(Object.keys(parsed)).toEqual([...BATCH_FIELDS])
      for (const [table, list] of Object.entries(parsed.rows as Record<string, Record<string, unknown>[]>)) {
        for (const row of list) expect(Object.keys(row)).toEqual([...WIRE_FIELDS[table as TableName]])
      }
      for (const leak of ['blog.example.com', '/search', '"/a"', '"/b"', FATHOM_ACCURACY_NOTE]) expect(body).not.toContain(leak)
    }
  })

  it('reads the same rows whatever the files are called and whatever order they come in (never by name)', async () => {
    const want = await parse(fathomFixtureFiles())
    const renamed = fathomFixtureFiles((files) => {
      for (const [i, name] of Object.keys(files).entries()) {
        files[`Export (${i + 1}).csv`] = files[name]
        delete files[name]
      }
    })
    const shuffled = [...renamed].reverse()
    // The totals file is now LAST, and still read first (M7-g).
    expect(shuffled.at(-1)?.name).toBe('Export (1).csv')
    const got = await parse(shuffled)
    expect(got.rows).toEqual(want.rows)
    expect(got.skipped.toCounts()).toEqual(want.skipped.toCounts())
    expect((await buildPlan(got.rows)).fingerprint).toBe((await buildPlan(want.rows)).fingerprint)
  })

  it('reads the export by the columns\' names, in any order', async () => {
    const reordered = fathomFixtureFiles((files) => {
      const [header, ...lines] = files[N.device].trimEnd().split('\n')
      const cols = header.split(',')
      const order = [...cols.keys()].reverse()
      files[N.device] = [order.map((i) => cols[i]).join(','), ...lines.map((l) => {
        const f = l.split(',')
        return order.map((i) => f[i]).join(',')
      })].join('\n') + '\n'
    })
    const { rows } = await parse(reordered)
    expect(rows.dimensions.filter((r) => r.dimension === 'device')).toEqual([
      dim('2026-03-01', 'device', 'Desktop', 7, 22),
      dim('2026-03-01', 'device', 'Mobile', 3, 8),
    ])
  })

  it('imports just the site totals when that is all the customer exported', async () => {
    const only = fathomFixtureFiles((files) => {
      for (const name of Object.keys(files)) if (name !== N.totals) delete files[name]
    })
    const { rows } = await parse(only)
    expect(rows.daily).toEqual(EXPECTED_DAILY)
    expect(rows.dimensions).toEqual([])
    expect(rows.acquisition).toEqual([])
  })

  it('accepts a Country-only export (no Region or City): country rows and nothing under them', async () => {
    const countryOnly = fathomFixtureFiles((files) => {
      files[N.locations] = 'datetime,country_code,uniques,pageviews\n2026-03-01 00:00:00,BE,4,8\n'
    })
    const { rows } = await parse(countryOnly)
    expect(rows.dimensions.filter((r) => ['country', 'region', 'city'].includes(r.dimension))).toEqual([
      dim('2026-03-01', 'country', 'BE', 4, 8),
    ])
  })

  it('accepts the bounce and time metrics ticked on any export, and reads them only from the totals', async () => {
    const ticked = fathomFixtureFiles((files) => {
      files[N.device] = 'datetime,device_type,uniques,pageviews,bounce_rate,avg_time_on_site\n2026-03-01 00:00:00,Desktop,7,22,0.5,31\n'
    })
    const { rows } = await parse(ticked)
    expect(rows.dimensions.filter((r) => r.dimension === 'device')).toEqual([dim('2026-03-01', 'device', 'Desktop', 7, 22)])
  })

  it.each(['avg_duration', 'visit_duration'])('reads the time metric spelled %s', async (spelling) => {
    const spelled = fathomFixtureFiles((files) => {
      files[N.totals] = files[N.totals].replace('avg_time_on_site', spelling)
    })
    const { rows } = await parse(spelled)
    expect(rows.daily[0].src_engagement_seconds).toBe(120)
  })
})

// Gate 1: the site-totals file is known by having NO marker column, so its
// dispatch is safe whichever spelling its visitor count turns out to have.
describe('dispatch (M7-d)', () => {
  it.each(['visitors', 'uniques', 'both'] as const)('a totals file with %s dispatches as totals and maps the same', async (totalsVisitors) => {
    const { rows, skipped } = await parse(fathomFixtureFiles(undefined, { totalsVisitors }))
    expect(rows.daily).toEqual(EXPECTED_DAILY)
    expect(rows.dimensions).toEqual(EXPECTED_DIMENSIONS)
    expect(skipped.toCounts()).toEqual(EXPECTED_SKIPS)
  })

  it('a totals file with both columns reads `uniques`, the fixed tie-break, and refuses neither', () => {
    const h = classifyFathomHeader('t.csv', ['datetime', 'visitors', 'uniques', 'pageviews'])
    expect(h).toMatchObject({ role: 'totals', visitors: 'uniques' })
    expect(classifyFathomHeader('t.csv', ['datetime', 'visitors', 'pageviews'])).toMatchObject({ role: 'totals', visitors: 'visitors' })
  })

  it('classifies each recipe file by its marker, and a totals header is never a dimension', () => {
    const headers: Record<FathomRole, string[]> = {
      totals: ['datetime', 'uniques', 'pageviews'],
      page: ['datetime', 'hostname', 'pathname', 'pageviews', 'uniques'],
      locations: ['datetime', 'country_code', 'state', 'city', 'uniques', 'pageviews'],
      device: ['datetime', 'device_type', 'uniques', 'pageviews'],
      browser: ['datetime', 'browser', 'uniques', 'pageviews'],
      os: ['datetime', 'operating_system', 'uniques', 'pageviews'],
      acquisition: ['datetime', 'referrer_hostname', 'referrer_pathname', 'utm_source', 'uniques', 'pageviews'],
    }
    for (const role of FATHOM_ROLES) expect(classifyFathomHeader('f.csv', headers[role]).role).toBe(role)
    // `hostname` is allowed on the Page file, not required: the parser folds
    // it away, so a Page export without it loses nothing (§5 item 4 settles
    // what a real one carries).
    expect(classifyFathomHeader('f.csv', ['datetime', 'pathname', 'uniques', 'pageviews']).role).toBe('page')
    // The totals' `uniques` spelling is a subset of every dimensioned header,
    // which is exactly why a name-based dispatch would misroute it (V§1a).
    for (const role of FATHOM_ROLES.filter((r) => r !== 'totals')) {
      expect(headers[role]).toEqual(expect.arrayContaining(headers.totals))
    }
  })

  it.each([
    ['a marker in another case', 'datetime,Country_Code,uniques,pageviews\n2026-03-01 00:00:00,BE,3,5\n', 'locations', 'country_code'],
    ['a marker with whitespace around it', 'datetime, pathname ,uniques,pageviews\n2026-03-01 00:00:00,/x,3,5\n', 'page', 'pathname'],
  ] as const)('%s still names the file, never the totals, and is refused for the marker as Fathom spells it', async (_what, text, role, marker) => {
    const name = N[role]
    const e = await failure(parse(fathomFixtureFiles((f) => (f[name] = text))))
    expect(e.code).toBe('wrong_file')
    expect(e.detail).toEqual({ reason: 'missing_columns', file: name, columns: [marker] })
    expect(e.message).toBe(`${name} is missing ${marker}.`)
  })

  it('a marker in another case also counts toward a combined export', () => {
    const e = thrown(() => classifyFathomHeader('mixed.csv', ['datetime', 'Browser', 'country_code', 'uniques', 'pageviews']))
    expect(e.detail).toEqual({ reason: 'unrecognised_file', file: 'mixed.csv', columns: ['country_code', 'browser'], limit: 1, observed: 2 })
  })

  it('a device file alone is never taken for the totals: the upload is missing its totals', async () => {
    const alone = fathomFixtureFiles((files) => {
      for (const name of Object.keys(files)) if (name !== N.device) delete files[name]
    })
    const e = await failure(parse(alone))
    expect(e.code).toBe('wrong_file')
    expect(e.detail).toEqual({ reason: 'missing_file', files: ['site totals'] })
    expect(e.message).toBe('This upload is missing site totals.')
  })

  it('refuses a file with no marker and no visitor column, echoing the header it saw', () => {
    const e = thrown(() => classifyFathomHeader('other.csv', ['Page', 'Visitors', 'Views']))
    expect(e.detail).toEqual({ reason: 'unrecognised_file', file: 'other.csv', columns: ['Page', 'Visitors', 'Views'] })
    // M7-p's sentence, with the tool and the file filled in.
    expect(e.message).toBe("This doesn't look like part of a Fathom export. other.csv has none of the columns this export writes.")
  })

  it('refuses two markers in one file, naming them, whatever order they come in', () => {
    for (const header of [
      ['datetime', 'browser', 'country_code', 'uniques', 'pageviews'],
      ['country_code', 'datetime', 'uniques', 'pageviews', 'browser'],
    ]) {
      const e = thrown(() => classifyFathomHeader('mixed.csv', header))
      // `limit` and `observed` are what tell this form from the no-marker one
      // (whose `columns` is the header seen): one recipe dimension per file,
      // and how many this one combines.
      expect(e.detail).toEqual({
        reason: 'unrecognised_file',
        file: 'mixed.csv',
        columns: ['country_code', 'browser'],
        limit: 1,
        observed: 2,
      })
    }
  })

  it('the six markers are pairwise distinct, and none is a column of another file', () => {
    const markers = FATHOM_ROLES.map((r) => FATHOM_FILES[r].marker).filter((m): m is string => m !== null)
    expect(new Set(markers).size).toBe(6)
    for (const role of FATHOM_ROLES) {
      const own = FATHOM_FILES[role]
      const columns = new Set([...own.required, ...own.optional])
      for (const m of markers) if (m !== own.marker) expect(columns.has(m), `${role} holds ${m}`).toBe(false)
    }
  })

  it('reads the day of a datetime, and nothing that is not one', () => {
    expect(fathomDay('2026-03-01 00:00:00')).toBe('2026-03-01')
    expect(fathomDay('2026-03-01 23:59:59')).toBe('2026-03-01')
    expect(fathomDay('2026-03-01')).toBe('2026-03-01')
    expect(fathomDay('2026-03-01T13:00')).toBe('2026-03-01')
    for (const bad of ['2026-02-30 00:00:00', '2026-03-01 24:00:00', '2026-03-01 10:60:00', '01/03/2026', '', '2026-03-01 10:00:00Z']) {
      expect(fathomDay(bad), bad).toBeNull()
    }
  })
})

// Gate 2: each refusal on its own fixture.
describe('the wrong upload, named', () => {
  it('the dashboard download (a ZIP) is refused on its format, before any CSV is read (M7-f layer 1)', async () => {
    // A ZIP whose entries would parse perfectly as Custom Export files: the
    // format alone refuses it.
    const texts = fathomFixtureTexts()
    const zip = zipSync({ 'Pages.csv': strToU8(texts.page), 'Site.csv': strToU8(texts.totals) })
    const dashboard = new File([zip as BlobPart], 'fathom-dashboard.zip')
    // A ZIP with no entries at all (a download cut short, a zipped empty
    // folder) is still a ZIP, and is refused the same way, never read as a CSV.
    const empty = new File([zipSync({}) as BlobPart], 'fathom-dashboard.zip')
    for (const upload of [[dashboard], [...fathomFixtureFiles(), dashboard], [empty]]) {
      const e = await failure(parse(upload))
      expect(e.code).toBe('wrong_file')
      expect(e.detail).toEqual({ reason: 'unexpected_archive', file: 'fathom-dashboard.zip' })
      expect(e.message).toBe(
        "This is Fathom's dashboard download, which holds totals for the whole range. Use Custom Export with Daily grouping instead.",
      )
    }
  })

  it('a compressed CSV is refused the same way, and says it is compressed', async () => {
    const gz = new File([gzipSync(strToU8(fathomFixtureTexts().totals)) as BlobPart], 'site-totals.csv.gz')
    const e = await failure(parse([gz]))
    expect(e.detail).toEqual({ reason: 'unexpected_archive', file: 'site-totals.csv.gz' })
    expect(e.message).toContain('compressed')
  })

  it.each([
    ['a page list', 'pathname,hostname,uniques,pageviews\n/,example.com,8,20\n'],
    ['the site totals', 'visitors,pageviews,bounce_rate,avg_time_on_site\n35,89,40,120\n'],
  ])('one CSV taken out of the dashboard download (%s) has no datetime, and says so (M7-f layer 2)', async (_what, text) => {
    const e = await failure(parse([new File([text], 'from-the-dashboard.csv')]))
    expect(e.detail).toEqual({ reason: 'missing_columns', file: 'from-the-dashboard.csv', columns: ['datetime'] })
  })

  it.each([
    ['weekly', 7, 7],
    ['monthly', 30, 30],
  ])('a %s site-totals export is refused, naming the gap it saw (M7-e)', async (_what, step, observed) => {
    const lines = ['datetime,visitors,pageviews']
    for (let i = 0; i < 6; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i * step)).toISOString().slice(0, 10)
      lines.push(`${d} 00:00:00,${10 + i},${30 + i}`)
    }
    const files = fathomFixtureFiles((f) => (f[N.totals] = lines.join('\n') + '\n'))
    const e = await failure(parse(files))
    expect(e.code).toBe('wrong_file')
    expect(e.detail).toEqual({ reason: 'wrong_grouping', file: N.totals, observed, limit: 3 })
    expect(e.message).toBe(`${N.totals}'s dates are roughly ${observed} days apart. Export it again with Daily grouping.`)
  })

  it('judges the grouping on the totals alone: a sparse breakdown, and short or 3-day-gap totals, are daily', async () => {
    const totals = (days: string[]) => ['datetime,visitors,pageviews', ...days.map((d) => `${d} 00:00:00,1,1`)].join('\n') + '\n'
    // An average gap of exactly three days is accepted; two days, however far apart, say nothing.
    for (const days of [
      ['2026-01-01', '2026-01-04', '2026-01-07'],
      ['2026-01-01', '2026-02-01'],
    ]) {
      await expect(parse([new File([totals(days)], 't.csv')])).resolves.toBeDefined()
    }
    // A page seen once a fortnight is a rare page, not a weekly export.
    const sparse = fathomFixtureFiles((f) => {
      f[N.totals] = totals(Array.from({ length: 31 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`))
      f[N.page] = 'datetime,pathname,uniques,pageviews\n2026-01-01 00:00:00,/rare,1,1\n2026-01-15 00:00:00,/rare,1,1\n2026-01-29 00:00:00,/rare,1,1\n'
    })
    const { rows } = await parse(sparse)
    expect(rows.dimensions.filter((r) => r.dimension === 'page')).toHaveLength(3)
  })

  it('an out-of-recipe dimension on a recipe file is refused, naming the extra column (M7-c)', async () => {
    // Page + Region: the region's column is not the page file's.
    const pageRegion = fathomFixtureFiles((f) => {
      f[N.page] = 'datetime,pathname,state,uniques,pageviews\n2026-03-01 00:00:00,/,Flanders,1,1\n'
    })
    const e = await failure(parse(pageRegion))
    expect(e.detail).toEqual({ reason: 'unexpected_columns', file: N.page, columns: ['state'] })
  })

  it('two recipe dimensions in one file are refused, naming both markers (M7-c, M7-d)', async () => {
    const browserCountry = fathomFixtureFiles((f) => {
      f[N.browser] = 'datetime,browser,country_code,uniques,pageviews\n2026-03-01 00:00:00,Chrome,BE,1,1\n'
    })
    const e = await failure(parse(browserCountry))
    expect(e.detail).toEqual({ reason: 'unrecognised_file', file: N.browser, columns: ['country_code', 'browser'], limit: 1, observed: 2 })
  })

  it('a second file of one kind is refused as duplicate_file, naming both', async () => {
    const twice = fathomFixtureFiles((f) => (f['devices (1).csv'] = f[N.device]))
    const e = await failure(parse(twice))
    expect(e.detail).toEqual({ reason: 'duplicate_file', file: 'devices (1).csv', files: [N.device, 'devices (1).csv'] })
  })

  it('refuses before reading a single row: a doubled file after a malformed one reports the doubling', async () => {
    // The header pass runs over every file first, so a structural problem is
    // named before any row's content can fail.
    const files = fathomFixtureFiles((f) => {
      f[N.browser] += '2026-03-01 00:00:00,"Chrome,1,1\n'
      f['browsers (1).csv'] = f[N.browser]
    })
    expect((await failure(parse(files))).detail.reason).toBe('duplicate_file')
  })

  it.each([
    ['a file with no header row', (f: Record<string, string>) => (f[N.os] = ''), { reason: 'empty_file', file: N.os }],
    [
      'a dimension file missing its visitor count',
      (f: Record<string, string>) => (f[N.device] = 'datetime,device_type,pageviews\n2026-03-01 00:00:00,Desktop,1\n'),
      { reason: 'missing_columns', columns: ['uniques'] },
    ],
    [
      'the totals without pageviews',
      (f: Record<string, string>) => (f[N.totals] = 'datetime,visitors\n2026-03-01 00:00:00,1\n'),
      { reason: 'missing_columns', columns: ['pageviews'] },
    ],
    [
      'a CSV whose quote never closes',
      (f: Record<string, string>) => (f[N.device] += '2026-03-01 00:00:00,"Desktop,1,1\n'),
      { reason: 'malformed_csv' },
    ],
  ])('%s', async (_what, mutate, detail) => {
    const e = await failure(parse(fathomFixtureFiles(mutate)))
    expect(e.code).toBe('wrong_file')
    expect(e.detail).toMatchObject(detail)
  })

  it('a file that is not UTF-8', async () => {
    const latin1 = new Uint8Array([
      ...new TextEncoder().encode('datetime,browser,uniques,pageviews\n2026-03-01 00:00:00,'),
      0xe9,
      ...new TextEncoder().encode(',1,1\n'),
    ])
    const files = [...fathomFixtureFiles((f) => delete f[N.browser]), new File([latin1 as BlobPart], 'browsers.csv')]
    expect((await failure(parse(files))).code).toBe('unsupported_encoding')
  })
})

describe('an Hourly export (M7-e)', () => {
  it('folds to exactly the rows its Daily equivalent gives', async () => {
    const daily = await parse(fathomFixtureFiles())
    const hourly = await parse(fathomFixtureFiles(undefined, { hourly: true }))
    // It really is hourly: two rows per countable day.
    expect(fathomFixtureTexts({ hourly: true }).totals).toContain('2026-03-01 15:00:00')
    expect(hourly.rows).toEqual(daily.rows)
    expect(hourly.skipped.toCounts()).toEqual({ ...EXPECTED_SKIPS, outside_totals_range: 4 })
  })
})

// M7-g: the totals' own date range bounds every breakdown, on top of the
// site's window, which keeps its own reason.
describe('the site-totals range', () => {
  it('a row outside both the window and the totals is counted under the window, as for any source', async () => {
    const clip: Clip = { from: '2026-03-01', through: '2026-03-03', before: 'outside_history_window', after: 'pulse_measured' }
    const { skipped } = await parse(fathomFixtureFiles(), clip)
    expect(skipped.toCounts()).toEqual({
      bad_number: 1,
      bad_timestamp: 1,
      missing_field: 1,
      outside_history_window: 1,
      pulse_measured: 1,
    })
  })

  it('a row inside the window but outside the totals is outside_totals_range, and is not sent', async () => {
    const clip: Clip = { from: '2026-01-01', through: '2026-12-31', before: 'outside_history_window', after: 'pulse_measured' }
    const { rows, skipped } = await parse(fathomFixtureFiles(), clip)
    expect(skipped.toCounts().outside_totals_range).toBe(2)
    expect(rows.dimensions.some((r) => r.value === '/early')).toBe(false)
    expect(rows.acquisition.some((r) => r.date === '2026-03-04')).toBe(false)
  })

  it('bounds by the totals file\'s own days, whatever the window keeps of them', async () => {
    // The window keeps only the 2nd, but the totals span the 1st to the 3rd:
    // the 1st's breakdown rows are the window's, not outside the totals.
    const clip: Clip = { from: '2026-03-02', through: '2026-03-02', before: 'outside_history_window', after: 'pulse_measured' }
    const { skipped } = await parse(fathomFixtureFiles(), clip)
    expect(skipped.toCounts().outside_totals_range).toBeUndefined()
  })

  it('applies no bound when the totals file has no data rows', async () => {
    const files = fathomFixtureFiles((f) => (f[N.totals] = 'datetime,visitors,pageviews\n'))
    const { rows, skipped } = await parse(files)
    expect(rows.daily).toEqual([])
    expect(rows.dimensions.some((r) => r.value === '/early')).toBe(true)
    expect(skipped.toCounts().outside_totals_range).toBeUndefined()
  })
})

// M7-n: Fathom's breakdowns before March 2021 are less reliable. Kept, never
// dropped; the plan notes how far back the affected history reaches.
describe('the pre-March-2021 note', () => {
  it('names the earliest kept breakdown day before 2021-03-01', async () => {
    const { rows, notes } = await parse(fathomFixtureFiles(undefined, { start: '2021-02-27' }))
    // The '/early' page row falls on 2021-02-25, before the totals: skipped, so not the answer.
    expect(notes).toEqual({ [FATHOM_ACCURACY_NOTE]: '2021-02-27' })
    // The rows are all there.
    expect(rows.dimensions.filter((r) => r.date === '2021-02-27').length).toBeGreaterThan(0)
  })

  it('ignores the totals, and the days the window drops', async () => {
    const totalsOnly = fathomFixtureFiles((f) => {
      for (const name of Object.keys(f)) if (name !== N.totals) delete f[name]
    }, { start: '2020-06-01' })
    expect((await parse(totalsOnly)).notes).toEqual({})
    const clip: Clip = { from: '2021-02-28', through: '2021-12-31', before: 'outside_history_window', after: 'pulse_measured' }
    expect((await parse(fathomFixtureFiles(undefined, { start: '2021-02-27' }), clip)).notes).toEqual({
      [FATHOM_ACCURACY_NOTE]: '2021-02-28',
    })
  })

  it('says nothing when every breakdown day is on or after the floor', async () => {
    expect((await parse(fathomFixtureFiles(undefined, { start: '2021-03-01' }))).notes).toEqual({})
  })
})

// Gate 3, as the parser uses it: ONE budget for all seven files.
describe('the byte budget across the files (M7-b)', () => {
  const MiB = 1024 * 1024
  const sizes = () => Object.fromEntries(fathomFixtureFiles().map((f) => [f.name, f.size]))

  it('reads the upload when its files together are exactly at the total cap: the header pass costs nothing', async () => {
    const total = Object.values(sizes()).reduce((a, b) => a + b, 0)
    const read: ReadOptions = { limits: { ...ARCHIVE_LIMITS, maxTotalBytes: total, maxRatio: 1 } }
    await expect(parse(fathomFixtureFiles(), null, read)).resolves.toBeDefined()
  })

  it('refuses once the files together cross the total cap, naming the file whose bytes crossed it', async () => {
    const s = sizes()
    // Totals first, then the breakdowns in the order chosen: pages, locations, devices, …
    const cap = s[N.totals] + s[N.page] + s[N.locations] + 1
    const read: ReadOptions = { limits: { ...ARCHIVE_LIMITS, maxTotalBytes: cap, maxEntryBytes: MiB } }
    const e = await failure(parse(fathomFixtureFiles(), null, read))
    expect(e.code).toBe('zip_too_large')
    expect(e.detail).toMatchObject({ guard: 'total_bytes', file: N.device, limit: cap })
  })

  it('holds the header pass to the total cap too, across the files, not only per file', async () => {
    // The pass that finds each file's role streams a prefix of every file (all
    // of a small one) before any is read whole. Doubling the Page file puts a
    // refusal of its own at the end of that pass: reaching it would mean the
    // pass streamed past the cap unchecked.
    const s = sizes()
    const byName = Object.fromEntries(fathomFixtureFiles().map((f) => [f.name, f]))
    const upload = [N.page, N.locations, N.device, N.browser].map((n) => byName[n])
    upload.push(new File([byName[N.page]], 'pages (1).csv'))
    const cap = s[N.page] + s[N.locations] + s[N.device] + 1
    const read: ReadOptions = { limits: { ...ARCHIVE_LIMITS, maxTotalBytes: cap, maxEntryBytes: MiB } }
    const e = await failure(parse(upload, null, read))
    expect(e.code).toBe('zip_too_large')
    expect(e.detail).toMatchObject({ guard: 'total_bytes', file: N.browser, limit: cap })
  })

  it('reports progress across every file together, ending at their total size', async () => {
    const seen: [number, number][] = []
    const total = Object.values(sizes()).reduce((a, b) => a + b, 0)
    await parse(fathomFixtureFiles(), null, { onProgress: (r, t) => seen.push([r, t]) })
    expect(seen.every(([, t]) => t === total)).toBe(true)
    expect(seen.map(([r]) => r)).toEqual([...seen.map(([r]) => r)].sort((a, b) => a - b))
    expect(seen.at(-1)?.[0]).toBe(total)
  })
})

// Gate 10: Fathom is built and tested, and unreachable (M7-o).
describe('dark by omission', () => {
  it('is in no registry the orchestrator or the worker reads', () => {
    expect(IMPORT_SOURCES).toEqual(['plausible'])
    expect(isImportSource('fathom')).toBe(false)
    expect(Object.keys(SOURCE_META)).toEqual(['plausible'])
    expect(Object.keys(SOURCE_PARSERS)).toEqual(['plausible'])
  })

  it('a worker asked to prepare a Fathom import refuses it as source_not_enabled', async () => {
    const posted: FromWorker[] = []
    const host = createWorkerHost((m) => posted.push(m))
    await host({
      type: 'prepare',
      id: 1,
      protocol: PROTOCOL_VERSION,
      source: 'fathom' as never,
      files: fathomFixtureFiles().map((f) => ({ name: f.name, blob: f })),
      clip: null,
      timeZone: 'UTC',
    })
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({ type: 'error', error: { code: 'source_not_enabled' } })
  })
})

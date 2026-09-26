// @vitest-environment node
//
// The reference consumer, gate 5 (§3.12b M2-o): the parser on a SYNTHETIC
// export, built from the documented headers, produces EXACTLY the expected rows
// and skip counts. And every way the file can be the wrong one is named.

import { describe, expect, it } from 'vitest'
import { AggregateBuilder } from '../../core/aggregate'
import type { Clip } from '../../core/cap'
import { SkipLedger } from '../../core/skipped'
import { detectInputKind } from '../../core/zip'
import { ImportError } from '../../errors'
import { runPipeline } from '../../pipeline'
import { plausibleFixtureFile, plausibleFixtureFiles } from '../../__tests__/fixtures/plausible-export'
import { PLAUSIBLE_COLUMNS, plausibleSource } from '../plausible'

const SUFFIX = '20260301_20260303'
const file = (table: string) => `imported_${table}_${SUFFIX}.csv`

async function parse(blob: Blob, clip: Clip | null = null) {
  const skipped = new SkipLedger()
  const rows = new AggregateBuilder(clip, skipped)
  const { ignored } = await plausibleSource.read(blob, await detectInputKind(blob), { rows, skipped, read: {} })
  return { rows: rows.build(), skipped, ignored }
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

const dim = (date: string, dimension: string, value: string, visitors: number, visits: number, pageviews: number) => ({
  date,
  dimension,
  parent: '',
  value,
  visitors,
  visits,
  pageviews,
})

describe('the synthetic export', () => {
  it('maps to exactly the expected rows', async () => {
    const { rows, ignored } = await parse(plausibleFixtureFile())

    expect(rows.daily).toEqual([
      { date: '2026-03-01', visitors: 10, visits: 12, pageviews: 30, src_bounces: 4, src_engagement_seconds: 600 },
      { date: '2026-03-02', visitors: 20, visits: 25, pageviews: 50, src_bounces: 8, src_engagement_seconds: 1200 },
      // bounces and visit_duration not reported: null, never 0.
      { date: '2026-03-03', visitors: 5, visits: 6, pageviews: 9, src_bounces: null, src_engagement_seconds: null },
    ])

    expect(rows.dimensions).toEqual([
      // Two versions of one browser are one row.
      dim('2026-03-01', 'browser', 'Chrome', 5, 6, 19),
      dim('2026-03-01', 'browser', 'Firefox', 5, 6, 11),
      // BE split across two regions and a city is one country row.
      dim('2026-03-01', 'country', 'BE', 4, 4, 8),
      dim('2026-03-01', 'country', 'DE', 2, 2, 4),
      dim('2026-03-01', 'device', 'Desktop', 7, 9, 22),
      dim('2026-03-01', 'device', 'Mobile', 3, 3, 8),
      // Entry pages: ENTRANCES are the visits, the file's pageviews the pageviews.
      dim('2026-03-01', 'entry_page', '/', 8, 11, 25),
      // Exit pages: EXITS are the visits.
      dim('2026-03-01', 'exit_page', '/', 6, 7, 14),
      dim('2026-03-01', 'os', 'GNU/Linux', 1, 1, 2),
      // One path on two hostnames is one page row.
      dim('2026-03-01', 'page', '/', 10, 11, 23),
      dim('2026-03-01', 'page', '/über, "quoted"', 1, 1, 2),
      dim('2026-03-02', 'country', 'US', 5, 6, 8),
      dim('2026-03-02', 'entry_page', '/pricing', 4, 5, 9),
      dim('2026-03-02', 'exit_page', '/pricing', 3, 4, 6),
      dim('2026-03-02', 'os', 'Mac', 4, 5, 10),
      dim('2026-03-02', 'page', '/pricing', 4, 5, 7),
    ])

    const acq = (date: string, source: string, visitors: number, visits: number, pageviews: number, utm: [string, string, string] | null) => ({
      date,
      // The file's `source`, as it is, in both: only the server maps it.
      referrer: source,
      utm_source: utm ? utm[0] : null,
      utm_medium: utm ? utm[1] : null,
      utm_campaign: utm ? utm[2] : null,
      src_source: source,
      src_medium: utm ? utm[1] : '',
      src_campaign: utm ? utm[2] : '',
      src_channel_group: '',
      visitors,
      visits,
      pageviews,
    })
    expect(rows.acquisition).toEqual([
      acq('2026-03-01', 'Direct / None', 3, 4, 10, null),
      acq('2026-03-01', 'Google', 7, 8, 20, null),
      // Two rows that differ only in utm_content are one row.
      acq('2026-03-02', 'Newsletter', 5, 5, 11, ['newsletter', 'email', 'spring']),
    ])

    // No monthly rows: the export has no monthly unique count (M2-k).
    expect(rows.monthly).toEqual([])
    expect(ignored).toEqual([file('custom_events')])
  })

  it('counts exactly the rows it skipped, by reason, with their lines and nothing else', async () => {
    const { skipped } = await parse(plausibleFixtureFile())
    expect(skipped.toCounts()).toEqual({
      bad_number: 1,
      bad_timestamp: 1,
      missing_field: 2,
      needs_place_names: 2,
    })
    expect(skipped.toSamples()).toEqual({
      bad_number: [{ file: file('sources'), line: 6 }],
      bad_timestamp: [{ file: file('visitors'), line: 5 }],
      missing_field: [
        { file: file('pages'), line: 6 },
        { file: file('exit_pages'), line: 4 },
      ],
      needs_place_names: [
        { file: file('locations'), line: 2 },
        { file: file('locations'), line: 3 },
      ],
    })
  })

  it('drops days outside the window with the window\'s reason, and counts place names only for days kept', async () => {
    const { rows, skipped } = await parse(plausibleFixtureFile(), {
      from: '2026-03-02',
      through: '2026-03-02',
      before: 'outside_history_window',
      after: 'pulse_measured',
    })
    expect([...new Set([...rows.daily, ...rows.dimensions, ...rows.acquisition].map((r) => r.date))]).toEqual(['2026-03-02'])
    const counts = skipped.toCounts()
    // The BE rows fall on the 1st: counted once, under the window, not as place names.
    expect(counts.needs_place_names).toBeUndefined()
    // The valid rows on the 1st: visitors 1, sources 2, pages 3, entry 1, exit 1,
    // locations 3, devices 2, browsers 3, operating systems 1.
    expect(counts.outside_history_window).toBe(17)
    expect(counts.pulse_measured).toBe(1)
  })

  it('plans the export end to end', async () => {
    const { summary, parts } = await runPipeline({ source: 'plausible', file: plausibleFixtureFile(), clip: null, timeZone: 'UTC' })
    expect(summary).toMatchObject({
      source: 'plausible',
      kind: 'upload_aggregate',
      visits_are_visitors: false,
      range_start: '2026-03-01',
      range_end: '2026-03-03',
      steps: [{ start: '2026-03-01', end: '2026-03-03', parts: 1 }],
      parts_total: 1,
      totals: { rows: { daily: 3, monthly: 0, dimensions: 16, acquisition: 3 }, visitors: 35, pageviews: 89 },
      skipped: { bad_number: 1, bad_timestamp: 1, missing_field: 2, needs_place_names: 2 },
      ignored_files: [file('custom_events')],
    })
    expect(summary.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(parts).toHaveLength(1)
  })

  it('gives the same fingerprint for the same export on every run', async () => {
    const a = await runPipeline({ source: 'plausible', file: plausibleFixtureFile(), clip: null, timeZone: 'UTC' })
    const b = await runPipeline({ source: 'plausible', file: plausibleFixtureFile(), clip: null, timeZone: 'UTC' })
    expect(b.summary.fingerprint).toBe(a.summary.fingerprint)
  })
})

describe('the fixture, moved (the staging harness puts it inside a QA site\'s window)', () => {
  it('keeps every count and moves every day, file names included', async () => {
    const { rows, skipped } = await parse(plausibleFixtureFile(undefined, { start: '2026-09-20' }))
    expect(rows.daily.map((r) => [r.date, r.visitors])).toEqual([
      ['2026-09-20', 10],
      ['2026-09-21', 20],
      ['2026-09-22', 5],
    ])
    expect(skipped.toCounts()).toEqual({ bad_number: 1, bad_timestamp: 1, missing_field: 2, needs_place_names: 2 })
    expect(skipped.toSamples().bad_timestamp[0].file).toBe('imported_visitors_20260920_20260922.csv')
  })
})

describe('tolerated shapes', () => {
  it('reads columns in any order, by name', async () => {
    const reordered = plausibleFixtureFile((files) => {
      const [header, ...lines] = files[file('devices')].trimEnd().split('\n')
      const cols = header.split(',')
      const order = [...cols.keys()].reverse()
      files[file('devices')] = [order.map((i) => cols[i]).join(','), ...lines.map((l) => {
        const f = l.split(',')
        return order.map((i) => f[i]).join(',')
      })].join('\n') + '\n'
    })
    const { rows } = await parse(reordered)
    expect(rows.dimensions.filter((r) => r.dimension === 'device')).toEqual([
      dim('2026-03-01', 'device', 'Desktop', 7, 9, 22),
      dim('2026-03-01', 'device', 'Mobile', 3, 3, 8),
    ])
  })

  it('reads a file where every field is quoted, as a database export writes it', async () => {
    const quoted = plausibleFixtureFile((files) => {
      files[file('devices')] = files[file('devices')]
        .trimEnd()
        .split('\n')
        .map((l) => l.split(',').map((v) => `"${v}"`).join(','))
        .join('\r\n')
    })
    const { rows } = await parse(quoted)
    expect(rows.dimensions.filter((r) => r.dimension === 'device').map((r) => r.value)).toEqual(['Desktop', 'Mobile'])
  })

  it('accepts files inside a folder, and ignores what a Mac adds when it re-zips', async () => {
    const nested = plausibleFixtureFile((files) => {
      for (const name of Object.keys(files)) {
        files[`plausible-export/${name}`] = files[name]
        delete files[name]
      }
      files['__MACOSX/plausible-export/._imported_visitors_20260301_20260303.csv'] = 'resource fork'
      files['plausible-export/.DS_Store'] = 'finder'
    })
    const { rows } = await parse(nested)
    expect(rows.daily).toHaveLength(3)
  })

  it('never reads the custom events file, so its shape cannot fail an import (D8)', async () => {
    const odd = plausibleFixtureFile((files) => {
      files[file('custom_events')] = 'anything,at,all\n"unterminated\n'
    })
    await expect(parse(odd)).resolves.toBeDefined()
  })

  it('accepts a documented column it does not read being absent (an older export)', async () => {
    const older = plausibleFixtureFile((files) => {
      const cols = PLAUSIBLE_COLUMNS.pages.filter((c) => !c.startsWith('total_'))
      files[file('pages')] = cols.join(',') + '\n2026-03-01,example.com,/,9,8,20\n'
    })
    const { rows } = await parse(older)
    expect(rows.dimensions.filter((r) => r.dimension === 'page')).toEqual([dim('2026-03-01', 'page', '/', 8, 9, 20)])
  })
})

describe('the wrong file, named', () => {
  it.each([
    [
      'a missing file',
      (f: Record<string, string>) => delete f[file('pages')],
      { reason: 'missing_file', files: [`imported_pages_<dates>.csv`] },
    ],
    ['a file that is not part of the export', (f: Record<string, string>) => (f['notes.txt'] = 'hi'), { reason: 'unexpected_file', file: 'notes.txt' }],
    [
      'two exports in one archive',
      (f: Record<string, string>) => (f['imported_visitors_20260101_20260131.csv'] = f[file('visitors')]),
      { reason: 'duplicate_file' },
    ],
    [
      'a column the export never writes',
      (f: Record<string, string>) => (f[file('devices')] = f[file('devices')].replace('device,', 'device,extra,')),
      { reason: 'unexpected_columns', columns: ['extra'] },
    ],
    [
      'a column the parser reads, missing',
      (f: Record<string, string>) => (f[file('visitors')] = f[file('visitors')].replace(',visits,', ',')),
      { reason: 'missing_columns', columns: ['visits'] },
    ],
    ['a file with no header row', (f: Record<string, string>) => (f[file('browsers')] = ''), { reason: 'empty_file' }],
    [
      'a CSV whose quote never closes',
      (f: Record<string, string>) => (f[file('devices')] += '2026-03-01,"Desktop,1,1,1,1,1\n'),
      { reason: 'malformed_csv' },
    ],
  ])('%s', async (_what, mutate, detail) => {
    const e = await failure(parse(plausibleFixtureFile(mutate)))
    expect(e.code).toBe('wrong_file')
    expect(e.detail).toMatchObject(detail)
  })

  it('a different tool\'s export archive', async () => {
    const other = new File([await (async () => {
      const { zipSync, strToU8 } = await import('fflate')
      return zipSync({ 'Pages.csv': strToU8('Page,Visitors\n/,1\n'), 'Referrers.csv': strToU8('Referrer,Visitors\nx,1\n') }) as BlobPart
    })()], 'export.zip')
    const e = await failure(parse(other))
    expect(e.code).toBe('wrong_file')
    expect(e.detail.reason).toBe('unexpected_file')
  })

  it('one CSV from inside the export instead of the ZIP', async () => {
    const one = new File([plausibleFixtureFiles()[file('visitors')]], file('visitors'))
    const e = await failure(parse(one))
    expect(e.code).toBe('wrong_file')
    expect(e.detail.reason).toBe('not_an_archive')
  })

  it('a file that is not UTF-8', async () => {
    const latin1 = new Uint8Array([...new TextEncoder().encode('date,device,visitors,visits,visit_duration,bounces,pageviews\n2026-03-01,'), 0xe9, ...new TextEncoder().encode(',1,1,1,1,1\n')])
    const { zipSync, strToU8 } = await import('fflate')
    const files: Record<string, Uint8Array> = {}
    for (const [name, text] of Object.entries(plausibleFixtureFiles())) files[name] = strToU8(text)
    files[file('devices')] = latin1
    const e = await failure(parse(new File([zipSync(files) as BlobPart], 'x.zip')))
    expect(e.code).toBe('unsupported_encoding')
  })
})

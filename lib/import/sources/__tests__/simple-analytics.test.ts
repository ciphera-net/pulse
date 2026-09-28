// @vitest-environment node
//
// Simple Analytics' raw datapoints CSV parser (design §3.12m9), on (a) a
// SYNTHETIC fixture built from M9-c's exact required header, and (b) the real
// export vendored at `./fixtures/simple-analytics-real-export.csv` — a copy of
// the 1,417 real rows recorded in
// `Pulse/docs/data/27-09-2026-analytics-import-adapters/real-exports/simple-analytics/`,
// simpleanalytics.com's own public dashboard. It is vendored INSIDE this repo
// (not read from that sibling docs path) because Woodpecker's `test.yml`
// checks out only this repo — a path escaping it 404s in CI even though it
// resolves locally in this workspace's layout. That real CSV predates M9-b's
// `type=all` fix (README: "the 1,417-row CSV... lacks hostname/datapoint"), so
// gate 2's real-fixture check
// augments it with the two columns the corrected recipe adds — `hostname`
// (the query's own `hostname=` value, true of every row in the pull) and
// `datapoint` (every row is a real `pageview`, since the pull that produced
// this file requested `type=pageviews` only) — never fabricating a count, only
// supplying metadata that was already true of how the file was fetched. A
// second, small, hand-built fixture in this file's own `type=all` shape (mixed
// pageview/custom-event rows) proves the corrected recipe end to end.
//
// Gates covered here: 1 (unit/property level — the schema, the row skips, the
// vocabulary-free pass-through, the Direct/Shared-Link derivation and its two
// required cases, `hostname_mismatch`) and 2 (the real fixture, byte for byte,
// plus the small `type=all` fixture).

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Clip } from '../../core/cap'
import { CsvByteParser } from '../../core/csv'
import { RawFolder } from '../../core/fold'
import { SkipLedger } from '../../core/skipped'
import { detectInputKind, type ReadOptions } from '../../core/zip'
import { ImportError } from '../../errors'
import { IMPORT_SOURCES, SOURCE_META, isImportSource } from '../../source-meta'
import { SOURCE_PARSERS } from '../index'
import {
  SIMPLE_ANALYTICS_KNOWN_COLUMNS,
  SIMPLE_ANALYTICS_REQUIRED_COLUMNS,
  parseAddedIso,
  simpleAnalyticsSource,
} from '../simple-analytics'

// ─── Test helpers ──────────────────────────────────────────────────────────

async function sourceFiles(files: readonly File[]) {
  const out = []
  for (const f of files) out.push({ name: f.name, blob: f as Blob, input: await detectInputKind(f) })
  return out
}

interface ParseOptions {
  clip?: Clip | null
  timeZone?: string
  read?: ReadOptions
  /** The upload window's `site_domain` (M9-j'); defaults to null, the intra-file-check path. */
  siteDomain?: string | null
}

async function parse(files: readonly File[], options: ParseOptions = {}) {
  const skipped = new SkipLedger()
  const rows = new RawFolder({
    timeZone: options.timeZone ?? 'UTC',
    clip: options.clip ?? null,
    skipped,
    // The production wiring (pipeline.ts): `emitExitPages: meta.hasExitPages`.
    emitExitPages: SOURCE_META.simple_analytics.hasExitPages,
  })
  const result = await simpleAnalyticsSource.read(await sourceFiles(files), {
    rows,
    skipped,
    read: options.read ?? {},
    siteDomain: options.siteDomain ?? null,
  })
  return { rows: rows.finish(), skipped, ignored: result.ignored, notes: result.notes ?? {} }
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

const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
function csvText(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(q).join(',')).join('\n') + '\n'
}
function csvFile(rows: readonly (readonly string[])[], name = 'export.csv'): File {
  return new File([csvText(rows)], name, { type: 'text/csv' })
}

/** Defaults for a well-formed row, in M9-c's required order. Override by name. */
const DEFAULTS: Record<(typeof SIMPLE_ANALYTICS_REQUIRED_COLUMNS)[number], string> = {
  added_iso: '2026-03-10T09:00:00.000Z',
  datapoint: 'pageview',
  is_robot: 'false',
  is_unique: 'true',
  hostname: 'example.com',
  path: '/',
  document_referrer: '',
  utm_source: '',
  utm_medium: '',
  utm_campaign: '',
  country_code: 'BE',
  device_type: 'desktop',
  browser_name: 'Chrome',
  os_name: 'macOS',
  lang_language: 'en',
  lang_region: 'us',
  screen_width: '1920',
  screen_height: '1080',
}

type RowOverrides = Partial<Record<(typeof SIMPLE_ANALYTICS_REQUIRED_COLUMNS)[number], string>>

function row(over: RowOverrides = {}): string[] {
  return SIMPLE_ANALYTICS_REQUIRED_COLUMNS.map((c) => over[c] ?? DEFAULTS[c])
}

function fixture(rows: readonly RowOverrides[], name = 'export.csv'): File {
  return csvFile([SIMPLE_ANALYTICS_REQUIRED_COLUMNS as unknown as string[], ...rows.map((r) => row(r))], name)
}

// ─── Schema constants ──────────────────────────────────────────────────────

describe('the column lists', () => {
  it('names exactly 18 required and 36 known columns, required a subset of known', () => {
    expect(SIMPLE_ANALYTICS_REQUIRED_COLUMNS).toHaveLength(18)
    expect(SIMPLE_ANALYTICS_KNOWN_COLUMNS).toHaveLength(36)
    expect(new Set(SIMPLE_ANALYTICS_REQUIRED_COLUMNS).size).toBe(18)
    expect(new Set(SIMPLE_ANALYTICS_KNOWN_COLUMNS).size).toBe(36)
    for (const c of SIMPLE_ANALYTICS_REQUIRED_COLUMNS) expect(SIMPLE_ANALYTICS_KNOWN_COLUMNS).toContain(c)
  })

  it('never lists a deprecated legacy name', () => {
    for (const legacy of ['url', 'referrer', 'referrer_raw', 'device_width_pixels', 'device_width', 'source']) {
      expect(SIMPLE_ANALYTICS_KNOWN_COLUMNS).not.toContain(legacy)
    }
  })
})

// ─── Registration (M9 joins these in its own milestone, unlike Fathom) ─────

describe('registration', () => {
  it('is a real, enabled source', () => {
    expect(IMPORT_SOURCES).toContain('simple_analytics')
    expect(isImportSource('simple_analytics')).toBe(true)
    expect(SOURCE_PARSERS.simple_analytics).toBe(simpleAnalyticsSource)
    expect(SOURCE_META.simple_analytics).toEqual({
      kind: 'upload_raw',
      visitsAreVisitors: true,
      accepts: ['plain', 'gzip'],
      fileCount: 'single',
      oneFileMessage: "Choose one file: Simple Analytics' export is a single CSV file.",
      hasExitPages: false,
    })
  })
})

// ─── added_iso (M9-d) ───────────────────────────────────────────────────────

describe('parseAddedIso', () => {
  it('reads the real shape: millisecond, Z-suffixed UTC', () => {
    expect(parseAddedIso('2026-09-19T22:04:02.322Z')).toBe(Date.parse('2026-09-19T22:04:02.322Z'))
  })

  it('accepts no fractional seconds and an explicit numeric offset, defensively', () => {
    expect(parseAddedIso('2026-03-10T09:00:00Z')).toBe(Date.UTC(2026, 2, 10, 9, 0, 0))
    // +02:00 local is 2h ahead of UTC.
    expect(parseAddedIso('2026-03-10T11:00:00+02:00')).toBe(Date.UTC(2026, 2, 10, 9, 0, 0))
    expect(parseAddedIso('2026-03-10T07:00:00-02:00')).toBe(Date.UTC(2026, 2, 10, 9, 0, 0))
    expect(parseAddedIso('2026-03-10T11:00:00+0200')).toBe(Date.UTC(2026, 2, 10, 9, 0, 0))
  })

  it('rejects a day that does not exist, an out-of-range clock part, and garbage', () => {
    expect(parseAddedIso('2026-02-30T00:00:00Z')).toBeNull()
    expect(parseAddedIso('2026-03-10T24:00:00Z')).toBeNull()
    expect(parseAddedIso('2026-03-10T09:60:00Z')).toBeNull()
    expect(parseAddedIso('not-a-timestamp')).toBeNull()
    expect(parseAddedIso('2026-03-10')).toBeNull()
  })
})

// ─── Dispatch and file shape (M9-c) ────────────────────────────────────────

describe('dispatch and file shape', () => {
  it('refuses a ZIP as unexpected_archive, never not_an_archive', async () => {
    const { zipSync } = await import('fflate')
    const zip = new File([zipSync({ 'a.csv': strToU8('x') }) as BlobPart], 'export.zip')
    const e = await failure(parse([zip]))
    expect(e.code).toBe('wrong_file')
    expect(e.detail).toEqual({ reason: 'unexpected_archive', file: 'export.zip' })
    expect(e.message).toBe(
      'This looks like a ZIP archive. Simple Analytics exports a single CSV file, so upload that file directly.',
    )
  })

  it('reads a plain CSV and a gzip of the same bytes identically', async () => {
    const rows = [row({ path: '/' }), row({ path: '/pricing', is_unique: 'false' })]
    const text = csvText([SIMPLE_ANALYTICS_REQUIRED_COLUMNS as unknown as string[], ...rows])
    const plain = new File([text], 'export.csv')
    const gz = new File([gzipSync(strToU8(text)) as BlobPart], 'export.csv.gz')
    const a = await parse([plain])
    const b = await parse([gz])
    expect(a.rows).toEqual(b.rows)
    expect(a.skipped.total()).toBe(0)
  })

  it('refuses no file and more than one file (single-file source, M7-a)', async () => {
    const none = await failure(parse([]))
    expect(none.detail).toEqual({ reason: 'missing_file' })
    const two = await failure(parse([fixture([{}]), fixture([{}])]))
    expect(two.code).toBe('wrong_file')
    expect(two.detail).toMatchObject({ reason: 'duplicate_file', limit: 1, observed: 2 })
    expect(two.message).toBe("Choose one file: Simple Analytics' export is a single CSV file.")
  })

  it('refuses a file with no header row at all as empty_file', async () => {
    const empty = new File([''], 'export.csv')
    const e = await failure(parse([empty]))
    expect(e.detail).toEqual({ reason: 'empty_file', file: 'export.csv' })
  })

  it('accepts a header-only file with zero data rows', async () => {
    const headerOnly = new File([csvText([SIMPLE_ANALYTICS_REQUIRED_COLUMNS as unknown as string[]])], 'export.csv')
    const { rows, skipped } = await parse([headerOnly])
    expect(rows.daily).toEqual([])
    expect(skipped.total()).toBe(0)
  })

  it('names missing, unexpected and duplicated columns', async () => {
    const missing = csvFile([['added_iso', 'path']])
    const eMissing = await failure(parse([missing]))
    expect(eMissing.detail).toMatchObject({ reason: 'missing_columns' })

    const cols = [...SIMPLE_ANALYTICS_REQUIRED_COLUMNS, 'some_future_field']
    const unexpected = csvFile([cols])
    const eUnexpected = await failure(parse([unexpected]))
    expect(eUnexpected.detail).toMatchObject({ reason: 'unexpected_columns', columns: ['some_future_field'] })

    const dup = csvFile([[...SIMPLE_ANALYTICS_REQUIRED_COLUMNS, 'path']])
    const eDup = await failure(parse([dup]))
    expect(eDup.detail).toMatchObject({ reason: 'duplicate_columns', columns: ['path'] })
  })

  it('does not check column order', async () => {
    const reversed = [...SIMPLE_ANALYTICS_REQUIRED_COLUMNS].reverse()
    const file = csvFile([reversed, reversed.map((c) => DEFAULTS[c as (typeof SIMPLE_ANALYTICS_REQUIRED_COLUMNS)[number]])])
    const { skipped } = await parse([file])
    expect(skipped.total()).toBe(0)
  })

  it('accepts a known-but-optional column (e.g. session_id) it never reads', async () => {
    const cols = [...SIMPLE_ANALYTICS_REQUIRED_COLUMNS, 'session_id']
    const file = csvFile([cols, [...row(), 'a-session-id']])
    const { skipped } = await parse([file])
    expect(skipped.total()).toBe(0)
  })
})

// ─── Row-level skips ────────────────────────────────────────────────────────

describe('row-level skips', () => {
  it('drops a row with the wrong number of fields as missing_field', async () => {
    const text = csvText([SIMPLE_ANALYTICS_REQUIRED_COLUMNS as unknown as string[]]) + 'a,b\n'
    const { rows, skipped } = await parse([new File([text], 'export.csv')])
    expect(rows.daily).toEqual([])
    expect(skipped.toCounts()).toEqual({ missing_field: 1 })
  })

  it('drops a robot row as bot_row, checked regardless of the export URL\'s robots= flag', async () => {
    const { rows, skipped } = await parse([fixture([{ is_robot: 'true' }])])
    expect(rows.daily).toEqual([])
    expect(skipped.toCounts()).toEqual({ bot_row: 1 })
  })

  it('reads a non-pageview datapoint as a custom event, never not_a_pageview (M12-h)', async () => {
    const { rows, skipped } = await parse([fixture([{ datapoint: 'click_signup' }])])
    expect(rows.daily).toEqual([])
    expect(skipped.toCounts()).toEqual({})
    // No unique signal on an event row: visitors is null, never a zero the source didn't measure.
    expect(rows.events).toEqual([{ date: '2026-03-10', source_name: 'click_signup', visitors: null, count: 1 }])
  })

  it('holds a custom event to the site\'s domain and its timestamp like a pageview, and skips a robot one as bot_row', async () => {
    const { rows, skipped } = await parse(
      [
        fixture([
          { datapoint: 'signup', hostname: 'other-site.com' },
          { datapoint: 'signup', added_iso: 'yesterday' },
          { datapoint: 'signup', is_robot: 'true' },
          { datapoint: 'signup' },
        ]),
      ],
      { siteDomain: 'example.com' },
    )
    expect(skipped.toCounts()).toEqual({ hostname_mismatch: 1, bad_timestamp: 1, bot_row: 1 })
    expect(rows.events).toEqual([{ date: '2026-03-10', source_name: 'signup', visitors: null, count: 1 }])
  })

  it('skips a custom event whose name is empty once cleaned as event_name_invalid', async () => {
    const { rows, skipped } = await parse([fixture([{ datapoint: ' \t ' }, { datapoint: 'signup' }])])
    expect(skipped.toCounts()).toEqual({ event_name_invalid: 1 })
    expect(rows.events.map((e) => e.source_name)).toEqual(['signup'])
  })

  it('with no site_domain (an older server, M9-j\'), falls back to the intra-file check: the first row sets the reference', async () => {
    const { rows, skipped } = await parse([
      fixture([{ hostname: 'example.com' }, { hostname: 'other-site.com', path: '/x' }, { hostname: 'example.com', path: '/y' }]),
    ])
    expect(rows.daily[0]?.pageviews).toBe(2)
    expect(skipped.toCounts()).toEqual({ hostname_mismatch: 1 })
  })

  it('drops a malformed added_iso as bad_timestamp', async () => {
    const { rows, skipped } = await parse([fixture([{ added_iso: '2026-13-40T00:00:00Z' }])])
    expect(rows.daily).toEqual([])
    expect(skipped.toCounts()).toEqual({ bad_timestamp: 1 })
  })

  it('counts every skip with a file-and-line sample, never row content', async () => {
    const { skipped } = await parse([fixture([{ is_robot: 'true' }])])
    expect(skipped.toSamples().bot_row).toEqual([{ file: 'export.csv', line: 2 }])
  })
})

// ─── The hostname filter against the site's own domain (M9-j') ────────────

describe("hostname filter against ctx.siteDomain (M9-j')", () => {
  it('drops every row from another host, even the first one — unlike the intra-file fallback, which cannot', async () => {
    const { rows, skipped } = await parse(
      [fixture([{ hostname: 'other-site.com', path: '/x' }, { hostname: 'example.com', path: '/y' }])],
      { siteDomain: 'example.com' },
    )
    expect(rows.daily[0]?.pageviews).toBe(1)
    expect(skipped.toCounts()).toEqual({ hostname_mismatch: 1 })
  })

  it("keeps rows from the site's own host and its www. form", async () => {
    const { rows, skipped } = await parse(
      [fixture([{ hostname: 'example.com', path: '/a' }, { hostname: 'www.example.com', path: '/b' }])],
      { siteDomain: 'example.com' },
    )
    expect(skipped.total()).toBe(0)
    expect(rows.daily[0]?.pageviews).toBe(2)
  })

  it("also keeps rows when the SITE's domain itself is a www. form (both sides www.-stripped)", async () => {
    const { rows, skipped } = await parse([fixture([{ hostname: 'example.com' }])], { siteDomain: 'www.example.com' })
    expect(skipped.total()).toBe(0)
    expect(rows.daily[0]?.pageviews).toBe(1)
  })

  it('matches a Unicode row hostname against the site domain\'s ASCII (punycode) form, and drops an unrelated Unicode host', async () => {
    // new URL('http://münchen.example/').hostname === 'xn--mnchen-3ya.example' —
    // the ASCII form id-backend #526/#531 says an IDN site's `sites.domain` stores.
    const { rows, skipped } = await parse(
      [
        fixture([
          { hostname: 'münchen.example', path: '/a' },
          { hostname: 'other-münchen.example', path: '/b' },
        ]),
      ],
      { siteDomain: 'xn--mnchen-3ya.example' },
    )
    expect(rows.daily[0]?.pageviews).toBe(1)
    expect(skipped.toCounts()).toEqual({ hostname_mismatch: 1 })
  })

  it('rejects a WHOLESALE upload of another property\'s export in full — every row shares one consistent wrong host, so the intra-file fallback would see nothing to disagree with', async () => {
    // The motivating scenario from the design doc itself (M9-j'): a file
    // where every row agrees with every other row, just not with the site.
    // A count-for-count fixture (one wrong row, one right row) can't tell
    // this check apart from the pre-M9-j' first-row-reference fallback,
    // which also happens to keep whichever row it saw first — this fixture
    // has no "right" row at all, so only an explicit ctx.siteDomain compare
    // can reject it.
    const rowsIn = [
      { hostname: 'wrong-property.com', path: '/a' },
      { hostname: 'wrong-property.com', path: '/b' },
      { hostname: 'wrong-property.com', path: '/c' },
    ]
    const { rows, skipped } = await parse([fixture(rowsIn)], { siteDomain: 'example.com' })
    expect(rows.daily).toEqual([])
    expect(skipped.toCounts()).toEqual({ hostname_mismatch: rowsIn.length })
  })

  it('strips a trailing root-label dot before comparing, like every other normalization this check performs', async () => {
    // FQDN-with-trailing-dot form (`example.com.`): normaliseHost already
    // lower-cases and strips `www.` and converts Unicode to ASCII, so a
    // literal trailing dot — never present in `sites.domain` per the
    // backend — should not be the one thing left un-normalised.
    const { rows, skipped } = await parse([fixture([{ hostname: 'example.com.', path: '/a' }])], {
      siteDomain: 'example.com',
    })
    expect(skipped.total()).toBe(0)
    expect(rows.daily[0]?.pageviews).toBe(1)
  })
})

// ─── Identity and the fold amendments (M9-e) ───────────────────────────────

describe('identity: is_unique is the entire signal (M9-e)', () => {
  it('counts an is_unique=true row toward visitors, visits and pageviews', async () => {
    const { rows } = await parse([fixture([{ is_unique: 'true' }])])
    expect(rows.daily).toEqual([{ date: '2026-03-10', visitors: 1, visits: 1, pageviews: 1, src_bounces: null, src_engagement_seconds: null }])
  })

  it('counts an is_unique=false row toward pageviews only', async () => {
    const { rows } = await parse([fixture([{ is_unique: 'false' }])])
    expect(rows.daily).toEqual([{ date: '2026-03-10', visitors: 0, visits: 0, pageviews: 1, src_bounces: null, src_engagement_seconds: null }])
  })

  it('gives every is_unique=true row a FRESH, distinct identity, never merged across rows', async () => {
    const { rows } = await parse([fixture([{ is_unique: 'true', path: '/a' }, { is_unique: 'true', path: '/a' }])])
    expect(rows.daily).toEqual([{ date: '2026-03-10', visitors: 2, visits: 2, pageviews: 2, src_bounces: null, src_engagement_seconds: null }])
  })

  it('mixes both in the same day correctly', async () => {
    const { rows } = await parse([
      fixture([{ is_unique: 'true' }, { is_unique: 'true' }, { is_unique: 'false' }, { is_unique: 'false' }, { is_unique: 'false' }]),
    ])
    expect(rows.daily).toEqual([{ date: '2026-03-10', visitors: 2, visits: 2, pageviews: 5, src_bounces: null, src_engagement_seconds: null }])
  })

  it('never produces an exit_page row, and entry_page.pageviews equals entry_page.visitors (M9-k)', async () => {
    const { rows } = await parse([fixture([{ is_unique: 'true', path: '/a' }, { is_unique: 'true', path: '/b' }, { is_unique: 'false', path: '/c' }])])
    expect(rows.dimensions.some((r) => r.dimension === 'exit_page')).toBe(false)
    const entries = rows.dimensions.filter((r) => r.dimension === 'entry_page')
    expect(entries).toHaveLength(2)
    for (const e of entries) expect(e.pageviews).toBe(e.visitors)
    // The non-unique row's page never entered as an entry_page.
    expect(entries.map((e) => e.value).sort()).toEqual(['/a', '/b'])
  })

  it('never produces a region or city row (M9-f: no place dimension finer than country)', async () => {
    const { rows } = await parse([fixture([{}])])
    expect(rows.dimensions.some((r) => r.dimension === 'region' || r.dimension === 'city')).toBe(false)
  })
})

// ─── Direct vs. Shared Link (M9-g) ──────────────────────────────────────────

describe('Direct vs. Shared Link, and the referrer travelling unchanged', () => {
  it('is_unique=true, no referrer, landing on / → Direct', async () => {
    const { rows } = await parse([fixture([{ is_unique: 'true', document_referrer: '', path: '/' }])])
    expect(rows.acquisition).toEqual([
      { date: '2026-03-10', referrer: 'Direct', utm_source: null, utm_medium: null, utm_campaign: null, src_source: 'Direct', src_medium: '', src_campaign: '', src_channel_group: '', visitors: 1, visits: 1, pageviews: 1 },
    ])
  })

  it('is_unique=true, no referrer, landing elsewhere → Shared Link', async () => {
    const { rows } = await parse([fixture([{ is_unique: 'true', document_referrer: '', path: '/blog/post' }])])
    expect(rows.acquisition[0]?.referrer).toBe('Shared Link')
    expect(rows.acquisition[0]?.src_source).toBe('Shared Link')
  })

  it("no referrer but a utm_source → the tag is the label, before Direct or Shared Link (native's order, M9-g')", async () => {
    // Native labels a visit with no referrer by its utm_source before the
    // Direct/Shared Link fallback (internal/api/events.go). Without this step a
    // tagged newsletter visit would import as Direct, which native never stores.
    const { rows } = await parse([fixture([
      { is_unique: 'true', document_referrer: '', path: '/', utm_source: 'newsletter' },
      { is_unique: 'true', document_referrer: '', path: '/blog/post', utm_source: 'newsletter' },
    ])])
    expect(rows.acquisition.map((r) => [r.referrer, r.src_source, r.utm_source, r.visitors])).toEqual([['newsletter', 'newsletter', 'newsletter', 2]])
  })

  it('an external referrer travels unchanged, in both referrer and src_source', async () => {
    const { rows } = await parse([fixture([{ is_unique: 'true', document_referrer: 'http://google.com/search' }])])
    expect(rows.acquisition[0]?.referrer).toBe('http://google.com/search')
    expect(rows.acquisition[0]?.src_source).toBe('http://google.com/search')
  })

  it('required case 1: a same-registrable-domain SUBDOMAIN referrer travels unchanged, never collapsed to Direct here', async () => {
    const { rows } = await parse([fixture([{ is_unique: 'true', hostname: 'example.com', document_referrer: 'http://dashboard.example.com/' }])])
    expect(rows.acquisition[0]?.referrer).toBe('http://dashboard.example.com/')
    // Whether this ultimately resolves to the site's own host is IsOwnHost's
    // job, server-side (M2-l) — this parser's only job is to not guess.
  })

  it('required case 2: a www. referrer travels unchanged too', async () => {
    const { rows } = await parse([fixture([{ is_unique: 'true', hostname: 'example.com', document_referrer: 'http://www.example.com/' }])])
    expect(rows.acquisition[0]?.referrer).toBe('http://www.example.com/')
  })

  it('utm_source/medium/campaign are null when empty on the wire; src_medium/src_campaign stay raw strings', async () => {
    const { rows } = await parse([fixture([{ is_unique: 'true', document_referrer: 'http://x.example/', utm_source: '', utm_medium: '', utm_campaign: '' }])])
    expect(rows.acquisition[0]).toMatchObject({ utm_source: null, utm_medium: null, utm_campaign: null, src_medium: '', src_campaign: '', src_channel_group: '' })
  })

  it('an is_unique=false row produces no acquisition row at all', async () => {
    const { rows } = await parse([fixture([{ is_unique: 'false', document_referrer: 'http://google.com/' }])])
    expect(rows.acquisition).toEqual([])
  })

  it('two is_unique=true rows sharing a day and acquisition key merge into one row, summed', async () => {
    const { rows } = await parse([
      fixture([
        { is_unique: 'true', document_referrer: '', path: '/' },
        { is_unique: 'true', document_referrer: '', path: '/' },
      ]),
    ])
    expect(rows.acquisition).toHaveLength(1)
    expect(rows.acquisition[0]).toMatchObject({ referrer: 'Direct', visitors: 2, visits: 2, pageviews: 2 })
  })
})

// ─── Dimension mapping: verbatim, unmapped client-side (M2-l does the mapping) ─

describe('dimension mapping', () => {
  it('passes country, device, browser and os through verbatim, unmapped', async () => {
    const { rows } = await parse([fixture([{ country_code: 'BE', device_type: 'desktop', browser_name: 'Google Chrome', os_name: 'macOS' }])])
    const byDim = (d: string) => rows.dimensions.filter((r) => r.dimension === d).map((r) => r.value)
    expect(byDim('country')).toEqual(['BE'])
    expect(byDim('device')).toEqual(['desktop'])
    expect(byDim('browser')).toEqual(['Google Chrome'])
    expect(byDim('os')).toEqual(['macOS'])
  })

  it('stores the quoted os_name anomaly verbatim, quote characters and all', async () => {
    const { rows } = await parse([fixture([{ os_name: '"Windows"' }])])
    expect(rows.dimensions.find((r) => r.dimension === 'os')?.value).toBe('"Windows"')
  })

  it('combines lang_language and lang_region; a bare language with no region is language alone', async () => {
    const { rows } = await parse([
      fixture([{ lang_language: 'en', lang_region: 'us', path: '/a' }, { lang_language: 'nl', lang_region: '', path: '/b' }]),
    ])
    const values = rows.dimensions.filter((r) => r.dimension === 'language').map((r) => r.value).sort()
    expect(values).toEqual(['en-us', 'nl'])
  })

  it('builds screen_resolution as WIDTHxHEIGHT', async () => {
    const { rows } = await parse([fixture([{ screen_width: '1512', screen_height: '982' }])])
    expect(rows.dimensions.find((r) => r.dimension === 'screen_resolution')?.value).toBe('1512x982')
  })

  it('every row contributes a page dimension row keyed on the raw path', async () => {
    const { rows } = await parse([fixture([{ path: '/pricing' }])])
    expect(rows.dimensions.find((r) => r.dimension === 'page')?.value).toBe('/pricing')
  })
})

// ─── Gate 2: the real export, augmented for the corrected recipe ───────────

// Vendored in-repo (see the file-header comment) — never a path that escapes
// `__dirname`'s own tree, so a plain `npm ci` + `npm test` checkout of this
// repo alone (exactly what Woodpecker's `test.yml` does) can read it.
const REAL_CSV_PATH = path.resolve(__dirname, 'fixtures/simple-analytics-real-export.csv')

/** A synchronous CSV read for TEST SETUP ONLY (the real parser is streaming; see core/csv.ts). */
function readCsvSync(text: string): { header: string[]; rows: string[][] } {
  let header: string[] | null = null
  const dataRows: string[][] = []
  const csv = new CsvByteParser((fields) => {
    if (!header) header = fields
    else dataRows.push(fields)
  }, 'sync.csv')
  csv.push(new TextEncoder().encode(text))
  csv.end()
  return { header: header ?? [], rows: dataRows }
}

/**
 * Reconstructs the real, pre-M9-b-fix export (no `hostname`/`datapoint`
 * columns) into the shape the CORRECTED recipe writes. Both added columns are
 * facts already true of how the file was pulled — `hostname` is the fetch's
 * own `hostname=simpleanalytics.com` query parameter (confirmed on every real
 * row that DOES carry it, README "hostname… on every row"), and `datapoint`
 * is `pageview` because the pull that produced this file requested
 * `type=pageviews` only (README, request 1) — never a fabricated count.
 */
function augmentedRealExportFile(): File {
  const { header, rows } = readCsvSync(readFileSync(REAL_CSV_PATH, 'utf8'))
  const augmentedHeader = [...header, 'hostname', 'datapoint']
  const augmentedRows = rows.map((r) => [...r, 'simpleanalytics.com', 'pageview'])
  return csvFile([augmentedHeader, ...augmentedRows], 'real-export.csv')
}

function sumBy<T>(items: readonly T[], key: (t: T) => number): number {
  return items.reduce((sum, t) => sum + key(t), 0)
}

describe('gate 2: the real export, augmented for the corrected recipe', () => {
  it('reads all 1,417 rows clean: zero skips of any reason', async () => {
    const { rows, skipped } = await parse([augmentedRealExportFile()])
    expect(skipped.total()).toBe(0)
    expect(sumBy(rows.daily, (r) => r.pageviews)).toBe(1417)
    // README: is_unique true 1,111 / false 306 — the entrance count.
    expect(sumBy(rows.daily, (r) => r.visitors)).toBe(1111)
    expect(sumBy(rows.daily, (r) => r.visits)).toBe(1111)
  })

  it('reproduces the README\'s independently-recomputed device_type distribution', async () => {
    const { rows } = await parse([augmentedRealExportFile()])
    const byValue = (dimension: string) => {
      const out: Record<string, number> = {}
      for (const r of rows.dimensions.filter((x) => x.dimension === dimension)) out[r.value] = (out[r.value] ?? 0) + (r.pageviews ?? 0)
      return out
    }
    expect(byValue('device')).toEqual({ desktop: 1125, mobile: 291, tablet: 1 })
  })

  it('reproduces the README\'s browser_name distribution, including the 3 empty rows', async () => {
    const { rows } = await parse([augmentedRealExportFile()])
    const byValue: Record<string, number> = {}
    for (const r of rows.dimensions.filter((x) => x.dimension === 'browser')) byValue[r.value] = (byValue[r.value] ?? 0) + (r.pageviews ?? 0)
    expect(byValue).toEqual({
      'Google Chrome': 880,
      Safari: 180,
      'iOS Safari': 136,
      Firefox: 65,
      Brave: 49,
      'Chrome Mobile': 45,
      'Microsoft Edge': 39,
      'Firefox Mobile': 10,
      Opera: 5,
      DuckDuckGo: 5,
      '': 3,
    })
  })

  it('reproduces the README\'s os_name distribution, INCLUDING the one quoted "Windows" anomaly, stored verbatim', async () => {
    const { rows } = await parse([augmentedRealExportFile()])
    const byValue: Record<string, number> = {}
    for (const r of rows.dimensions.filter((x) => x.dimension === 'os')) byValue[r.value] = (byValue[r.value] ?? 0) + (r.pageviews ?? 0)
    expect(byValue).toEqual({
      macOS: 727,
      Windows: 319,
      iOS: 186,
      Android: 107,
      Linux: 70,
      'Chrome OS': 4,
      '': 3,
      '"Windows"': 1,
    })
  })

  it('never emits an exit_page, region or city row for this source', async () => {
    const { rows } = await parse([augmentedRealExportFile()])
    expect(rows.dimensions.some((r) => r.dimension === 'exit_page')).toBe(false)
    expect(rows.dimensions.some((r) => r.dimension === 'region')).toBe(false)
    expect(rows.dimensions.some((r) => r.dimension === 'city')).toBe(false)
  })

  it('entry_page pageviews equal entry_page visitors across the whole file (M9-k)', async () => {
    const { rows } = await parse([augmentedRealExportFile()])
    const entries = rows.dimensions.filter((r) => r.dimension === 'entry_page')
    expect(sumBy(entries, (r) => r.pageviews ?? 0)).toBe(1111)
    for (const e of entries) expect(e.pageviews).toBe(e.visitors)
  })

  it('acquisition rows come only from is_unique=true rows and sum to 1,111 pageviews', async () => {
    const { rows } = await parse([augmentedRealExportFile()])
    expect(sumBy(rows.acquisition, (r) => r.pageviews)).toBe(1111)
    expect(sumBy(rows.acquisition, (r) => r.visitors)).toBe(1111)
  })
})

// ─── A second, small, hand-built type=all fixture (M9-b's own recipe shape) ─

describe('a second small fixture in the corrected type=all shape', () => {
  it('keeps every pageview row and folds every custom-event row by (day, datapoint), counts still matching (M12-h)', async () => {
    const events = ['click_login_top_nav', 'visit_pricing', 'outbound_www_capterra_com']
    const rowsIn = [
      row({ datapoint: 'pageview', is_unique: 'true', path: '/' }),
      row({ datapoint: events[0], is_unique: 'true', path: '/' }),
      row({ datapoint: 'pageview', is_unique: 'false', path: '/pricing' }),
      row({ datapoint: events[1], is_unique: 'false', path: '/pricing' }),
      row({ datapoint: 'pageview', is_unique: 'true', path: '/about' }),
      row({ datapoint: events[2], is_unique: 'true', path: '/about' }),
    ]
    const file = csvFile([SIMPLE_ANALYTICS_REQUIRED_COLUMNS as unknown as string[], ...rowsIn])
    const { rows, skipped } = await parse([file])
    // 3 real pageviews kept, 3 custom-event rows read as events: the file was
    // read whole (M9-b), never filtered at the source, and nothing is dropped.
    expect(sumBy(rows.daily, (r) => r.pageviews)).toBe(3)
    expect(skipped.toCounts()).toEqual({})
    expect(rows.events.map((e) => [e.source_name, e.count, e.visitors])).toEqual(
      [...events].sort().map((name) => [name, 1, null]),
    )
  })
})

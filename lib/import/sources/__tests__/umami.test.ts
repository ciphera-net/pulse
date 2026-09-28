// @vitest-environment node
//
// M8 gates 1 and 3 (design §3.12m8 §9), on two kinds of evidence:
//
//   - the SYNTHETIC export (lib/import/__tests__/fixtures/umami-export.ts),
//     built from the spec's own schema text, folded by hand below;
//   - the REAL export: the published query (umami-recipe.ts, byte for byte)
//     run with psql against the self-hosted Umami 3.4.0 instance behind
//     `Pulse/docs/data/27-09-2026-analytics-import-adapters/real-exports/umami/`
//     (35 events, 15 sessions, 22–27 Sep 2026), vendored beside this file in
//     two forms: as published (`umami-published-query.csv`, `…T09:00:00Z`),
//     and with `created_at` selected bare (`…-raw-timestamps.csv`,
//     `2026-09-22 09:00:00+00`, Postgres's own text: M8-d's shape 2). Every
//     expected number for it was computed by PostgreSQL itself, in SQL over
//     the same tables (GROUP BY day, window functions for each visit's first
//     and last pageview), not by this code.
//
// Mutations these kill, among others: accepting a header without
// `event_name`; treating `event_type` 2 or 5 as a pageview; reading shape 2's
// offset as UTC; assuming shape 3 silently; keying Direct vs Shared Link on
// the raw path instead of its bare form; taking the origin from the file's
// first row of a visit rather than its earliest; adding an unspecified
// `utm_source` fallback step to the referrer/Direct/Shared-Link precedence
// (M8-g is two cases only); leaking a UTM tag into `src_source`/`src_medium`/
// `src_campaign` instead of leaving them `''` (M8-g).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { UMAMI_FIXTURE_HEADER, UMAMI_FIXTURE_NAME, umamiFixtureCsv, umamiFixtureFile } from '../../__tests__/fixtures/umami-export'
import type { Clip } from '../../core/cap'
import { RawFolder } from '../../core/fold'
import { SkipLedger } from '../../core/skipped'
import { detectInputKind } from '../../core/zip'
import { ImportError } from '../../errors'
import { runPipeline } from '../../pipeline'
import { SOURCE_META } from '../../source-meta'
import { SOURCE_PARSERS } from '../index'
import type { AcquisitionRow, AggregateRows, DimensionRow } from '../../types'
import {
  UMAMI_ASSUMED_UTC_NOTE,
  UMAMI_COLUMNS,
  landingPath,
  parseUmamiTimestamp,
  umamiOrigin,
  umamiSource,
} from '../umami'
import { UMAMI_MYSQL_QUERY, UMAMI_POSTGRES_QUERY, UMAMI_WEBSITE_ID_PLACEHOLDER } from '../umami-recipe'

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')
const REAL = fixture('umami-published-query.csv')
const REAL_RAW = fixture('umami-published-query-raw-timestamps.csv')

/** A File the customer chose; bytes are copied into a plain ArrayBuffer, as a Blob part must be. */
const file = (content: string | Uint8Array, name = 'umami-export.csv') =>
  new File([typeof content === 'string' ? content : new Uint8Array(content)], name)

async function parse(files: File | File[], timeZone = 'UTC', clip: Clip | null = null) {
  const list = Array.isArray(files) ? files : [files]
  const skipped = new SkipLedger()
  const rows = new RawFolder({ timeZone, clip, skipped })
  const chosen = []
  for (const f of list) chosen.push({ name: f.name, blob: f as Blob, input: await detectInputKind(f) })
  const result = await umamiSource.read(chosen, { rows, skipped, read: {} })
  return { rows: rows.finish(), skipped, ...result }
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

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const byKey = (a: DimensionRow, b: DimensionRow) => cmp(a.date, b.date) || cmp(a.parent, b.parent) || cmp(a.value, b.value)

/** One dimension's rows, in a fixed order, so an expectation can be written in any order. */
function dims(rows: AggregateRows, dimension: string): DimensionRow[] {
  return rows.dimensions.filter((r) => r.dimension === dimension).sort(byKey)
}
const d = (date: string, dimension: string, value: string, visitors: number, visits: number, pageviews: number, parent = '') =>
  ({ date, dimension, parent, value, visitors, visits, pageviews }) as DimensionRow
const expected = (rows: DimensionRow[]) => [...rows].sort(byKey)

function acq(
  date: string,
  referrer: string,
  visitors: number,
  visits: number,
  pageviews: number,
  utm: [string, string, string] | null = null,
): AcquisitionRow {
  return {
    date,
    referrer,
    utm_source: utm ? utm[0] : null,
    utm_medium: utm ? utm[1] : null,
    utm_campaign: utm ? utm[2] : null,
    // M8-g: Umami's src_* are unconditionally '', unlike an aggregate source.
    src_source: '',
    src_medium: '',
    src_campaign: '',
    src_channel_group: '',
    visitors,
    visits,
    pageviews,
  }
}

// ─── The published recipe (M8-a, M8-b, §3.12c amendment 6) ────────────────

/** The aliases a query's SELECT list names, in order: one `… AS <name>` per line. */
function selected(query: string): string[] {
  const list = query.slice(query.indexOf('SELECT') + 'SELECT'.length, query.indexOf('FROM website_event'))
  return list
    .split('\n')
    .map((line) => /\sAS ([a-z_]+),?$/.exec(line.trimEnd())?.[1])
    .filter((name): name is string => name !== undefined)
}

/** A seeded PRNG (mulberry32), so a random test fails the same way every run. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('the published recipe', () => {
  it.each([
    ['PostgreSQL', UMAMI_POSTGRES_QUERY],
    ['MySQL', UMAMI_MYSQL_QUERY],
  ])('%s selects exactly the header the parser accepts, in its order', (_, query) => {
    expect(selected(query)).toEqual([...UMAMI_COLUMNS])
  })

  it('selects event_name, so a v1 export already holds the custom events M12 will read (amendment 6)', () => {
    expect(UMAMI_COLUMNS).toContain('event_name')
    expect(UMAMI_POSTGRES_QUERY).toMatch(/^\s*we\.event_name AS event_name,$/m)
    expect(UMAMI_MYSQL_QUERY).toMatch(/^\s*COALESCE\(we\.event_name, ''\) AS event_name,$/m)
  })

  it('MySQL: every column that can be NULL is an empty string in the file, whatever client exports it', () => {
    // Some clients write NULL into a CSV as the word "NULL" (phpMyAdmin's
    // default): a referrer, tag or city called "NULL". The query decides.
    const notNull = new Set(['created_at', 'session_id', 'visit_id', 'event_type', 'url_path'])
    const lines = UMAMI_MYSQL_QUERY.split('\n')
    for (const column of UMAMI_COLUMNS) {
      const line = lines.find((l) => new RegExp(`\\sAS ${column},?$`).test(l)) as string
      if (notNull.has(column)) expect(line, column).not.toMatch(/COALESCE/)
      else expect(line, column).toMatch(new RegExp(`^\\s*COALESCE\\((we|s)\\.${column}, ''\\) AS ${column},?$`))
    }
  })

  it('writes created_at as UTC with a T and a Z, never the engine default (M8-a)', () => {
    expect(UMAMI_POSTGRES_QUERY).toContain(`to_char(we.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at`)
    expect(UMAMI_MYSQL_QUERY).toContain(`SET time_zone = '+00:00';`)
    expect(UMAMI_MYSQL_QUERY).toContain(`DATE_FORMAT(we.created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at`)
  })

  it('filters on the website id in the database, with the hostname filter offered commented out', () => {
    for (const query of [UMAMI_POSTGRES_QUERY, UMAMI_MYSQL_QUERY]) {
      expect(query).toContain(`WHERE we.website_id = '${UMAMI_WEBSITE_ID_PLACEHOLDER}'`)
      expect(query).toMatch(/^\s*-- AND we\.hostname = 'example\.com'$/m)
      expect(query).toContain('JOIN session s ON s.session_id = we.session_id')
      // Read-only: nothing that writes.
      expect(query).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT)\b/i)
    }
    // PostgreSQL writes to the customer's own terminal: no server file, no superuser.
    expect(UMAMI_POSTGRES_QUERY).toMatch(/\) TO STDOUT WITH \(FORMAT csv, HEADER true\);\n$/)
  })

  it('is what produced the vendored real export: the file starts with its header', () => {
    expect(REAL.split('\n')[0]).toBe(UMAMI_COLUMNS.join(','))
    expect(REAL_RAW.split('\n')[0]).toBe(UMAMI_COLUMNS.join(','))
  })
})

// ─── The header (M8-b) ────────────────────────────────────────────────────

describe('the header check', () => {
  const header = [...UMAMI_COLUMNS]
  const withHeader = (columns: readonly string[]) => `${columns.join(',')}\n`

  it('accepts the published header in any order', async () => {
    const shuffled = [...header].reverse()
    const body = REAL.split('\n')
      .slice(1)
      .filter((l) => l !== '')
      .map((l) => {
        // Re-order each row's fields to match (none of the real rows quote a comma).
        const f = l.split(',')
        return shuffled.map((c) => f[header.indexOf(c as (typeof header)[number])]).join(',')
      })
    const reordered = await parse(file([shuffled.join(','), ...body].join('\n') + '\n'))
    const asPublished = await parse(file(REAL))
    expect(reordered.rows).toEqual(asPublished.rows)
  })

  it.each(header.map((c) => [c]))('refuses a file without %s (missing_columns)', async (column) => {
    const e = await failure(parse(file(withHeader(header.filter((c) => c !== column)))))
    expect(e.code).toBe('wrong_file')
    expect(e.detail).toMatchObject({ reason: 'missing_columns', columns: [column] })
  })

  it("refuses a column the published query does not write, such as the README join's url_query (unexpected_columns)", async () => {
    const e = await failure(parse(file(withHeader([...header, 'url_query']))))
    expect(e.detail).toMatchObject({ reason: 'unexpected_columns', columns: ['url_query'] })
  })

  it('refuses a column named twice (duplicate_columns)', async () => {
    const e = await failure(parse(file(withHeader([...header, 'city']))))
    expect(e.detail).toMatchObject({ reason: 'duplicate_columns', columns: ['city'] })
  })

  it("refuses another tool's file: a Plausible visitors table is the wrong file", async () => {
    const e = await failure(parse(file('date,visitors,pageviews,bounces,visits,visit_duration\n2026-03-01,1,1,0,1,0\n')))
    expect(e.code).toBe('wrong_file')
    expect(e.detail.reason).toBe('missing_columns')
  })

  it('refuses a file with no header, and a header with no rows below it (empty_file, M8-o)', async () => {
    expect((await failure(parse(file('')))).detail).toMatchObject({ reason: 'empty_file' })
    // What the published query writes against a ClickHouse-backed Umami: its
    // Postgres tables hold no events, so the file is the header alone.
    expect((await failure(parse(file(withHeader(header))))).detail).toMatchObject({ reason: 'empty_file' })
  })

  it('refuses a second file: the export is one file', async () => {
    const e = await failure(parse([file(REAL), file(REAL, 'again.csv')]))
    expect(e.detail).toMatchObject({ reason: 'duplicate_file', limit: 1, observed: 2 })
  })
})

// ─── Timestamps (M8-d) ────────────────────────────────────────────────────

describe('created_at', () => {
  it.each([
    // 1. strict: the published queries' shape.
    ['2026-09-22T09:00:00Z', '2026-09-22T09:00:00.000Z', 'strict'],
    ['2024-02-29T23:59:59Z', '2024-02-29T23:59:59.000Z', 'strict'],
    // 2. offset: Postgres's own text, read with its own offset.
    ['2026-09-22 09:00:00+00', '2026-09-22T09:00:00.000Z', 'offset'],
    ['2026-09-22 11:00:00+02', '2026-09-22T09:00:00.000Z', 'offset'],
    ['2026-09-22 04:00:00-05', '2026-09-22T09:00:00.000Z', 'offset'],
    ['2026-09-22 14:30:00+05:30', '2026-09-22T09:00:00.000Z', 'offset'],
    ['2026-09-21 23:30:00-09:30', '2026-09-22T09:00:00.000Z', 'offset'],
    ['2026-09-22 09:00:00.123456+00', '2026-09-22T09:00:00.123Z', 'offset'],
    ['2026-09-22 09:00:00.5+00:00', '2026-09-22T09:00:00.500Z', 'offset'],
    // Across a day boundary: the offset moves the instant to the previous UTC day.
    ['2026-09-22 01:00:00+02', '2026-09-21T23:00:00.000Z', 'offset'],
    // 3. bare: assumed UTC.
    ['2026-09-22 09:00:00', '2026-09-22T09:00:00.000Z', 'bare'],
  ])('%s is %s (%s)', (value, iso, shape) => {
    expect(parseUmamiTimestamp(value)).toEqual({ at: Date.parse(iso), shape })
  })

  it.each([
    '',
    '2026-09-22',
    '2026-09-22T09:00:00',
    '2026-09-22T09:00:00.000Z',
    '2026-09-22T09:00:00+00:00',
    '2026-09-22t09:00:00z',
    '2026-09-22 09:00',
    '2026-09-22 09:00:00 +00',
    '2026-09-22 09:00:00+0',
    '2026-09-22 09:00:00+16',
    '2026-09-22 09:00:00+05:60',
    '2026-09-22 09:00:00+00:00:00',
    '2026-09-22 09:00:00Z',
    ' 2026-09-22T09:00:00Z',
    '2026-09-22T09:00:00Z ',
    '2026-02-30T09:00:00Z',
    '2026-13-01T09:00:00Z',
    '2026-09-22T24:00:00Z',
    '2026-09-22T23:60:00Z',
    '2026-09-22T23:59:60Z',
    '0099-01-01T00:00:00Z',
    '22/09/2026 09:00:00',
    '1758531600',
  ])('%j is bad_timestamp', (value) => {
    expect(parseUmamiTimestamp(value)).toBeNull()
  })

  it('reads every shape back to the instant it was written from, for 5,000 random instants and offsets', () => {
    const rand = prng(7)
    const pad = (n: number, w = 2) => String(n).padStart(w, '0')
    const wall = (ms: number, sep: string) => {
      const t = new Date(ms)
      return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}${sep}${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`
    }
    for (let i = 0; i < 5000; i++) {
      const at = Math.floor((Date.UTC(1990, 0, 1) + rand() * (Date.UTC(2040, 0, 1) - Date.UTC(1990, 0, 1))) / 1000) * 1000
      expect(parseUmamiTimestamp(`${wall(at, 'T')}Z`)).toEqual({ at, shape: 'strict' })
      expect(parseUmamiTimestamp(wall(at, ' '))).toEqual({ at, shape: 'bare' })
      // A real zone offset, −12:00 … +14:45 in quarter hours, written the way Postgres does.
      const minutes = Math.round(rand() * (26.75 * 4)) * 15 - 12 * 60
      const sign = minutes < 0 ? '-' : '+'
      const abs = Math.abs(minutes)
      const zone = `${sign}${pad(Math.floor(abs / 60))}${abs % 60 ? `:${pad(abs % 60)}` : ''}`
      expect(parseUmamiTimestamp(`${wall(at + minutes * 60_000, ' ')}${zone}`)).toEqual({ at, shape: 'offset' })
    }
  })
})

// ─── Where a visit came from (M8-g) ───────────────────────────────────────

describe('the origin of a visit', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    ['/#pricing', '/'],
    ['/?utm_source=x', '/'],
    ['/#', '/'],
    ['/pricing/', '/pricing'],
    ['/pricing//', '/pricing'],
    ['/blog/#top', '/blog'],
    ['#/app', '/'],
    // ingestnorm.TrimTrailingSlash: "//" trims to "", which is not the root.
    ['//', ''],
  ])('the landing path of %j is %j', (path, landing) => {
    expect(landingPath(path)).toBe(landing)
  })

  it.each([
    // The referrer host wins.
    ['google.com', '/pricing', 'google.com'],
    ['google.com', '/', 'google.com'],
    // No referrer: Direct on the root, Shared Link anywhere else. M8-g is two
    // cases only — a `utm_source` tag is not a third one; the fold-level test
    // below proves a tagged no-referrer row still resolves this way.
    ['', '/', 'Direct'],
    ['', '/#features', 'Direct'],
    ['', '', 'Direct'],
    ['', '/pricing', 'Shared Link'],
    ['', '/pricing/', 'Shared Link'],
    ['', '//', 'Shared Link'],
  ])('referrer %j, landing %j: %s', (referrer, path, origin) => {
    expect(umamiOrigin(referrer, path)).toBe(origin)
  })

  it('matches an independent re-implementation of M8-g\'s rule on 2,000 random visits, and never lets a UTM tag reach referrer or src_*', async () => {
    // The M2 red team's differential discipline: generate visits whose rows
    // are shuffled in the file, fold them through the parser, and rebuild the
    // acquisition table from first principles (each visit's EARLIEST
    // pageview; M8-g's rule: referrer, else Direct/Shared Link by the bare
    // path — a `utm_source` tag is generated on many rows precisely so a
    // regression that lets it become a third fallback, or leak into
    // `src_source`/`src_medium`/`src_campaign`, is caught here too).
    const rand = prng(42)
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
    const PATHS = ['/', '', '/#a', '/?q=1', '//', '/a', '/a/', '/b#x', '#/r', '/c?d', '///']
    const REFS = ['', '', '', 'google.com', 't.co', 'news.example']
    const TAGS = ['', '', 'newsletter', 'google']
    const MEDIUMS = ['', 'email', 'cpc']
    type R = { at: number; session: string; visit: string; path: string; ref: string; tag: string; medium: string }
    const rows: R[] = []
    for (let v = 0; v < 2000; v++) {
      const n = 1 + Math.floor(rand() * 4)
      const session = `s${Math.floor(rand() * 300)}`
      const start = Date.UTC(2026, 2, 1) + Math.floor(rand() * 3 * 86_400) * 1000
      for (let k = 0; k < n; k++) {
        // Distinct instants within a visit, so "earliest" is never a tie.
        rows.push({ at: start + k * 60_000 + v, session, visit: `v${v}`, path: pick(PATHS), ref: pick(REFS), tag: pick(TAGS), medium: pick(MEDIUMS) })
      }
    }
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[rows[i], rows[j]] = [rows[j], rows[i]]
    }
    const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const csv = [UMAMI_COLUMNS.join(',')]
    for (const r of rows) {
      const values: Record<string, string> = {
        created_at: new Date(r.at).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        session_id: r.session,
        visit_id: r.visit,
        event_type: '1',
        event_name: '',
        hostname: 'example.com',
        url_path: r.path,
        referrer_domain: r.ref,
        utm_source: r.tag,
        utm_medium: r.medium,
        utm_campaign: '',
        browser: 'chrome',
        os: 'Linux',
        device: 'desktop',
        screen: '1920x1080',
        language: 'en-US',
        country: 'BE',
        region: 'BE-VLG',
        city: 'Gent',
      }
      csv.push(UMAMI_COLUMNS.map((c) => q(values[c])).join(','))
    }
    // The file carries whole seconds; a visit's rows are a minute apart, so
    // its earliest pageview is never a tie.
    const { rows: out } = await parse(file(csv.join('\n') + '\n'))

    const first = new Map<string, R>()
    const pageviews = new Map<string, number>()
    for (const r of rows) {
      const f = first.get(r.visit)
      if (!f || Math.floor(r.at / 1000) < Math.floor(f.at / 1000)) first.set(r.visit, r)
      pageviews.set(r.visit, (pageviews.get(r.visit) ?? 0) + 1)
    }
    // src_* are unconditionally '' for Umami (M8-g), so the acquisition key
    // is date+referrer only: visits with different tags/mediums but the same
    // referrer on the same day MERGE into one row.
    const want = new Map<string, { date: string; referrer: string; sessions: Set<string>; visits: number; pageviews: number }>()
    for (const [visit, r] of first) {
      const bare = r.path.split(/[?#]/, 1)[0]
      const referrer = r.ref || (bare === '' || bare === '/' ? 'Direct' : 'Shared Link')
      const date = new Date(Math.floor(r.at / 1000) * 1000).toISOString().slice(0, 10)
      const k = JSON.stringify([date, referrer])
      let w = want.get(k)
      if (!w) want.set(k, (w = { date, referrer, sessions: new Set(), visits: 0, pageviews: 0 }))
      w.sessions.add(r.session)
      w.visits++
      w.pageviews += pageviews.get(visit) as number
    }
    const got = out.acquisition.map((a) => ({
      date: a.date,
      referrer: a.referrer,
      visitors: a.visitors,
      visits: a.visits,
      pageviews: a.pageviews,
    }))
    const exp = [...want.values()].map((w) => ({ date: w.date, referrer: w.referrer, visitors: w.sessions.size, visits: w.visits, pageviews: w.pageviews }))
    const order = (a: { date: string; referrer: string }, b: typeof a) => cmp(a.date, b.date) || cmp(a.referrer, b.referrer)
    expect(got.sort(order)).toEqual(exp.sort(order))
    // Every src_* stayed '' throughout, on every row, not just the merged ones.
    for (const a of out.acquisition) {
      expect(a.src_source).toBe('')
      expect(a.src_medium).toBe('')
      expect(a.src_campaign).toBe('')
    }
    // Direct and Shared Link were both exercised, and a tagged no-referrer
    // visit never turned its tag into a referrer label.
    const labels = new Set(got.map((g) => g.referrer))
    for (const l of ['Direct', 'Shared Link', 'google.com']) expect(labels).toContain(l)
    for (const tag of ['newsletter', 'google']) expect(labels).not.toContain(tag)
  })
})

// ─── The synthetic export (gate 3), folded by hand ────────────────────────

describe('the synthetic export', () => {
  it('uses the spec\'s own column order, not the published query\'s', () => {
    expect(UMAMI_FIXTURE_HEADER.split(',')).not.toEqual([...UMAMI_COLUMNS])
    expect([...UMAMI_FIXTURE_HEADER.split(',')].sort()).toEqual([...UMAMI_COLUMNS].sort())
  })

  it('folds to exactly the expected daily rows, in the site\'s zone', async () => {
    const utc = await parse(umamiFixtureFile())
    expect(utc.rows.daily).toEqual([
      { date: '2026-03-01', visitors: 2, visits: 3, pageviews: 5, src_bounces: null, src_engagement_seconds: null },
      { date: '2026-03-02', visitors: 5, visits: 5, pageviews: 7, src_bounces: null, src_engagement_seconds: null },
      { date: '2026-03-03', visitors: 1, visits: 1, pageviews: 1, src_bounces: null, src_engagement_seconds: null },
    ])
    // New York is UTC−5 in early March: the 03-02 rows before 05:00Z move back a day.
    const ny = await parse(umamiFixtureFile(), 'America/New_York')
    expect(ny.rows.daily).toEqual([
      { date: '2026-03-01', visitors: 2, visits: 3, pageviews: 6, src_bounces: null, src_engagement_seconds: null },
      { date: '2026-03-02', visitors: 4, visits: 4, pageviews: 6, src_bounces: null, src_engagement_seconds: null },
      { date: '2026-03-03', visitors: 1, visits: 1, pageviews: 1, src_bounces: null, src_engagement_seconds: null },
    ])
    // No monthly rows, ever (M8-h).
    expect(utc.rows.monthly).toEqual([])
  })

  it('folds pages, entrances and exits', async () => {
    const { rows } = await parse(umamiFixtureFile())
    expect(dims(rows, 'page')).toEqual(
      expected([
        d('2026-03-01', 'page', '/', 1, 1, 1),
        d('2026-03-01', 'page', '/pricing', 1, 1, 1),
        d('2026-03-01', 'page', '/blog/', 1, 1, 1),
        d('2026-03-01', 'page', '/blog/post', 1, 1, 1),
        d('2026-03-01', 'page', '/#features', 1, 1, 1),
        d('2026-03-02', 'page', '/features', 1, 1, 1),
        d('2026-03-02', 'page', '/', 3, 3, 3),
        d('2026-03-02', 'page', '/pricing', 1, 1, 1),
        d('2026-03-02', 'page', '/about', 1, 1, 1),
        d('2026-03-02', 'page', '/docs/', 1, 1, 1),
        d('2026-03-03', 'page', '/', 1, 1, 1),
      ]),
    )
    // A visit's entrance is its EARLIEST pageview (D1's is the file's second
    // row), counted on that pageview's day with the visit's pageviews.
    expect(dims(rows, 'entry_page')).toEqual(
      expected([
        d('2026-03-01', 'entry_page', '/', 1, 1, 2),
        d('2026-03-01', 'entry_page', '/blog/', 1, 1, 2),
        d('2026-03-01', 'entry_page', '/#features', 1, 1, 2),
        d('2026-03-02', 'entry_page', '/', 3, 3, 5),
        d('2026-03-02', 'entry_page', '/docs/', 1, 1, 1),
        d('2026-03-03', 'entry_page', '/', 1, 1, 1),
      ]),
    )
    // B1 crosses midnight: its exit is on 03-02.
    expect(dims(rows, 'exit_page')).toEqual(
      expected([
        d('2026-03-01', 'exit_page', '/pricing', 1, 1, 2),
        d('2026-03-01', 'exit_page', '/blog/post', 1, 1, 2),
        d('2026-03-02', 'exit_page', '/features', 1, 1, 2),
        d('2026-03-02', 'exit_page', '/pricing', 1, 1, 2),
        d('2026-03-02', 'exit_page', '/about', 1, 1, 2),
        d('2026-03-02', 'exit_page', '/', 1, 1, 1),
        d('2026-03-02', 'exit_page', '/docs/', 1, 1, 1),
        d('2026-03-03', 'exit_page', '/', 1, 1, 1),
      ]),
    )
  })

  it('folds every session dimension as the file names it, blanks included', async () => {
    const { rows } = await parse(umamiFixtureFile())
    expect(dims(rows, 'country')).toEqual(
      expected([
        d('2026-03-01', 'country', 'US', 1, 2, 4),
        d('2026-03-01', 'country', 'GB', 1, 1, 1),
        d('2026-03-02', 'country', 'GB', 1, 1, 1),
        d('2026-03-02', 'country', 'SE', 1, 1, 2),
        d('2026-03-02', 'country', 'US', 1, 1, 2),
        d('2026-03-02', 'country', 'BR', 1, 1, 1),
        d('2026-03-02', 'country', 'JP', 1, 1, 1),
        d('2026-03-03', 'country', 'DE', 1, 1, 1),
      ]),
    )
    // Region and city are sent unconditionally, as Umami wrote them, under
    // their country (M8-l); a blank one is sent blank (the server's Unknown).
    expect(dims(rows, 'region')).toEqual(
      expected([
        d('2026-03-01', 'region', 'US-OH', 1, 2, 4, 'US'),
        d('2026-03-01', 'region', 'GB-ENG', 1, 1, 1, 'GB'),
        d('2026-03-02', 'region', 'GB-ENG', 1, 1, 1, 'GB'),
        d('2026-03-02', 'region', 'SE-S', 1, 1, 2, 'SE'),
        d('2026-03-02', 'region', 'US-DC', 1, 1, 2, 'US'),
        d('2026-03-02', 'region', 'BR-SP', 1, 1, 1, 'BR'),
        d('2026-03-02', 'region', 'JP-13', 1, 1, 1, 'JP'),
        d('2026-03-03', 'region', '', 1, 1, 1, 'DE'),
      ]),
    )
    expect(dims(rows, 'city')).toEqual(
      expected([
        d('2026-03-01', 'city', 'Cleveland', 1, 2, 4, 'US'),
        d('2026-03-01', 'city', 'East Finchley', 1, 1, 1, 'GB'),
        d('2026-03-02', 'city', 'East Finchley', 1, 1, 1, 'GB'),
        d('2026-03-02', 'city', 'Säffle', 1, 1, 2, 'SE'),
        d('2026-03-02', 'city', 'Washington, D.C.', 1, 1, 2, 'US'),
        d('2026-03-02', 'city', 'São Paulo', 1, 1, 1, 'BR'),
        d('2026-03-02', 'city', 'Koishikawa', 1, 1, 1, 'JP'),
        d('2026-03-03', 'city', '', 1, 1, 1, 'DE'),
      ]),
    )
    // Device labels travel as Umami wrote them ("laptop" included): the
    // server's vocabulary maps them (M8-k), never the browser.
    expect(dims(rows, 'device')).toEqual(
      expected([
        d('2026-03-01', 'device', 'desktop', 1, 2, 4),
        d('2026-03-01', 'device', 'mobile', 1, 1, 1),
        d('2026-03-02', 'device', 'mobile', 2, 2, 2),
        d('2026-03-02', 'device', 'desktop', 1, 1, 2),
        d('2026-03-02', 'device', 'laptop', 2, 2, 3),
        d('2026-03-03', 'device', 'laptop', 1, 1, 1),
      ]),
    )
    expect(dims(rows, 'browser')).toEqual(
      expected([
        d('2026-03-01', 'browser', 'chrome', 1, 2, 4),
        d('2026-03-01', 'browser', 'ios', 1, 1, 1),
        d('2026-03-02', 'browser', 'ios', 1, 1, 1),
        d('2026-03-02', 'browser', 'firefox', 1, 1, 2),
        d('2026-03-02', 'browser', 'safari', 1, 1, 2),
        d('2026-03-02', 'browser', 'edge-chromium', 1, 1, 1),
        d('2026-03-02', 'browser', 'samsung', 1, 1, 1),
        d('2026-03-03', 'browser', 'chrome', 1, 1, 1),
      ]),
    )
    expect(dims(rows, 'os')).toEqual(
      expected([
        d('2026-03-01', 'os', 'Windows 10', 1, 2, 4),
        d('2026-03-01', 'os', 'iOS', 1, 1, 1),
        d('2026-03-02', 'os', 'iOS', 1, 1, 1),
        d('2026-03-02', 'os', 'Linux', 1, 1, 2),
        d('2026-03-02', 'os', 'Mac OS', 1, 1, 2),
        d('2026-03-02', 'os', 'Windows 10', 1, 1, 1),
        d('2026-03-02', 'os', 'Android OS', 1, 1, 1),
        d('2026-03-03', 'os', 'Chrome OS', 1, 1, 1),
      ]),
    )
    expect(dims(rows, 'language')).toEqual(
      expected([
        d('2026-03-01', 'language', 'en-US', 1, 2, 4),
        d('2026-03-01', 'language', 'de-DE', 1, 1, 1),
        d('2026-03-02', 'language', 'de-DE', 1, 1, 1),
        d('2026-03-02', 'language', 'en-GB', 1, 1, 2),
        d('2026-03-02', 'language', 'fr-FR', 1, 1, 2),
        d('2026-03-02', 'language', 'es-ES', 1, 1, 1),
        d('2026-03-02', 'language', 'en-US', 1, 1, 1),
        d('2026-03-03', 'language', 'de-DE', 1, 1, 1),
      ]),
    )
    expect(dims(rows, 'screen_resolution')).toEqual(
      expected([
        d('2026-03-01', 'screen_resolution', '2560x1440', 1, 2, 4),
        d('2026-03-01', 'screen_resolution', '375x812', 1, 1, 1),
        d('2026-03-02', 'screen_resolution', '375x812', 1, 1, 1),
        d('2026-03-02', 'screen_resolution', '1920x1080', 2, 2, 3),
        d('2026-03-02', 'screen_resolution', '1440x900', 1, 1, 2),
        d('2026-03-02', 'screen_resolution', '384x854', 1, 1, 1),
        d('2026-03-03', 'screen_resolution', '1920x1080', 1, 1, 1),
      ]),
    )
    // Nothing else: no hostname or event name ever becomes a dimension.
    expect(new Set(rows.dimensions.map((r) => r.dimension))).toEqual(
      new Set(['page', 'entry_page', 'exit_page', 'country', 'region', 'city', 'device', 'browser', 'os', 'language', 'screen_resolution']),
    )
  })

  it('folds acquisition from each visit\'s earliest pageview, per M8-g\'s rule', async () => {
    const { rows } = await parse(umamiFixtureFile())
    expect(rows.acquisition).toEqual([
      acq('2026-03-01', 'Direct', 1, 1, 2),
      acq('2026-03-01', 'Shared Link', 1, 1, 2),
      acq('2026-03-01', 'google.com', 1, 1, 2),
      // A tagged link with NO referrer is still Direct/Shared Link by its
      // landing page (M8-g): the tag never becomes the referrer.
      acq('2026-03-02', 'Direct', 1, 1, 2, ['newsletter', 'email', 'spring']),
      // Two visits from google.com on one day, differently tagged: src_* are
      // unconditionally '' for Umami, so they MERGE into one row, keeping
      // whichever visit's own utm_* is earliest in the file (E, not F).
      acq('2026-03-02', 'google.com', 2, 2, 2, ['google', 'cpc', 'spring']),
      // D1: its file-first row is a Shared Link landing, its EARLIEST is this.
      acq('2026-03-02', 'news.ycombinator.com', 1, 1, 2, ['hn', 'social', 'launch']),
      acq('2026-03-03', 'Direct', 1, 1, 1),
    ])
  })

  it('counts exactly the rows it skipped, by reason, with their lines and nothing else', async () => {
    const { skipped, notes, ignored } = await parse(umamiFixtureFile())
    expect(skipped.toCounts()).toEqual({ bad_timestamp: 2, missing_field: 3, not_a_pageview: 3 })
    expect(skipped.toSamples()).toEqual({
      bad_timestamp: [
        { file: UMAMI_FIXTURE_NAME, line: 17 },
        { file: UMAMI_FIXTURE_NAME, line: 18 },
      ],
      missing_field: [
        { file: UMAMI_FIXTURE_NAME, line: 19 },
        { file: UMAMI_FIXTURE_NAME, line: 20 },
        { file: UMAMI_FIXTURE_NAME, line: 21 },
      ],
      not_a_pageview: [
        { file: UMAMI_FIXTURE_NAME, line: 4 },
        { file: UMAMI_FIXTURE_NAME, line: 15 },
        { file: UMAMI_FIXTURE_NAME, line: 16 },
      ],
    })
    // The one row read under shape 3 (no zone, assumed UTC) is counted, never silent.
    expect(notes).toEqual({ [UMAMI_ASSUMED_UTC_NOTE]: '1' })
    expect(ignored).toEqual([])
  })

  it('clips to the window like every raw source: a day outside it is skipped, never sent', async () => {
    const clip: Clip = { from: '2026-03-02', through: '2026-03-02', before: 'outside_history_window', after: 'pulse_measured' }
    const { rows, skipped } = await parse(umamiFixtureFile(), 'UTC', clip)
    expect(rows.daily.map((r) => r.date)).toEqual(['2026-03-02'])
    // 5 pageviews on 03-01, 1 on 03-03, each counted under the window's reason.
    expect(skipped.toCounts()).toMatchObject({ outside_history_window: 5, pulse_measured: 1 })
  })
})

// ─── Event types (M8-f) ───────────────────────────────────────────────────

describe('event_type', () => {
  const one = (eventType: string) =>
    `${UMAMI_COLUMNS.join(',')}\n` +
    UMAMI_COLUMNS.map((c) =>
      c === 'created_at' ? '2026-03-01T09:00:00Z' : c === 'event_type' ? eventType : c === 'url_path' ? '/' : c.endsWith('_id') ? 'x' : '',
    ).join(',') +
    '\n' +
    // One pageview, so the plan is not empty.
    UMAMI_COLUMNS.map((c) =>
      c === 'created_at' ? '2026-03-01T10:00:00Z' : c === 'event_type' ? '1' : c === 'url_path' ? '/' : c.endsWith('_id') ? 'y' : '',
    ).join(',') +
    '\n'

  it.each(['2', '3', '4', '5', '0', '6', '01', ' 1', '1.0', 'pageview'])('%j is not a pageview', async (t) => {
    const { skipped, rows } = await parse(file(one(t)))
    expect(skipped.toCounts()).toEqual({ not_a_pageview: 1 })
    expect(rows.daily).toEqual([{ date: '2026-03-01', visitors: 1, visits: 1, pageviews: 1, src_bounces: null, src_engagement_seconds: null }])
  })

  it('an empty one is a malformed row (missing_field)', async () => {
    expect((await parse(file(one('')))).skipped.toCounts()).toEqual({ missing_field: 1 })
  })
})

// ─── The file's three shapes (M8-c) ───────────────────────────────────────

describe('plain, gzip and ZIP', () => {
  it('reads a gzipped export exactly as the plain one', async () => {
    const plain = await parse(file(REAL))
    const gz = await parse(file(gzipSync(strToU8(REAL)), 'umami-export.csv.gz'))
    expect(gz.rows).toEqual(plain.rows)
    expect(gz.skipped.toCounts()).toEqual(plain.skipped.toCounts())
  })

  it("reads a ZIP's website_event.csv, and names every other entry as ignored, never an error", async () => {
    const zip = zipSync({
      'umami-export/session.csv': strToU8('session_id,browser\n'),
      'umami-export/website_event.csv': strToU8(REAL),
      'umami-export/session_data.csv': strToU8('x\n'),
      'umami-export/event_data.csv': strToU8('y\n'),
      '__MACOSX/umami-export/._website_event.csv': strToU8('litter'),
      'umami-export/.DS_Store': strToU8('litter'),
    })
    const plain = await parse(file(REAL))
    const zipped = await parse(file(zip, 'umami-export.zip'))
    expect(zipped.rows).toEqual(plain.rows)
    expect(zipped.ignored).toEqual(['session.csv', 'session_data.csv', 'event_data.csv'])
    // Skip samples name the entry the row came from.
    expect(zipped.skipped.toSamples().not_a_pageview[0].file).toBe('website_event.csv')
  })

  it.each(['website_event.csv', 'website_event_2026-09-01_2026-09-30.csv', 'website_event_export.csv'])(
    'finds the event table named %s',
    async (name) => {
      const zipped = await parse(file(zipSync({ [name]: strToU8(REAL) }), 'x.zip'))
      expect(zipped.rows.daily.length).toBe(6)
    },
  )

  it('refuses an archive with no event table (missing_file) or two of them (duplicate_file)', async () => {
    const none = await failure(parse(file(zipSync({ 'session.csv': strToU8('a\n'), 'events.csv': strToU8('b\n') }), 'x.zip')))
    expect(none.detail).toMatchObject({ reason: 'missing_file', files: ['website_event.csv'] })
    const two = await failure(
      parse(file(zipSync({ 'website_event.csv': strToU8(REAL), 'a/website_event_2.csv': strToU8(REAL) }), 'x.zip')),
    )
    expect(two.detail).toMatchObject({ reason: 'duplicate_file', files: ['website_event.csv', 'website_event_2.csv'] })
  })

  it("refuses Umami's own dashboard download (seven range totals, no event table)", async () => {
    const names = ['events.csv', 'pages.csv', 'referrers.csv', 'browsers.csv', 'os.csv', 'devices.csv', 'countries.csv']
    const zip = zipSync(Object.fromEntries(names.map((n) => [n, strToU8('x,y\nchrome,6\n')])))
    const e = await failure(parse(file(zip, 'export.zip')))
    expect(e.detail).toMatchObject({ reason: 'missing_file' })
  })
})

// ─── The real export ──────────────────────────────────────────────────────

describe('the real self-hosted export', () => {
  it('folds to the daily rows PostgreSQL computed, in UTC and in Tokyo', async () => {
    const day = (date: string, pageviews: number, visitors: number, visits: number) => ({
      date,
      visitors,
      visits,
      pageviews,
      src_bounces: null,
      src_engagement_seconds: null,
    })
    expect((await parse(file(REAL))).rows.daily).toEqual([
      day('2026-09-22', 3, 1, 1),
      day('2026-09-23', 3, 2, 2),
      day('2026-09-24', 5, 2, 2),
      day('2026-09-25', 5, 3, 3),
      day('2026-09-26', 5, 3, 3),
      day('2026-09-27', 9, 6, 6),
    ])
    expect((await parse(file(REAL), 'Asia/Tokyo')).rows.daily).toEqual([
      day('2026-09-22', 3, 1, 1),
      day('2026-09-23', 2, 1, 1),
      day('2026-09-24', 3, 2, 2),
      day('2026-09-25', 6, 3, 3),
      day('2026-09-26', 5, 2, 2),
      day('2026-09-27', 9, 6, 6),
      day('2026-09-28', 2, 2, 2),
    ])
  })

  it('skips exactly the four custom events and the one performance event, and nothing else', async () => {
    const { skipped, notes } = await parse(file(REAL))
    expect(skipped.toCounts()).toEqual({ not_a_pageview: 5 })
    expect(skipped.toSamples().not_a_pageview.map((s) => s.line)).toEqual([26, 28, 30, 33, 36])
    expect(notes).toEqual({})
  })

  it('folds acquisition to what PostgreSQL computed from each visit\'s first pageview', async () => {
    const { rows } = await parse(file(REAL))
    expect(rows.acquisition).toEqual([
      acq('2026-09-22', 'google.com', 1, 1, 3),
      acq('2026-09-23', 'Shared Link', 1, 1, 2),
      acq('2026-09-23', 't.co', 1, 1, 1),
      acq('2026-09-24', 'Shared Link', 1, 1, 2),
      acq('2026-09-24', 'bing.com', 1, 1, 3),
      // A tagged link with NO referrer_domain: Direct, since it lands on the
      // root (M8-g) — the real export's own newsletter visit.
      acq('2026-09-25', 'Direct', 1, 1, 2, ['newsletter', 'email', 'september-launch']),
      acq('2026-09-25', 'duckduckgo.com', 1, 1, 2),
      acq('2026-09-25', 'facebook.com', 1, 1, 1),
      acq('2026-09-26', 'Shared Link', 2, 2, 4),
      acq('2026-09-26', 'news.ycombinator.com', 1, 1, 1, ['twitter', 'social', 'launch-week']),
      acq('2026-09-27', 'Direct', 2, 2, 2),
      acq('2026-09-27', 'Shared Link', 1, 1, 1),
      acq('2026-09-27', 'facebook.com', 1, 1, 1),
      acq('2026-09-27', 'google.com', 2, 2, 5),
    ])
  })

  it('folds entrances, exits, regions and devices to what PostgreSQL computed', async () => {
    const { rows } = await parse(file(REAL))
    expect(dims(rows, 'entry_page')).toEqual(
      expected([
        d('2026-09-22', 'entry_page', '/', 1, 1, 3),
        d('2026-09-23', 'entry_page', '/', 1, 1, 1),
        d('2026-09-23', 'entry_page', '/blog/', 1, 1, 2),
        d('2026-09-24', 'entry_page', '/', 1, 1, 3),
        d('2026-09-24', 'entry_page', '/features', 1, 1, 2),
        d('2026-09-25', 'entry_page', '/', 3, 3, 5),
        d('2026-09-26', 'entry_page', '/about', 1, 1, 1),
        d('2026-09-26', 'entry_page', '/blog/', 1, 1, 3),
        d('2026-09-26', 'entry_page', '/features', 1, 1, 1),
        d('2026-09-27', 'entry_page', '/', 4, 4, 7),
        d('2026-09-27', 'entry_page', '/account', 1, 1, 1),
        d('2026-09-27', 'entry_page', '/contact', 1, 1, 1),
      ]),
    )
    expect(dims(rows, 'exit_page')).toEqual(
      expected([
        d('2026-09-22', 'exit_page', '/contact', 1, 1, 3),
        d('2026-09-23', 'exit_page', '/', 1, 1, 1),
        d('2026-09-23', 'exit_page', '/blog/post-one', 1, 1, 2),
        d('2026-09-24', 'exit_page', '/about/', 1, 1, 3),
        d('2026-09-24', 'exit_page', '/pricing/', 1, 1, 2),
        d('2026-09-25', 'exit_page', '/', 1, 1, 1),
        d('2026-09-25', 'exit_page', '/features', 1, 1, 2),
        d('2026-09-25', 'exit_page', '/pricing/', 1, 1, 2),
        d('2026-09-26', 'exit_page', '/about', 1, 1, 1),
        d('2026-09-26', 'exit_page', '/contact', 1, 1, 3),
        d('2026-09-26', 'exit_page', '/features', 1, 1, 1),
        d('2026-09-27', 'exit_page', '/', 2, 2, 2),
        d('2026-09-27', 'exit_page', '/account', 1, 1, 1),
        d('2026-09-27', 'exit_page', '/blog/', 1, 1, 2),
        d('2026-09-27', 'exit_page', '/contact', 1, 1, 1),
        d('2026-09-27', 'exit_page', '/pricing/', 1, 1, 3),
      ]),
    )
    // Two sessions resolved a country only: their region and city are blank
    // in the file, and sent blank.
    expect(dims(rows, 'region')).toEqual(
      expected([
        d('2026-09-22', 'region', 'US-OH', 1, 1, 3, 'US'),
        d('2026-09-23', 'region', 'GB-ENG', 1, 1, 1, 'GB'),
        d('2026-09-23', 'region', 'US-OH', 1, 1, 2, 'US'),
        d('2026-09-24', 'region', '', 1, 1, 2, 'DE'),
        d('2026-09-24', 'region', 'JP-13', 1, 1, 3, 'JP'),
        d('2026-09-25', 'region', 'AU-VIC', 1, 1, 1, 'AU'),
        d('2026-09-25', 'region', 'BR-SP', 1, 1, 2, 'BR'),
        d('2026-09-25', 'region', 'SE-S', 1, 1, 2, 'SE'),
        d('2026-09-26', 'region', 'CA-ON', 1, 1, 1, 'CA'),
        d('2026-09-26', 'region', '', 1, 1, 3, 'US'),
        d('2026-09-26', 'region', 'US-WA', 1, 1, 1, 'US'),
        d('2026-09-27', 'region', 'AU-VIC', 1, 1, 1, 'AU'),
        d('2026-09-27', 'region', '', 1, 1, 1, 'DE'),
        d('2026-09-27', 'region', 'GB-ENG', 1, 1, 3, 'GB'),
        d('2026-09-27', 'region', 'NP-P3', 1, 1, 1, 'NP'),
        d('2026-09-27', 'region', 'US-OH', 2, 2, 3, 'US'),
      ]),
    )
    expect(dims(rows, 'device')).toEqual(
      expected([
        d('2026-09-22', 'device', 'desktop', 1, 1, 3),
        d('2026-09-23', 'device', 'desktop', 1, 1, 2),
        d('2026-09-23', 'device', 'mobile', 1, 1, 1),
        d('2026-09-24', 'device', 'mobile', 1, 1, 3),
        d('2026-09-24', 'device', 'tablet', 1, 1, 2),
        d('2026-09-25', 'device', 'desktop', 1, 1, 2),
        d('2026-09-25', 'device', 'laptop', 1, 1, 1),
        d('2026-09-25', 'device', 'mobile', 1, 1, 2),
        d('2026-09-26', 'device', 'laptop', 2, 2, 4),
        d('2026-09-26', 'device', 'tablet', 1, 1, 1),
        d('2026-09-27', 'device', 'desktop', 3, 3, 5),
        d('2026-09-27', 'device', 'laptop', 2, 2, 2),
        d('2026-09-27', 'device', 'mobile', 1, 1, 2),
      ]),
    )
  })

  it("reads the raw `\\copy` timestamps (`2026-09-22 09:00:00+00`) to the same plan, byte for byte", async () => {
    expect(REAL_RAW).toContain('\n2026-09-22 09:00:00+00,')
    const published = await runPipeline({ source: 'umami', files: [file(REAL)], clip: null, timeZone: 'Europe/Brussels' })
    const raw = await runPipeline({ source: 'umami', files: [file(REAL_RAW)], clip: null, timeZone: 'Europe/Brussels' })
    expect(raw.summary.fingerprint).toBe(published.summary.fingerprint)
    expect(raw.parts.map((p) => p.rowsJson)).toEqual(published.parts.map((p) => p.rowsJson))
    // Shape 2 carries its offset: nothing was assumed.
    expect(raw.summary.notes).toEqual({})
  })
})

// ─── Registration (M8 §7) ─────────────────────────────────────────────────

describe('registration', () => {
  it('is an upload_raw source with real visits, reading plain, gzip and ZIP, one file', () => {
    expect(SOURCE_META.umami).toEqual({ kind: 'upload_raw', visitsAreVisitors: false, accepts: ['plain', 'gzip', 'zip'], fileCount: 'single' })
    expect(SOURCE_PARSERS.umami).toBe(umamiSource)
    expect(umamiSource.kind).toBe('upload_raw')
  })

  it('plans the real export end to end: raw kind, real visits, the browser skips, no monthly rows', async () => {
    const { summary, parts } = await runPipeline({ source: 'umami', files: [file(REAL)], clip: null, timeZone: 'UTC' })
    expect(summary).toMatchObject({
      source: 'umami',
      kind: 'upload_raw',
      visits_are_visitors: false,
      range_start: '2026-09-22',
      range_end: '2026-09-27',
      skipped: { not_a_pageview: 5 },
      ignored_files: [],
      notes: {},
    })
    expect(summary.totals).toMatchObject({ pageviews: 30, rows: { daily: 6, monthly: 0 } })
    for (const p of parts) expect(JSON.parse(p.rowsJson).monthly ?? []).toEqual([])
  })

  it("the synthetic export's plan names the rows it read as UTC", async () => {
    const { summary } = await runPipeline({ source: 'umami', files: [umamiFixtureFile()], clip: null, timeZone: 'UTC' })
    expect(summary.notes).toEqual({ [UMAMI_ASSUMED_UTC_NOTE]: '1' })
    expect(umamiFixtureCsv().startsWith(UMAMI_FIXTURE_HEADER)).toBe(true)
  })
})

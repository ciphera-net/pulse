// A SYNTHETIC Fathom Custom Export: the seven CSVs of the recipe (design
// §3.12m7, M7-c), built from the headers the spec names. No real Fathom export
// exists yet (it is owner-held, §3.12m7 §5), so this is best evidence, not a
// measured shape: the site-totals file's visitor-count column in particular is
// `visitors` or `uniques` and nothing yet says which, so the fixture writes
// either, or both (`FathomFixtureOptions.totalsVisitors`).
//
// Small, but it touches every mapping rule: a path on two hostnames, a
// Country+Region+City export with blank places, two referrer rows that share
// a client key (different utm_content and referrer_pathname), quoting, a UTF-8
// path, a rate-valued metric, one row per skip reason, and one breakdown row
// dated outside the totals file's range.
//
// Files are named the way a person might save them; the parser never reads a
// name to decide anything, and the tests prove it by renaming and reordering.

import { addDays, dayNumber } from '../../core/dates'
import type { FathomRole } from '../../sources/fathom'

const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

function csv(columns: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const lines = [columns.join(',')]
  for (const r of rows) lines.push(r.map((v) => q(String(v))).join(','))
  return lines.join('\n') + '\n'
}

export const FATHOM_FIXTURE_RANGE = { from: '2026-03-01', through: '2026-03-03' } as const

/** The columns each file is written with, in order. The totals' visitor column is filled per `totalsVisitors`. */
export const FATHOM_FIXTURE_COLUMNS: Readonly<Record<FathomRole, readonly string[]>> = {
  totals: ['datetime', '<visitors>', 'pageviews', 'bounce_rate', 'avg_time_on_site'],
  page: ['datetime', 'hostname', 'pathname', 'pageviews', 'uniques'],
  locations: ['datetime', 'country_code', 'state', 'city', 'uniques', 'pageviews'],
  device: ['datetime', 'device_type', 'uniques', 'pageviews'],
  browser: ['datetime', 'browser', 'uniques', 'pageviews'],
  os: ['datetime', 'operating_system', 'uniques', 'pageviews'],
  acquisition: [
    'datetime',
    'referrer_hostname',
    'referrer_pathname',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'uniques',
    'pageviews',
  ],
}

/** The name each file is saved under. Nothing reads it but the skip samples. */
export const FATHOM_FIXTURE_NAMES: Readonly<Record<FathomRole, string>> = {
  totals: 'site-totals.csv',
  page: 'pages.csv',
  locations: 'locations.csv',
  device: 'devices.csv',
  browser: 'browsers.csv',
  os: 'operating-systems.csv',
  acquisition: 'referrers.csv',
}

/** Rows in column order, per file. Line numbers in the comments are the CSV lines (header = 1). */
export const FATHOM_FIXTURE_ROWS: Readonly<Record<FathomRole, readonly (readonly (string | number)[])[]>> = {
  totals: [
    // datetime, <visitors>, pageviews, bounce_rate, avg_time_on_site
    ['2026-03-01 00:00:00', 10, 30, 40, 120], // 2: whole-number metrics are kept as the file has them
    ['2026-03-02 00:00:00', 20, 50, '0.45', '95.5'], // 3: a rate and a fractional average → null, the row is kept
    ['2026-03-03 00:00:00', 5, 9, '', ''], // 4: metrics not reported → null, never 0
    ['2026-03-32 00:00:00', 1, 1, 0, 0], // 5: bad_timestamp
  ],
  page: [
    // datetime, hostname, pathname, pageviews, uniques
    ['2026-03-01 00:00:00', 'example.com', '/', 20, 8], // 2
    ['2026-03-01 00:00:00', 'blog.example.com', '/', 3, 2], // 3: same path, second hostname → one row
    ['2026-03-01 00:00:00', 'example.com', '/über, "quoted"', 2, 1], // 4: UTF-8 and quoting
    ['2026-03-02 00:00:00', 'example.com', '/pricing', 7, 4], // 5
    ['2026-03-02 00:00:00', 'example.com', '/short'], // 6: missing_field (too few columns)
    ['2026-02-27 00:00:00', 'example.com', '/early', 1, 1], // 7: before the totals' first day → outside_totals_range
  ],
  locations: [
    // datetime, country_code, state, city, uniques, pageviews
    ['2026-03-01 00:00:00', 'BE', 'Flanders', 'Ghent', 3, 6], // 2
    ['2026-03-01 00:00:00', 'BE', 'Wallonia', '', 1, 2], // 3: no city → a blank city row (the server's Unknown)
    ['2026-03-01 00:00:00', 'DE', '', '', 2, 4], // 4: country only
    ['2026-03-02 00:00:00', 'US', 'California', 'San Francisco', 5, 8], // 5
  ],
  device: [
    // datetime, device_type, uniques, pageviews
    ['2026-03-01 00:00:00', 'Desktop', 7, 22], // 2
    ['2026-03-01 00:00:00', 'Mobile', 3, 8], // 3
  ],
  browser: [
    // datetime, browser, uniques, pageviews
    ['2026-03-01 00:00:00', 'Chrome', 5, 19], // 2
    ['2026-03-01 00:00:00', 'Firefox', 5, 11], // 3
    ['2026-03-02 00:00:00', 'Safari', 'x', 3], // 4: bad_number
  ],
  os: [
    // datetime, operating_system, uniques, pageviews
    ['2026-03-01 00:00:00', 'Linux', 1, 2], // 2
    ['2026-03-02 00:00:00', 'Mac OS X', 4, 10], // 3
  ],
  acquisition: [
    // datetime, referrer_hostname, referrer_pathname, utm_source, utm_medium, utm_campaign, utm_term, utm_content, uniques, pageviews
    ['2026-03-01 00:00:00', 'www.google.com', '/search', '', '', '', '', '', 7, 20], // 2
    ['2026-03-01 00:00:00', '', '', '', '', '', '', '', 3, 10], // 3: no referrer
    ['2026-03-02 00:00:00', 'news.example.org', '/a', 'newsletter', 'email', 'spring', '', 'a', 2, 5], // 4
    ['2026-03-02 00:00:00', 'news.example.org', '/b', 'newsletter', 'email', 'spring', '', 'b', 3, 6], // 5: same client key as 4
    ['2026-03-04 00:00:00', 'www.google.com', '/search', '', '', '', '', '', 1, 1], // 6: after the totals' last day → outside_totals_range
  ],
}

export interface FathomFixtureOptions {
  /**
   * What the site-totals file calls its visitor count (§3.12m7 §5 item 1):
   * `visitors`, `uniques`, or both columns with the same values. Default
   * `visitors`.
   */
  totalsVisitors?: 'visitors' | 'uniques' | 'both'
  /**
   * Writes every countable row as two hourly rows (09:00 and 15:00) whose
   * counts add up to the daily row's, as an Hourly export would. The totals'
   * metrics go on the first hour only, so they add up too. Malformed rows are
   * written once, as they are.
   */
  hourly?: boolean
  /** Moves every day to start here instead of 2026-03-01 (the counts are unchanged). */
  start?: string
}

function shifter(start: string | undefined): (value: string | number) => string | number {
  if (!start) return (v) => v
  const by = dayNumber(start) - dayNumber(FATHOM_FIXTURE_RANGE.from)
  return (v) => {
    if (typeof v !== 'string') return v
    const m = /^(2026-0[23]-\d{2})( .*)?$/.exec(v)
    if (!m || m[1] === '2026-03-32') return v
    return `${addDays(m[1], by)}${m[2] ?? ''}`
  }
}

/** Two hourly rows for one daily row: counts split so they sum back, metrics on the first hour. */
function hourlyRows(role: FathomRole, columns: readonly string[], row: readonly (string | number)[]): (string | number)[][] {
  const at = (name: string) => columns.indexOf(name)
  const counts = [at('<visitors>'), at('uniques'), at('visitors'), at('pageviews')].filter((i) => i >= 0)
  const metrics = role === 'totals' ? [at('bounce_rate'), at('avg_time_on_site')] : []
  const day = String(row[0]).slice(0, 10)
  const countable = row.length === columns.length && counts.every((i) => /^\d+$/.test(String(row[i]))) && !day.endsWith('-32')
  if (!countable) return [[...row]]
  const first = [...row]
  const second = [...row]
  first[0] = `${day} 09:00:00`
  second[0] = `${day} 15:00:00`
  for (const i of counts) {
    const n = Number(row[i])
    first[i] = Math.ceil(n / 2)
    second[i] = Math.floor(n / 2)
  }
  for (const i of metrics) second[i] = ''
  return [first, second]
}

/** Every file's text, by role. */
export function fathomFixtureTexts(options: FathomFixtureOptions = {}): Record<FathomRole, string> {
  const shift = shifter(options.start)
  const visitors = options.totalsVisitors ?? 'visitors'
  const out = {} as Record<FathomRole, string>
  for (const role of Object.keys(FATHOM_FIXTURE_ROWS) as FathomRole[]) {
    let columns = [...FATHOM_FIXTURE_COLUMNS[role]]
    let rows = FATHOM_FIXTURE_ROWS[role].map((r) => [...r])
    if (role === 'totals') {
      if (visitors === 'both') {
        columns = ['datetime', 'visitors', 'uniques', ...columns.slice(2)]
        rows = rows.map((r) => (r.length > 1 ? [r[0], r[1], r[1], ...r.slice(2)] : r))
      } else {
        columns[1] = visitors
      }
    }
    if (options.hourly) {
      const named = role === 'totals' && visitors !== 'both' ? FATHOM_FIXTURE_COLUMNS.totals : columns
      rows = rows.flatMap((r) => hourlyRows(role, named, r))
    }
    out[role] = csv(columns, rows.map((r) => r.map(shift)))
  }
  return out
}

/**
 * The seven files as a browser hands them over, in recipe order. `mutate` may
 * rewrite, drop or add files (by name) before they are built.
 */
export function fathomFixtureFiles(
  mutate?: (files: Record<string, string>) => void,
  options: FathomFixtureOptions = {},
): File[] {
  const texts = fathomFixtureTexts(options)
  const files: Record<string, string> = {}
  for (const role of Object.keys(texts) as FathomRole[]) files[FATHOM_FIXTURE_NAMES[role]] = texts[role]
  mutate?.(files)
  return Object.entries(files).map(([name, text]) => new File([text], name, { type: 'text/csv' }))
}

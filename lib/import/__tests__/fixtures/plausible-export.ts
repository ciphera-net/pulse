// A SYNTHETIC Plausible "Export to CSV" archive, built from the documented
// headers (sources/plausible.ts PLAUSIBLE_COLUMNS, from the research's
// `input_structures` finding). No real export is committed: M6 closes on a real
// CE export and a Cloud export. The staging harness (gate 6) bundles this file
// too, so the browser end to end uploads exactly what the unit tests assert.
//
// The fixture is small but touches every mapping rule: a page on two
// hostnames, a browser in two versions, a country split across regions and
// cities, two acquisition rows that share a client key (different utm_content),
// quoting, a UTF-8 path, and one malformed row per skip reason.

import { zipSync, strToU8 } from 'fflate'
import { PLAUSIBLE_COLUMNS } from '../../sources/plausible'

const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

function csv(columns: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const lines = [columns.join(',')]
  for (const r of rows) lines.push(r.map((v) => q(String(v))).join(','))
  return lines.join('\n') + '\n'
}

export const FIXTURE_RANGE = { from: '2026-03-01', through: '2026-03-03' } as const
const SUFFIX = '20260301_20260303'

/** Rows in column order, per file. Line numbers in the comments are the CSV lines (header = 1). */
export const PLAUSIBLE_FIXTURE_ROWS = {
  visitors: [
    // date, visitors, pageviews, bounces, visits, visit_duration
    ['2026-03-01', 10, 30, 4, 12, 600], // line 2
    ['2026-03-02', 20, 50, 8, 25, 1200], // line 3
    ['2026-03-03', 5, 9, '', 6, ''], // line 4: bounces and duration not reported → null
    ['2026-03-32', 1, 1, 0, 1, 0], // line 5: bad_timestamp
  ],
  sources: [
    // date, source, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term, pageviews, visitors, visits, visit_duration, bounces
    ['2026-03-01', 'Google', 'https://www.google.com/', '', '', '', '', '', 20, 7, 8, 100, 2], // 2
    ['2026-03-01', 'Direct / None', '', '', '', '', '', '', 10, 3, 4, 50, 1], // 3
    ['2026-03-02', 'Newsletter', '', 'newsletter', 'email', 'spring', 'a', '', 5, 2, 2, 10, 0], // 4
    ['2026-03-02', 'Newsletter', '', 'newsletter', 'email', 'spring', 'b', '', 6, 3, 3, 20, 1], // 5: same client key as 4
    ['2026-03-02', 'Google', 'https://www.google.com/', '', '', '', '', '', 'x', 1, 1, 0, 0], // 6: bad_number
  ],
  pages: [
    // date, hostname, page, visits, visitors, pageviews, total_scroll_depth, total_scroll_depth_visits, total_time_on_page, total_time_on_page_visits
    ['2026-03-01', 'example.com', '/', 9, 8, 20, 0, 0, 0, 0], // 2
    ['2026-03-01', 'blog.example.com', '/', 2, 2, 3, 0, 0, 0, 0], // 3: same path, second hostname
    ['2026-03-01', 'example.com', '/über, "quoted"', 1, 1, 2, 0, 0, 0, 0], // 4: UTF-8 and quoting
    ['2026-03-02', 'example.com', '/pricing', 5, 4, 7, 0, 0, 0, 0], // 5
    ['2026-03-02', 'example.com', '/short'], // 6: missing_field (too few columns)
  ],
  entry_pages: [
    // date, entry_page, visitors, entrances, visit_duration, bounces, pageviews
    ['2026-03-01', '/', 8, 11, 300, 3, 25], // 2
    ['2026-03-02', '/pricing', 4, 5, 100, 1, 9], // 3
  ],
  exit_pages: [
    // date, exit_page, visitors, visit_duration, exits, bounces, pageviews
    ['2026-03-01', '/', 6, 200, 7, 2, 14], // 2
    ['2026-03-02', '/pricing', 3, 50, 4, 1, 6], // 3
    ['2026-03-02', '/gone', 1, 0, '', 0, 1], // 4: missing_field (empty exits)
  ],
  locations: [
    // date, country, region, city, visitors, visits, visit_duration, bounces, pageviews
    ['2026-03-01', 'BE', 'BE-VLG', 2803138, 3, 3, 90, 1, 6], // 2: region+city → needs_place_names
    ['2026-03-01', 'BE', 'BE-WAL', 0, 1, 1, 10, 0, 2], // 3: region only → needs_place_names
    ['2026-03-01', 'DE', '', 0, 2, 2, 20, 1, 4], // 4: country only
    ['2026-03-02', 'US', '', 0, 5, 6, 30, 2, 8], // 5
  ],
  devices: [
    // date, device, visitors, visits, visit_duration, bounces, pageviews
    ['2026-03-01', 'Desktop', 7, 9, 400, 3, 22], // 2
    ['2026-03-01', 'Mobile', 3, 3, 200, 1, 8], // 3
  ],
  browsers: [
    // date, browser, browser_version, visitors, visits, visit_duration, bounces, pageviews
    ['2026-03-01', 'Firefox', '130', 2, 2, 60, 0, 5], // 2
    ['2026-03-01', 'Firefox', '131', 3, 4, 70, 1, 6], // 3: second version
    ['2026-03-01', 'Chrome', '129', 5, 6, 80, 2, 19], // 4
  ],
  operating_systems: [
    // date, operating_system, operating_system_version, visitors, visits, visit_duration, bounces, pageviews
    ['2026-03-01', 'GNU/Linux', '', 1, 1, 10, 0, 2], // 2
    ['2026-03-02', 'Mac', '15.0', 4, 5, 90, 1, 10], // 3
  ],
} as const

export const CUSTOM_EVENTS_COLUMNS = ['date', 'name', 'link_url', 'path', 'visitors', 'events'] as const

/** The file set: every documented table, including the custom events the parser ignores. */
export function plausibleFixtureFiles(): Record<string, string> {
  const files: Record<string, string> = {}
  for (const [table, rows] of Object.entries(PLAUSIBLE_FIXTURE_ROWS)) {
    const columns = PLAUSIBLE_COLUMNS[table as keyof typeof PLAUSIBLE_COLUMNS]
    files[`imported_${table}_${SUFFIX}.csv`] = csv(columns, rows as unknown as (string | number)[][])
  }
  files[`imported_custom_events_${SUFFIX}.csv`] = csv(CUSTOM_EVENTS_COLUMNS, [['2026-03-01', 'Signup', '', '/', 1, 1]])
  return files
}

/** The archive's bytes. `mutate` may add, drop or rewrite files before zipping. */
export function plausibleFixtureZip(mutate?: (files: Record<string, string>) => void): Uint8Array {
  const files = plausibleFixtureFiles()
  mutate?.(files)
  const entries: Record<string, Uint8Array> = {}
  for (const [name, text] of Object.entries(files)) entries[name] = strToU8(text)
  return zipSync(entries, { level: 6 })
}

export function plausibleFixtureFile(mutate?: (files: Record<string, string>) => void): File {
  return new File([plausibleFixtureZip(mutate) as BlobPart], 'plausible-export.zip', { type: 'application/zip' })
}

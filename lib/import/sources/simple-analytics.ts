// ─── Simple Analytics: the raw datapoints export (M9) ─────────────────────
//
// Simple Analytics' Export API (`GET /api/export/datapoints`, `format=csv`,
// keyed on `hostname=`) writes ONE CSV, one row per datapoint: a pageview or a
// custom event, `type=all` so the export never needs re-fetching once M12
// reads events (§3.12c amendment 6; D8). This parser reads the whole stream
// and keeps only `datapoint=pageview` rows — every other row is skipped
// `not_a_pageview`, not dropped from the read.
//
// 🔑 THERE IS NO SESSION, VISIT OR PERSISTENT VISITOR ID ANYWHERE IN THE
// EXPORT (M9-a). The only identity signal is `is_unique`: Simple Analytics'
// own definition of a visit start (no referrer, or a referrer whose hostname
// differs from the site's) — a per-row flag, not a cardinality dedup. M9-e's
// fold amendment is built for exactly this: an `is_unique=true` row mints a
// fresh, never-reused per-parse counter token as BOTH its visitor and its
// visit id (never Simple Analytics' own `uuid`, which the vendor's own docs
// call "not always unique"); an `is_unique=false` row sends `visitor: null,
// visit: null`. Every bucket then ends up counting exactly the
// `is_unique=true` rows for `visitors`/`visits` and every row for
// `pageviews`, with no per-dimension special-casing — which is also the
// entire mechanism behind entry pages and acquisition (M9-f, M9-g): a
// VisitRecord, and therefore an entrance and an acquisition row, only ever
// comes from an `is_unique=true` row.
//
// Under this model every "visit" is exactly one pageview, so a computed exit
// page would be a mechanical duplicate of the entry page — a fabricated
// session boundary the source cannot honestly provide. `hasExitPages: false`
// (source-meta.ts) turns that emission off at the fold; this parser never
// mentions exit pages at all.
//
// No region or city: Simple Analytics collects country only, on every plan
// and every surface, so `dimensions.region`/`.city` are keys this parser
// simply never sets (never sent, not skipped) — there is never a code to
// resolve, unlike Plausible's ISO/GeoNames codes.
//
// 🔑 `hostname_mismatch` (M9-j, amended M9-j') guards against importing
// another property's data. `ctx.siteDomain` is the site's own configured
// domain (`sites.domain`, lower-cased, an IDN site's ASCII form), threaded in
// from `GET …/data-imports/upload-window`'s additive `site_domain` field
// through `PrepareRequest` into the parse context. When it is set, every
// row's `hostname` (lower-cased, `www.`-stripped, a Unicode hostname
// converted to its ASCII form via the WHATWG URL parser) is compared against
// it, also `www.`-stripped (core/host.ts, the one host rule Umami shares,
// M8-b′): this catches a WRONG-PROPERTY UPLOAD in general,
// not only a file that mixes two properties. `hostname_original` is not read
// (M9-j: it only matters for a site that has rewritten its own hostname,
// which this filter doesn't need to reconstruct). When `ctx.siteDomain` is
// null — an older server that hasn't shipped the field yet — the parser falls
// back to its original M9-j check: the first row's own `hostname` becomes the
// reference and every later row is held to it, which still catches a file
// that mixes rows from more than one property, just not a wholesale upload of
// the wrong one.

import { isCalendarDate } from '../core/dates'
import { siteHostCheck } from '../core/host'
import { checkHeader, requireExactlyOneFile, type ColumnIndex } from '../core/schema'
import type { RowRef } from '../core/skipped'
import { readGzip, readPlain, type EntrySink } from '../core/zip'
import { wrongFile } from '../errors'
import { SIMPLE_ANALYTICS_ONE_FILE_MESSAGE } from '../source-meta'
import type { RawAcquisition } from '../core/fold'
import { CsvByteParser } from '../core/csv'
import type { RawSourceParser } from './source'

/**
 * The columns this parser reads (M9-c). Exactly 18: undercounted in the
 * research draft as "fourteen… sixteen" — the `utm_*` row alone is three
 * names, not one.
 */
export const SIMPLE_ANALYTICS_REQUIRED_COLUMNS = [
  'added_iso',
  'datapoint',
  'is_robot',
  'is_unique',
  'hostname',
  'path',
  'document_referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'country_code',
  'device_type',
  'browser_name',
  'os_name',
  'lang_language',
  'lang_region',
  'screen_width',
  'screen_height',
] as const

/**
 * Every field name the live Export API accepts (M9-c's field enumeration,
 * exactly 36), so a header naming any of them is accepted whether or not this
 * parser reads it — a customer's own hand-built URL, or a future export
 * defaulting to more fields, is not refused for carrying one. The deprecated
 * legacy names (`url`, `referrer`, `referrer_raw`, `device_width_pixels`,
 * `device_width`, `source`) and any `metadata.*` field are deliberately
 * absent: never valid on the live endpoint.
 */
export const SIMPLE_ANALYTICS_KNOWN_COLUMNS = [
  'added_date',
  'added_iso',
  'added_unix',
  'browser_name',
  'browser_version',
  'country_code',
  'datapoint',
  'device_type',
  'document_referrer',
  'duration_seconds',
  'hostname',
  'hostname_original',
  'is_robot',
  'is_unique',
  'lang_language',
  'lang_region',
  'os_name',
  'os_version',
  'path',
  'path_and_query',
  'query',
  'referrer_hostname',
  'referrer_path',
  'screen_height',
  'screen_width',
  'scrolled_percentage',
  'session_id',
  'user_agent',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term',
  'uuid',
  'viewport_height',
  'viewport_width',
] as const

/**
 * `added_iso`'s shape (M9-d): millisecond `Z`-suffixed UTC is what every real
 * row carries; a numeric offset is accepted defensively, never observed.
 */
const TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/

/** `added_iso` as epoch ms, or null when it is not the shape M9-d expects. */
export function parseAddedIso(value: string): number | null {
  const m = TIMESTAMP_RE.exec(value)
  if (!m) return null
  const [, y, mo, d, h, mi, s, frac, zone] = m
  if (!isCalendarDate(`${y}-${mo}-${d}`)) return null
  const hour = Number(h)
  const minute = Number(mi)
  const second = Number(s)
  if (hour > 23 || minute > 59 || second > 59) return null
  const ms = frac ? Number((frac + '000').slice(0, 3)) : 0
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), hour, minute, second, ms)
  if (zone === 'Z') return utcMs
  const zm = /^([+-])(\d{2}):?(\d{2})$/.exec(zone)
  if (!zm) return null
  const sign = zm[1] === '-' ? -1 : 1
  const offsetMs = sign * (Number(zm[2]) * 60 + Number(zm[3])) * 60_000
  return utcMs - offsetMs
}

const nullIfEmpty = (s: string) => (s === '' ? null : s)

/**
 * Direct vs. Shared Link, derived client-side (M9-g): reproduces native's
 * `NoReferrerLabel` rule from a landing path, which a per-day aggregate row
 * never has but a raw pageview row does. A non-empty referrer travels
 * unchanged; the server resolves its host (M2-l).
 */
function referrerLabel(documentReferrer: string, utmSource: string, path: string): string {
  if (documentReferrer !== '') return documentReferrer
  // Native's order (M9-g′): with no referrer, a utm_source names the visit's
  // origin before the Direct/Shared Link fallback (internal/api/events.go).
  if (utmSource !== '') return utmSource
  return path === '/' ? 'Direct' : 'Shared Link'
}

export const simpleAnalyticsSource: RawSourceParser = {
  kind: 'upload_raw',
  async read(files, ctx) {
    const file = requireExactlyOneFile(files, SIMPLE_ANALYTICS_ONE_FILE_MESSAGE)
    if (file.input === 'zip') {
      throw wrongFile(
        'unexpected_archive',
        'This looks like a ZIP archive. Simple Analytics exports a single CSV file, so upload that file directly.',
        { file: file.name },
      )
    }

    let index: ColumnIndex | null = null
    let width = 0
    let entrances = 0
    // M9-j': the site's own domain when the server sent one, else the
    // original M9-j intra-file check (core/host.ts, shared with Umami).
    const belongs = siteHostCheck(ctx.siteDomain)

    const csv = new CsvByteParser((fields, line) => {
      if (!index) {
        index = checkHeader(
          { file: file.name, required: SIMPLE_ANALYTICS_REQUIRED_COLUMNS, known: SIMPLE_ANALYTICS_KNOWN_COLUMNS },
          fields,
        )
        width = fields.length
        return
      }
      const at: RowRef = { file: file.name, line }
      if (fields.length !== width) {
        ctx.skipped.add('missing_field', at)
        return
      }
      const idx = index
      const text = (column: string) => fields[idx[column]]

      // A fixed order, so a row that breaks several rules is counted once:
      // robot, then the datapoint kind, then which property it belongs to,
      // then whether its timestamp is one this export could have written.
      if (text('is_robot') === 'true') {
        ctx.skipped.add('bot_row', at)
        return
      }
      if (text('datapoint') !== 'pageview') {
        // M9-b/§3.12c amendment 6: the recipe fetches type=all on purpose, so
        // a custom-event row is expected here, not wrong — M12 reads these
        // once it ships, with no re-export.
        ctx.skipped.add('not_a_pageview', at)
        return
      }
      if (!belongs(text('hostname'))) {
        ctx.skipped.add('hostname_mismatch', at)
        return
      }
      const at_ = parseAddedIso(text('added_iso'))
      if (at_ === null) {
        ctx.skipped.add('bad_timestamp', at)
        return
      }

      const path = text('path')
      const isUnique = text('is_unique') === 'true'
      let visitor: string | null = null
      let visit: string | null = null
      let acquisition: RawAcquisition | null = null
      if (isUnique) {
        // M9-e: a fresh, never-reused token as BOTH ids — never SA's own
        // `uuid`, which the vendor's docs call "not always unique".
        const token = `sa-entrance-${entrances++}`
        visitor = token
        visit = token
        const medium = text('utm_medium')
        const campaign = text('utm_campaign')
        const label = referrerLabel(text('document_referrer'), text('utm_source'), path)
        acquisition = {
          referrer: label,
          utm_source: nullIfEmpty(text('utm_source')),
          utm_medium: nullIfEmpty(medium),
          utm_campaign: nullIfEmpty(campaign),
          src_source: label,
          src_medium: medium,
          src_campaign: campaign,
          src_channel_group: '',
        }
      }

      const screenWidth = text('screen_width')
      const screenHeight = text('screen_height')
      const langLanguage = text('lang_language')
      const langRegion = text('lang_region')

      ctx.rows.add({
        at: at_,
        visitor,
        visit,
        page: path,
        acquisition,
        dimensions: {
          country: text('country_code'),
          device: text('device_type'),
          browser: text('browser_name'),
          os: text('os_name'),
          language: langRegion !== '' ? `${langLanguage}-${langRegion}` : langLanguage,
          screen_resolution: `${screenWidth}x${screenHeight}`,
          // No region/city key at all (M9-f): Simple Analytics has no place
          // dimension finer than country, on any plan or surface.
        },
        file: file.name,
        line,
      })
    }, file.name)

    const sink: EntrySink = { chunk: (bytes) => csv.push(bytes), end: () => csv.end() }
    if (file.input === 'gzip') {
      await readGzip(file.blob, file.name, sink, ctx.read)
    } else {
      await readPlain(file.blob, file.name, sink, ctx.read)
    }
    if (!index) throw wrongFile('empty_file', `${file.name} has no header row.`, { file: file.name })

    return { ignored: [] }
  },
}

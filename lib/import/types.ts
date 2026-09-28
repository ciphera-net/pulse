// ─── The wire contract, as types (design §3.12b, M2-r) ────────────────────
//
// Every name here is EXACT: the backend and this library were built in parallel
// against one written definition, and a field spelled differently on either side
// is a 400 (`DisallowUnknownFields`) on the first batch. Rows are snake_case
// because that is what goes on the wire; nothing renames them in between.
//
// 🔴 M2-q: a batch has no field that could carry an event. There is no timestamp
// finer than a day, no session, visit or visitor id, no IP, user agent or title,
// and `lib/import/__tests__/no-raw-row.test.ts` fails if one is ever added.

import type { Cursor } from './errors'

export type { Cursor }

/** imported_dimensions.dimension (migration 195's CHECK). */
export const DIMENSIONS = [
  'page',
  'entry_page',
  'exit_page',
  'country',
  'region',
  'city',
  'device',
  'browser',
  'os',
  'language',
  'screen_resolution',
] as const
export type Dimension = (typeof DIMENSIONS)[number]

export interface DailyRow {
  date: string
  visitors: number
  visits: number
  pageviews: number
  /** Stored as the source reported it, never displayed (D2). */
  src_bounces: number | null
  src_engagement_seconds: number | null
}

export interface MonthlyRow {
  /** The 1st of the month. */
  month: string
  visitors: number
  full_month: boolean
}

export interface DimensionRow {
  date: string
  dimension: Dimension
  /** The country code for region and city; '' otherwise. */
  parent: string
  value: string
  visitors: number
  visits: number | null
  pageviews: number | null
}

export interface AcquisitionRow {
  date: string
  /** The source's own origin value AS THE FILE HAS IT; only the server maps it (M2-l). */
  referrer: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  /** The source's labels verbatim ('' when it has none). Internal provenance, never displayed. */
  src_source: string
  src_medium: string
  src_campaign: string
  src_channel_group: string
  visitors: number
  visits: number
  pageviews: number
}

/** The four tables a batch may carry. Each is optional on the wire; omitted = empty. */
export interface AggregateRows {
  daily: DailyRow[]
  monthly: MonthlyRow[]
  dimensions: DimensionRow[]
  acquisition: AcquisitionRow[]
}

export type TableName = keyof AggregateRows
export const TABLES: readonly TableName[] = ['daily', 'monthly', 'dimensions', 'acquisition']

/** The fields each table's rows carry on the wire, in canonical order (M2-r). */
export const WIRE_FIELDS: Readonly<Record<TableName, readonly string[]>> = {
  daily: ['date', 'visitors', 'visits', 'pageviews', 'src_bounces', 'src_engagement_seconds'],
  monthly: ['month', 'visitors', 'full_month'],
  dimensions: ['date', 'dimension', 'parent', 'value', 'visitors', 'visits', 'pageviews'],
  acquisition: [
    'date',
    'referrer',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'src_source',
    'src_medium',
    'src_campaign',
    'src_channel_group',
    'visitors',
    'visits',
    'pageviews',
  ],
}

/** The top-level fields of a batch body (M2-r). */
export const BATCH_FIELDS = ['step', 'part', 'fingerprint', 'rows'] as const

/** One step of a plan: a contiguous day range sent as `parts` batches. `plan_json` keeps exactly this shape. */
export interface PlanStep {
  start: string
  end: string
  parts: number
}

export interface PlanTotals {
  rows: { daily: number; monthly: number; dimensions: number; acquisition: number }
  visitors: number
  pageviews: number
}

export type SourceKind = 'upload_aggregate' | 'upload_raw'

/** The status object (M2-r): returned by create, status, and upload-window's `existing_import`. */
export interface ImportStatus {
  id: string
  source: string
  kind: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | (string & {})
  error_code: string | null
  source_timezone: string
  range_start: string
  range_end: string
  steps_total: number
  cursor: Cursor
  fingerprint: string | null
  totals: unknown
  skipped: { browser: Record<string, number>; server: Record<string, number> }
  visits_are_visitors: boolean
  import_through: string | null
  created_at: string
  started_at: string | null
  progressed_at: string | null
  finished_at: string | null
}

export interface CollectSettings {
  page_paths: boolean
  referrers: boolean
  device_info: boolean
  geo_data: 'full' | 'country' | 'none'
  screen_resolution: boolean
  audience_data: boolean
}

/** `GET …/data-imports/upload-window` (M2-r; `site_domain` additive, M9-j'). */
export interface UploadWindow {
  source: string
  kind: string
  site_timezone: string
  source_timezone: string
  /** Null when nothing is importable. */
  allowed_from: string | null
  allowed_through: string | null
  collect: CollectSettings
  existing_import: ImportStatus | null
  /**
   * The site's own configured domain (`sites.domain`), lower-cased, an IDN
   * site's ASCII form (M9-j'). Null from an older server that has not shipped
   * this field yet — a source parser that needs it falls back to its own
   * intra-file consistency check in that case, never treating null as "no
   * domain configured".
   */
  site_domain: string | null
}

/** `POST …/data-imports` body (M2-r). */
export interface CreateImportRequest {
  source: string
  source_timezone: string
  range_start: string
  range_end: string
  plan: PlanStep[]
  fingerprint: string
  totals: PlanTotals
  skipped: Record<string, number>
  visits_are_visitors: boolean
}

/** A batch's 200 answer: applied, or a retry below the cursor that wrote nothing. */
export interface BatchResponse {
  already_applied: boolean
  applied: { daily: number; monthly: number; dimensions: number; acquisition: number } | null
  skipped: Record<string, number>
  next: Cursor | null
  status: string
}

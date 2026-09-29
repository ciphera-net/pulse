import { serializeFilters, type DimensionFilter } from '@/lib/filters'

// ---------------------------------------------------------------------------
// Settings → Export's download (PULSE-132, design §9.2): one GET to
// /sites/:id/export, the configuration in the query string, the file made by
// pulse-backend. The server owns the numbers, the site's timezone, the
// imported-history provenance and the Notes sheet; the browser only asks and
// saves what comes back. Nothing here computes or reshapes data.
//
// The vocabularies below are the route's closed allowlists, in the order the
// server writes them. The query always lists them in THIS order, whatever
// order they were ticked in, so one choice of tables is one URL.
// ---------------------------------------------------------------------------

export const EXPORT_TABLES = [
  'daily',
  'pages',
  'entry_pages',
  'exit_pages',
  'referrers',
  'channels',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'countries',
  'regions',
  'browsers',
  'operating_systems',
  'devices',
  'languages',
  'goals',
  'events',
  'event_properties',
] as const
export type ExportTable = typeof EXPORT_TABLES[number]

export const EXPORT_METRICS = ['visitors', 'visits', 'pageviews', 'bounce_rate', 'visit_duration', 'scroll_depth'] as const
export type ExportMetric = typeof EXPORT_METRICS[number]

/** The daily summary's bucket. Only the daily table has one. */
export type ExportGrain = 'hour' | 'day' | 'week' | 'month'

/** Rows per table: `all` is the server's own ceiling (50,000), which the Notes say when a table reaches it. */
export type ExportLimit = '100' | '1000' | 'all'

/** csv is a zip of one CSV per table plus README.txt; xlsx has a Notes sheet first; json carries `notes`. */
export type ExportFormat = 'xlsx' | 'csv' | 'json'

/**
 * The range, as the route takes it: All time as the `all` token (the server
 * resolves it from the site's history, and it is exempt from the 366-day cap,
 * so it must never travel as dates), anything else as two site-local days.
 */
export type ExportRange = { period: 'all' } | { from: string; to: string }

export interface ExportRequest {
  tables: readonly ExportTable[]
  metrics: readonly ExportMetric[]
  /** Sent only when the daily summary is exported: no other table has a grain. */
  grain: ExportGrain
  range: ExportRange
  /** The dashboard's filters, serialised with its own v2 DSL (ParseFilters on the server). */
  filters: readonly DimensionFilter[]
  limit: ExportLimit
  format: ExportFormat
}

function inCanonicalOrder<T extends string>(order: readonly T[], picked: readonly T[]): T[] {
  const set = new Set(picked)
  return order.filter((key) => set.has(key))
}

/** The query string for GET /sites/:id/export, exactly per design §9.2. */
export function buildExportQuery(request: ExportRequest): string {
  const tables = inCanonicalOrder(EXPORT_TABLES, request.tables)
  const q = new URLSearchParams()
  q.set('tables', tables.join(','))
  q.set('metrics', inCanonicalOrder(EXPORT_METRICS, request.metrics).join(','))
  if (tables.includes('daily')) q.set('grain', request.grain)
  if ('period' in request.range) {
    q.set('period', request.range.period)
  } else {
    q.set('from', request.range.from)
    q.set('to', request.range.to)
  }
  const filters = serializeFilters([...request.filters])
  if (filters) q.set('filters', filters)
  q.set('limit', request.limit)
  q.set('format', request.format)
  return q.toString()
}

/** Used only if the server's Content-Disposition does not reach the browser. */
const FALLBACK_FILENAME: Record<ExportFormat, string> = {
  xlsx: 'pulse-export.xlsx',
  csv: 'pulse-export.zip',
  json: 'pulse-export.json',
}

/**
 * Asks the server for the file and saves it (the invoice PDF's pattern,
 * lib/api/billing.ts). The server builds the whole file before it writes a
 * byte, so a failure is a JSON error — thrown here as an ApiError carrying the
 * server's message — and never a truncated download.
 */
export async function downloadExport(siteId: string, request: ExportRequest): Promise<void> {
  const { apiRequestBlob } = await import('./client')
  const { blob, filename } = await apiRequestBlob(`/sites/${siteId}/export?${buildExportQuery(request)}`)

  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename ?? FALLBACK_FILENAME[request.format]
  a.click()
  URL.revokeObjectURL(blobUrl)
}

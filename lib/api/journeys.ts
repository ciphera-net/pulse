import apiRequest from './client'

// ─── Types ──────────────────────────────────────────────────────────

// GET /sites/:id/journeys/flow — the Sankey, bounded on the server. Each column
// carries its exact totals (counted before the cut) and its top 50 pages; Paths
// (5 / 10 / 20 / 50) re-slices that in the browser with no request. 50 is the
// top of the Paths ladder and a server constant, never a parameter.

/** One named page of a column: [path, sessions]. */
export type JourneyFlowPage = [path: string, sessions: number]

/**
 * The sessions that went from column `hop`'s page `from` to column `hop + 1`'s
 * page `to`. `from` and `to` index those columns' `top`; −1 is (other). Only the
 * hops the chart draws (0 … depth − 2) are sent, and (other)→(other) is
 * included, so one hop's links sum to exactly that hop's sessions.
 */
export type JourneyFlowLink = [hop: number, from: number, to: number, sessions: number]

export interface JourneyFlowColumn {
  /** Sessions at this step, exact over the range (counted before the cut). */
  total_sessions: number
  /** Distinct pages at this step, exact. */
  pages: number
  /**
   * At most 50 pages, ranked sessions DESC then path in BYTE order. That order
   * is the contract: slice it as received and never re-sort it (JavaScript's
   * string comparison is by UTF-16 code unit, which disagrees with byte order).
   */
  top: JourneyFlowPage[]
  /** What lies below the cut: total_sessions − Σ top. */
  other_sessions: number
  /** pages − top.length. */
  other_pages: number
}

export interface JourneyFlow {
  /** The depth served (the request's, clamped to 2–6). */
  depth: number
  /** Column 0's total: the sessions with at least one hop (two or more pages). */
  total_sessions: number
  /** Exactly `depth` entries; a column no session reached is all zeros. */
  columns: JourneyFlowColumn[]
  links: JourneyFlowLink[]
}

export interface EntryPoint {
  path: string
  session_count: number
}

// ─── Helpers ────────────────────────────────────────────────────────

function buildQuery(opts: {
  startDate?: string
  endDate?: string
  /** A server-resolved period (All time, PULSE-20) — sent INSTEAD of the dates. */
  period?: string
  depth?: number
  entry_path?: string
  filters?: string
}): string {
  const params = new URLSearchParams()
  if (opts.period) {
    params.append('period', opts.period)
  } else {
    if (opts.startDate) params.append('start_date', opts.startDate)
    if (opts.endDate) params.append('end_date', opts.endDate)
  }
  if (opts.depth != null) params.append('depth', opts.depth.toString())
  if (opts.entry_path) params.append('entry_path', opts.entry_path)
  if (opts.filters) params.append('filters', opts.filters)
  const query = params.toString()
  return query ? `?${query}` : ''
}

// ─── API Functions ──────────────────────────────────────────────────

export function getJourneyFlow(
  siteId: string,
  startDate?: string,
  endDate?: string,
  opts?: { depth?: number; entryPath?: string; filters?: string; period?: string }
): Promise<JourneyFlow> {
  return apiRequest<JourneyFlow>(
    `/sites/${siteId}/journeys/flow${buildQuery({
      startDate,
      endDate,
      period: opts?.period,
      depth: opts?.depth,
      entry_path: opts?.entryPath,
      filters: opts?.filters,
    })}`
  ).then(r => r ?? { depth: opts?.depth ?? 0, total_sessions: 0, columns: [], links: [] })
}

export function getJourneyEntryPoints(
  siteId: string,
  startDate?: string,
  endDate?: string,
  filters?: string,
  period?: string
): Promise<EntryPoint[]> {
  return apiRequest<{ entry_points: EntryPoint[] }>(
    `/sites/${siteId}/journeys/entry-points${buildQuery({ startDate, endDate, filters, period })}`
  ).then(r => r?.entry_points ?? [])
}

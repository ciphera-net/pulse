import apiRequest from './client'

// ─── Types ──────────────────────────────────────────────────────────

export interface PathTransition {
  from_path: string
  to_path: string
  step_index: number
  session_count: number
}

export interface TransitionsResponse {
  transitions: PathTransition[]
  total_sessions: number
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
  min_sessions?: number
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
  if (opts.min_sessions != null) params.append('min_sessions', opts.min_sessions.toString())
  if (opts.entry_path) params.append('entry_path', opts.entry_path)
  if (opts.filters) params.append('filters', opts.filters)
  const query = params.toString()
  return query ? `?${query}` : ''
}

// ─── API Functions ──────────────────────────────────────────────────

export function getJourneyTransitions(
  siteId: string,
  startDate?: string,
  endDate?: string,
  opts?: { depth?: number; minSessions?: number; entryPath?: string; filters?: string; period?: string }
): Promise<TransitionsResponse> {
  return apiRequest<TransitionsResponse>(
    `/sites/${siteId}/journeys/transitions${buildQuery({
      startDate,
      endDate,
      period: opts?.period,
      depth: opts?.depth,
      min_sessions: opts?.minSessions,
      entry_path: opts?.entryPath,
      filters: opts?.filters,
    })}`
  ).then(r => r ?? { transitions: [], total_sessions: 0 })
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

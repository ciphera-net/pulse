import apiRequest from './client'

// ─── The Visitors surface ───────────────────────────────────────────
//
// Design: Pulse/docs/plans/30-08-2026-visitors-surface-design.md §4.
//
// Every dimension is `string | null`, never optional and never ''. Null means
// "your site does not collect this, or it was never observed" and the UI renders
// an em dash for it. An optional field would let a missing key and a collected
// blank look identical, which is the fabrication D7 forbids.

export interface VisitorRow {
  visitor_key: string
  /** The identity's site-local calendar month, 'YYYY-MM'. */
  month: string
  first_seen: string
  last_seen: string
  visits: number
  pageviews: number
  events: number

  country: string | null
  region: string | null
  city: string | null
  device_type: string | null
  browser: string | null
  os: string | null
  language: string | null
  screen_resolution: string | null
  referrer: string | null
  entry_path: string | null

  active_now: boolean
}

export interface VisitorsResponse {
  visitors: VisitorRow[]
  total: number
  page: number
  page_size: number
  /** RFC3339. The earliest instant this site can be asked about. */
  range_floor: string
  /** Distinct visitors on the site RIGHT NOW — a property of now, not of the range. */
  active_now: number
}

export interface VisitorProfile extends Omit<VisitorRow, 'active_now'> {
  /** Null when no visit's duration was measured — never 0, which reads as "left instantly". */
  avg_visit_seconds: number | null
  /** The visitor's self-reported IANA zone, for the "where they are" clock. */
  timezone: string | null
  active_now: boolean
}

export interface VisitorProfileResponse {
  visitor: VisitorProfile
  range_floor: string
}

export interface VisitRow {
  /** Opaque `{session}:{n}` token — pass it back verbatim, never parse it. */
  visit_key: string
  started_at: string
  ended_at: string
  duration_seconds: number | null
  pageviews: number
  events: number
  entry_path: string | null
  exit_path: string | null
  referrer: string | null
}

export interface VisitsResponse {
  visits: VisitRow[]
  total: number
  page: number
  page_size: number
}

export interface VisitEvent {
  timestamp: string
  type: 'pageview' | 'custom'
  event_name: string
  path: string
  properties?: Record<string, string>
  duration: number | null
  scroll_depth: number | null
}

export interface VisitEventsResponse {
  events: VisitEvent[]
  total: number
  page: number
  page_size: number
}

/**
 * VisitorRange is the one range shape every call here takes.
 *
 * `minutes` and the date pair are MUTUALLY EXCLUSIVE — the server 400s a request
 * carrying both, deliberately, because two range specifications mean the caller
 * believes something about the window that at least one of them contradicts.
 * useUrlDateRange hands back `rollingMinutes` precisely so a page picks one.
 */
export interface VisitorRange {
  startDate?: string
  endDate?: string
  minutes?: number | null
}

function rangeQuery(range: VisitorRange, extra?: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  if (range.minutes != null) {
    params.append('minutes', String(range.minutes))
  } else {
    if (range.startDate) params.append('start_date', range.startDate)
    if (range.endDate) params.append('end_date', range.endDate)
  }
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v !== undefined && v !== '') params.append(k, String(v))
  }
  const q = params.toString()
  return q ? `?${q}` : ''
}

export function getVisitors(
  siteId: string,
  range: VisitorRange,
  opts?: { sort?: string; order?: 'asc' | 'desc'; page?: number; pageSize?: number },
): Promise<VisitorsResponse> {
  return apiRequest<VisitorsResponse>(
    `/sites/${siteId}/visitors${rangeQuery(range, {
      sort: opts?.sort,
      order: opts?.order,
      page: opts?.page,
      page_size: opts?.pageSize,
    })}`,
    // A 403 here is the site's toggle being off, which is a STATE the page
    // renders (the enable room), not an error to retry. It surfaces as an
    // ApiError with status 403 and the page branches on it.
  ).then(
    (r) =>
      r ?? { visitors: [], total: 0, page: 1, page_size: 50, range_floor: '', active_now: 0 },
  )
}

export function getVisitorProfile(
  siteId: string,
  key: string,
  range: VisitorRange,
): Promise<VisitorProfileResponse> {
  return apiRequest<VisitorProfileResponse>(
    `/sites/${siteId}/visitors/${encodeURIComponent(key)}${rangeQuery(range)}`,
  )
}

export function getVisitorVisits(
  siteId: string,
  key: string,
  range: VisitorRange,
  opts?: { page?: number; pageSize?: number },
): Promise<VisitsResponse> {
  return apiRequest<VisitsResponse>(
    `/sites/${siteId}/visitors/${encodeURIComponent(key)}/visits${rangeQuery(range, {
      page: opts?.page,
      page_size: opts?.pageSize,
    })}`,
  ).then((r) => r ?? { visits: [], total: 0, page: 1, page_size: 20 })
}

export function getVisitEvents(
  siteId: string,
  key: string,
  visitKey: string,
  range: VisitorRange,
  page?: number,
): Promise<VisitEventsResponse> {
  return apiRequest<VisitEventsResponse>(
    `/sites/${siteId}/visitors/${encodeURIComponent(key)}/visits/${encodeURIComponent(visitKey)}/events${rangeQuery(
      range,
      { page },
    )}`,
  ).then((r) => r ?? { events: [], total: 0, page: 1, page_size: 200 })
}

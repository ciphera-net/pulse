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
  /** The site-local month of the profile's day, 'YYYY-MM'. */
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

  /**
   * The new Visitors page (in beta): the visitor's count of the site's OWN events in range, the ones its code sent
   * (every event but a pageview, an outbound link, a download, a 404 and the interactions script's `pulse_` ones).
   * Present with `include=day` or on a filtered, tabbed or own-events-sorted list; absent otherwise.
   */
  own_events?: number
  /** The visitor's day for the row's marks (`include=day`): its visits in order, each its steps. */
  day?: VisitorDayVisit[]
}

/** One visit of a listed visitor's day: its steps in the trail's order and shape, at most 200 for the whole day. */
export interface VisitorDayVisit {
  steps: VisitEvent[]
}

/** A quick tab over the list: visitors who fired a NAMED event, who went past their first page, or who did not. */
export type VisitorOnly = 'converted' | 'went_on' | 'one_page'

/** The strip's figures for one range. `seconds` is null when no visit had a measured time. */
export interface VisitorSummaryFigures {
  visitors: number
  pageviews: number
  visits: number
  seconds: number | null
  /** The visitors who fired one of the site's named events (Settings, Events); null when the site has named none. */
  converted: number | null
}

export interface VisitorsSummaryResponse {
  current: VisitorSummaryFigures
  /** The period of the same length just before, under the same filter; null when it reaches back past the floor. */
  previous: VisitorSummaryFigures | null
  /** How many events the site has named. None: Converted has no figure, and the page says how to name one. */
  named_events: number
  range_floor: string
  site_timezone: string
}

export interface VisitorsResponse {
  visitors: VisitorRow[]
  total: number
  page: number
  page_size: number
  /**
   * The SITE's IANA timezone — the calendar every instant in this payload must be
   * rendered in.
   *
   * 🔑 It travels WITH the data rather than being fetched separately, so the rows and
   * the calendar they are read in can never be out of step and no second request gates
   * rendering a date. Not to be confused with `VisitorProfile.timezone`, which is the
   * VISITOR's self-reported zone — a different fact, spelled differently on purpose.
   */
  site_timezone: string
  /** RFC3339. The earliest instant this site can be asked about. */
  range_floor: string
  /** Distinct visitors on the site RIGHT NOW — a property of now, not of the range. */
  active_now: number
}

export interface VisitorProfile extends Omit<VisitorRow, 'active_now'> {
  /**
   * The end of the profile's day (the next site-local midnight after its last visit), as
   * an RFC3339 instant computed by the server. The page does not read it; the key is
   * dropped one release after the page stops using it.
   */
  month_resets_at: string | null
  /** Null when no visit's duration was measured — never 0, which reads as "left instantly". */
  avg_visit_seconds: number | null
  /** The visitor's self-reported IANA zone, for the "where they are" clock. */
  timezone: string | null
  active_now: boolean
}

export interface VisitorProfileResponse {
  visitor: VisitorProfile
  range_floor: string
  /**
   * The SITE's IANA timezone — the calendar every instant in this payload must be
   * rendered in.
   *
   * 🔑 It travels WITH the data rather than being fetched separately, so the rows and
   * the calendar they are read in can never be out of step and no second request gates
   * rendering a date. Not to be confused with `VisitorProfile.timezone`, which is the
   * VISITOR's self-reported zone — a different fact, spelled differently on purpose.
   */
  site_timezone: string
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
  /** The visit's campaign, its first pageview's tags (`include=campaign`); absent for a visit without tags. */
  campaign?: VisitCampaign
}

export interface VisitCampaign {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
}

export interface VisitsResponse {
  visits: VisitRow[]
  total: number
  page: number
  page_size: number
  /**
   * The SITE's IANA timezone — the calendar every instant in this payload must be
   * rendered in.
   *
   * 🔑 It travels WITH the data rather than being fetched separately, so the rows and
   * the calendar they are read in can never be out of step and no second request gates
   * rendering a date. Not to be confused with `VisitorProfile.timezone`, which is the
   * VISITOR's self-reported zone — a different fact, spelled differently on purpose.
   */
  site_timezone: string
}

export interface VisitEvent {
  timestamp: string
  type: 'pageview' | 'custom'
  event_name: string
  /**
   * Null when the site does not collect page paths (D7). The column itself is
   * NOT NULL — the server applies the site's CURRENT setting on the way out,
   * because the rows can hold paths collected before the owner narrowed it.
   */
  path: string | null
  properties?: Record<string, string>
  duration: number | null
  scroll_depth: number | null
}

export interface VisitEventsResponse {
  events: VisitEvent[]
  total: number
  page: number
  page_size: number
  /**
   * The SITE's IANA timezone — the calendar every instant in this payload must be
   * rendered in.
   *
   * 🔑 It travels WITH the data rather than being fetched separately, so the rows and
   * the calendar they are read in can never be out of step and no second request gates
   * rendering a date. Not to be confused with `VisitorProfile.timezone`, which is the
   * VISITOR's self-reported zone — a different fact, spelled differently on purpose.
   */
  site_timezone: string
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
  /**
   * `all` — All time, resolved by the SERVER to the visitors data window (its floor is
   * the identity epoch) and exempt from the 366-day cap only as a token. Sent INSTEAD of
   * the dates (lib/api/rangeQuery), so there is no question which one was answered.
   */
  period?: 'all'
}

function rangeQuery(range: VisitorRange, extra?: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  if (range.minutes != null) {
    params.append('minutes', String(range.minutes))
  } else if (range.period) {
    params.append('period', range.period)
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
  opts?: { sort?: string; order?: 'asc' | 'desc'; page?: number; pageSize?: number; filters?: string; only?: VisitorOnly; include?: 'day' },
): Promise<VisitorsResponse> {
  return apiRequest<VisitorsResponse>(
    `/sites/${siteId}/visitors${rangeQuery(range, {
      sort: opts?.sort,
      order: opts?.order,
      page: opts?.page,
      page_size: opts?.pageSize,
      filters: opts?.filters,
      only: opts?.only,
      include: opts?.include,
    })}`,
    // A 403 here is the site's toggle being off, which is a STATE the page
    // renders (the enable room), not an error to retry. It surfaces as an
    // ApiError with status 403 and the page branches on it.
  ).then(
    (r) =>
      r ?? {
        visitors: [],
        total: 0,
        page: 1,
        page_size: 50,
        range_floor: '',
        // An empty string, not the reader's zone: a body that never arrived carries no
        // calendar, and the pages fall back to the server's own UTC default for it.
        site_timezone: '',
        active_now: 0,
      },
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
  opts?: { page?: number; pageSize?: number; include?: 'campaign' },
): Promise<VisitsResponse> {
  return apiRequest<VisitsResponse>(
    `/sites/${siteId}/visitors/${encodeURIComponent(key)}/visits${rangeQuery(range, {
      page: opts?.page,
      page_size: opts?.pageSize,
      include: opts?.include,
    })}`,
  ).then((r) => r ?? { visits: [], total: 0, page: 1, page_size: 20, site_timezone: '' })
}

/** The new Visitors page's strip: the range and the period before, under the same filter (never a quick tab). */
export function getVisitorsSummary(siteId: string, range: VisitorRange, filters?: string): Promise<VisitorsSummaryResponse> {
  return apiRequest<VisitorsSummaryResponse>(`/sites/${siteId}/visitors/summary${rangeQuery(range, { filters })}`)
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
  ).then((r) => r ?? { events: [], total: 0, page: 1, page_size: 200, site_timezone: '' })
}

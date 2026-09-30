import apiRequest from './client'
import { Site } from './sites'

// ─── Types ──────────────────────────────────────────────────────────

// The four averages are nullable: null means "not measured" (no sessions in
// the window, or no session carried that signal) — never coalesce it to 0, a
// fabricated zero is indistinguishable from a measured one. Render an em dash.
export interface Stats {
  pageviews: number
  visitors: number
  bounce_rate: number | null
  avg_duration: number | null
  avg_scroll_depth: number | null
  avg_visible_duration: number | null
  // The denominators behind the two rates, for the InfoTip worked examples
  // (metric info layer, 22-08-2026). Optional because an older backend does
  // not send them — and a missing count means NO example, never a numerator
  // multiplied out in the browser.
  bounce_visits?: number
  duration_measured_visits?: number
  // The rates' shared DENOMINATOR. Load-bearing since migration 163: `visitors`
  // used to BE the session count and the examples divided by it; it now counts
  // people (monthly dedup), so a visit numerator over `visitors` prints a
  // fraction that cannot produce the rate beside it. Since the visits split
  // (26-08-2026) this counts VISITS — 30-minute-inactivity runs — not days.
  // Optional for the same reason as the two above: a backend that does not send
  // it gets NO example, never a wrong one.
  visits?: number
}

/**
 * Imported-history provenance (PULSE-83, design §3.5 and M4-a): whether the numbers
 * beside it include days imported from another analytics tool, and which. The
 * member dashboard, the public API and MCP send this one shape.
 *
 *  - `included: false` with every other field null: the range touches no imported
 *    day, or the site has none.
 *  - `from`/`through`/`source` are set whenever imported days fall in the range,
 *    counted or not; `reason` says why they were left out (null when they were not).
 *
 * The UI reads it and infers nothing (M11-h): every imported-history mark on the
 * dashboard comes from this field, never from the dates on the client.
 */
export interface ImportedProvenance {
  included: boolean
  /** YYYY-MM-DD, the first imported day the range touches. */
  from: string | null
  /** YYYY-MM-DD, the last imported day the range touches. */
  through: string | null
  /** The stored source id ("plausible"); opaque, and an unknown value is not an error. */
  source: string | null
  /** 'filtered' | 'granularity' | 'surface_unsupported' | 'surface_excluded', or a newer one. */
  reason: string | null
}

/** GET /stats: the Stats fields, flat, plus the provenance of the imported days they include. */
export interface StatsResponse extends Stats {
  imported?: ImportedProvenance
}

// visitors/rates are populated for top pages; entry/exit rows reuse this shape
// with visitors == pageviews by construction and null rates.
export interface TopPage {
  path: string
  pageviews: number
  visitors: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

export interface ScreenResolutionStat {
  screen_resolution: string
  pageviews: number
  visitors: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

export interface GoalCountStat {
  event_name: string
  /** Events, not people. Pulse-measured and imported together (M12-f). */
  count: number
  /** Distinct visitors who fired the event (the server sends it; older callers ignore it). */
  visitors?: number
  display_name?: string | null
  /**
   * Where this row's count comes from (M12, contract §3.12m12b-6), the public
   * vocabulary: `measured` (Pulse only), `imported` (imported days only),
   * `mixed`. Server-said, never inferred: an `imported` row has no properties
   * to show, so it does not expand. Absent from a pre-M12 server = measured.
   */
  instrument?: 'measured' | 'imported' | 'mixed'
  /**
   * The Pulse-measured part of `count` (M12-e). The Outbound card divides by
   * THIS, never by `count`: its per-link rows can't be imported, so a share
   * over a merged total would mix two instruments.
   */
  native_count?: number
}


export interface CampaignStat {
  source: string
  medium: string
  campaign: string
  term: string
  content: string
  visitors: number
  pageviews: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

export interface TopReferrer {
  referrer: string
  pageviews: number
  visitors: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

export interface ChannelStat {
  channel: string
  pageviews: number
  visitors: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

export interface CountryStat {
  country: string
  pageviews: number
  visitors: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

export interface CityStat {
  city: string
  country: string
  pageviews: number
  visitors: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

export interface RegionStat {
  region: string
  country: string
  pageviews: number
  visitors: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

export interface LanguageStat {
  language: string
  pageviews: number
  visitors: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

/**
 * One row per BASE language (PULSE-173) — the group key is the lowercased
 * primary language subtag of the stored value (`en-US`, `en-GB`, `en` all
 * group to `en`; `NULL`/empty groups to `"Unknown"`). Computed server-side:
 * visitors are not additive across locales and the rates cannot be averaged
 * without weights, so the server owns this row, never the client.
 */
export interface LanguageGroupStat {
  /** The group key itself, e.g. "en" or "Unknown" — also the display name's
   *  input (`Intl.DisplayNames`) and the value the row's filter click resolves
   *  its label from. */
  language: string
  pageviews: number
  visitors: number
  bounce_rate: number | null
  avg_duration: number | null
  /** The distinct raw stored tags in the group, ordered by visitors desc
   *  (tags only, no counts). ABSENT (not empty — omitted) on a floored
   *  shared-dashboard payload: listing them would reveal that a locale under
   *  the n≥5 floor exists inside an otherwise-visible group. */
  members?: string[]
  /** `members.length`, mirrored so a card need not compute it. Omitted for
   *  the same reason as `members` on a floored payload. */
  locale_count?: number
  /** Uppercased region subtag of the group's most-visited member that HAS a
   *  region subtag; `null` when no member has one, or (on a floored payload)
   *  when that member itself sits under the floor. */
  flag_region: string | null
}

export interface TimezoneStat {
  timezone: string
  pageviews: number
  visitors: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

export interface BrowserStat {
  browser: string
  pageviews: number
  visitors: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

export interface OSStat {
  os: string
  pageviews: number
  visitors: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

export interface DeviceStat {
  device: string
  pageviews: number
  visitors: number
  // Session-level rates over this row's member sessions — same definitions as
  // the headline stats (backend dimension_rates.go). null = unmeasured, never 0.
  bounce_rate: number | null
  avg_duration: number | null
}

// `date` is the bucket in the SITE's timezone. The server sends the true
// instant with the site's offset attached (2026-08-12T03:00:00+02:00); the
// LITERAL yyyy-mm-ddThh:mm prefix is the site's wall clock under both the old
// (Z-stamped) and new wire formats — parse it with parseSiteWallClock and read
// UTC getters, never local ones. The four averages are nullable like Stats';
// a null bucket is "not measured" (or floored on a public-scoped read) and
// draws as a GAP, not a zero.
export interface DailyStat {
  date: string
  pageviews: number
  visitors: number
  // The bucket's VISIT count (migration 164) — what "Pages / visit" divides by.
  // NULLABLE and null is a real answer: a daily_stats row frozen before 164 has
  // no visit count, and only a recompute can give it one. Consumers must omit
  // the ratio on null — falling back to `visitors` reports pages per PERSON,
  // the exact number this field exists to stop publishing.
  visits: number | null
  bounce_rate: number | null
  avg_duration: number | null
  avg_scroll_depth: number | null
  avg_visible_duration: number | null
}

export interface RealtimeStats {
  visitors: number
}

// ─── Public Auth ─────────────────────────────────────────────────────

export function authenticatePublicDashboard(siteId: string, password: string, captchaToken?: string, captchaId?: string, captchaSolution?: string): Promise<{ status: string }> {
  return apiRequest<{ status: string }>(`/public/sites/${siteId}/auth`, {
    method: 'POST',
    body: JSON.stringify({
      password,
      captcha_token: captchaToken || '',
      captcha_id: captchaId || '',
      captcha_solution: captchaSolution || '',
    }),
    credentials: 'include',
  })
}

// ─── Helpers ────────────────────────────────────────────────────────

function buildQuery(
  opts: {
    startDate?: string
    endDate?: string
    period?: string
    limit?: number
    interval?: string
    countryLimit?: number
    sort?: string
    filters?: string
    /**
     * A rolling live window in MINUTES. Mutually exclusive with period and with
     * start/end — the SERVER refuses the combination rather than silently
     * preferring one, so this mirrors that here instead of sending a request
     * that is already known to be a 400.
     */
    minutes?: number
    // PULSE-173: the full-list languages request's grouped variant
    // (?group=language) — a fixed, non-user value, unlike the free-text
    // params above.
    group?: string
  },
): string {
  const params = new URLSearchParams()
  if (opts.minutes != null) {
    params.append('minutes', String(opts.minutes))
  } else if (opts.period) {
    params.append('period', opts.period)
  } else {
    if (opts.startDate) params.append('start_date', opts.startDate)
    if (opts.endDate) params.append('end_date', opts.endDate)
  }
  if (opts.limit != null) params.append('limit', opts.limit.toString())
  if (opts.interval) params.append('interval', opts.interval)
  if (opts.countryLimit != null) params.append('country_limit', opts.countryLimit.toString())
  if (opts.sort) params.append('sort', opts.sort)
  if (opts.filters) params.append('filters', opts.filters)
  if (opts.group) params.append('group', opts.group)
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Factory for endpoints that return an array nested under a response key. */
function createListFetcher<T>(path: string, field: string, defaultLimit = 10) {
  return (siteId: string, startDate?: string, endDate?: string, limit = defaultLimit, filters?: string, period?: string): Promise<T[]> =>
    apiRequest<Record<string, T[]>>(`/sites/${siteId}/${path}${buildQuery({ startDate, endDate, limit, filters, period })}`)
      .then(r => r?.[field] || [])
}

// ─── List Endpoints ─────────────────────────────────────────────────

export const getTopPages = createListFetcher<TopPage>('pages', 'pages')
export const getTopReferrers = createListFetcher<TopReferrer>('referrers', 'referrers')
export const getCountries = createListFetcher<CountryStat>('countries', 'countries')
export const getCities = createListFetcher<CityStat>('cities', 'cities')
export const getRegions = createListFetcher<RegionStat>('regions', 'regions')
export const getBrowsers = createListFetcher<BrowserStat>('browsers', 'browsers')
export const getOS = createListFetcher<OSStat>('os', 'os')
export const getDevices = createListFetcher<DeviceStat>('devices', 'devices')
export const getEntryPages = createListFetcher<TopPage>('entry-pages', 'pages')
export const getExitPages = createListFetcher<TopPage>('exit-pages', 'pages')
export const getScreenResolutions = createListFetcher<ScreenResolutionStat>('screen-resolutions', 'screen_resolutions')
export const getLanguages = createListFetcher<LanguageStat>('languages', 'languages')
export const getTimezones = createListFetcher<TimezoneStat>('timezones', 'timezones')

/**
 * The Languages tab's "view all" full list, grouped by base language
 * (PULSE-173) — same endpoint as `getLanguages`, with `?group=language` added
 * so the backend switches its response envelope: `{ language_groups: [...],
 * imported: ... }` (GetLanguagesHandler), NOT the plain `{ languages: [...] }`
 * envelope the ungrouped call returns. Kept as its own function (not
 * `createListFetcher`, which has no fixed-param hook and reads the wrong key)
 * so the plain per-locale fetcher is untouched.
 */
export function getLanguageGroups(siteId: string, startDate?: string, endDate?: string, limit = 10, filters?: string, period?: string): Promise<LanguageGroupStat[]> {
  return apiRequest<Record<string, LanguageGroupStat[]>>(`/sites/${siteId}/languages${buildQuery({ startDate, endDate, limit, filters, period, group: 'language' })}`)
    .then(r => r?.language_groups || [])
}
export const getGoalStats = createListFetcher<GoalCountStat>('goals/stats', 'goal_counts', 20)
export const getChannels = createListFetcher<ChannelStat>('channels', 'channels', 20)
export const getCampaigns = createListFetcher<CampaignStat>('campaigns', 'campaigns')

// ─── Stats & Realtime ───────────────────────────────────────────────

export function getStats(siteId: string, startDate?: string, endDate?: string, filters?: string, period?: string): Promise<StatsResponse> {
  return apiRequest<StatsResponse>(`/sites/${siteId}/stats${buildQuery({ startDate, endDate, filters, period })}`)
}

export function getPublicStats(siteId: string, startDate?: string, endDate?: string): Promise<Stats> {
  return apiRequest<Stats>(`/public/sites/${siteId}/stats${buildQuery({ startDate, endDate })}`)
}

export function getRealtime(siteId: string): Promise<RealtimeStats> {
  return apiRequest<RealtimeStats>(`/sites/${siteId}/realtime`)
}

export function getPublicRealtime(siteId: string): Promise<RealtimeStats> {
  return apiRequest<RealtimeStats>(`/public/sites/${siteId}/realtime`)
}

// ─── Daily Stats ────────────────────────────────────────────────────

export function getDailyStats(siteId: string, startDate?: string, endDate?: string, interval?: string, filters?: string, period?: string): Promise<DailyStat[]> {
  return apiRequest<{ stats: DailyStat[] }>(`/sites/${siteId}/daily${buildQuery({ startDate, endDate, interval, filters, period })}`)
    .then(r => r?.stats || [])
}

export function getPublicDailyStats(siteId: string, startDate?: string, endDate?: string, interval?: string): Promise<DailyStat[]> {
  return apiRequest<{ stats: DailyStat[] }>(`/public/sites/${siteId}/daily${buildQuery({ startDate, endDate, interval })}`)
    .then(r => r?.stats || [])
}

// ─── Public Campaigns ───────────────────────────────────────────────


// ─── Full Dashboard ─────────────────────────────────────────────────

export interface DashboardData {
  site: Site
  stats: Stats
  realtime_visitors: number
  daily_stats: DailyStat[]
  top_pages: TopPage[]
  entry_pages: TopPage[]
  exit_pages: TopPage[]
  top_referrers: TopReferrer[]
  channels?: ChannelStat[]
  countries: CountryStat[]
  cities: CityStat[]
  regions: RegionStat[]
  languages: LanguageStat[]
  /** One row per base language (PULSE-173), additive alongside `languages`
   *  (unchanged, still per-locale). Absent on a backend that predates the
   *  grouping rollout — the card falls back to `languages` then (deploy
   *  skew), no error. Floored like every other dimension on a shared
   *  dashboard; see LanguageGroupStat for what a floored group omits. */
  language_groups?: LanguageGroupStat[]
  timezones: TimezoneStat[]
  browsers: BrowserStat[]
  os: OSStat[]
  devices: DeviceStat[]
  screen_resolutions: ScreenResolutionStat[]
  goal_counts?: GoalCountStat[]
  scroll_depth?: ScrollDepthDistribution
  // Campaign rows joined the payload 02-09-2026 (floored on public-scoped
  // reads like every dimension) so the share surface can render the
  // Campaigns card without the member-only /campaigns endpoint.
  campaigns?: CampaignStat[]
  date_range?: { start: string; end: string }
  /**
   * The bucket daily_stats is actually in. Equal to the requested interval except on
   * "All time" past a year, where the server picks week or month (PULSE-20).
   */
  interval?: 'minute' | 'hour' | 'day' | 'week' | 'month'
  /** What the minimum-cell-size floor withheld. Present ONLY on a shared dashboard
   *  and ONLY when something was withheld, so its presence is itself the signal that
   *  this payload was served anonymously.
   *
   *  A shared dashboard drops every dimension row describing fewer than
   *  `min_cell_size` people, because the payload carries fifteen dimensions computed
   *  over the same sessions and small cells in several of them join into one person.
   *  The counts are reported rather than silently applied so a viewer can see that
   *  the rows do not sum to the total on purpose. */
  suppression?: DashboardSuppression
  /**
   * Whether the headline and the chart include imported history, and which days
   * (PULSE-83). Speaks for the headline and the series; each card speaks for
   * itself in `imported_cards`.
   */
  imported?: ImportedProvenance
  /**
   * Each importable card's own provenance, keyed by its dimension (page,
   * entry_page, exit_page, referrer, channel, campaign, country, region, city,
   * browser, os, device, language, screen_resolution). Only the cards this
   * response carries.
   */
  imported_cards?: Record<string, ImportedProvenance>
  /**
   * The goal counts' own provenance (M12-f): whether the Events card's numbers
   * include imported days. A field of its own, not an `imported_cards` key. The
   * focused goals endpoints carry the same thing as `imported`.
   */
  imported_goals?: ImportedProvenance
}

export interface DashboardSuppression {
  min_cell_size: number
  rows_withheld: number
  pageviews_withheld: number
}

export interface ScrollDepthDistribution {
  scroll_25: number
  scroll_50: number
  scroll_75: number
  scroll_100: number
  total_sessions: number
}

export function getDashboard(siteId: string, startDate?: string, endDate?: string, limit = 10, interval?: string, filters?: string, period?: string, minutes?: number): Promise<DashboardData> {
  return apiRequest<DashboardData>(`/sites/${siteId}/dashboard${buildQuery({ startDate, endDate, limit, interval, filters, period, minutes })}`)
}

export function getPublicDashboard(
  siteId: string,
  startDate?: string,
  endDate?: string,
  limit = 10,
  interval?: string,
  period?: string
): Promise<DashboardData> {
  return apiRequest<DashboardData>(
    `/public/sites/${siteId}/dashboard${buildQuery({ startDate, endDate, limit, interval, period })}`
  )
}

// ─── Focused Dashboard Endpoints ────────────────────────────────────

export interface DashboardOverviewData {
  site: Site
  stats: Stats
  realtime_visitors: number
  daily_stats: DailyStat[]
  date_range?: { start: string; end: string }
}

export interface DashboardPagesData {
  top_pages: TopPage[]
  entry_pages: TopPage[]
  exit_pages: TopPage[]
}

export interface DashboardLocationsData {
  countries: CountryStat[]
  cities: CityStat[]
  regions: RegionStat[]
  languages: LanguageStat[]
  timezones: TimezoneStat[]
}

export interface DashboardDevicesData {
  browsers: BrowserStat[]
  os: OSStat[]
  devices: DeviceStat[]
  screen_resolutions: ScreenResolutionStat[]
}

export interface DashboardReferrersData {
  top_referrers: TopReferrer[]
  channels?: ChannelStat[]
}

export interface DashboardGoalsData {
  goal_counts: GoalCountStat[]
  /** M12-f: whether the goal counts include imported days, like every merged card. */
  imported?: ImportedProvenance
}

export function getDashboardOverview(siteId: string, startDate?: string, endDate?: string, interval?: string, filters?: string): Promise<DashboardOverviewData> {
  return apiRequest<DashboardOverviewData>(`/sites/${siteId}/dashboard/overview${buildQuery({ startDate, endDate, interval, filters })}`)
}


// ---------------------------------------------------------------------------
// The Pages surface (PULSE-18).
//
// 🔴 These rates are NOT the ones on TopPage. `TopPage.bounce_rate` and
// `avg_duration` are computed per VISIT for every dimension (the backend's
// dimension_rates.go says so outright), so on a page row they describe whole
// visits that TOUCHED the page rather than the page itself. This row's
// `avg_time_on_page` is AVG(PageTimeExpr) per path and its `entry_bounce_rate`
// is entry-scoped — the GA4/Plausible definition. Do not render one under the
// other's label, and do not "simplify" by reusing TopPage here.
//
// Every rate is `number | null`. NULL means UNMEASURED and must render as an em
// dash — never 0. A page nobody entered has no entry bounce; a page with no
// scroll beacons has no scroll depth; a page with no prior period has no delta,
// and 0 would claim it was flat.
// ---------------------------------------------------------------------------
export interface PageTableRow {
  path: string
  pageviews: number
  visitors: number
  entries: number
  exits: number
  exit_rate: number | null
  avg_time_on_page: number | null
  entry_bounce_rate: number | null
  avg_scroll_depth: number | null
  /** Daily pageviews across the selected range, oldest first, from page_daily. */
  trend: number[]
  /** Percent change against the preceding range of equal length; null = incomparable. */
  delta: number | null
}

export interface PagesTableData {
  pages: PageTableRow[]
}

export function getPagesTable(siteId: string, startDate?: string, endDate?: string, limit = 500, filters?: string, period?: string): Promise<PagesTableData> {
  return apiRequest<PagesTableData>(`/sites/${siteId}/pages/table${buildQuery({ startDate, endDate, period, limit, filters })}`)
}

export function getDashboardPages(siteId: string, startDate?: string, endDate?: string, limit = 10, filters?: string): Promise<DashboardPagesData> {
  return apiRequest<DashboardPagesData>(`/sites/${siteId}/dashboard/pages${buildQuery({ startDate, endDate, limit, filters })}`)
}


export function getDashboardLocations(siteId: string, startDate?: string, endDate?: string, limit = 10, countryLimit = 250, filters?: string): Promise<DashboardLocationsData> {
  return apiRequest<DashboardLocationsData>(`/sites/${siteId}/dashboard/locations${buildQuery({ startDate, endDate, limit, countryLimit, filters })}`)
}


export function getDashboardDevices(siteId: string, startDate?: string, endDate?: string, limit = 10, filters?: string): Promise<DashboardDevicesData> {
  return apiRequest<DashboardDevicesData>(`/sites/${siteId}/dashboard/devices${buildQuery({ startDate, endDate, limit, filters })}`)
}


export function getDashboardReferrers(siteId: string, startDate?: string, endDate?: string, limit = 10, filters?: string): Promise<DashboardReferrersData> {
  return apiRequest<DashboardReferrersData>(`/sites/${siteId}/dashboard/referrers${buildQuery({ startDate, endDate, limit, filters })}`)
}


export function getDashboardGoals(siteId: string, startDate?: string, endDate?: string, limit = 10, filters?: string): Promise<DashboardGoalsData> {
  return apiRequest<DashboardGoalsData>(`/sites/${siteId}/dashboard/goals${buildQuery({ startDate, endDate, limit, filters })}`)
}


// ─── Event Properties ────────────────────────────────────────────────

export interface EventPropertyKey {
  key: string
  count: number
}

export interface EventPropertyValue {
  value: string
  count: number
}

export function getEventPropertyKeys(siteId: string, eventName: string, startDate?: string, endDate?: string): Promise<EventPropertyKey[]> {
  return apiRequest<{ keys: EventPropertyKey[] }>(`/sites/${siteId}/goals/${encodeURIComponent(eventName)}/properties${buildQuery({ startDate, endDate })}`)
    .then(r => r?.keys || [])
}

// `period` wins over the dates when given (buildQuery): the server resolves a
// token like `1h` or `today` in the SITE's timezone, which a date-only fetch
// cannot express — the same reason the campaigns fetch threads it.
export function getEventPropertyValues(siteId: string, eventName: string, propName: string, startDate?: string, endDate?: string, limit = 20, period?: string): Promise<EventPropertyValue[]> {
  return apiRequest<{ values: EventPropertyValue[] }>(`/sites/${siteId}/goals/${encodeURIComponent(eventName)}/properties/${encodeURIComponent(propName)}${buildQuery({ startDate, endDate, limit, period })}`)
    .then(r => r?.values || [])
}



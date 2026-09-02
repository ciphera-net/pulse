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
  count: number
  display_name?: string | null
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
  },
): string {
  const params = new URLSearchParams()
  if (opts.period) {
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
export const getGoalStats = createListFetcher<GoalCountStat>('goals/stats', 'goal_counts', 20)
export const getChannels = createListFetcher<ChannelStat>('channels', 'channels', 20)
export const getCampaigns = createListFetcher<CampaignStat>('campaigns', 'campaigns')

// ─── Stats & Realtime ───────────────────────────────────────────────

export function getStats(siteId: string, startDate?: string, endDate?: string, filters?: string, period?: string): Promise<Stats> {
  return apiRequest<Stats>(`/sites/${siteId}/stats${buildQuery({ startDate, endDate, filters, period })}`)
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

export interface RealtimePageVisitors {
  path: string
  visitors: number
}

export async function getRealtimePages(siteId: string): Promise<RealtimePageVisitors[]> {
  const res = await apiRequest<{ pages: RealtimePageVisitors[] }>(`/sites/${siteId}/realtime/pages`)
  return res.pages ?? []
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

export function getDashboard(siteId: string, startDate?: string, endDate?: string, limit = 10, interval?: string, filters?: string, period?: string): Promise<DashboardData> {
  return apiRequest<DashboardData>(`/sites/${siteId}/dashboard${buildQuery({ startDate, endDate, limit, interval, filters, period })}`)
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
}

export function getDashboardOverview(siteId: string, startDate?: string, endDate?: string, interval?: string, filters?: string): Promise<DashboardOverviewData> {
  return apiRequest<DashboardOverviewData>(`/sites/${siteId}/dashboard/overview${buildQuery({ startDate, endDate, interval, filters })}`)
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

export function getEventPropertyValues(siteId: string, eventName: string, propName: string, startDate?: string, endDate?: string, limit = 20): Promise<EventPropertyValue[]> {
  return apiRequest<{ values: EventPropertyValue[] }>(`/sites/${siteId}/goals/${encodeURIComponent(eventName)}/properties/${encodeURIComponent(propName)}${buildQuery({ startDate, endDate, limit })}`)
    .then(r => r?.values || [])
}



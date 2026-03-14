import apiRequest from './client'
import { Site } from './sites'

// ─── Types ──────────────────────────────────────────────────────────

export interface Stats {
  pageviews: number
  visitors: number
  bounce_rate: number
  avg_duration: number
}

export interface TopPage {
  path: string
  pageviews: number
  visits?: number
}

export interface ScreenResolutionStat {
  screen_resolution: string
  pageviews: number
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
  visitors: number
  pageviews: number
}

export interface TopReferrer {
  referrer: string
  pageviews: number
}

export interface CountryStat {
  country: string
  pageviews: number
}

export interface CityStat {
  city: string
  country: string
  pageviews: number
}

export interface RegionStat {
  region: string
  country: string
  pageviews: number
}

export interface BrowserStat {
  browser: string
  pageviews: number
}

export interface OSStat {
  os: string
  pageviews: number
}

export interface DeviceStat {
  device: string
  pageviews: number
}

export interface DailyStat {
  date: string
  pageviews: number
  visitors: number
  bounce_rate: number
  avg_duration: number
}

export interface RealtimeStats {
  visitors: number
}

export interface AuthParams {
  password?: string
  captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
}

export interface FrustrationSummary {
  rage_clicks: number
  rage_unique_elements: number
  rage_top_page: string
  dead_clicks: number
  dead_unique_elements: number
  dead_top_page: string
  prev_rage_clicks: number
  prev_dead_clicks: number
}

export interface FrustrationElement {
  selector: string
  page_path: string
  count: number
  avg_click_count?: number
  sessions: number
  last_seen: string
}

export interface FrustrationByPage {
  page_path: string
  rage_clicks: number
  dead_clicks: number
  total: number
  unique_elements: number
}

// ─── Helpers ────────────────────────────────────────────────────────

function appendAuthParams(params: URLSearchParams, auth?: AuthParams) {
  if (auth?.password) params.append('password', auth.password)
  if (auth?.captcha?.captcha_id) params.append('captcha_id', auth.captcha.captcha_id)
  if (auth?.captcha?.captcha_solution) params.append('captcha_solution', auth.captcha.captcha_solution)
  if (auth?.captcha?.captcha_token) params.append('captcha_token', auth.captcha.captcha_token)
}

function buildQuery(
  opts: {
    startDate?: string
    endDate?: string
    limit?: number
    interval?: string
    countryLimit?: number
    sort?: string
    filters?: string
  },
  auth?: AuthParams
): string {
  const params = new URLSearchParams()
  if (opts.startDate) params.append('start_date', opts.startDate)
  if (opts.endDate) params.append('end_date', opts.endDate)
  if (opts.limit != null) params.append('limit', opts.limit.toString())
  if (opts.interval) params.append('interval', opts.interval)
  if (opts.countryLimit != null) params.append('country_limit', opts.countryLimit.toString())
  if (opts.sort) params.append('sort', opts.sort)
  if (opts.filters) params.append('filters', opts.filters)
  if (auth) appendAuthParams(params, auth)
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Factory for endpoints that return an array nested under a response key. */
function createListFetcher<T>(path: string, field: string, defaultLimit = 10) {
  return (siteId: string, startDate?: string, endDate?: string, limit = defaultLimit, filters?: string): Promise<T[]> =>
    apiRequest<Record<string, T[]>>(`/sites/${siteId}/${path}${buildQuery({ startDate, endDate, limit, filters })}`)
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
export const getGoalStats = createListFetcher<GoalCountStat>('goals/stats', 'goal_counts', 20)
export const getCampaigns = createListFetcher<CampaignStat>('campaigns', 'campaigns')

// ─── Stats & Realtime ───────────────────────────────────────────────

export function getStats(siteId: string, startDate?: string, endDate?: string, filters?: string): Promise<Stats> {
  return apiRequest<Stats>(`/sites/${siteId}/stats${buildQuery({ startDate, endDate, filters })}`)
}

export function getPublicStats(siteId: string, startDate?: string, endDate?: string, auth?: AuthParams): Promise<Stats> {
  return apiRequest<Stats>(`/public/sites/${siteId}/stats${buildQuery({ startDate, endDate }, auth)}`)
}

export function getRealtime(siteId: string): Promise<RealtimeStats> {
  return apiRequest<RealtimeStats>(`/sites/${siteId}/realtime`)
}

export function getPublicRealtime(siteId: string, auth?: AuthParams): Promise<RealtimeStats> {
  return apiRequest<RealtimeStats>(`/public/sites/${siteId}/realtime${buildQuery({}, auth)}`)
}

// ─── Daily Stats ────────────────────────────────────────────────────

export function getDailyStats(siteId: string, startDate?: string, endDate?: string, interval?: string, filters?: string): Promise<DailyStat[]> {
  return apiRequest<{ stats: DailyStat[] }>(`/sites/${siteId}/daily${buildQuery({ startDate, endDate, interval, filters })}`)
    .then(r => r?.stats || [])
}

export function getPublicDailyStats(siteId: string, startDate?: string, endDate?: string, interval?: string, auth?: AuthParams): Promise<DailyStat[]> {
  return apiRequest<{ stats: DailyStat[] }>(`/public/sites/${siteId}/daily${buildQuery({ startDate, endDate, interval }, auth)}`)
    .then(r => r?.stats || [])
}

// ─── Public Campaigns ───────────────────────────────────────────────

export function getPublicCampaigns(siteId: string, startDate?: string, endDate?: string, limit = 10, auth?: AuthParams): Promise<CampaignStat[]> {
  return apiRequest<{ campaigns: CampaignStat[] }>(`/public/sites/${siteId}/campaigns${buildQuery({ startDate, endDate, limit }, auth)}`)
    .then(r => r?.campaigns || [])
}

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
  countries: CountryStat[]
  cities: CityStat[]
  regions: RegionStat[]
  browsers: BrowserStat[]
  os: OSStat[]
  devices: DeviceStat[]
  screen_resolutions: ScreenResolutionStat[]
  goal_counts?: GoalCountStat[]
}

export function getDashboard(siteId: string, startDate?: string, endDate?: string, limit = 10, interval?: string, filters?: string): Promise<DashboardData> {
  return apiRequest<DashboardData>(`/sites/${siteId}/dashboard${buildQuery({ startDate, endDate, limit, interval, filters })}`)
}

export function getPublicDashboard(
  siteId: string,
  startDate?: string,
  endDate?: string,
  limit = 10,
  interval?: string,
  password?: string,
  captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardData> {
  return apiRequest<DashboardData>(
    `/public/sites/${siteId}/dashboard${buildQuery({ startDate, endDate, limit, interval }, { password, captcha })}`
  )
}

// ─── Focused Dashboard Endpoints ────────────────────────────────────

export interface DashboardOverviewData {
  site: Site
  stats: Stats
  realtime_visitors: number
  daily_stats: DailyStat[]
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
}

export interface DashboardDevicesData {
  browsers: BrowserStat[]
  os: OSStat[]
  devices: DeviceStat[]
  screen_resolutions: ScreenResolutionStat[]
}

export interface DashboardReferrersData {
  top_referrers: TopReferrer[]
}

export interface DashboardGoalsData {
  goal_counts: GoalCountStat[]
}

export function getDashboardOverview(siteId: string, startDate?: string, endDate?: string, interval?: string, filters?: string): Promise<DashboardOverviewData> {
  return apiRequest<DashboardOverviewData>(`/sites/${siteId}/dashboard/overview${buildQuery({ startDate, endDate, interval, filters })}`)
}

export function getPublicDashboardOverview(
  siteId: string, startDate?: string, endDate?: string, interval?: string,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardOverviewData> {
  return apiRequest<DashboardOverviewData>(`/public/sites/${siteId}/dashboard/overview${buildQuery({ startDate, endDate, interval }, { password, captcha })}`)
}

export function getDashboardPages(siteId: string, startDate?: string, endDate?: string, limit = 10, filters?: string): Promise<DashboardPagesData> {
  return apiRequest<DashboardPagesData>(`/sites/${siteId}/dashboard/pages${buildQuery({ startDate, endDate, limit, filters })}`)
}

export function getPublicDashboardPages(
  siteId: string, startDate?: string, endDate?: string, limit = 10,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardPagesData> {
  return apiRequest<DashboardPagesData>(`/public/sites/${siteId}/dashboard/pages${buildQuery({ startDate, endDate, limit }, { password, captcha })}`)
}

export function getDashboardLocations(siteId: string, startDate?: string, endDate?: string, limit = 10, countryLimit = 250, filters?: string): Promise<DashboardLocationsData> {
  return apiRequest<DashboardLocationsData>(`/sites/${siteId}/dashboard/locations${buildQuery({ startDate, endDate, limit, countryLimit, filters })}`)
}

export function getPublicDashboardLocations(
  siteId: string, startDate?: string, endDate?: string, limit = 10, countryLimit = 250,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardLocationsData> {
  return apiRequest<DashboardLocationsData>(`/public/sites/${siteId}/dashboard/locations${buildQuery({ startDate, endDate, limit, countryLimit }, { password, captcha })}`)
}

export function getDashboardDevices(siteId: string, startDate?: string, endDate?: string, limit = 10, filters?: string): Promise<DashboardDevicesData> {
  return apiRequest<DashboardDevicesData>(`/sites/${siteId}/dashboard/devices${buildQuery({ startDate, endDate, limit, filters })}`)
}

export function getPublicDashboardDevices(
  siteId: string, startDate?: string, endDate?: string, limit = 10,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardDevicesData> {
  return apiRequest<DashboardDevicesData>(`/public/sites/${siteId}/dashboard/devices${buildQuery({ startDate, endDate, limit }, { password, captcha })}`)
}

export function getDashboardReferrers(siteId: string, startDate?: string, endDate?: string, limit = 10, filters?: string): Promise<DashboardReferrersData> {
  return apiRequest<DashboardReferrersData>(`/sites/${siteId}/dashboard/referrers${buildQuery({ startDate, endDate, limit, filters })}`)
}

export function getPublicDashboardReferrers(
  siteId: string, startDate?: string, endDate?: string, limit = 10,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardReferrersData> {
  return apiRequest<DashboardReferrersData>(`/public/sites/${siteId}/dashboard/referrers${buildQuery({ startDate, endDate, limit }, { password, captcha })}`)
}

export function getDashboardGoals(siteId: string, startDate?: string, endDate?: string, limit = 10, filters?: string): Promise<DashboardGoalsData> {
  return apiRequest<DashboardGoalsData>(`/sites/${siteId}/dashboard/goals${buildQuery({ startDate, endDate, limit, filters })}`)
}

export function getPublicDashboardGoals(
  siteId: string, startDate?: string, endDate?: string, limit = 10,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardGoalsData> {
  return apiRequest<DashboardGoalsData>(`/public/sites/${siteId}/dashboard/goals${buildQuery({ startDate, endDate, limit }, { password, captcha })}`)
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

// ─── Frustration Signals ────────────────────────────────────────────

export interface BehaviorData {
  summary: FrustrationSummary
  rage_clicks: { items: FrustrationElement[]; total: number }
  dead_clicks: { items: FrustrationElement[]; total: number }
  by_page: FrustrationByPage[]
}

const emptyBehavior: BehaviorData = {
  summary: { rage_clicks: 0, rage_unique_elements: 0, rage_top_page: '', dead_clicks: 0, dead_unique_elements: 0, dead_top_page: '', prev_rage_clicks: 0, prev_dead_clicks: 0 },
  rage_clicks: { items: [], total: 0 },
  dead_clicks: { items: [], total: 0 },
  by_page: [],
}

export function getBehavior(siteId: string, startDate?: string, endDate?: string, limit = 7): Promise<BehaviorData> {
  return apiRequest<BehaviorData>(`/sites/${siteId}/behavior${buildQuery({ startDate, endDate, limit })}`)
    .then(r => r ?? emptyBehavior)
}

export function getFrustrationSummary(siteId: string, startDate?: string, endDate?: string): Promise<FrustrationSummary> {
  return apiRequest<FrustrationSummary>(`/sites/${siteId}/frustration/summary${buildQuery({ startDate, endDate })}`)
    .then(r => r ?? { rage_clicks: 0, rage_unique_elements: 0, rage_top_page: '', dead_clicks: 0, dead_unique_elements: 0, dead_top_page: '', prev_rage_clicks: 0, prev_dead_clicks: 0 })
}

export function getRageClicks(siteId: string, startDate?: string, endDate?: string, limit = 10, pagePath?: string): Promise<{ items: FrustrationElement[], total: number }> {
  const params = buildQuery({ startDate, endDate, limit })
  const pageFilter = pagePath ? `&page_path=${encodeURIComponent(pagePath)}` : ''
  return apiRequest<{ items: FrustrationElement[], total: number }>(`/sites/${siteId}/frustration/rage-clicks${params}${pageFilter}`)
    .then(r => r ?? { items: [], total: 0 })
}

export function getDeadClicks(siteId: string, startDate?: string, endDate?: string, limit = 10, pagePath?: string): Promise<{ items: FrustrationElement[], total: number }> {
  const params = buildQuery({ startDate, endDate, limit })
  const pageFilter = pagePath ? `&page_path=${encodeURIComponent(pagePath)}` : ''
  return apiRequest<{ items: FrustrationElement[], total: number }>(`/sites/${siteId}/frustration/dead-clicks${params}${pageFilter}`)
    .then(r => r ?? { items: [], total: 0 })
}

export function getFrustrationByPage(siteId: string, startDate?: string, endDate?: string, limit = 20): Promise<FrustrationByPage[]> {
  return apiRequest<{ pages: FrustrationByPage[] }>(`/sites/${siteId}/frustration/by-page${buildQuery({ startDate, endDate, limit })}`)
    .then(r => r?.pages ?? [])
}

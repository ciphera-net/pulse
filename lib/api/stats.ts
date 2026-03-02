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

export interface PerformanceStats {
  lcp: number
  cls: number
  inp: number
}

export interface PerformanceByPageStat {
  path: string
  samples: number
  lcp: number | null
  cls: number | null
  inp: number | null
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
  if (auth) appendAuthParams(params, auth)
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Factory for endpoints that return an array nested under a response key. */
function createListFetcher<T>(path: string, field: string, defaultLimit = 10) {
  return (siteId: string, startDate?: string, endDate?: string, limit = defaultLimit): Promise<T[]> =>
    apiRequest<Record<string, T[]>>(`/sites/${siteId}/${path}${buildQuery({ startDate, endDate, limit })}`)
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

export function getStats(siteId: string, startDate?: string, endDate?: string): Promise<Stats> {
  return apiRequest<Stats>(`/sites/${siteId}/stats${buildQuery({ startDate, endDate })}`)
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

export function getDailyStats(siteId: string, startDate?: string, endDate?: string, interval?: string): Promise<DailyStat[]> {
  return apiRequest<{ stats: DailyStat[] }>(`/sites/${siteId}/daily${buildQuery({ startDate, endDate, interval })}`)
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

// ─── Performance By Page ────────────────────────────────────────────

export function getPerformanceByPage(
  siteId: string,
  startDate?: string,
  endDate?: string,
  opts?: { limit?: number; sort?: 'lcp' | 'cls' | 'inp' }
): Promise<PerformanceByPageStat[]> {
  return apiRequest<{ performance_by_page: PerformanceByPageStat[] }>(
    `/sites/${siteId}/performance-by-page${buildQuery({ startDate, endDate, limit: opts?.limit, sort: opts?.sort })}`
  ).then(r => r?.performance_by_page ?? [])
}

export function getPublicPerformanceByPage(
  siteId: string,
  startDate?: string,
  endDate?: string,
  opts?: { limit?: number; sort?: 'lcp' | 'cls' | 'inp' },
  auth?: AuthParams
): Promise<PerformanceByPageStat[]> {
  return apiRequest<{ performance_by_page: PerformanceByPageStat[] }>(
    `/public/sites/${siteId}/performance-by-page${buildQuery({ startDate, endDate, limit: opts?.limit, sort: opts?.sort }, auth)}`
  ).then(r => r?.performance_by_page ?? [])
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
  performance?: PerformanceStats
  performance_by_page?: PerformanceByPageStat[]
  goal_counts?: GoalCountStat[]
}

export function getDashboard(siteId: string, startDate?: string, endDate?: string, limit = 10, interval?: string): Promise<DashboardData> {
  return apiRequest<DashboardData>(`/sites/${siteId}/dashboard${buildQuery({ startDate, endDate, limit, interval })}`)
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

export interface DashboardPerformanceData {
  performance?: PerformanceStats
  performance_by_page?: PerformanceByPageStat[]
}

export interface DashboardGoalsData {
  goal_counts: GoalCountStat[]
}

export function getDashboardOverview(siteId: string, startDate?: string, endDate?: string, interval?: string): Promise<DashboardOverviewData> {
  return apiRequest<DashboardOverviewData>(`/sites/${siteId}/dashboard/overview${buildQuery({ startDate, endDate, interval })}`)
}

export function getPublicDashboardOverview(
  siteId: string, startDate?: string, endDate?: string, interval?: string,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardOverviewData> {
  return apiRequest<DashboardOverviewData>(`/public/sites/${siteId}/dashboard/overview${buildQuery({ startDate, endDate, interval }, { password, captcha })}`)
}

export function getDashboardPages(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<DashboardPagesData> {
  return apiRequest<DashboardPagesData>(`/sites/${siteId}/dashboard/pages${buildQuery({ startDate, endDate, limit })}`)
}

export function getPublicDashboardPages(
  siteId: string, startDate?: string, endDate?: string, limit = 10,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardPagesData> {
  return apiRequest<DashboardPagesData>(`/public/sites/${siteId}/dashboard/pages${buildQuery({ startDate, endDate, limit }, { password, captcha })}`)
}

export function getDashboardLocations(siteId: string, startDate?: string, endDate?: string, limit = 10, countryLimit = 250): Promise<DashboardLocationsData> {
  return apiRequest<DashboardLocationsData>(`/sites/${siteId}/dashboard/locations${buildQuery({ startDate, endDate, limit, countryLimit })}`)
}

export function getPublicDashboardLocations(
  siteId: string, startDate?: string, endDate?: string, limit = 10, countryLimit = 250,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardLocationsData> {
  return apiRequest<DashboardLocationsData>(`/public/sites/${siteId}/dashboard/locations${buildQuery({ startDate, endDate, limit, countryLimit }, { password, captcha })}`)
}

export function getDashboardDevices(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<DashboardDevicesData> {
  return apiRequest<DashboardDevicesData>(`/sites/${siteId}/dashboard/devices${buildQuery({ startDate, endDate, limit })}`)
}

export function getPublicDashboardDevices(
  siteId: string, startDate?: string, endDate?: string, limit = 10,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardDevicesData> {
  return apiRequest<DashboardDevicesData>(`/public/sites/${siteId}/dashboard/devices${buildQuery({ startDate, endDate, limit }, { password, captcha })}`)
}

export function getDashboardReferrers(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<DashboardReferrersData> {
  return apiRequest<DashboardReferrersData>(`/sites/${siteId}/dashboard/referrers${buildQuery({ startDate, endDate, limit })}`)
}

export function getPublicDashboardReferrers(
  siteId: string, startDate?: string, endDate?: string, limit = 10,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardReferrersData> {
  return apiRequest<DashboardReferrersData>(`/public/sites/${siteId}/dashboard/referrers${buildQuery({ startDate, endDate, limit }, { password, captcha })}`)
}

export function getDashboardPerformance(siteId: string, startDate?: string, endDate?: string): Promise<DashboardPerformanceData> {
  return apiRequest<DashboardPerformanceData>(`/sites/${siteId}/dashboard/performance${buildQuery({ startDate, endDate })}`)
}

export function getPublicDashboardPerformance(
  siteId: string, startDate?: string, endDate?: string,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardPerformanceData> {
  return apiRequest<DashboardPerformanceData>(`/public/sites/${siteId}/dashboard/performance${buildQuery({ startDate, endDate }, { password, captcha })}`)
}

export function getDashboardGoals(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<DashboardGoalsData> {
  return apiRequest<DashboardGoalsData>(`/sites/${siteId}/dashboard/goals${buildQuery({ startDate, endDate, limit })}`)
}

export function getPublicDashboardGoals(
  siteId: string, startDate?: string, endDate?: string, limit = 10,
  password?: string, captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardGoalsData> {
  return apiRequest<DashboardGoalsData>(`/public/sites/${siteId}/dashboard/goals${buildQuery({ startDate, endDate, limit }, { password, captcha })}`)
}

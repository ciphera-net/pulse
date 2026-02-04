import apiRequest from './client'
import { Site } from './sites'

export interface Stats {
  pageviews: number
  visitors: number
  bounce_rate: number
  avg_duration: number
}

export interface TopPage {
  path: string
  pageviews: number
  visits?: number // For entry/exit pages
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

function appendAuthParams(params: URLSearchParams, auth?: AuthParams) {
  if (auth?.password) params.append('password', auth.password)
  if (auth?.captcha?.captcha_id) params.append('captcha_id', auth.captcha.captcha_id)
  if (auth?.captcha?.captcha_solution) params.append('captcha_solution', auth.captcha.captcha_solution)
  if (auth?.captcha?.captcha_token) params.append('captcha_token', auth.captcha.captcha_token)
}

export async function getStats(siteId: string, startDate?: string, endDate?: string): Promise<Stats> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  const query = params.toString()
  return apiRequest<Stats>(`/sites/${siteId}/stats${query ? `?${query}` : ''}`)
}

export async function getPublicStats(siteId: string, startDate?: string, endDate?: string, auth?: AuthParams): Promise<Stats> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  appendAuthParams(params, auth)
  const query = params.toString()
  return apiRequest<Stats>(`/public/sites/${siteId}/stats${query ? `?${query}` : ''}`)
}

export async function getRealtime(siteId: string): Promise<RealtimeStats> {
  return apiRequest<RealtimeStats>(`/sites/${siteId}/realtime`)
}

export async function getPublicRealtime(siteId: string, auth?: AuthParams): Promise<RealtimeStats> {
  const params = new URLSearchParams()
  appendAuthParams(params, auth)
  return apiRequest<RealtimeStats>(`/public/sites/${siteId}/realtime?${params.toString()}`)
}

export async function getTopPages(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<TopPage[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ pages: TopPage[] }>(`/sites/${siteId}/pages?${params.toString()}`).then(r => r?.pages || [])
}

export async function getTopReferrers(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<TopReferrer[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ referrers: TopReferrer[] }>(`/sites/${siteId}/referrers?${params.toString()}`).then(r => r?.referrers || [])
}

export async function getCountries(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<CountryStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ countries: CountryStat[] }>(`/sites/${siteId}/countries?${params.toString()}`).then(r => r?.countries || [])
}

export async function getCities(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<CityStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ cities: CityStat[] }>(`/sites/${siteId}/cities?${params.toString()}`).then(r => r?.cities || [])
}

export async function getRegions(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<RegionStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ regions: RegionStat[] }>(`/sites/${siteId}/regions?${params.toString()}`).then(r => r?.regions || [])
}

export async function getBrowsers(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<BrowserStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ browsers: BrowserStat[] }>(`/sites/${siteId}/browsers?${params.toString()}`).then(r => r?.browsers || [])
}

export async function getOS(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<OSStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ os: OSStat[] }>(`/sites/${siteId}/os?${params.toString()}`).then(r => r?.os || [])
}

export async function getDevices(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<DeviceStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ devices: DeviceStat[] }>(`/sites/${siteId}/devices?${params.toString()}`).then(r => r?.devices || [])
}

export async function getDailyStats(siteId: string, startDate?: string, endDate?: string, interval?: string): Promise<DailyStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (interval) params.append('interval', interval)
  return apiRequest<{ stats: DailyStat[] }>(`/sites/${siteId}/daily?${params.toString()}`).then(r => r?.stats || [])
}

export async function getPublicDailyStats(siteId: string, startDate?: string, endDate?: string, interval?: string, auth?: AuthParams): Promise<DailyStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (interval) params.append('interval', interval)
  appendAuthParams(params, auth)
  return apiRequest<{ stats: DailyStat[] }>(`/public/sites/${siteId}/daily?${params.toString()}`).then(r => r?.stats || [])
}

export async function getEntryPages(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<TopPage[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ pages: TopPage[] }>(`/sites/${siteId}/entry-pages?${params.toString()}`).then(r => r?.pages || [])
}

export async function getExitPages(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<TopPage[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ pages: TopPage[] }>(`/sites/${siteId}/exit-pages?${params.toString()}`).then(r => r?.pages || [])
}

export async function getScreenResolutions(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<ScreenResolutionStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ screen_resolutions: ScreenResolutionStat[] }>(`/sites/${siteId}/screen-resolutions?${params.toString()}`).then(r => r?.screen_resolutions || [])
}

export async function getPerformanceByPage(
  siteId: string,
  startDate?: string,
  endDate?: string,
  opts?: { limit?: number; sort?: 'lcp' | 'cls' | 'inp' }
): Promise<PerformanceByPageStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (opts?.limit != null) params.append('limit', String(opts.limit))
  if (opts?.sort) params.append('sort', opts.sort)
  const res = await apiRequest<{ performance_by_page: PerformanceByPageStat[] }>(
    `/sites/${siteId}/performance-by-page?${params.toString()}`
  )
  return res?.performance_by_page ?? []
}

export async function getPublicPerformanceByPage(
  siteId: string,
  startDate?: string,
  endDate?: string,
  opts?: { limit?: number; sort?: 'lcp' | 'cls' | 'inp' },
  auth?: AuthParams
): Promise<PerformanceByPageStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (opts?.limit != null) params.append('limit', String(opts.limit))
  if (opts?.sort) params.append('sort', opts.sort)
  appendAuthParams(params, auth)
  const res = await apiRequest<{ performance_by_page: PerformanceByPageStat[] }>(
    `/public/sites/${siteId}/performance-by-page?${params.toString()}`
  )
  return res?.performance_by_page ?? []
}

export async function getGoalStats(siteId: string, startDate?: string, endDate?: string, limit = 20): Promise<GoalCountStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ goal_counts: GoalCountStat[] }>(`/sites/${siteId}/goals/stats?${params.toString()}`).then(r => r?.goal_counts || [])
}

export async function getCampaigns(siteId: string, startDate?: string, endDate?: string, limit = 10): Promise<CampaignStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  return apiRequest<{ campaigns: CampaignStat[] }>(`/sites/${siteId}/campaigns?${params.toString()}`).then(r => r?.campaigns || [])
}

export async function getPublicCampaigns(siteId: string, startDate?: string, endDate?: string, limit = 10, auth?: AuthParams): Promise<CampaignStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  params.append('limit', limit.toString())
  appendAuthParams(params, auth)
  return apiRequest<{ campaigns: CampaignStat[] }>(`/public/sites/${siteId}/campaigns?${params.toString()}`).then(r => r?.campaigns || [])
}

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

export async function getDashboard(siteId: string, startDate?: string, endDate?: string, limit = 10, interval?: string): Promise<DashboardData> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (interval) params.append('interval', interval)
  params.append('limit', limit.toString())
  return apiRequest<DashboardData>(`/sites/${siteId}/dashboard?${params.toString()}`)
}

export async function getPublicDashboard(
  siteId: string, 
  startDate?: string, 
  endDate?: string, 
  limit = 10, 
  interval?: string, 
  password?: string,
  captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<DashboardData> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (interval) params.append('interval', interval)
  
  appendAuthParams(params, { password, captcha })
  
  params.append('limit', limit.toString())
  return apiRequest<DashboardData>(`/public/sites/${siteId}/dashboard?${params.toString()}`)
}

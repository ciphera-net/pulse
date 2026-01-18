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
}

export interface RealtimeStats {
  visitors: number
}

export async function getStats(siteId: string, startDate?: string, endDate?: string): Promise<Stats> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  const query = params.toString()
  return apiRequest<Stats>(`/sites/${siteId}/stats${query ? `?${query}` : ''}`)
}

export async function getRealtime(siteId: string): Promise<RealtimeStats> {
  return apiRequest<RealtimeStats>(`/sites/${siteId}/realtime`)
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
}

export async function getDashboard(siteId: string, startDate?: string, endDate?: string, limit = 10, interval?: string): Promise<DashboardData> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (interval) params.append('interval', interval)
  params.append('limit', limit.toString())
  return apiRequest<DashboardData>(`/sites/${siteId}/dashboard?${params.toString()}`)
}

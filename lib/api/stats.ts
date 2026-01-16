import apiRequest from './client'

export interface Stats {
  pageviews: number
  visitors: number
}

export interface TopPage {
  path: string
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

export async function getDailyStats(siteId: string, startDate?: string, endDate?: string): Promise<DailyStat[]> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  return apiRequest<{ stats: DailyStat[] }>(`/sites/${siteId}/daily?${params.toString()}`).then(r => r?.stats || [])
}

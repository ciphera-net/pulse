import apiRequest from './client'

// ─── Types ──────────────────────────────────────────────────────────

export interface GSCStatus {
  connected: boolean
  google_email?: string
  gsc_property?: string
  status?: 'active' | 'syncing' | 'error'
  error_message?: string | null
  last_synced_at?: string | null
  created_at?: string
}

export interface GSCOverview {
  total_clicks: number
  total_impressions: number
  avg_ctr: number
  avg_position: number
  prev_clicks: number
  prev_impressions: number
  prev_avg_ctr: number
  prev_avg_position: number
}

export interface GSCDataRow {
  query: string
  page: string
  impressions: number
  clicks: number
  ctr: number
  position: number
}

export interface GSCQueryResponse {
  queries: GSCDataRow[]
  total: number
}

export interface GSCPageResponse {
  pages: GSCDataRow[]
  total: number
}

// ─── API Functions ──────────────────────────────────────────────────

export async function getGSCAuthURL(siteId: string): Promise<{ auth_url: string }> {
  return apiRequest<{ auth_url: string }>(`/sites/${siteId}/integrations/gsc/auth-url`)
}

export async function getGSCStatus(siteId: string): Promise<GSCStatus> {
  return apiRequest<GSCStatus>(`/sites/${siteId}/integrations/gsc/status`)
}

export async function disconnectGSC(siteId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/integrations/gsc`, {
    method: 'DELETE',
  })
}

export async function getGSCOverview(siteId: string, startDate: string, endDate: string): Promise<GSCOverview> {
  return apiRequest<GSCOverview>(`/sites/${siteId}/gsc/overview?start_date=${startDate}&end_date=${endDate}`)
}

export async function getGSCTopQueries(siteId: string, startDate: string, endDate: string, limit = 50, offset = 0): Promise<GSCQueryResponse> {
  return apiRequest<GSCQueryResponse>(`/sites/${siteId}/gsc/top-queries?start_date=${startDate}&end_date=${endDate}&limit=${limit}&offset=${offset}`)
}

export async function getGSCTopPages(siteId: string, startDate: string, endDate: string, limit = 50, offset = 0): Promise<GSCPageResponse> {
  return apiRequest<GSCPageResponse>(`/sites/${siteId}/gsc/top-pages?start_date=${startDate}&end_date=${endDate}&limit=${limit}&offset=${offset}`)
}

export async function getGSCQueryPages(siteId: string, query: string, startDate: string, endDate: string): Promise<GSCPageResponse> {
  return apiRequest<GSCPageResponse>(`/sites/${siteId}/gsc/query-pages?query=${encodeURIComponent(query)}&start_date=${startDate}&end_date=${endDate}`)
}

export async function getGSCPageQueries(siteId: string, page: string, startDate: string, endDate: string): Promise<GSCQueryResponse> {
  return apiRequest<GSCQueryResponse>(`/sites/${siteId}/gsc/page-queries?page=${encodeURIComponent(page)}&start_date=${startDate}&end_date=${endDate}`)
}

export interface GSCDailyTotal {
  date: string
  clicks: number
  impressions: number
}

export interface GSCNewQueries {
  count: number
  queries: string[]
}

export interface GSCCountryRow {
  country: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GSCCountryResponse {
  countries: GSCCountryRow[]
  total: number
}

export interface GSCDeviceRow {
  device: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GSCDeviceResponse {
  devices: GSCDeviceRow[]
}

export interface GSCOpportunityRow {
  query: string
  clicks: number
  impressions: number
  position: number
  potential_clicks: number
}

export interface GSCOpportunityResponse {
  opportunities: GSCOpportunityRow[]
  total: number
}

export async function getGSCDailyTotals(siteId: string, startDate: string, endDate: string): Promise<{ daily_totals: GSCDailyTotal[] }> {
  return apiRequest<{ daily_totals: GSCDailyTotal[] }>(`/sites/${siteId}/gsc/daily-totals?start_date=${startDate}&end_date=${endDate}`)
}

export async function getGSCNewQueries(siteId: string, startDate: string, endDate: string): Promise<GSCNewQueries> {
  return apiRequest<GSCNewQueries>(`/sites/${siteId}/gsc/new-queries?start_date=${startDate}&end_date=${endDate}`)
}

export async function getGSCTopCountries(siteId: string, startDate: string, endDate: string, limit = 50, offset = 0): Promise<GSCCountryResponse> {
  return apiRequest<GSCCountryResponse>(`/sites/${siteId}/gsc/top-countries?start_date=${startDate}&end_date=${endDate}&limit=${limit}&offset=${offset}`)
}

export async function getGSCTopDevices(siteId: string, startDate: string, endDate: string): Promise<GSCDeviceResponse> {
  return apiRequest<GSCDeviceResponse>(`/sites/${siteId}/gsc/top-devices?start_date=${startDate}&end_date=${endDate}`)
}

export async function getGSCOpportunities(siteId: string, startDate: string, endDate: string, limit = 50): Promise<GSCOpportunityResponse> {
  return apiRequest<GSCOpportunityResponse>(`/sites/${siteId}/gsc/opportunities?start_date=${startDate}&end_date=${endDate}&limit=${limit}`)
}

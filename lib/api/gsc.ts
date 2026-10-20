import apiRequest, { type SendOptions } from './client'
import { sitePath, type SiteRef } from '@/lib/scope/site-ref'

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

export async function getGSCStatus(site: SiteRef): Promise<GSCStatus> {
  return apiRequest<GSCStatus>(sitePath(site, '/integrations/gsc/status'))
}

export async function disconnectGSC(siteId: string, send: SendOptions = {}): Promise<void> {
  await apiRequest(`/sites/${siteId}/integrations/gsc`, {
    method: 'DELETE',
    keepalive: send.keepalive,
  })
}

export async function getGSCOverview(site: SiteRef, startDate: string, endDate: string): Promise<GSCOverview> {
  return apiRequest<GSCOverview>(sitePath(site, `/gsc/overview?start_date=${startDate}&end_date=${endDate}`))
}

export async function getGSCTopQueries(site: SiteRef, startDate: string, endDate: string, limit = 50, offset = 0): Promise<GSCQueryResponse> {
  return apiRequest<GSCQueryResponse>(sitePath(site, `/gsc/top-queries?start_date=${startDate}&end_date=${endDate}&limit=${limit}&offset=${offset}`))
}

export async function getGSCTopPages(site: SiteRef, startDate: string, endDate: string, limit = 50, offset = 0): Promise<GSCPageResponse> {
  return apiRequest<GSCPageResponse>(sitePath(site, `/gsc/top-pages?start_date=${startDate}&end_date=${endDate}&limit=${limit}&offset=${offset}`))
}

export async function getGSCQueryPages(site: SiteRef, query: string, startDate: string, endDate: string): Promise<GSCPageResponse> {
  return apiRequest<GSCPageResponse>(sitePath(site, `/gsc/query-pages?query=${encodeURIComponent(query)}&start_date=${startDate}&end_date=${endDate}`))
}

export async function getGSCPageQueries(site: SiteRef, page: string, startDate: string, endDate: string): Promise<GSCQueryResponse> {
  return apiRequest<GSCQueryResponse>(sitePath(site, `/gsc/page-queries?page=${encodeURIComponent(page)}&start_date=${startDate}&end_date=${endDate}`))
}

export interface GSCDailyTotal {
  date: string
  clicks: number
  impressions: number
  ctr: number
  // * null on legacy-fallback rows (site's gsc_daily backfill not landed yet) —
  // * treat as "no position series", never as 0.
  position: number | null
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

export async function getGSCDailyTotals(site: SiteRef, startDate: string, endDate: string): Promise<{ daily_totals: GSCDailyTotal[] }> {
  return apiRequest<{ daily_totals: GSCDailyTotal[] }>(sitePath(site, `/gsc/daily-totals?start_date=${startDate}&end_date=${endDate}`))
}

export async function getGSCNewQueries(site: SiteRef, startDate: string, endDate: string): Promise<GSCNewQueries> {
  return apiRequest<GSCNewQueries>(sitePath(site, `/gsc/new-queries?start_date=${startDate}&end_date=${endDate}`))
}

export async function getGSCTopCountries(site: SiteRef, startDate: string, endDate: string, limit = 50, offset = 0): Promise<GSCCountryResponse> {
  return apiRequest<GSCCountryResponse>(sitePath(site, `/gsc/top-countries?start_date=${startDate}&end_date=${endDate}&limit=${limit}&offset=${offset}`))
}

export async function getGSCTopDevices(site: SiteRef, startDate: string, endDate: string): Promise<GSCDeviceResponse> {
  return apiRequest<GSCDeviceResponse>(sitePath(site, `/gsc/top-devices?start_date=${startDate}&end_date=${endDate}`))
}

export async function getGSCOpportunities(site: SiteRef, startDate: string, endDate: string, limit = 50): Promise<GSCOpportunityResponse> {
  return apiRequest<GSCOpportunityResponse>(sitePath(site, `/gsc/opportunities?start_date=${startDate}&end_date=${endDate}&limit=${limit}`))
}

export interface GSCQueryTrendPoint {
  date: string
  position: number
  clicks: number
  impressions: number
  ctr: number
}

export async function getGSCQueryTrend(
  site: SiteRef,
  query: string,
  startDate?: string,
  endDate?: string
): Promise<GSCQueryTrendPoint[]> {
  const params = new URLSearchParams({ query })
  if (startDate) params.set('start_date', startDate)
  if (endDate) params.set('end_date', endDate)
  const res = await apiRequest<{ trend: GSCQueryTrendPoint[] }>(
    sitePath(site, `/gsc/query-trend?${params}`)
  )
  return res.trend
}

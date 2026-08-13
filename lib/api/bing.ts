import apiRequest from './client'

/**
 * @file Bing Webmaster Tools integration — site-level daily search stats.
 *
 * ! DAILY TOTALS ONLY, AND THAT IS DELIBERATE. Bing's per-query endpoint refreshes weekly and
 * ! accepts no date range, so query rows could not honour the Search tab's date picker. Rather
 * ! than render a query table that silently ignores the page's primary control, the Bing view
 * ! shows site totals and says so. See pulse-backend migration 134.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface BingStatus {
  connected: boolean
  /** The exact verified property in Bing, including scheme (http/https/www are distinct there). */
  site_url?: string
  status?: 'active' | 'syncing' | 'error'
  error_message?: string | null
  last_synced_at?: string | null
  created_at?: string
}

export interface BingVerifiedSite {
  url: string
  is_verified: boolean
}

export interface BingOverview {
  total_clicks: number
  total_impressions: number
  ctr: number
  prev_total_clicks: number
  prev_total_impressions: number
  prev_ctr: number
}

export interface BingDailyRow {
  /**
   * ! BING'S day, in BING'S timezone (Pacific) — not the site's local day.
   * ! Never align this to a gsc_daily date as if they were the same interval; the two engines
   * ! bucket days differently and can disagree by up to 24 hours.
   */
  date: string
  clicks: number
  impressions: number
  ctr: number
}

/**
 * Echoed by both read endpoints so the UI can label whose day it is showing rather than implying
 * the two engines share one calendar.
 */
export type BingDateBasis = 'bing_local'

// ─── API Functions ──────────────────────────────────────────────────

/**
 * Lists the properties on the Bing account behind `apiKey`.
 *
 * ! POST with the key in the BODY, never a query string: a URL parameter lands in access logs,
 * ! browser history and any intermediary that records URLs. Nothing is persisted by this call.
 */
export async function listBingSites(siteId: string, apiKey: string): Promise<{ sites: BingVerifiedSite[] }> {
  return apiRequest<{ sites: BingVerifiedSite[] }>(
    `/sites/${siteId}/integrations/bing/sites`,
    { method: 'POST', body: JSON.stringify({ api_key: apiKey }) }
  )
}

export async function connectBing(siteId: string, apiKey: string, siteUrl: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/integrations/bing`, {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey, site_url: siteUrl }),
  })
}

export async function getBingStatus(siteId: string): Promise<BingStatus> {
  return apiRequest<BingStatus>(`/sites/${siteId}/integrations/bing/status`)
}

export async function disconnectBing(siteId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/integrations/bing`, { method: 'DELETE' })
}

export async function getBingOverview(
  siteId: string,
  startDate: string,
  endDate: string
): Promise<{ overview: BingOverview; date_basis: BingDateBasis }> {
  return apiRequest<{ overview: BingOverview; date_basis: BingDateBasis }>(
    `/sites/${siteId}/bing/overview?start_date=${startDate}&end_date=${endDate}`
  )
}

export async function getBingDailyTotals(
  siteId: string,
  startDate: string,
  endDate: string
): Promise<{ daily_totals: BingDailyRow[]; date_basis: BingDateBasis }> {
  return apiRequest<{ daily_totals: BingDailyRow[]; date_basis: BingDateBasis }>(
    `/sites/${siteId}/bing/daily-totals?start_date=${startDate}&end_date=${endDate}`
  )
}

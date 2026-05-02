import apiRequest from './client'

export interface PrivacyScanConfig {
  site_id: string
  enabled: boolean
  frequency: string
  next_scan_at?: string
}

export interface ThirdPartyScript {
  host: string
  category: string
  url: string
}

export interface SecurityHeaders {
  hsts: boolean
  x_content_type: boolean
  x_frame_options: boolean
  csp: boolean
  referrer_policy: boolean
  permissions_policy: boolean
}

export interface PrivacyScanResult {
  id: string
  site_id: string
  third_party_scripts: ThirdPartyScript[]
  cookies: Array<{ name: string; domain: string; secure: boolean; http_only: boolean }>
  security_headers: SecurityHeaders
  privacy_score: number
  issues: string[]
  triggered_by: string
  scanned_at: string
}

export async function getPrivacyScanConfig(siteId: string): Promise<PrivacyScanConfig | null> {
  try {
    return await apiRequest<PrivacyScanConfig>(`/sites/${siteId}/privacy/config`)
  } catch {
    return null
  }
}

export async function updatePrivacyScanConfig(siteId: string, enabled: boolean, frequency: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/privacy/config`, {
    method: 'PUT',
    body: JSON.stringify({ enabled, frequency }),
  })
}

export async function triggerPrivacyScan(siteId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/privacy/scan`, { method: 'POST' })
}

export async function getLatestPrivacyScan(siteId: string): Promise<PrivacyScanResult | null> {
  try {
    const res = await apiRequest<{ result: PrivacyScanResult | null }>(`/sites/${siteId}/privacy/latest`)
    return res?.result ?? null
  } catch {
    return null
  }
}

export async function getPrivacyScanHistory(siteId: string, limit = 20): Promise<PrivacyScanResult[]> {
  try {
    const res = await apiRequest<{ results: PrivacyScanResult[] }>(`/sites/${siteId}/privacy/history?limit=${limit}`)
    return res?.results ?? []
  } catch {
    return []
  }
}

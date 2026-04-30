import apiRequest from './client'

export type GeoDataLevel = 'full' | 'country' | 'none'

export interface PageRule {
  type: 'exclude' | 'group'
  pattern: string
  label?: string
}

export interface Site {
  id: string
  user_id: string
  domain: string
  name: string
  timezone?: string
  is_public?: boolean
  has_password?: boolean
  excluded_paths?: string[]
  page_rules?: PageRule[]
  auto_group_dynamic_paths?: boolean
  allowed_query_params?: string[]
  // Data collection settings (privacy controls)
  collect_page_paths?: boolean
  collect_referrers?: boolean
  collect_device_info?: boolean
  collect_geo_data?: GeoDataLevel
  collect_screen_resolution?: boolean
  collect_audience_data?: boolean
  // Bot and noise filtering
  filter_bots?: boolean
  // Hide unknown locations from stats
  hide_unknown_locations?: boolean
  // Data retention (months); 0 = keep forever
  data_retention_months?: number
  // Script feature toggles
  script_features?: Record<string, unknown>
  // Uptime monitoring toggle
  uptime_enabled: boolean
  is_verified?: boolean
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface CreateSiteRequest {
  domain: string
  name: string
  timezone?: string
}

export interface UpdateSiteRequest {
  name: string
  timezone?: string
  is_public?: boolean
  password?: string
  clear_password?: boolean
  excluded_paths?: string[]
  page_rules?: PageRule[]
  auto_group_dynamic_paths?: boolean
  allowed_query_params?: string[]
  // Data collection settings (privacy controls)
  collect_page_paths?: boolean
  collect_referrers?: boolean
  collect_device_info?: boolean
  collect_geo_data?: GeoDataLevel
  collect_screen_resolution?: boolean
  collect_audience_data?: boolean
  // Bot and noise filtering
  filter_bots?: boolean
  // Script feature toggles
  script_features?: Record<string, unknown>
  // Uptime monitoring toggle
  uptime_enabled?: boolean
  // Hide unknown locations from stats
  hide_unknown_locations?: boolean
  // Data retention (months); 0 = keep forever
  data_retention_months?: number
}

export async function listSites(): Promise<Site[]> {
  const response = await apiRequest<{ sites: Site[] }>('/sites')
  return response?.sites || []
}

export async function getSite(id: string): Promise<Site> {
  return apiRequest<Site>(`/sites/${id}`)
}

export async function createSite(data: CreateSiteRequest): Promise<Site> {
  return apiRequest<Site>('/sites', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateSite(id: string, data: UpdateSiteRequest): Promise<Site> {
  return apiRequest<Site>(`/sites/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteSite(id: string): Promise<{ message: string; purge_at: string }> {
  return apiRequest<{ message: string; purge_at: string }>(`/sites/${id}`, {
    method: 'DELETE',
  })
}

export type ResetModule = 'analytics' | 'journeys' | 'funnels' | 'uptime' | 'pagespeed' | 'cdn' | 'search_console'

export async function resetSiteData(id: string, modules: ResetModule[]): Promise<{ message: string; modules: string[] }> {
  return apiRequest<{ message: string; modules: string[] }>(`/sites/${id}/reset`, {
    method: 'POST',
    body: JSON.stringify({ modules }),
  })
}

export async function verifySite(id: string): Promise<void> {
  await apiRequest(`/sites/${id}/verify`, {
    method: 'POST',
  })
}

export async function restoreSite(id: string): Promise<void> {
  await apiRequest(`/sites/${id}/restore`, {
    method: 'POST',
  })
}

export async function permanentDeleteSite(id: string): Promise<void> {
  await apiRequest(`/sites/${id}/permanent`, {
    method: 'DELETE',
  })
}

export async function listDeletedSites(): Promise<Site[]> {
  const response = await apiRequest<{ sites: Site[] }>('/sites/deleted')
  return response?.sites || []
}

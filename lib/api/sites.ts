import apiRequest from './client'

export type GeoDataLevel = 'full' | 'country' | 'none'

export interface Site {
  id: string
  user_id: string
  domain: string
  name: string
  timezone?: string
  is_public?: boolean
  has_password?: boolean
  excluded_paths?: string[]
  // Data collection settings (privacy controls)
  collect_page_paths?: boolean
  collect_referrers?: boolean
  collect_device_info?: boolean
  collect_geo_data?: GeoDataLevel
  collect_screen_resolution?: boolean
  // Performance insights setting
  enable_performance_insights?: boolean
  // Bot and noise filtering
  filter_bots?: boolean
  created_at: string
  updated_at: string
}

export interface CreateSiteRequest {
  domain: string
  name: string
}

export interface UpdateSiteRequest {
  name: string
  timezone?: string
  is_public?: boolean
  password?: string
  clear_password?: boolean
  excluded_paths?: string[]
  // Data collection settings (privacy controls)
  collect_page_paths?: boolean
  collect_referrers?: boolean
  collect_device_info?: boolean
  collect_geo_data?: GeoDataLevel
  collect_screen_resolution?: boolean
  // Performance insights setting
  enable_performance_insights?: boolean
  // Bot and noise filtering
  filter_bots?: boolean
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

export async function deleteSite(id: string): Promise<void> {
  await apiRequest(`/sites/${id}`, {
    method: 'DELETE',
  })
}

export async function resetSiteData(id: string): Promise<void> {
  await apiRequest(`/sites/${id}/reset`, {
    method: 'POST',
  })
}

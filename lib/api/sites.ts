import apiRequest from './client'

export type GeoDataLevel = 'full' | 'country' | 'none'
export type ReplayMode = 'disabled' | 'consent_required' | 'anonymous_skeleton'

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
  // Session replay settings
  replay_mode?: ReplayMode
  replay_sampling_rate?: number
  replay_retention_days?: number
  replay_mask_all_text?: boolean
  replay_mask_all_inputs?: boolean
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
  // Session replay settings
  replay_mode?: ReplayMode
  replay_sampling_rate?: number
  replay_retention_days?: number
  replay_mask_all_text?: boolean
  replay_mask_all_inputs?: boolean
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

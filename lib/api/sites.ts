import apiRequest from './client'

export interface Site {
  id: string
  user_id: string
  domain: string
  name: string
  created_at: string
  updated_at: string
}

export interface CreateSiteRequest {
  domain: string
  name: string
}

export interface UpdateSiteRequest {
  name: string
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

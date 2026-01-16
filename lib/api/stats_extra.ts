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

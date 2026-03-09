import apiRequest from './client'

export type AnnotationCategory = 'deploy' | 'campaign' | 'incident' | 'other'

export interface Annotation {
  id: string
  site_id: string
  date: string
  text: string
  category: AnnotationCategory
  created_by: string
  created_at: string
  updated_at: string
}

export interface CreateAnnotationRequest {
  date: string
  text: string
  category?: AnnotationCategory
}

export interface UpdateAnnotationRequest {
  date: string
  text: string
  category: AnnotationCategory
}

export async function listAnnotations(siteId: string, startDate?: string, endDate?: string): Promise<Annotation[]> {
  const params = new URLSearchParams()
  if (startDate) params.set('start_date', startDate)
  if (endDate) params.set('end_date', endDate)
  const qs = params.toString()
  const res = await apiRequest<{ annotations: Annotation[] }>(`/sites/${siteId}/annotations${qs ? `?${qs}` : ''}`)
  return res?.annotations ?? []
}

export async function createAnnotation(siteId: string, data: CreateAnnotationRequest): Promise<Annotation> {
  return apiRequest<Annotation>(`/sites/${siteId}/annotations`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateAnnotation(siteId: string, annotationId: string, data: UpdateAnnotationRequest): Promise<Annotation> {
  return apiRequest<Annotation>(`/sites/${siteId}/annotations/${annotationId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteAnnotation(siteId: string, annotationId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/annotations/${annotationId}`, {
    method: 'DELETE',
  })
}

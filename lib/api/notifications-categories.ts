import apiRequest from '@/lib/api/client'

export interface CategorySetting {
  id: string
  label: string
  description: string
}

export interface CategorySettingsResponse {
  settings: Record<string, boolean>
  categories: CategorySetting[]
}

export const getCategorySettings = () =>
  apiRequest<CategorySettingsResponse>('/notification-settings')

export const updateCategorySettings = (settings: Record<string, boolean>) =>
  apiRequest<{ ok: boolean }>('/notification-settings', {
    method: 'PATCH',
    body: JSON.stringify({ settings }),
    headers: { 'Content-Type': 'application/json' },
  })

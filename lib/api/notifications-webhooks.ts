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

export interface Webhook {
  id: string
  organization_id: string
  label: string | null
  subscribed_types: string[]
  enabled: boolean
  created_by: string
  created_at: string
  url_masked: string
}

export const listWebhooks = () =>
  apiRequest<{ webhooks: Webhook[] }>('/notifications/webhooks')

export const createWebhook = (body: {
  url: string
  subscribed_types: string[]
  label?: string | null
}) =>
  apiRequest<Webhook>('/notifications/webhooks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

export const deleteWebhook = (id: string) =>
  apiRequest<{ ok: boolean }>(`/notifications/webhooks/${id}`, { method: 'DELETE' })

export const testWebhook = (url: string) =>
  apiRequest<{ ok: boolean; status?: number; error?: string }>(`/notifications/webhooks/test`, {
    method: 'POST',
    body: JSON.stringify({ url }),
    headers: { 'Content-Type': 'application/json' },
  })

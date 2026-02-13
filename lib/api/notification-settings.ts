/**
 * @file Notification settings API client
 */

import apiRequest from './client'

export interface NotificationSettingsResponse {
  settings: Record<string, boolean>
  categories: { id: string; label: string; description: string }[]
}

export async function getNotificationSettings(): Promise<NotificationSettingsResponse> {
  return apiRequest<NotificationSettingsResponse>('/notification-settings')
}

export async function updateNotificationSettings(settings: Record<string, boolean>): Promise<void> {
  return apiRequest<void>('/notification-settings', {
    method: 'PATCH',
    body: JSON.stringify({ settings }),
    headers: { 'Content-Type': 'application/json' },
  })
}

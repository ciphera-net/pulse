/**
 * @file Notifications API client
 */

import apiRequest from './client'

export interface Notification {
  id: string
  organization_id: string
  type: string
  title: string
  body?: string
  read: boolean
  link_url?: string
  link_label?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface ListNotificationsResponse {
  notifications: Notification[]
  unread_count: number
}

export async function listNotifications(): Promise<ListNotificationsResponse> {
  return apiRequest<ListNotificationsResponse>('/notifications')
}

export async function markNotificationRead(id: string): Promise<void> {
  return apiRequest<void>(`/notifications/${id}/read`, {
    method: 'PATCH',
  })
}

export async function markAllNotificationsRead(): Promise<void> {
  return apiRequest<void>('/notifications/mark-all-read', {
    method: 'POST',
  })
}

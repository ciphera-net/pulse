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

export interface ListNotificationsParams {
  limit?: number
  offset?: number
}

export async function listNotifications(params?: ListNotificationsParams): Promise<ListNotificationsResponse> {
  const q = new URLSearchParams()
  if (params?.limit != null) q.set('limit', String(params.limit))
  if (params?.offset != null) q.set('offset', String(params.offset))
  const query = q.toString()
  const url = query ? `/notifications?${query}` : '/notifications'
  return apiRequest<ListNotificationsResponse>(url)
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

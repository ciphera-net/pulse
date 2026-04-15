/**
 * @file Notifications v2 API client
 *
 * Wraps the pulse-backend /api/v1/notifications endpoints introduced in the
 * notifications privacy revamp.  Uses the same apiRequest helper as all other
 * API modules in this project.
 *
 * omitempty normalisation: Go serialises Receipt.delivered_at, Receipt.read_at,
 * event.link_url, and event.link_label_key with omitempty, so those fields are
 * absent (not null) when unset.  normalizeReceipt converts absent → null so
 * consumers can rely on the TypeScript Receipt type without extra guards.
 */

import type { Receipt } from '@/lib/notifications/types'
import apiRequest from '@/lib/api/client'

export interface ListParams {
  limit?: number
  offset?: number
  unread?: boolean
  category?: string[]
}

export interface ListResponse {
  receipts: Receipt[]
  unread_count: number
}

function normalizeReceipt(r: any): Receipt {
  return {
    user_id: r.user_id,
    event_id: r.event_id,
    delivered_at: r.delivered_at ?? null,
    read_at: r.read_at ?? null,
    event: {
      id: r.event.id,
      organization_id: r.event.organization_id,
      type: r.event.type,
      payload: r.event.payload,
      link_url: r.event.link_url ?? null,
      link_label_key: r.event.link_label_key ?? null,
      created_at: r.event.created_at,
      expires_at: r.event.expires_at,
    },
  }
}

export async function listNotifications(p: ListParams = {}): Promise<ListResponse> {
  const qs = new URLSearchParams()
  if (p.limit) qs.set('limit', String(p.limit))
  if (p.offset) qs.set('offset', String(p.offset))
  if (p.unread) qs.set('unread', 'true')
  if (p.category?.length) qs.set('category', p.category.join(','))
  const url = '/notifications' + (qs.toString() ? '?' + qs : '')
  const raw = await apiRequest<{ receipts: any[]; unread_count: number }>(url)
  return {
    receipts: (raw.receipts ?? []).map(normalizeReceipt),
    unread_count: raw.unread_count ?? 0,
  }
}

export const markRead = (id: string) =>
  apiRequest(`/notifications/${id}/read`, { method: 'POST' })

export const markUnread = (id: string) =>
  apiRequest(`/notifications/${id}/unread`, { method: 'POST' })

export const markAllRead = () =>
  apiRequest('/notifications/read-all', { method: 'POST' })

export const dismiss = (id: string) =>
  apiRequest(`/notifications/${id}`, { method: 'DELETE' })

export const purgeMine = () =>
  apiRequest('/notifications/mine', {
    method: 'DELETE',
    body: JSON.stringify({ confirm: 'DELETE_ALL_MY_NOTIFICATIONS' }),
    headers: { 'Content-Type': 'application/json' },
  })

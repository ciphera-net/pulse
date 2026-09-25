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

export interface CategoryCount {
  display_name: string
  unread: number
  total: number
}

export interface ListResponse {
  receipts: Receipt[]
  unread_count: number
  /**
   * Per-category {unread, total} + the registry display name — GLOBAL and
   * NEVER narrowed by limit/offset/unread/category (pinned server-side, the
   * total_count lesson): a filtered list returns the same category_counts as
   * an unfiltered one, so the tab row's numbers never dance with the filter.
   */
  category_counts: Record<string, CategoryCount>
  /**
   * Every receipt the user has — NOT narrowed by limit/offset/unread/category.
   * Iris's contract, kept on the wire even though its one consumer (the purge
   * confirmation, retired 22-09-2026) is gone.
   *
   * 🔴 `null` means the server could not count, and must stay null rather than
   * becoming 0 — a fabricated 0 was the bug this field was added to fix.
   */
  total_count: number | null
}

function normalizeReceipt(r: any): Receipt {
  return {
    user_id: r.user_id,
    event_id: r.event_id,
    delivered_at: r.delivered_at ?? null,
    read_at: r.read_at ?? null,
    // The email leg's status vocabulary, untranslated (S10); delivered_at
    // stays "handed off, null until then".
    email_status: r.email_status ?? null,
    email_state_reason: r.email_state_reason ?? null,
    category_id: r.category_id ?? null,
    type_display_name: r.type_display_name ?? null,
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
  const raw = await apiRequest<{
    receipts: any[]
    unread_count: number
    total_count?: number | null
    category_counts?: Record<string, CategoryCount>
  }>(url)
  return {
    category_counts: raw.category_counts ?? {},
    receipts: (raw.receipts ?? []).map(normalizeReceipt),
    unread_count: raw.unread_count ?? 0,
    // `?? null`, never `?? 0` — see the field doc. This also covers a backend
    // that predates the field, which must read as "unknown", not as "none".
    total_count: raw.total_count ?? null,
  }
}

export const markRead = (id: string) =>
  apiRequest(`/notifications/${id}/read`, { method: 'POST' })

export const markUnread = (id: string) =>
  apiRequest(`/notifications/${id}/unread`, { method: 'POST' })

export const markAllRead = (category?: string) =>
  apiRequest(
    `/notifications/read-all${category ? `?category=${encodeURIComponent(category)}` : ''}`,
    { method: 'POST' },
  )

export const dismiss = (id: string) =>
  apiRequest(`/notifications/${id}`, { method: 'DELETE' })

export interface Delivery {
  id: string
  channel: string   // 'in_app' | 'email' (historical rows may say 'email_digest')
  status: string    // 'queued' | 'handed_off' | 'delivered' | 'bounced' | 'suppressed' | 'skipped_off' | …
  sent_at: string
}

export const listDeliveries = (eventId: string) =>
  apiRequest<{ deliveries: Delivery[] }>(`/notifications/${eventId}/deliveries`)

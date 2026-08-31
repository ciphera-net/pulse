'use client'

import useSWR from 'swr'
import { useAuth } from '@/lib/auth/context'
import { listNotifications, type CategoryCount, type ListParams, type ListResponse } from '@/lib/api/notifications-v2'
import type { Receipt } from '@/lib/notifications/types'
import { NOTIFICATIONS_KEY, useInvalidateNotifications } from './useNotificationInbox'

export interface UseNotificationsResult {
  receipts: Receipt[]
  unreadCount: number
  /**
   * The user's ENTIRE receipt count, independent of the filters passed to this
   * hook — distinct from `receipts.length`, which is the current page.
   * `null` = the server could not count it. Callers must not coerce that to 0.
   */
  totalCount: number | null
  /**
   * Per-category {unread, total} + registry display names — GLOBAL, never
   * narrowed by this hook's filters (pinned server-side). null before the
   * first response.
   */
  categoryCounts: Record<string, CategoryCount> | null
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * The /notifications page's list.
 *
 * 🔑 ON SWR, AND ON THE SAME KEY FAMILY AS THE BELL. It used to be bare
 * `useState` keyed on `JSON.stringify(params)` with a manual version counter,
 * which meant the bell and this page shared no cache at all: "Mark all read" in
 * the bell left an open page rendering unread styling until its own next fetch.
 * Both now sit under `NOTIFICATIONS_KEY`, and any mutation invalidates every
 * mounted variant by prefix — see `invalidateNotifications`.
 *
 * The filters stay IN the key rather than being applied after the fetch, so two
 * filter states cannot overwrite each other's cache entry.
 */
export function useNotifications(params: ListParams): UseNotificationsResult {
  const { user } = useAuth()
  const orgId = user?.org_id
  const invalidateNotifications = useInvalidateNotifications()

  const key = user
    ? [
        NOTIFICATIONS_KEY,
        orgId ?? '',
        'list',
        params.unread ? 'unread' : 'all',
        params.category ?? '',
        params.limit ?? 0,
      ]
    : null

  const { data, error, isLoading } = useSWR<ListResponse>(
    key,
    () => listNotifications(params),
    {
      // The list must not blank while a revalidation is in flight — a page that
      // flickers empty reads as "you have nothing".
      keepPreviousData: true,
      revalidateOnFocus: true,
    },
  )

  return {
    receipts: data?.receipts ?? [],
    unreadCount: user ? (data?.unread_count ?? 0) : 0,
    // 🔴 NOT coerced to 0. null means the server could not count, and the purge
    // dialog's copy branches on exactly that.
    totalCount: data?.total_count ?? null,
    categoryCounts: data?.category_counts ?? null,
    loading: isLoading,
    error: (error as Error) ?? null,
    refresh: () => { void invalidateNotifications() },  // bound mutate — the global one is a no-op here
  }
}

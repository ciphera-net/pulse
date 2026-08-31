'use client'

import { useCallback } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { useAuth } from '@/lib/auth/context'
import {
  listNotifications,
  markRead as apiMarkRead,
  markAllRead as apiMarkAllRead,
  dismiss as apiDismiss,
} from '@/lib/api/notifications-v2'
import type { ListResponse } from '@/lib/api/notifications-v2'
import type { Receipt } from '@/lib/notifications/types'

/**
 * The first element of every notification SWR key.
 *
 * 🔑 It exists so invalidation can match by PREFIX. A bare `mutate(exactKey)`
 * only revalidates hooks holding that exact key, so "Mark all read" in the bell
 * left an open /notifications page showing unread styling until its own poll
 * came round — the standing SWR trap in this codebase. The filter form
 * (`invalidateNotifications` below) reaches the bell's key AND every page filter
 * variant at once.
 */
export const NOTIFICATIONS_KEY = 'notifications'

/** How many receipts the bell shows. Triage beyond this is what "View all" is for. */
export const INBOX_LIMIT = 10

const POLL_INTERVAL_MS = 90_000

/**
 * What an optimistic update falls back to when the cache is still empty.
 *
 * SWR types `optimisticData` as returning a value, never `undefined`, so this
 * has to be a real shape rather than a pass-through. `total_count: null` is
 * deliberate and is the same contract useNotifications documents: null means
 * the server could not count, and callers must not coerce it to 0.
 */
const EMPTY_INBOX: ListResponse = { receipts: [], unread_count: 0, total_count: null, category_counts: {} }

/**
 * Revalidate every mounted notification hook, whatever its filters.
 *
 * The predicate form is load-bearing — see NOTIFICATIONS_KEY.
 *
 * 🔴 A HOOK, NOT A MODULE FUNCTION, and that is the whole fix: pulse mounts a
 * custom SWR cache provider (components/SWRProvider.tsx), so the GLOBAL
 * `mutate` imported from 'swr' operates on a cache nothing in the app reads —
 * a silent no-op. The first version of this helper was exactly that no-op:
 * the bell LOOKED right (its own optimistic per-key writes carried it) while
 * cross-surface invalidation never fired once — measured on staging 31-08:
 * a register mark-read POST returned in 3ms and the next list fetch was the
 * 90-second poll, 78s later. Same defect as the org-switch purge (pulse#412
 * → #413); the memory said "never import { mutate } from 'swr'" and this
 * file was the remaining offender. Bound mutate from useSWRConfig() or
 * nothing.
 */
export function useInvalidateNotifications() {
  const { mutate } = useSWRConfig()
  return useCallback(
    () =>
      mutate((key) => Array.isArray(key) && key[0] === NOTIFICATIONS_KEY, undefined, {
        revalidate: true,
      }),
    [mutate],
  )
}

export interface NotificationInbox {
  receipts: Receipt[]
  unreadCount: number
  loading: boolean
  error: Error | null
  markRead: (eventID: string) => Promise<void>
  markAllRead: () => Promise<void>
  dismiss: (eventID: string) => Promise<void>
}

/**
 * The bell's data, shared by both of its mounts.
 *
 * 🔴 THE BELL MOUNTS TWICE ON EVERY AUTHENTICATED PAGE — `GlassTopBar`
 * (`hidden md:flex`) and `ContentHeader` (`md:hidden`). Both render
 * unconditionally; only CSS hides one, so React mounts both. Each used to carry
 * its own `useState` receipts and its own 90 s poll, which meant two independent
 * unread counts that disagreed the moment the viewport crossed the `md`
 * breakpoint, and twice the polling.
 *
 * Conditional mounting would need a `matchMedia` listener plus SSR/hydration
 * handling to fix something a shared cache dissolves outright. `useOnboarding`
 * — the sibling chip with the identical double mount — already documents this
 * resolution: all state lives in a shared SWR cache, so the two mounts cannot
 * desync. SWR also dedupes them into ONE request and ONE interval, so the
 * double poll disappears as a side effect rather than as a separate fix.
 *
 * 🔴 GATED ON THE AUTH CONTEXT, and that is not defensiveness. On the 25-08
 * half-state the old poll kept firing every 90 s against a dead session,
 * swallowing 401s, and its last good unread count was the dot rendered beside
 * "Sign in". A null key stops SWR entirely, and `unreadCount` reports 0 rather
 * than a number the session can no longer explain.
 * Audit: 25-08-2026-lost-rotation-reuse-revocation-and-half-state-chrome.md §3
 */
export function useNotificationInbox(): NotificationInbox {
  const { user } = useAuth()
  const orgId = user?.org_id
  const invalidateNotifications = useInvalidateNotifications()

  const key = user ? [NOTIFICATIONS_KEY, orgId ?? '', 'inbox'] : null

  const { data, error, isLoading, mutate } = useSWR(
    key,
    () => listNotifications({ limit: INBOX_LIMIT }),
    {
      refreshInterval: POLL_INTERVAL_MS,
      dedupingInterval: 30_000,
      // The panel must not blank while a background poll is in flight; a
      // notification list that flickers empty reads as "you have nothing".
      keepPreviousData: true,
      revalidateOnFocus: true,
    },
  )

  const receipts = data?.receipts ?? []
  const unreadCount = user ? (data?.unread_count ?? 0) : 0

  /**
   * Optimistic, then authoritative.
   *
   * `rollbackOnError` is what makes the row's error state real: the row shows
   * the new state immediately, and if the request fails it goes back to what it
   * was — so the caller's toast is describing something the user can see.
   */
  const markRead = useCallback(async (eventID: string) => {
    await mutate(
      async (current) => {
        await apiMarkRead(eventID)
        return current
      },
      {
        optimisticData: (current) =>
          current
            ? {
                ...current,
                receipts: current.receipts.map((r) =>
                  r.event_id === eventID && !r.read_at
                    ? { ...r, read_at: new Date().toISOString() }
                    : r,
                ),
                unread_count: Math.max(0, current.unread_count - 1),
              }
            : EMPTY_INBOX,
        rollbackOnError: true,
        revalidate: false,
        populateCache: false,
      },
    )
    await invalidateNotifications()
  }, [mutate, invalidateNotifications])

  const markAllRead = useCallback(async () => {
    await mutate(
      async (current) => {
        await apiMarkAllRead()
        return current
      },
      {
        optimisticData: (current) =>
          current
            ? {
                ...current,
                receipts: current.receipts.map((r) => ({
                  ...r,
                  read_at: r.read_at ?? new Date().toISOString(),
                })),
                unread_count: 0,
              }
            : EMPTY_INBOX,
        rollbackOnError: true,
        revalidate: false,
        populateCache: false,
      },
    )
    await invalidateNotifications()
  }, [mutate, invalidateNotifications])

  const dismissOne = useCallback(async (eventID: string) => {
    await mutate(
      async (current) => {
        await apiDismiss(eventID)
        return current
      },
      {
        optimisticData: (current) =>
          current
            ? {
                ...current,
                receipts: current.receipts.filter((r) => r.event_id !== eventID),
                unread_count: current.receipts.some(
                  (r) => r.event_id === eventID && !r.read_at,
                )
                  ? Math.max(0, current.unread_count - 1)
                  : current.unread_count,
              }
            : EMPTY_INBOX,
        rollbackOnError: true,
        revalidate: false,
        populateCache: false,
      },
    )
    await invalidateNotifications()
  }, [mutate, invalidateNotifications])

  return {
    receipts,
    unreadCount,
    // keepPreviousData means isLoading is false on a background refresh, which
    // is what we want: the skeleton is for the FIRST load only.
    loading: isLoading,
    error: (error as Error) ?? null,
    markRead,
    markAllRead,
    dismiss: dismissOne,
  }
}

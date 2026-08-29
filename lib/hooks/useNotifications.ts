import { useEffect, useState, useCallback } from 'react'
import { listNotifications, type ListParams, type ListResponse } from '@/lib/api/notifications-v2'
import type { Receipt } from '@/lib/notifications/types'

export interface UseNotificationsResult {
  receipts: Receipt[]
  unreadCount: number
  /**
   * The user's ENTIRE receipt count, independent of the filters passed to this
   * hook — distinct from `receipts.length`, which is the current page.
   * `null` = the server could not count it. Callers must not coerce that to 0.
   */
  totalCount: number | null
  loading: boolean
  error: Error | null
  refresh: () => void
}

export function useNotifications(params: ListParams): UseNotificationsResult {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [unreadCount, setUnread] = useState(0)
  const [totalCount, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [version, setVersion] = useState(0)

  const key = JSON.stringify(params)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listNotifications(params)
      .then((r: ListResponse) => {
        if (cancelled) return
        setReceipts(r.receipts)
        setUnread(r.unread_count)
        setTotal(r.total_count)
        setError(null)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setError(e)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version])

  const refresh = useCallback(() => setVersion(v => v + 1), [])

  return { receipts, unreadCount, totalCount, loading, error, refresh }
}

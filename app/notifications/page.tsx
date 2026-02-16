'use client'

/**
 * @file Full notifications list page (View all).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from '@/lib/api/notifications'
import { getAuthErrorMessage } from '@/lib/utils/authErrors'
import { AlertTriangleIcon, CheckCircleIcon, Button, ArrowLeftIcon } from '@ciphera-net/ui'
import { toast } from '@ciphera-net/ui'

const PAGE_SIZE = 50

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString()
}

function getTypeIcon(type: string) {
  if (type.includes('down') || type.includes('degraded') || type.startsWith('billing_')) {
    return <AlertTriangleIcon className="w-4 h-4 shrink-0 text-amber-500" />
  }
  return <CheckCircleIcon className="w-4 h-4 shrink-0 text-emerald-500" />
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchPage = async (pageOffset: number, append: boolean) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await listNotifications({ limit: PAGE_SIZE, offset: pageOffset })
      const list = Array.isArray(res?.notifications) ? res.notifications : []
      setNotifications((prev) => (append ? [...prev, ...list] : list))
      setUnreadCount(typeof res?.unread_count === 'number' ? res.unread_count : 0)
      setHasMore(list.length === PAGE_SIZE)
    } catch (err) {
      setError(getAuthErrorMessage(err as Error) || 'Failed to load notifications')
      setNotifications((prev) => (append ? prev : []))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!user?.org_id) {
      setLoading(false)
      return
    }
    fetchPage(0, false)
  }, [user?.org_id])

  const handleLoadMore = () => {
    const next = offset + PAGE_SIZE
    setOffset(next)
    fetchPage(next, true)
  }

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id)
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // Ignore
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
      toast.success('All notifications marked as read')
    } catch {
      toast.error(getAuthErrorMessage(new Error('Failed to mark all as read')))
    }
  }

  const handleNotificationClick = (n: Notification) => {
    if (!n.read) handleMarkRead(n.id)
  }

  if (!user?.org_id) {
    return (
      <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center py-12">
          <p className="text-neutral-500">Switch to an organization to view notifications.</p>
          <Link href="/welcome" className="text-brand-orange hover:underline mt-4 inline-block">
            Go to workspace
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back
          </Link>
          {unreadCount > 0 && (
            <Button variant="ghost" onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )}
        </div>

        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Notifications</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
          Manage which notifications you receive in{' '}
          <Link href="/org-settings?tab=notifications" className="text-brand-orange hover:underline">
            Organization Settings → Notifications
          </Link>
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-200 dark:border-red-800">
            {error}
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 dark:text-neutral-400 rounded-2xl border border-neutral-200 dark:border-neutral-800">
            <p>No notifications yet</p>
            <p className="text-sm mt-2">
              Manage which notifications you receive in{' '}
              <Link href="/org-settings?tab=notifications" className="text-brand-orange hover:underline">
                Organization Settings → Notifications
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div key={n.id}>
                {n.link_url ? (
                  <Link
                    href={n.link_url}
                    onClick={() => handleNotificationClick(n)}
                    className={`block p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors ${!n.read ? 'bg-brand-orange/5 dark:bg-brand-orange/10' : ''}`}
                  >
                    <div className="flex gap-3">
                      {getTypeIcon(n.type)}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${!n.read ? 'font-medium' : ''} text-neutral-900 dark:text-white`}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{n.body}</p>
                        )}
                        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                          {formatTimeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNotificationClick(n)}
                    onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}
                    className={`block p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer ${!n.read ? 'bg-brand-orange/5 dark:bg-brand-orange/10' : ''}`}
                  >
                    <div className="flex gap-3">
                      {getTypeIcon(n.type)}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${!n.read ? 'font-medium' : ''} text-neutral-900 dark:text-white`}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{n.body}</p>
                        )}
                        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                          {formatTimeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {hasMore && (
              <div className="pt-4 text-center">
                <Button variant="ghost" onClick={handleLoadMore} isLoading={loadingMore}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

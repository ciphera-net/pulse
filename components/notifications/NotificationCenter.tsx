'use client'

/**
 * @file Notification center: bell icon with dropdown of recent notifications.
 */

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { listNotifications, markNotificationRead, markAllNotificationsRead, type Notification } from '@/lib/api/notifications'
import { getAuthErrorMessage } from '@/lib/utils/authErrors'
import { AlertTriangleIcon, CheckCircleIcon } from '@ciphera-net/ui'

// * Bell icon (simple SVG, no extra deps)
function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

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
  if (type.includes('down') || type.includes('degraded')) {
    return <AlertTriangleIcon className="w-4 h-4 shrink-0 text-amber-500" />
  }
  return <CheckCircleIcon className="w-4 h-4 shrink-0 text-emerald-500" />
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listNotifications()
      setNotifications(Array.isArray(res?.notifications) ? res.notifications : [])
      setUnreadCount(typeof res?.unread_count === 'number' ? res.unread_count : 0)
    } catch (err) {
      setError(getAuthErrorMessage(err as Error) || 'Failed to load notifications')
      setNotifications([])
      setUnreadCount(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchNotifications()
    }
  }, [open])

  // * Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id)
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // Ignore; user can retry
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {
      // Ignore
    }
  }

  const handleNotificationClick = (n: Notification) => {
    if (!n.read) {
      handleMarkRead(n.id)
    }
    setOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white rounded-lg hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50 transition-colors"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-brand-orange rounded-full" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl overflow-hidden z-[100]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
            <h3 className="font-semibold text-neutral-900 dark:text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-sm text-brand-orange hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="p-6 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                Loading…
              </div>
            )}
            {error && (
              <div className="p-6 text-center text-red-500 text-sm">{error}</div>
            )}
            {!loading && !error && (notifications?.length ?? 0) === 0 && (
              <div className="p-6 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                No notifications yet
              </div>
            )}
            {!loading && !error && (notifications?.length ?? 0) > 0 && (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {(notifications ?? []).map((n) => (
                  <li key={n.id}>
                    {n.link_url ? (
                      <Link
                        href={n.link_url}
                        onClick={() => handleNotificationClick(n)}
                        className={`block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors ${!n.read ? 'bg-brand-orange/5 dark:bg-brand-orange/10' : ''}`}
                      >
                        <div className="flex gap-3">
                          {getTypeIcon(n.type)}
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm ${!n.read ? 'font-medium' : ''} text-neutral-900 dark:text-white`}>
                              {n.title}
                            </p>
                            {n.body && (
                              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">
                                {n.body}
                              </p>
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
                        className={`block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer ${!n.read ? 'bg-brand-orange/5 dark:bg-brand-orange/10' : ''}`}
                      >
                        <div className="flex gap-3">
                          {getTypeIcon(n.type)}
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm ${!n.read ? 'font-medium' : ''} text-neutral-900 dark:text-white`}>
                              {n.title}
                            </p>
                            {n.body && (
                              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">
                                {n.body}
                              </p>
                            )}
                            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                              {formatTimeAgo(n.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

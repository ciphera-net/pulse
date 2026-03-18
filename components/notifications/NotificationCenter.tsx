'use client'

/**
 * @file Notification center: bell icon with dropdown of recent notifications.
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { listNotifications, markNotificationRead, markAllNotificationsRead, type Notification } from '@/lib/api/notifications'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { formatTimeAgo, getTypeIcon } from '@/lib/utils/notifications'
import { SettingsIcon } from '@ciphera-net/ui'
import { SkeletonLine, SkeletonCircle } from '@/components/skeletons'

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
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

const LOADING_DELAY_MS = 250
const POLL_INTERVAL_MS = 90_000

interface NotificationCenterProps {
  /** Where the dropdown opens. 'right' uses fixed positioning to escape overflow:hidden containers. */
  anchor?: 'bottom' | 'right'
  /** Render variant. 'sidebar' matches NavLink styling. */
  variant?: 'default' | 'sidebar'
  /** Optional label content rendered after the icon (useful for sidebar variant with fading labels). */
  children?: React.ReactNode
}

export default function NotificationCenter({ anchor = 'bottom', variant = 'default', children }: NotificationCenterProps) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [fixedPos, setFixedPos] = useState<{ left: number; top: number } | null>(null)

  const updatePosition = useCallback(() => {
    if (anchor === 'right' && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setFixedPos({ left: rect.right + 8, top: rect.top })
    }
  }, [anchor])

  const fetchUnreadCount = async () => {
    try {
      const res = await listNotifications({ limit: 1 })
      setUnreadCount(typeof res?.unread_count === 'number' ? res.unread_count : 0)
    } catch {
      // Ignore polling errors
    }
  }

  const fetchNotifications = async () => {
    setError(null)
    const loadingTimer = setTimeout(() => setLoading(true), LOADING_DELAY_MS)
    try {
      const res = await listNotifications({})
      setNotifications(Array.isArray(res?.notifications) ? res.notifications : [])
      setUnreadCount(typeof res?.unread_count === 'number' ? res.unread_count : 0)
    } catch (err) {
      setError(getAuthErrorMessage(err as Error) || 'Failed to load notifications')
      setNotifications([])
      setUnreadCount(0)
    } finally {
      clearTimeout(loadingTimer)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchNotifications()
      updatePosition()
    }
  }, [open, updatePosition])

  // * Poll unread count in background (when authenticated)
  useEffect(() => {
    fetchUnreadCount()
    const id = setInterval(fetchUnreadCount, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  // * Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        (!panelRef.current || !panelRef.current.contains(target))
      ) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
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

  const isSidebar = variant === 'sidebar'

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? 'notification-dropdown' : undefined}
        className={isSidebar
          ? 'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 w-full overflow-hidden transition-colors'
          : 'relative p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white rounded-lg hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50 transition-colors'
        }
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        {isSidebar ? (
          <>
            <span className="w-7 h-7 flex items-center justify-center shrink-0 relative">
              <BellIcon className="h-[18px] w-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-brand-orange rounded-full" aria-hidden="true" />
              )}
            </span>
            {children}
          </>
        ) : (
          <>
            <BellIcon />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-brand-orange rounded-full" aria-hidden="true" />
            )}
          </>
        )}
      </button>

      {(() => {
        const panel = open ? (
          <div
            ref={panelRef}
            id="notification-dropdown"
            role="dialog"
            aria-label="Notifications"
            className={`bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl overflow-hidden z-[100] ${
              anchor === 'right'
                ? 'fixed w-96 origin-top-left'
                : 'fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96'
            }`}
            style={anchor === 'right' && fixedPos ? { left: fixedPos.left, top: fixedPos.top } : undefined}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
              <h3 className="font-semibold text-neutral-900 dark:text-white">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  aria-label="Mark all notifications as read"
                  className="text-sm text-brand-orange hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading && (
                <div className="p-3 space-y-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-3 px-4 py-3">
                      <SkeletonCircle className="h-8 w-8 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <SkeletonLine className="h-3.5 w-3/4" />
                        <SkeletonLine className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
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
                        <button
                          type="button"
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer ${!n.read ? 'bg-brand-orange/5 dark:bg-brand-orange/10' : ''}`}
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
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-neutral-200 dark:border-neutral-700 px-4 py-3 flex items-center justify-between gap-2">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-sm text-brand-orange hover:underline"
              >
                View all
              </Link>
              <Link
                href="/org-settings?tab=notifications"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
              >
                <SettingsIcon className="w-4 h-4" aria-hidden="true" />
                Manage settings
              </Link>
            </div>
          </div>
        ) : null

        return anchor === 'right' && panel && typeof document !== 'undefined'
          ? createPortal(panel, document.body)
          : panel
      })()}
    </div>
  )
}

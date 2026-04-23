'use client'

/**
 * @file Notification center: bell icon with dropdown of recent notifications.
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import Link from 'next/link'
import { listNotifications, markRead, markAllRead, dismiss } from '@/lib/api/notifications-v2'
import type { Receipt } from '@/lib/notifications/types'
import { renderNotification } from '@/lib/notifications/renderers'
import { useResolveSiteName, useResolveUserName } from '@/lib/notifications/resolvers'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { formatTimeAgo, getTypeIcon } from '@/lib/utils/notifications'
import { SettingsIcon } from '@ciphera-net/ui'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import { SkeletonLine, SkeletonCircle } from '@/components/skeletons'
import { EmptyState } from '@/components/ui/EmptyState'
import { BellSimple } from '@phosphor-icons/react'

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
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [fixedPos, setFixedPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const { openUnifiedSettings } = useUnifiedSettings()

  const resolveSiteName = useResolveSiteName()
  const resolveUserName = useResolveUserName()

  const updatePosition = useCallback(() => {
    if (anchor === 'right' && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const left = rect.right + 8
      if (rect.top > window.innerHeight / 2) {
        setFixedPos({ left, bottom: window.innerHeight - rect.bottom })
      } else {
        setFixedPos({ left, top: rect.top })
      }
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
      const res = await listNotifications({ limit: 10 })
      setReceipts(Array.isArray(res?.receipts) ? res.receipts : [])
      setUnreadCount(typeof res?.unread_count === 'number' ? res.unread_count : 0)
    } catch (err) {
      setError(getAuthErrorMessage(err as Error) || 'Failed to load notifications')
      setReceipts([])
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

  const handleMarkRead = async (eventID: string) => {
    try {
      await markRead(eventID)
      setReceipts((prev) => prev.map((r) => (r.event_id === eventID ? { ...r, read_at: new Date().toISOString() } : r)))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // Ignore; user can retry
    }
  }

  const handleDismiss = async (eventID: string) => {
    try {
      await dismiss(eventID)
      setReceipts((prev) => prev.filter((x) => x.event_id !== eventID))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // Ignore — user can retry
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllRead()
      setReceipts((prev) => prev.map((r) => ({ ...r, read_at: r.read_at ?? new Date().toISOString() })))
      setUnreadCount(0)
    } catch {
      // Ignore
    }
  }

  const handleNotificationClick = (r: Receipt) => {
    if (!r.read_at) handleMarkRead(r.event_id)
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
          ? 'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 w-full overflow-hidden transition-colors'
          : 'relative p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors'
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
        const panel = (
          <AnimatePresence>
            {open && (
          <motion.div
            ref={panelRef}
            id="notification-dropdown"
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
            className={`glass-overlay rounded-xl shadow-xl shadow-black/20 overflow-hidden z-[100] ${
              anchor === 'right'
                ? `fixed w-96 ${fixedPos?.bottom !== undefined ? 'origin-bottom-left' : 'origin-top-left'}`
                : 'fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96'
            }`}
            style={anchor === 'right' && fixedPos ? { left: fixedPos.left, top: fixedPos.top, bottom: fixedPos.bottom } : undefined}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <h3 className="font-semibold text-white">Notifications</h3>
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
              {!loading && !error && (receipts?.length ?? 0) === 0 && (
                <EmptyState
                  icon={<BellSimple />}
                  title="All quiet"
                  description="You'll see alerts about uptime, traffic spikes, and goal milestones here."
                />
              )}
              {!loading && !error && (receipts?.length ?? 0) > 0 && (
                <ul className="divide-y divide-white/[0.06]">
                  {(receipts ?? []).map((r) => {
                    const { title, body } = renderNotification(r, { resolveSiteName, resolveUserName })
                    const isUnread = !r.read_at
                    return (
                      <li key={r.event_id} className="group relative">
                        {r.event.link_url ? (
                          <Link
                            href={r.event.link_url}
                            onClick={() => handleNotificationClick(r)}
                            className={`block px-4 py-3 hover:bg-white/[0.06] transition-colors ${isUnread ? 'bg-brand-orange/10' : ''} ease-apple`}
                          >
                            <div className="flex gap-3">
                              {getTypeIcon(r.event.type)}
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm ${isUnread ? 'font-medium' : ''} text-white`}>
                                  {title}
                                </p>
                                {body && (
                                  <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">
                                    {body}
                                  </p>
                                )}
                                <p
                                  className="text-xs text-neutral-500 mt-1"
                                  title={new Date(r.event.created_at).toISOString()}
                                >
                                  {formatTimeAgo(r.event.created_at)}
                                </p>
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleNotificationClick(r)}
                            className={`w-full text-left block px-4 py-3 hover:bg-white/[0.06] cursor-pointer ${isUnread ? 'bg-brand-orange/10' : ''}`}
                          >
                            <div className="flex gap-3">
                              {getTypeIcon(r.event.type)}
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm ${isUnread ? 'font-medium' : ''} text-white`}>
                                  {title}
                                </p>
                                {body && (
                                  <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">
                                    {body}
                                  </p>
                                )}
                                <p
                                  className="text-xs text-neutral-500 mt-1"
                                  title={new Date(r.event.created_at).toISOString()}
                                >
                                  {formatTimeAgo(r.event.created_at)}
                                </p>
                              </div>
                            </div>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDismiss(r.event_id) }}
                          aria-label="Delete my copy of this notification"
                          title="Delete my copy"
                          className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-3 text-neutral-500 hover:text-red-400 px-2 py-1 text-xs"
                        >
                          ×
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-white/[0.06] px-4 py-3 flex items-center justify-between gap-2">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-sm text-brand-orange hover:underline"
              >
                View all
              </Link>
              <button
                onClick={() => {
                  setOpen(false)
                  openUnifiedSettings({ context: 'workspace', tab: 'notifications' })
                }}
                className="flex items-center gap-2 text-sm text-neutral-400 hover:text-brand-orange transition-colors cursor-pointer ease-apple"
              >
                <SettingsIcon className="w-4 h-4" aria-hidden="true" />
                Manage settings
              </button>
            </div>
          </motion.div>
            )}
          </AnimatePresence>
        )

        return anchor === 'right' && typeof document !== 'undefined'
          ? createPortal(panel, document.body)
          : panel
      })()}
    </div>
  )
}

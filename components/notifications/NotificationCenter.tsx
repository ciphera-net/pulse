'use client'

/**
 * @file Notification center: bell icon with dropdown of recent notifications.
 */

import { useEffect, useState, useRef, useCallback, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Receipt } from '@/lib/notifications/types'
import { useNotificationInbox } from '@/lib/hooks/useNotificationInbox'
import { NotificationRow, StratumHeader } from './NotificationRows'
import { renderNotification } from '@/lib/notifications/renderers'
import { useResolveSiteName, useResolveUserName } from '@/lib/notifications/resolvers'
import { getAuthErrorMessage, toast } from '@ciphera-net/facet'
import { SettingsIcon } from '@ciphera-net/facet'
import { SkeletonLine, SkeletonCircle } from '@/components/skeletons'
import { EmptyState } from '@/components/ui/EmptyState'
import { BellSimple } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'

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
  const router = useRouter()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  // Data lives in a store BOTH mounts share — see useNotificationInbox for why
  // (two unconditional mounts, two polls, two counts that disagreed).
  const { receipts, unreadCount, loading, error: inboxError, markRead, markAllRead, dismiss } = useNotificationInbox()
  const error = inboxError ? (getAuthErrorMessage(inboxError) || 'Failed to load notifications') : null
  // Rows with a dismiss in flight. Local by design: it is per-mount interaction
  // state, not shared data, and it is what makes the row's "Removing…" real.
  const [removing, setRemoving] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [fixedPos, setFixedPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)

  const resolveSiteName = useResolveSiteName()
  const resolveUserName = useResolveUserName()

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    if (anchor === 'right') {
      const left = rect.right + 8
      if (rect.top > window.innerHeight / 2) {
        setFixedPos({ left, bottom: window.innerHeight - rect.bottom })
      } else {
        setFixedPos({ left, top: rect.top })
      }
    } else {
      const panelWidth = 384
      const left = Math.max(8, rect.right - panelWidth)
      let top = rect.bottom + 8
      if (panelRef.current) {
        const maxTop = window.innerHeight - panelRef.current.offsetHeight - 8
        top = Math.min(top, Math.max(8, maxTop))
      }
      setFixedPos({ left, top })
    }
  }, [anchor])

  useEffect(() => {
    if (open) updatePosition()
  }, [open, updatePosition])

  /**
   * Announce a rising unread count.
   *
   * Politely, and only on an INCREASE: the count also drops when the user marks
   * things read, and narrating their own click is noise. The two mounts cannot
   * double-announce — the inactive one is inside a `display:none` wrapper, which
   * removes it from the accessibility tree.
   */
  const [announcement, setAnnouncement] = useState('')
  const prevUnread = useRef(unreadCount)
  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      setAnnouncement(
        unreadCount === 1 ? '1 unread notification' : `${unreadCount} unread notifications`,
      )
    }
    prevUnread.current = unreadCount
  }, [unreadCount])

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
    /**
     * 🔴 ESCAPE CLOSES **AND** A TAB CYCLE STAYS INSIDE.
     *
     * The panel has carried `role="dialog"` for months with no `aria-modal`, no
     * focus move on open, no trap and no restore on close — so a keyboard or
     * screen-reader user could Tab straight out of an open dialog into the page
     * behind it and lose their place entirely. Hand-rolled rather than pulling a
     * dependency: it is one keydown handler.
     */
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  /**
   * Move focus in on open, and put it back on close.
   *
   * The restore is deliberately skipped when focus has already left the panel —
   * clicking a notification navigates, and yanking focus back to the bell on the
   * destination page would be worse than doing nothing.
   */
  useEffect(() => {
    if (open) {
      panelRef.current?.focus()
      return
    }
    if (panelRef.current?.contains(document.activeElement) ?? false) {
      buttonRef.current?.focus()
    }
  }, [open])

  /**
   * 🔴 EVERY MUTATION SURFACES ITS FAILURE.
   *
   * These four handlers used to swallow errors in empty `catch` blocks, in a
   * codebase with 150 toast call sites and an explicit "no silent failures"
   * principle — a click that did nothing looked identical to a click that
   * worked. `MyPreferencesTab` is the pattern being matched.
   *
   * Reads stay soft on purpose: a failed background poll keeps the last known
   * list rather than blanking it or shouting, and the in-panel error body
   * appears only when there is no cached data at all.
   */
  const handleMarkRead = async (eventID: string) => {
    try {
      await markRead(eventID)
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to mark notification as read')
    }
  }

  const handleDismiss = async (eventID: string) => {
    setRemoving((prev) => new Set(prev).add(eventID))
    try {
      await dismiss(eventID)
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to dismiss notification')
    } finally {
      // The row returns to its previous state either way: on success it is gone
      // from the list, on failure the optimistic update has already rolled back,
      // so clearing this is what makes the revert visible rather than leaving a
      // permanently greyed row.
      setRemoving((prev) => {
        const next = new Set(prev)
        next.delete(eventID)
        return next
      })
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllRead()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to mark all as read')
    }
  }

  const handleNotificationClick = (r: Receipt) => {
    if (!r.read_at) handleMarkRead(r.event_id)
    setOpen(false)
  }

  /**
   * Two strata: New (unread) above Earlier (read), each newest-first.
   *
   * That IS the triage — what needs attention floats regardless of age, what has
   * been seen sinks. Computed from the receipts as they were WHEN THE PANEL
   * OPENED and held for as long as it stays open: marking a row read changes its
   * dot and its weight in place, it does not jump strata out from under the
   * cursor mid-scan. The next open re-stratifies.
   */
  const [snapshot, setSnapshot] = useState<Receipt[]>([])
  useEffect(() => {
    if (open) setSnapshot(receipts)
    // Deliberately keyed on `open` alone: re-running on every `receipts` change
    // is exactly the mid-scan re-sort this exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Which rows were ALREADY read when the panel opened. Captured separately from
  // the snapshot so that marking a row read changes its weight without moving it.
  //
  // ⚠️ Declared ABOVE the useMemo that reads it. useMemo runs its callback during
  // the call, so a `const` declared after it is still in the temporal dead zone
  // on the first render — TypeScript does not flag it (it cannot prove when a
  // closure runs) and it throws at runtime.
  const snapshotRead = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (open) {
      snapshotRead.current = new Set(receipts.filter((r) => r.read_at).map((r) => r.event_id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const strata = useMemo(() => {
    // While the panel is open the order comes from the snapshot, but the ROW
    // STATE comes from the live store — so an optimistic mark-read still shows
    // instantly in the row it is already in.
    const live = new Map(receipts.map((r) => [r.event_id, r]))
    const ordered = (snapshot.length ? snapshot : receipts)
      .map((r) => live.get(r.event_id) ?? r)
      .filter((r) => live.has(r.event_id))
    return [
      { label: 'New', rows: ordered.filter((r) => !snapshotRead.current.has(r.event_id)) },
      { label: 'Earlier', rows: ordered.filter((r) => snapshotRead.current.has(r.event_id)) },
    ].filter((s) => s.rows.length > 0)
  }, [snapshot, receipts])

  /** A header on a homogeneous list labels nothing. */
  const showHeaders = strata.length > 1

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
          ? 'relative flex items-center gap-2.5 rounded-none px-2.5 py-2 text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 w-full overflow-hidden transition-colors'
          // p-2 around a 20px icon is a 36x36 hit area. That is fine for a
          // mouse but under the 44px touch minimum, and this same button is the
          // notifications entry point in the MOBILE ContentHeader. Widen the box
          // below md only; md:h-auto/w-auto hands desktop back to p-2 unchanged.
          : 'relative flex h-11 w-11 items-center justify-center p-2 text-neutral-400 hover:text-white rounded-none hover:bg-white/[0.06] transition-colors md:h-auto md:w-auto'
        }
        data-tour="notification-bell"
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
              <span className="absolute top-3 right-3 md:top-1 md:right-1 w-2 h-2 bg-brand-orange rounded-full" aria-hidden="true" />
            )}
          </>
        )}
      </button>

      {/* Announces a RISING unread count. `sr-only` rather than hidden: an
          `aria-live` region inside `display:none` is not announced at all. */}
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>

      {(() => {
        const panel = (
          <AnimatePresence>
            {open && (
          <motion.div
            ref={panelRef}
            id="notification-dropdown"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-label="Notifications"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
            className={`bg-popover border border-border rounded-none overflow-hidden z-[100] fixed w-96 ${
              anchor === 'right'
                ? fixedPos?.bottom !== undefined ? 'origin-bottom-left' : 'origin-top-left'
                : 'origin-top-right'
            }`}
            style={fixedPos ? { left: fixedPos.left, top: fixedPos.top, bottom: fixedPos.bottom } : undefined}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800/60">
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
                  description="You'll see alerts about uptime, site performance, and billing here."
                />
              )}
              {!loading && !error && (receipts?.length ?? 0) > 0 && (
                <ul className="divide-y divide-white/[0.06]">
                  {strata.map(({ label, rows }) => (
                    <Fragment key={label}>
                      {showHeaders && <StratumHeader>{label}</StratumHeader>}
                      {rows.map((r) => {
                        const { title, body } = renderNotification(r, { resolveSiteName, resolveUserName })
                        return (
                          <NotificationRow
                            key={r.event_id}
                            receipt={r}
                            title={title}
                            body={body}
                            removing={removing.has(r.event_id)}
                            onActivate={handleNotificationClick}
                            onDismiss={handleDismiss}
                          />
                        )
                      })}
                    </Fragment>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-neutral-800/60 px-4 py-3 flex items-center justify-between gap-2">
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
                  router.push('/settings/account/notifications')
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

        return typeof document !== 'undefined'
          ? createPortal(panel, document.body)
          : panel
      })()}
    </div>
  )
}

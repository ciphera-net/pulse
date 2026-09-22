'use client'

/**
 * @file /notifications — "the bell, longer" (direction a · One list).
 *
 * Owner pick, 22-09-2026 (PULSE-15, options round on production:
 * `Pulse/docs/data/22-09-2026-notification-inbox-mocks/`, plan
 * `Pulse/docs/plans/22-09-2026-notification-inbox-simplification-plan.md`).
 * This replaced the 30-08 round-3 "Day Register": the category tabs, the
 * "N unread · M total" summary, the controls row (Unread only · Mark all read),
 * the per-day counts, the expand-on-click rows with the email delivery leg, and
 * the purge footer are all gone. What remains is one day-grouped list of the
 * SAME rows the bell renders (`NotificationRow`), so the two surfaces cannot
 * drift, with a clock time instead of a relative one and the category word as
 * the footer line. A row navigates on click and marks itself read on the way,
 * like the bell's; the × on each row is the soft dismiss.
 *
 * Why the unread controls left: the bell marks everything read the moment it
 * opens (R-B), so unread is no longer a state this page has to manage. Why the
 * purge left: cleanup is Iris's automatic sweeper on per-category TTLs, already
 * running; the user-facing purge was a second, unconditional delete (R-A).
 * Grouping stays calendar-day in the display zone (sections.tsx) — never a
 * fixed-hour offset.
 */

import { useState } from 'react'
import Link from 'next/link'
import { BellSimple } from '@phosphor-icons/react'
import { toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { EmptyState } from '@/components/ui/EmptyState'
import { NotificationRow } from '@/components/notifications/NotificationRows'
import { useNotifications } from '@/lib/hooks/useNotifications'
import { useInvalidateNotifications } from '@/lib/hooks/useNotificationInbox'
import { markRead, dismiss } from '@/lib/api/notifications-v2'
import { renderNotification } from '@/lib/notifications/renderers'
import { useResolveSiteName, useResolveUserName } from '@/lib/notifications/resolvers'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import type { Receipt } from '@/lib/notifications/types'
import { groupByDay, hhmm } from './sections'

const PAGE_LIMIT = 100

export default function NotificationsPage() {
  const { receipts, categoryCounts, loading, error } = useNotifications({ limit: PAGE_LIMIT })
  const invalidateNotifications = useInvalidateNotifications()
  const { zone } = useDisplayZone()
  const resolveSiteName = useResolveSiteName()
  const resolveUserName = useResolveUserName()
  // Rows with a dismiss in flight — per-page interaction state, not data. The
  // row shows "Removing…" until the refetch after the DELETE no longer carries
  // it; on failure it reverts and the toast describes something visible.
  const [removing, setRemoving] = useState<Set<string>>(new Set())

  const sections = groupByDay(receipts, zone)

  // Registry vocabulary from the wire (`category_counts` carries every
  // category's display name, filter or no filter); the local list only as the
  // pre-wire fallback (R3-3: one vocabulary).
  const displayName = (id: string): string =>
    categoryCounts?.[id]?.display_name ??
    NOTIFICATION_CATEGORIES.find((c) => c.id === id)?.label ??
    id

  /**
   * 🔴 EVERY MUTATION SURFACES ITS FAILURE — the bell's contract, kept here.
   * Reads stay soft: a failed fetch is the error body below, never a toast.
   */
  const onActivate = (r: Receipt) => {
    if (r.read_at) return
    markRead(r.event_id)
      .then(() => invalidateNotifications())
      .catch((err) => {
        toast.error(getAuthErrorMessage(err as Error) || 'Failed to mark notification as read')
      })
  }

  const onDismiss = async (eventID: string) => {
    setRemoving((prev) => new Set(prev).add(eventID))
    try {
      await dismiss(eventID)
      // Awaited on purpose: the row stays "Removing…" until the list that no
      // longer holds it has landed, rather than flashing back for a frame.
      await invalidateNotifications()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to dismiss notification')
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev)
        next.delete(eventID)
        return next
      })
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Notifications</h1>
          <p className="mt-1 text-sm text-neutral-400">Everything Pulse has told you.</p>
        </div>
        <Link
          href="/settings/account/notifications"
          className="inline-flex items-center gap-2 border border-border rounded-none px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap"
        >
          Notification settings
        </Link>
      </div>

      <section className="border border-border bg-card rounded-none overflow-hidden">
        {loading && (
          <div className="text-neutral-500 text-sm py-12 text-center">Loading…</div>
        )}
        {error && (
          <div className="p-6 text-center text-red-500 text-sm" role="alert">
            Failed to load notifications.
          </div>
        )}
        {!loading && !error && receipts.length === 0 && (
          <EmptyState
            icon={<BellSimple />}
            title="You're all caught up"
            description="Notifications from your sites and workspace land here. Cleanup is automatic — read items delete after their retention window."
            action={{ label: 'Notification settings', href: '/settings/account/notifications' }}
          />
        )}
        {!loading && !error && receipts.length > 0 && (
          <div>
            {sections.map((section) => (
              <section key={section.key}>
                <div className="px-4 pt-3 pb-2">
                  <h2 className="text-sm font-semibold tracking-tight text-white">
                    {section.label}
                  </h2>
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {section.items.map((r) => {
                    const { title, body } = renderNotification(r, { resolveSiteName, resolveUserName }, zone)
                    return (
                      <NotificationRow
                        key={r.event_id}
                        receipt={r}
                        title={title}
                        body={body}
                        timeLabel={hhmm(r.event.created_at, zone)}
                        meta={displayName(r.category_id ?? categoryOf(r.event.type))}
                        removing={removing.has(r.event_id)}
                        onActivate={onActivate}
                        onDismiss={onDismiss}
                      />
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/** Fallback only: a type key's category is its prefix. The authoritative
 *  value is the receipt's frozen category_id from iris (review catch). */
function categoryOf(type: string): string {
  return type.split('_')[0]
}

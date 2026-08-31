'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useNotifications } from '@/lib/hooks/useNotifications'
import { NOTIFICATIONS_KEY, useInvalidateNotifications } from '@/lib/hooks/useNotificationInbox'
import { markAllRead, purgeMine } from '@/lib/api/notifications-v2'
import { getPrefsDocument, type PreferencesDocument } from '@/lib/api/notifications-preferences'
import { NOTIFICATION_CATEGORIES, shortLabel } from '@/lib/notifications/categories'
import { groupByDay } from './sections'
import RegisterRow from './RegisterRow'
import PurgeConfirmDialog from './PurgeConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { BellSimple } from '@phosphor-icons/react'
import { toast, getAuthErrorMessage } from '@ciphera-net/facet'
import useSWR from 'swr'

/**
 * /notifications — the Day Register (round-3 ruling R3-1, Direction B; copy
 * per the 31-08 copy round, variant A everywhere).
 *
 * One register panel: the dashboard tab row (shortened registry labels +
 * per-tab unread counts, active = white + 3px orange underline), a controls
 * row carrying the FULL registry name (the vocabulary is always on screen), a
 * day-grouped icon-led ledger, and a footer pairing the undismissable
 * automatic-cleanup fact with the destructive purge at the server's TRUE
 * global count. Category is a FILTER, not a place; time is the primary axis.
 *
 * Wire truths this page leans on, all pinned server-side:
 * - `category_counts` is GLOBAL and never filter-narrowed — tab numbers do
 *   not dance with the filter.
 * - `total_count` is the whole account, null when the server could not count
 *   (rendered as an em dash, never a fabricated 0).
 * - Iris-down is 503 `notifications_unavailable`, never 200 [] — the error
 *   state and the empty state are different rooms.
 */
export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto py-6 px-4 text-neutral-500 text-sm">Loading…</div>
      }
    >
      <NotificationsContent />
    </Suspense>
  )
}

const TAB_ORDER = ['all', ...NOTIFICATION_CATEGORIES.map((c) => c.id)] as const

function NotificationsContent() {
  const invalidateNotifications = useInvalidateNotifications()
  const router = useRouter()
  const params = useSearchParams()
  const active = params.get('category') ?? 'all'
  const unreadOnly = params.get('state') === 'unread'
  const [purging, setPurging] = useState(false)

  const { receipts, unreadCount, totalCount, categoryCounts, loading, error, refresh } =
    useNotifications({
      unread: unreadOnly || undefined,
      category: active !== 'all' ? [active] : undefined,
      limit: 100,
    })

  // The preferences document feeds two honest details: the held chip's send
  // time (quiet_hours_end) and the muted state per category. Its absence
  // degrades those details, never the page.
  // The key sits INSIDE the invalidation family (array, NOTIFICATIONS_KEY
  // first) so a settings save reaches this copy too — a bare string key is
  // invisible to invalidateNotifications' prefix predicate (review catch).
  const { data: prefsDoc } = useSWR<PreferencesDocument>(
    [NOTIFICATIONS_KEY, 'prefs-doc'],
    () => getPrefsDocument(),
  )
  const mutedByCategory = useMemo(() => {
    const m: Record<string, boolean> = {}
    for (const cat of prefsDoc?.categories ?? []) m[cat.category_id] = cat.muted
    return m
  }, [prefsDoc])
  // HH:MM for the chip — the wire carries HH:MM:SS.
  const quietHoursEnd = prefsDoc?.recipient_preferences?.quiet_hours_end?.slice(0, 5) ?? null

  // Registry vocabulary from the wire; local list only as the pre-wire
  // fallback (R3-3: one vocabulary, short forms derive from the registry).
  const displayName = (id: string): string =>
    categoryCounts?.[id]?.display_name ??
    NOTIFICATION_CATEGORIES.find((c) => c.id === id)?.label ??
    id
  const activeName = active === 'all' ? 'All' : displayName(active)

  const setFilter = (next: { category?: string; unread?: boolean }) => {
    const q = new URLSearchParams()
    const cat = next.category ?? active
    const unread = next.unread ?? unreadOnly
    if (cat !== 'all') q.set('category', cat)
    if (unread) q.set('state', 'unread')
    router.replace(`/notifications${q.toString() ? `?${q.toString()}` : ''}`)
  }

  const activeUnread = active === 'all' ? unreadCount : (categoryCounts?.[active]?.unread ?? 0)
  const activeTotal =
    active === 'all' ? totalCount : (categoryCounts?.[active]?.total ?? null)

  const onMarkRead = async () => {
    try {
      await markAllRead(active === 'all' ? undefined : active)
      refresh()
      await invalidateNotifications()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to mark notifications as read')
    }
  }

  const sections = groupByDay(receipts)
  const trulyEmpty =
    !loading && !error && receipts.length === 0 && active === 'all' && !unreadOnly

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      {/* B1 — page header */}
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Notifications</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Everything Pulse has told you — and how it reached you.
          </p>
        </div>
        <Link
          href="/settings/account/notifications"
          className="inline-flex items-center gap-2 border border-border rounded-none px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap"
        >
          Notification settings
        </Link>
      </div>

      {/* B2 — the register panel */}
      <section className="border border-border bg-card rounded-none overflow-hidden">
        {/* Tab row */}
        <div className="flex items-center gap-1 border-b border-border px-4 flex-wrap">
          {TAB_ORDER.map((id) => {
            const isActive = active === id
            const label = id === 'all' ? 'All' : shortLabel(displayName(id))
            const unread = id === 'all' ? unreadCount : (categoryCounts?.[id]?.unread ?? 0)
            return (
              <button
                key={id}
                type="button"
                title={id === 'all' ? 'All categories' : displayName(id)}
                onClick={() => setFilter({ category: id })}
                className={`relative px-2.5 py-3 text-xs font-medium rounded-none cursor-pointer ${
                  isActive ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {label}
                {unread > 0 && (
                  <span
                    className={`ml-1.5 text-[11px] tabular-nums ${
                      isActive ? 'text-brand-orange' : 'text-neutral-500'
                    }`}
                  >
                    {unread}
                  </span>
                )}
                {isActive && (
                  <span
                    data-testid="active-tab-underline"
                    className="absolute inset-x-0 -bottom-px h-[3px] bg-brand-orange"
                  />
                )}
              </button>
            )
          })}
          <span className="ml-auto text-[11px] text-neutral-500 whitespace-nowrap">
            {unreadCount} unread · {totalCount ?? '—'} total
          </span>
        </div>

        {/* B3 — controls row: the full registry name lives here */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm text-neutral-300 truncate">{activeName}</span>
            <span className="text-[11px] text-neutral-500 whitespace-nowrap">
              {activeUnread} unread{activeTotal != null ? ` of ${activeTotal}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={unreadOnly}
              onClick={() => setFilter({ unread: !unreadOnly })}
              className={`inline-flex items-center gap-2 border border-border rounded-none px-4 py-2 text-xs font-medium transition-colors cursor-pointer ${
                unreadOnly
                  ? 'text-white bg-white/[0.06]'
                  : 'text-neutral-300 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              Unread only
            </button>
            <button
              type="button"
              onClick={onMarkRead}
              disabled={activeUnread === 0}
              className="inline-flex items-center gap-2 border border-border rounded-none px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              {active === 'all' ? 'Mark all read' : `Mark ${activeName} read`}
            </button>
          </div>
        </div>

        {/* B4 — the feed */}
        {loading && (
          <div className="text-neutral-500 text-sm py-12 text-center">Loading…</div>
        )}
        {error && (
          <div className="p-6 text-center text-red-500 text-sm" role="alert">
            Failed to load notifications.
          </div>
        )}
        {trulyEmpty && (
          <EmptyState
            icon={<BellSimple />}
            title="You're all caught up"
            description="Notifications from your sites and workspace land here. Cleanup is automatic — read items delete after their retention window."
            action={{ label: 'Notification settings', href: '/settings/account/notifications' }}
          />
        )}
        {!loading && !error && receipts.length === 0 && !trulyEmpty && (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-neutral-300">
              {unreadOnly && activeUnread === 0
                ? `Nothing unread in ${activeName === 'All' ? 'your notifications' : activeName}`
                : `Nothing in ${activeName}`}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {`No ${activeName === 'All' ? '' : `${activeName.toLowerCase()} `}notifications in this view — clear the filter to see all ${totalCount ?? ''}`.replace(/\s+/g, ' ').trimEnd() + '.'}
            </p>
            <button
              type="button"
              onClick={() => setFilter({ category: 'all', unread: false })}
              className="mt-3 inline-flex items-center gap-2 border border-border rounded-none px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              Show all
            </button>
          </div>
        )}
        {!loading && !error && receipts.length > 0 && (
          <div>
            {sections.map((section) => (
              <section key={section.key}>
                <div className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-2">
                  <h2 className="text-sm font-semibold tracking-tight text-white">
                    {section.label}
                  </h2>
                  <span className="truncate text-[11px] text-neutral-500">
                    {section.items.length} notification{section.items.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {section.items.map((r) => (
                    <RegisterRow
                      key={r.event_id}
                      receipt={r}
                      categoryName={displayName(r.category_id ?? categoryOf(r.event.type))}
                      quietHoursEnd={quietHoursEnd}
                      muted={mutedByCategory[r.category_id ?? categoryOf(r.event.type)] ?? false}
                      onChange={() => {
                        refresh()
                        void invalidateNotifications()
                      }}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      {/* B6 — footer: the cleanup fact + the destructive purge, true count */}
      <div className="mt-8 flex items-center justify-between gap-3 border border-border bg-card rounded-none px-4 py-3">
        <span className="text-[11px] text-neutral-500">
          Cleanup is automatic — read notifications delete on their category&apos;s retention
          window. Pulse keeps nothing longer.
        </span>
        <button
          type="button"
          onClick={() => setPurging(true)}
          className="border border-destructive/40 bg-destructive/10 rounded-none px-4 py-2 text-xs font-medium text-destructive hover:text-white transition-colors whitespace-nowrap"
        >
          {totalCount != null
            ? `Purge all ${totalCount} notification${totalCount === 1 ? '' : 's'}`
            : 'Purge all notifications'}
        </button>
      </div>

      {purging && (
        <PurgeConfirmDialog
          count={totalCount}
          onCancel={() => setPurging(false)}
          onConfirm={async () => {
            try {
              await purgeMine()
              setPurging(false)
              refresh()
              await invalidateNotifications()
            } catch (err) {
              toast.error(getAuthErrorMessage(err as Error) || 'Failed to purge notifications')
            }
          }}
        />
      )}
    </div>
  )
}

/** Fallback only: a type key's category is its prefix. The authoritative
 *  value is the receipt's frozen category_id from iris (review catch). */
function categoryOf(type: string): string {
  return type.split('_')[0]
}

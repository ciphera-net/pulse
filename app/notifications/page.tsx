'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useNotifications } from '@/lib/hooks/useNotifications'
import TransparencyBanner from './TransparencyBanner'
import FilterChips from './FilterChips'
import BulkActionBar from './BulkActionBar'
import NotificationRow from './NotificationRow'
import { groupByRecency } from './sections'
import { EmptyState } from '@/components/ui/EmptyState'
import { BellSimple } from '@phosphor-icons/react'

export default function NotificationsPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto py-6 px-4 text-neutral-500 text-sm">Loading…</div>}>
      <NotificationsContent />
    </Suspense>
  )
}

function NotificationsContent() {
  const params = useSearchParams()
  const state = params.get('state') ?? 'all'
  const categories = (params.get('category') ?? '').split(',').filter(Boolean)

  const { receipts, unreadCount, totalCount, loading, error, refresh } = useNotifications({
    unread: state === 'unread',
    category: categories.length ? categories : undefined,
    limit: 100,
  })

  const sections = groupByRecency(receipts)

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-white">Notifications</h1>
      </header>
      <TransparencyBanner />
      {/* Two different counts, deliberately. FilterChips' "All · N" describes
          THIS VIEW, so receipts.length is right for it. BulkActionBar's purge
          deletes everything the user has regardless of the filter, so it needs
          the unfiltered total — passing receipts.length there is what made the
          confirmation understate what it was about to destroy. */}
      <FilterChips unreadCount={unreadCount} totalCount={receipts.length} />
      {!loading && !error && (
        <BulkActionBar purgeCount={totalCount} unreadCount={unreadCount} onChange={refresh} />
      )}

      {loading && <div className="text-neutral-500 text-sm py-12 text-center">Loading…</div>}
      {error && <div className="text-red-400 text-sm py-12 text-center">Failed to load notifications.</div>}
      {!loading && !error && receipts.length === 0 && (
        <EmptyState
          icon={<BellSimple />}
          title="All quiet"
          description="You'll see alerts about uptime, site performance, and billing here."
        />
      )}
      {!loading && !error && receipts.length > 0 && (
        <div className="space-y-6">
          {sections.map(section => (
            <section key={section.label}>
              <h2 className="text-micro-label uppercase tracking-wider text-neutral-500 mb-2 px-1">{section.label}</h2>
              <ul className="space-y-1">
                {section.items.map(r => (
                  <NotificationRow key={r.event_id} receipt={r} onChange={refresh} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

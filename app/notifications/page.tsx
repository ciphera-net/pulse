'use client'

import { useSearchParams } from 'next/navigation'
import { useNotifications } from '@/lib/hooks/useNotifications'
import TransparencyBanner from './TransparencyBanner'
import FilterChips from './FilterChips'
import NotificationRow from './NotificationRow'
import { groupByRecency } from './sections'

export default function NotificationsPage() {
  const params = useSearchParams()
  const state = params.get('state') ?? 'all'
  const categories = (params.get('category') ?? '').split(',').filter(Boolean)

  const { receipts, unreadCount, loading, error, refresh } = useNotifications({
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
      <FilterChips unreadCount={unreadCount} totalCount={receipts.length} />

      {loading && <div className="text-neutral-500 text-sm py-12 text-center">Loading…</div>}
      {error && <div className="text-red-400 text-sm py-12 text-center">Failed to load notifications.</div>}
      {!loading && !error && receipts.length === 0 && (
        <div className="text-neutral-500 text-sm py-12 text-center">No notifications match.</div>
      )}
      {!loading && !error && receipts.length > 0 && (
        <div className="space-y-6">
          {sections.map(section => (
            <section key={section.label}>
              <h2 className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2 px-1">{section.label}</h2>
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

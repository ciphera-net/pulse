'use client'

import { useSearchParams } from 'next/navigation'
import { useNotifications } from '@/lib/hooks/useNotifications'
import TransparencyBanner from './TransparencyBanner'
import FilterChips from './FilterChips'

export default function NotificationsPage() {
  const params = useSearchParams()
  const state = params.get('state') ?? 'all'
  const categories = (params.get('category') ?? '').split(',').filter(Boolean)

  const { receipts, unreadCount, loading, error } = useNotifications({
    unread: state === 'unread',
    category: categories.length ? categories : undefined,
    limit: 100,
  })

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
        <div className="text-neutral-500 text-sm py-6 text-center">
          {receipts.length} notification{receipts.length === 1 ? '' : 's'} loaded — sectioned timeline + rows wire in Task 4.4.
        </div>
      )}
    </div>
  )
}

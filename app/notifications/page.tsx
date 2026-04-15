'use client'

import TransparencyBanner from './TransparencyBanner'

export default function NotificationsPage() {
  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-white">Notifications</h1>
      </header>
      <TransparencyBanner />
      <div className="text-neutral-500 text-sm py-12 text-center">
        Filter chips, sectioned timeline, and notification rows wire in over the next few tasks.
      </div>
    </div>
  )
}

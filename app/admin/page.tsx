'use client'

import Link from 'next/link'

export default function AdminDashboard() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Link
        href="/admin/orgs"
        className="block transition-transform hover:scale-[1.02] rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm"
      >
        <h3 className="text-lg font-semibold text-white">Organizations</h3>
        <p className="text-sm text-neutral-400 mt-1">Manage organization plans and limits</p>
        <p className="text-sm text-neutral-400 mt-4">
          View all organizations, check billing status, and manually grant plans.
        </p>
      </Link>
      <Link
        href="/admin/quarantine"
        className="block transition-transform hover:scale-[1.02] rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm"
      >
        <h3 className="text-lg font-semibold text-white">Quarantine & Reputation</h3>
        <p className="text-sm text-neutral-400 mt-1">Monitor quarantined traffic and domain reputation</p>
        <p className="text-sm text-neutral-400 mt-4">
          View quarantined events, manage domain reputation, and review auto-learned spam patterns.
        </p>
      </Link>
    </div>
  )
}

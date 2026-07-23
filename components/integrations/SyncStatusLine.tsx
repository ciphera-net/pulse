'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CircleNotch } from '@phosphor-icons/react'
import { formatDateTime } from '@/lib/utils/formatDate'

// ---------------------------------------------------------------------------
// Integration sync meta line — surfaces the sync state both the GSC and Bunny
// status endpoints already return, killing silent staleness (no-silent-failure
// rule). Mono last-synced stamp, a 150 ms-delayed spinner while syncing, a
// quiet red banner + Settings link on failure. Renders nothing until the
// status is known. Shared by the search and CDN shells.
// ---------------------------------------------------------------------------

interface SyncStatusLineProps {
  status?: 'active' | 'syncing' | 'error'
  lastSyncedAt?: string | null
  errorMessage?: string | null
  settingsHref: string
}

const SPINNER_DELAY_MS = 150

export function SyncStatusLine({ status, lastSyncedAt, errorMessage, settingsHref }: SyncStatusLineProps) {
  // * Spinner waits out fast syncs so a sub-150 ms refresh never flashes it.
  const [showSpinner, setShowSpinner] = useState(false)

  useEffect(() => {
    if (status !== 'syncing') {
      setShowSpinner(false)
      return
    }
    const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [status])

  if (!status) return null

  if (status === 'error') {
    return (
      <p className="mt-1.5 text-xs text-red-400">
        Sync failed{errorMessage ? ` — ${errorMessage}` : ''}
        <span aria-hidden="true" className="mx-1.5 text-red-400/50">·</span>
        <Link
          href={settingsHref}
          className="text-red-300 underline-offset-2 transition-colors duration-fast ease-apple hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
        >
          Fix in Settings
        </Link>
      </p>
    )
  }

  if (status === 'syncing') {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
        {showSpinner && <CircleNotch className="h-3 w-3 animate-spin" />}
        Syncing…
      </p>
    )
  }

  // * status === 'active' — only a real timestamp is worth showing.
  if (!lastSyncedAt) return null
  return (
    <p className="mt-1.5 text-xs text-neutral-500">
      Last synced {formatDateTime(new Date(lastSyncedAt))}
    </p>
  )
}

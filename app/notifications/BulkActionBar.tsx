'use client'
import { useState } from 'react'
import { markAllRead, purgeMine } from '@/lib/api/notifications-v2'
import PurgeConfirmDialog from './PurgeConfirmDialog'

interface BulkActionBarProps {
  totalCount: number
  unreadCount: number
  onChange: () => void
}

export default function BulkActionBar({ totalCount, unreadCount, onChange }: BulkActionBarProps) {
  const [purging, setPurging] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleMarkAll = async () => {
    if (unreadCount === 0 || busy) return
    setBusy(true)
    try {
      await markAllRead()
      onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 text-xs text-neutral-400 mb-3 px-1">
        <button
          type="button"
          onClick={handleMarkAll}
          disabled={unreadCount === 0 || busy}
          className="hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Mark all read
        </button>
        <span className="text-neutral-600">·</span>
        <button
          type="button"
          onClick={() => setPurging(true)}
          disabled={totalCount === 0 || busy}
          className="text-red-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Purge mine
        </button>
      </div>
      {purging && (
        <PurgeConfirmDialog
          count={totalCount}
          onCancel={() => setPurging(false)}
          onConfirm={async () => {
            await purgeMine()
            setPurging(false)
            onChange()
          }}
        />
      )}
    </>
  )
}

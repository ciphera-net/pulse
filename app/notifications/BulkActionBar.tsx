'use client'
import { useState } from 'react'
import { markAllRead, purgeMine } from '@/lib/api/notifications-v2'
import { toast, getAuthErrorMessage } from '@ciphera-net/facet'
import PurgeConfirmDialog from './PurgeConfirmDialog'

interface BulkActionBarProps {
  /**
   * Every receipt the user has — NOT the visible page. "Purge mine" deletes all
   * of them regardless of the active filter or the 100-row page cap, so this is
   * the only honest number to state in the confirmation, and the only honest
   * basis for disabling the button.
   *
   * Until 29-08-2026 this prop was passed `receipts.length`, so a filtered view
   * could tell the user it was deleting 3 things while it deleted 300.
   *
   * `null` = the server could not count. The dialog then states no number at
   * all, and the button stays ENABLED: not knowing the count is not a reason to
   * block a user from clearing their own history, and the no-number wording is
   * honest about what will happen.
   */
  purgeCount: number | null
  unreadCount: number
  onChange: () => void
}

export default function BulkActionBar({ purgeCount, unreadCount, onChange }: BulkActionBarProps) {
  const [purging, setPurging] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleMarkAll = async () => {
    if (unreadCount === 0 || busy) return
    setBusy(true)
    try {
      await markAllRead()
      onChange()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to mark all as read')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Bare 16px-tall text buttons, one of which ("Purge mine") is a
          destructive, irreversible action sitting ~12px from "Mark all read".
          min-h-11 plus a wider gap makes both reliably tappable and mis-tapping
          the destructive one much harder. md+ keeps the compact text row. */}
      <div className="flex items-center gap-4 md:gap-3 text-xs text-neutral-400 mb-3 px-1">
        <button
          type="button"
          onClick={handleMarkAll}
          disabled={unreadCount === 0 || busy}
          className="inline-flex min-h-11 items-center md:min-h-0 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Mark all read
        </button>
        <span className="text-neutral-600">·</span>
        <button
          type="button"
          onClick={() => setPurging(true)}
          disabled={purgeCount === 0 || busy}
          className="inline-flex min-h-11 items-center md:min-h-0 text-red-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Purge mine
        </button>
      </div>
      {purging && (
        <PurgeConfirmDialog
          count={purgeCount}
          onCancel={() => setPurging(false)}
          onConfirm={async () => {
            try {
              await purgeMine()
              toast.success('Notification history deleted')
              setPurging(false)
              onChange()
            } catch (err) {
              // The dialog stays OPEN on failure. Closing it would leave the
              // user believing an irreversible action succeeded — and this is
              // the one action in the product where that belief is unrecoverable.
              toast.error(getAuthErrorMessage(err as Error) || 'Failed to delete notification history')
              throw err
            }
          }}
        />
      )}
    </>
  )
}

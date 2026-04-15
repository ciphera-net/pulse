'use client'
import { useState } from 'react'

interface PurgeConfirmDialogProps {
  count: number
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export default function PurgeConfirmDialog({ count, onConfirm, onCancel }: PurgeConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = typed === 'DELETE' && !busy

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="max-w-md w-full mx-4 glass-overlay rounded-xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-2">Delete all my notification history</h3>
        <p className="text-sm text-neutral-300 mb-4">
          {count < 0
            ? "This permanently deletes all of your notification history from this account."
            : `This permanently deletes all ${count} notification${count === 1 ? '' : 's'} from your account.`
          }{' '}
          Other team members' copies are not affected. This cannot be undone.
        </p>
        <p className="text-xs text-neutral-400 mb-2">
          Type <code className="font-mono px-1 py-0.5 bg-white/10 rounded text-white">DELETE</code> to confirm:
        </p>
        <input
          autoFocus
          value={typed}
          onChange={e => setTyped(e.target.value)}
          className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
              } finally {
                setBusy(false)
              }
            }}
            className="px-4 py-2 text-sm rounded bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'Deleting…' : 'Delete everything'}
          </button>
        </div>
      </div>
    </div>
  )
}

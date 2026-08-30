'use client'
import { useState } from 'react'
import { Modal, Button, Input } from '@ciphera-net/facet'

interface PurgeConfirmDialogProps {
  count: number | null
  onConfirm: () => Promise<void>
  onCancel: () => void
}

/**
 * Confirm the destructive purge of a user's own notification history.
 *
 * 🔴 FACET'S `Modal`, NOT A HAND-ROLLED DIV. The previous version was a bare
 * `fixed inset-0` with an `onClick` backdrop: no `role="dialog"`, no
 * `aria-modal`, no Escape handler, no focus trap and no focus restore — none of
 * the four things Facet's `Modal` ships and the sibling alert-channel editor
 * already uses. The most destructive dialog in the product had the least
 * accessible shell in it.
 *
 * The COUNT is already honest — audit finding P-F5 was fixed on 29-08-2026 as
 * fix-now item #8. `count` is now every receipt the user has, not the filtered
 * 100-capped visible page, and `count == null` means the server could not count
 * it: the copy then states no number rather than printing a zero. Do not
 * "simplify" that null branch away.
 */
export default function PurgeConfirmDialog({ count, onConfirm, onCancel }: PurgeConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = typed === 'DELETE' && !busy

  return (
    <Modal isOpen onClose={onCancel} title="Delete all my notification history">
      <p className="text-sm text-neutral-300 mb-4">
        {count == null
          ? 'This permanently deletes all of your notification history from this account.'
          : `This permanently deletes all ${count} notification${count === 1 ? '' : 's'} from your account.`
        }{' '}
        Other team members&apos; copies are not affected. This cannot be undone.
      </p>
      <p className="text-xs text-neutral-400 mb-2">
        {/* The one legitimate monospace token on this surface: DELETE is a literal
            the user must type, i.e. machine data, not chrome. */}
        Type <code className="font-mono px-1 py-0.5 bg-white/10 rounded-none text-white">DELETE</code> to confirm:
      </p>
      <Input
        autoFocus
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        aria-label="Type DELETE to confirm"
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button
          variant="destructive"
          disabled={!ready}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Deleting…' : 'Delete everything'}
        </Button>
      </div>
    </Modal>
  )
}

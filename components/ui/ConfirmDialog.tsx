'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@ciphera-net/facet'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false)

  // Facet's Modal traps focus and focuses the first focusable element on
  // open, but — unlike the Radix dialog this replaces — never restores focus
  // on close, so the opener is remembered and refocused here (same pattern
  // as DeleteSiteModal). Guarded for a detached opener: a confirm can remove
  // the very row whose button opened the dialog.
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      return
    }
    const opener = restoreFocusRef.current
    restoreFocusRef.current = null
    if (opener && document.contains(opener)) {
      opener.focus()
    }
  }, [open])

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={open} onClose={() => onOpenChange(false)} title={title} showCloseButton={false} className="max-w-[400px]">
      {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
        <Button
          variant="outline"
          className="text-sm"
          onClick={() => onOpenChange(false)}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
        {/* Danger uses the sanctioned solid destructive fill, the one place the
            settings vocabulary allows it (the final confirm inside a dialog).
            The (currently unused) warning path is the page's primary rung. */}
        <Button
          variant={variant === 'danger' ? 'destructive' : 'default'}
          className="text-sm"
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? 'Please wait…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@ciphera-net/facet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

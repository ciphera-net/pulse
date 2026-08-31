'use client'

import { Button } from '@ciphera-net/facet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

// ---------------------------------------------------------------------------
// The funnel delete confirm — one component, used by the list and the detail
// (the two used to carry byte-identical inline copies).
// ---------------------------------------------------------------------------

export function DeleteFunnelDialog({
  open,
  funnelName,
  onCancel,
  onConfirm,
}: {
  open: boolean
  funnelName: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete funnel</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{funnelName}&rdquo;? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="default" className="bg-red-600 shadow-none hover:bg-red-500" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

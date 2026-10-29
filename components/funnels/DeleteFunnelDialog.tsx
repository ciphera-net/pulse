'use client'

import { HoldDialog } from '@ciphera-net/facet-hold'
import { Trash } from '@phosphor-icons/react'

// ---------------------------------------------------------------------------
// The funnel delete confirm — one component, used by the list and the detail
// (the two used to carry byte-identical inline copies). A thin wrapper over
// facet-hold's HoldDialog (PUL-28): both pages keep using this component, and
// the raw bg-red-600 confirm button is gone with the Radix dialog it sat on.
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
    <HoldDialog
      open={open}
      onOpenChange={(next) => { if (!next) onCancel() }}
      title={`Delete "${funnelName}"?`}
      holdLabel="Hold to delete"
      icon={<Trash weight="bold" className="h-4 w-4" aria-hidden="true" />}
      onConfirm={onConfirm}
    />
  )
}

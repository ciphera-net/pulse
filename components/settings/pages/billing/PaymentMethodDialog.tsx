'use client'

import * as React from 'react'
import { Button, Modal, Switcher, toast } from '@ciphera-net/facet'
import { CreditCard } from '@phosphor-icons/react'
import { updatePaymentMethod } from '@/lib/api/billing'
import { cdnUrl } from '@/lib/cdn'
import { PAYMENT_METHODS } from './planState'

/**
 * The title with its icon in orange, as drawn (round 8): the kit's `KitDialogTitle` draws a destructive dialog's coral
 * icon only, and changing a payment method destroys nothing. Same markup as the kit's, until the kit takes a tone.
 */
function MethodDialogTitle() {
  return (
    <span className="flex items-center gap-2">
      <span data-kit-icon="heading" className="flex shrink-0 text-primary [&_svg]:h-[18px] [&_svg]:w-[18px]">
        <CreditCard weight="bold" />
      </span>
      Pick a payment method
    </span>
  )
}

/**
 * Pick a method, then Mollie takes over: a €0 check, or while a payment is past due the open amount, which keeps the
 * plan (pulse-backend #1238). Mollie sends the person back to this page.
 */
export function PaymentMethodDialog({ open, onClose, pastDue }: { open: boolean; onClose: () => void; pastDue: boolean }) {
  const [method, setMethod] = React.useState<string | null>(null)

  // Every opening starts with nothing picked.
  React.useEffect(() => {
    if (open) setMethod(null)
  }, [open])

  const start = async () => {
    if (!method) return
    onClose()
    try {
      const { url } = await updatePaymentMethod(method)
      window.location.href = url
    } catch {
      toast.error("Couldn't start changing the payment method. Try again.")
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={<MethodDialogTitle />} className="max-w-sm">
      <div data-billing-dialog="method">
        <p className="mb-4 text-sm text-muted-foreground">
          {pastDue
            ? 'Mollie charges the open amount to it, then sends you back here.'
            : 'Mollie checks it with a €0 payment, then sends you back here.'}
        </p>
        <Switcher
          aria-label="Payment method"
          tone="solid"
          className="mb-4 w-full flex-wrap"
          value={method ?? ''}
          onChange={setMethod}
          options={PAYMENT_METHODS.map((m) => ({
            value: m.id,
            label: (
              <span className="flex items-center gap-1.5 py-1">
                <span className="flex items-center gap-1 bg-paper px-1 py-0.5">
                  {m.icons.map((icon) => (
                    <img key={icon} src={cdnUrl(icon)} alt="" className="h-4 w-auto" />
                  ))}
                </span>
                {m.label}
              </span>
            ),
          }))}
        />
        <Button variant="default" className="w-full" disabled={!method} onClick={start}>
          Continue
        </Button>
      </div>
    </Modal>
  )
}

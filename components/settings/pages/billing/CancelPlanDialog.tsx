'use client'

import { HoldDialog } from '@ciphera-net/facet-hold'
import { WarningCircle, XCircle } from '@phosphor-icons/react'
import { KitDialogRow, KitDialogTitle, KitWarningLine } from '@/components/settings/kit/Kit'
import { FREE_FACTS, FREE_RETENTION } from './planState'

/**
 * Cancel plan, held to confirm, then 6 seconds to undo (copy deck §10.5 and §10.9). What happens, then what follows
 * from the end date, then what is deleted: R26, the free plan keeps data for 6 months, so the next daily pass after
 * the plan ends deletes the older visits and events for good. The person reads that before the hold.
 */
export function CancelPlanDialog({
  open,
  onOpenChange,
  planName,
  endsOn,
  alone,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  planName: string
  /** The renewal day the plan will not reach ("3 Dec"), or null when the server sent none. */
  endsOn: string | null
  alone: boolean
  onConfirm: () => void
}) {
  return (
    <HoldDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<KitDialogTitle icon={<XCircle weight="bold" />}>{`Cancel the ${planName} plan?`}</KitDialogTitle>}
      description={
        endsOn
          ? `The plan runs until ${endsOn}, and nothing more is charged.`
          : 'The plan runs until the end of this billing period, and nothing more is charged.'
      }
      cancelLabel="Keep plan"
      holdLabel="Hold to cancel"
      icon={<XCircle weight="bold" className="h-4 w-4" aria-hidden="true" />}
      onConfirm={onConfirm}
      className="max-w-[480px]"
    >
      <div data-billing-dialog="cancel">
        <KitDialogRow
          label={endsOn ? `From ${endsOn}` : 'After that'}
          caption={`${alone ? "You're" : 'The team is'} on the free Personal plan: ${FREE_FACTS}.`}
        />
        <div className="border-t border-border pt-4">
          <KitWarningLine icon={<WarningCircle weight="fill" />}>
            {/* text-pretty: at 480 px the sentence otherwise leaves "day." alone on its last line (round 8, by eye). */}
            <span className="text-pretty">
              {`Your sites stay. Visits and events older than ${FREE_RETENTION} are deleted within a day.`}
            </span>
          </KitWarningLine>
        </div>
        <p className="mt-2 pb-2 text-xs text-muted-foreground">You have 6 seconds to undo.</p>
      </div>
    </HoldDialog>
  )
}

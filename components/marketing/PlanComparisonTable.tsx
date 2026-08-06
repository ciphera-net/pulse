import { Fragment } from 'react'
import { CheckIcon } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import type { PlanFeatureGroup, PlanFeatureValue } from '@/lib/plans'
import { FREE_PLAN, PLAN_CATALOG } from '@/lib/plans'

const COLUMNS = [FREE_PLAN, ...PLAN_CATALOG]

function ValueCell({ value }: { value: PlanFeatureValue }) {
  if (typeof value === 'string') {
    return <span className="text-sm text-foreground">{value}</span>
  }
  // Accent cells echo the slider's selected-tier label, which is text-primary.
  if (typeof value === 'object') {
    return <span className="text-sm text-primary">{value.text}</span>
  }
  // Included = primary check, absent = muted dash — color is the signal, same
  // semantics as VerdictTable's tone dots.
  return value ? (
    <>
      <CheckIcon aria-hidden="true" className="h-4 w-4 text-primary" />
      <span className="sr-only">Included</span>
    </>
  ) : (
    <>
      <span aria-hidden="true" className="text-sm text-muted-foreground/50">
        —
      </span>
      <span className="sr-only">Not included</span>
    </>
  )
}

/**
 * The detailed plan-comparison grid under the pricing cards — VerdictTable's
 * anatomy at four plan columns: hairline table, muted feature rail, the
 * popular plan's column emphasized with bg-card and a primary top edge.
 * Scrolls horizontally inside its own container on narrow screens so the
 * page body never scrolls sideways.
 */
export function PlanComparisonTable({ groups }: { groups: PlanFeatureGroup[] }) {
  return (
    <div className="mt-10 overflow-x-auto border border-border">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <caption className="sr-only">Feature comparison across all Pulse plans</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="w-[28%] px-5 py-4">
              <span className="sr-only">Feature</span>
            </th>
            {COLUMNS.map((plan) => (
              <th
                key={plan.id}
                scope="col"
                className={cn(
                  'relative w-[18%] px-5 py-4 text-xs font-normal uppercase tracking-[0.08em] text-muted-foreground',
                  plan.popular && 'bg-card text-foreground',
                )}
              >
                {plan.popular && (
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
                )}
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, groupIndex) => (
            <Fragment key={group.label}>
              {/* Group label keeps per-column cells (not colSpan) so the
                  popular column's bg-card runs unbroken down the table. The
                  numbered index is the receipts-ledger grammar from the
                  features page's guarantees section. */}
              <tr className="border-b border-border">
                <th
                  scope="colgroup"
                  className="px-5 pb-3 pt-6 text-left text-xs font-normal uppercase tracking-[0.08em] text-muted-foreground"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="tabular-nums text-primary">
                      {String(groupIndex + 1).padStart(2, '0')}
                    </span>
                    {group.label}
                  </span>
                </th>
                {COLUMNS.map((plan) => (
                  <td key={plan.id} aria-hidden="true" className={cn(plan.popular && 'bg-card')} />
                ))}
              </tr>
              {group.rows.map((row) => (
                <tr key={`${group.label}-${row.label}`} className="border-b border-border">
                  <th scope="row" className="px-5 py-3.5 text-left text-sm font-normal text-muted-foreground">
                    {row.label}
                  </th>
                  {COLUMNS.map((plan) => (
                    <td key={plan.id} className={cn('px-5 py-3.5', plan.popular && 'bg-card')}>
                      <ValueCell value={row.values[plan.id] ?? false} />
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

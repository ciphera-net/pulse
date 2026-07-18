'use client'

import { forwardRef } from 'react'
import { Check } from '@phosphor-icons/react'
import { Spinner } from '@ciphera-net/facet'
import { cn } from '@/lib/cn'
import type { PlanCatalogEntry, PlanPricing } from '@/lib/plans'

interface PlanChoiceCardProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  plan: PlanCatalogEntry
  price: PlanPricing | null
  /** True while the prices request is still in flight — shows a spinner. */
  priceLoading: boolean
  isYearly: boolean
  /** The org's live plan+tier+interval — renders inert with a CURRENT chip. */
  isCurrent?: boolean
}

/**
 * One selectable plan row — shared by /setup/plan and /switch so the two
 * flows can't drift apart visually. The chip set is deliberately small:
 * CURRENT (neutral — a fact, not a nudge) and POPULAR (brand — the one
 * sanctioned orange accent on the card).
 */
const PlanChoiceCard = forwardRef<HTMLButtonElement, PlanChoiceCardProps>(
  function PlanChoiceCard({ plan, price, priceLoading, isYearly, isCurrent = false, className, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || isCurrent}
        className={cn(
          'w-full text-left p-4 rounded-none border transition-all duration-base ease-apple',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange',
          isCurrent
            ? 'border-neutral-700 bg-neutral-800/50 cursor-default'
            : plan.popular
              ? 'border-brand-orange/40 bg-brand-orange/5 hover:border-brand-orange/70'
              : 'border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30',
          className,
        )}
        {...rest}
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{plan.name}</span>
              {isCurrent && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-300 bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 rounded-none">
                  Current
                </span>
              )}
              {!isCurrent && plan.popular && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-orange bg-brand-orange/10 px-1.5 py-0.5 rounded-none">
                  Popular
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">{plan.description}</p>
          </div>
          {price ? (
            <div className="text-right shrink-0">
              <div>
                <span className="text-lg font-bold text-white">
                  €{isYearly ? price.effectiveMonthly : price.monthly}
                </span>
                <span className="text-xs text-neutral-500">/mo</span>
              </div>
              {isYearly && (
                <p className="text-xs text-neutral-500">€{price.yearlyTotal} billed yearly</p>
              )}
            </div>
          ) : priceLoading ? (
            <Spinner size="sm" />
          ) : (
            <span className="text-sm text-neutral-500">—</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {plan.highlights.map((f) => (
            <span key={f} className="flex items-center gap-1 text-xs text-neutral-400">
              <Check className="w-3 h-3 text-brand-orange" weight="bold" />
              {f}
            </span>
          ))}
        </div>
      </button>
    )
  },
)

export default PlanChoiceCard

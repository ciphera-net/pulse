'use client'

import { MagnifyingGlass } from '@phosphor-icons/react'
import { buttonVariants } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// FilterButton — the toolbar trigger for the filter popover. The old inline
// dimension panel lives in components/dashboard/filter/ now; this is just the
// styled button handing its element to the popover as the anchor.
// ---------------------------------------------------------------------------

export interface FilterButtonProps {
  hasActiveFilters: boolean
  /** Popover open state — keeps the pressed styling while the flow is up. */
  active: boolean
  onClick: (anchor: HTMLElement) => void
}

export default function FilterButton({ hasActiveFilters, active, onClick }: FilterButtonProps) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={active}
      onClick={e => onClick(e.currentTarget)}
      className={cn(
        // * Facet's header chrome is the base (h-10 hairline, focus ring);
        // * the engaged state overlays the brand tint on top of it.
        buttonVariants({ variant: 'chrome', size: 'toolbar' }),
        'active:scale-[0.97] transition-[color,background-color,border-color,transform] ease-apple',
        (hasActiveFilters || active) && 'border-brand-orange/30 bg-brand-orange/10 text-brand-orange hover:border-brand-orange/30',
      )}
    >
      <MagnifyingGlass className="w-3.5 h-3.5" weight="bold" />
      Filter
    </button>
  )
}

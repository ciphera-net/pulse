'use client'

import { MagnifyingGlass } from '@phosphor-icons/react'

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
      className={`inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-none border transition-[color,background-color,border-color,transform] active:scale-[0.97] cursor-pointer ${
        hasActiveFilters || active
          ? 'bg-brand-orange/10 text-brand-orange border-brand-orange/30'
          : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white border-neutral-800'
      } ease-apple`}
    >
      <MagnifyingGlass className="w-3.5 h-3.5" weight="bold" />
      Filter
    </button>
  )
}

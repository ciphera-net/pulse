'use client'

import Link from 'next/link'
import { PlusIcon } from '@ciphera-net/facet'
import SiteLimitUpgradeButton from '@/components/dashboard/SiteLimitUpgradeButton'

interface FleetHeaderProps {
  siteCount: number
  /** null = unlimited plan (counter shows a plain count). */
  siteLimit: number | null
  canCreate: boolean
}

/**
 * The Fleet Deck header — H2 by decision: title plus ONE fused control,
 * "+ Add Site │ N/M" (chrome hairline, toolbar height, hairline-divided
 * counter). No caption row. At the plan limit the control hands over to the
 * established SiteLimitUpgradeButton (same fused anatomy, upgrade action).
 */
export default function FleetHeader({ siteCount, siteLimit, canCreate }: FleetHeaderProps) {
  const counter = siteLimit != null ? `${siteCount}/${siteLimit}` : `${siteCount} ${siteCount === 1 ? 'site' : 'sites'}`

  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="text-lg font-semibold text-neutral-200">Your Sites</h1>
      {siteLimit != null && siteCount >= siteLimit ? (
        <SiteLimitUpgradeButton used={siteCount} limit={siteLimit} />
      ) : canCreate ? (
        <Link
          href="/sites/new"
          className="group inline-flex h-10 items-stretch rounded-none border border-input bg-card text-sm text-neutral-200 transition-colors duration-fast hover:border-line-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 pl-4 pr-3 font-medium">
            <PlusIcon className="h-3.5 w-3.5" />
            Add Site
          </span>
          <span className="flex items-center border-l border-input px-3 text-xs tabular-nums text-neutral-400">
            {counter}
          </span>
        </Link>
      ) : (
        <span className="inline-flex h-10 items-center rounded-none border border-input bg-card px-3 text-xs tabular-nums text-neutral-400">
          {counter}
        </span>
      )}
    </div>
  )
}

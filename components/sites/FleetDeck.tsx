'use client'

import type { Site, SiteOverview } from '@/lib/api/sites'
import { FleetCard } from '@/components/sites/FleetCard'

interface FleetDeckProps {
  sites: Site[]
  overviewBySite: Record<string, SiteOverview>
  overviewError: boolean
  onRetryOverview: () => void
}

/**
 * The Your Sites deck: a two-up grid of V2d4 cinematic cards. Purely the
 * non-empty grid — loading and empty states are owned upstream by
 * HomeDashboard (this component's former unreachable branches are gone).
 */
export default function FleetDeck({ sites, overviewBySite, overviewError, onRetryOverview }: FleetDeckProps) {
  return (
    <div>
      {overviewError && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-none border border-red-500/30 bg-red-500/5 px-4 py-2.5">
          <p className="text-sm text-red-400">Couldn&apos;t load site stats.</p>
          <button
            type="button"
            onClick={onRetryOverview}
            className="inline-flex h-8 items-center rounded-none border border-neutral-800 px-3 text-xs font-medium text-neutral-200 transition-colors duration-fast ease-apple hover:border-neutral-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
          >
            Retry
          </button>
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {sites.map((site) => (
          <FleetCard
            key={site.id}
            site={site}
            overview={overviewBySite[site.id] ?? null}
            overviewError={overviewError}
          />
        ))}
      </div>
    </div>
  )
}

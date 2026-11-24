'use client'

import { Button } from '@ciphera-net/facet'
import type { Site, SiteOverview } from '@/lib/api/sites'
import { SiteCard } from '@/components/sites/SiteCard'

interface SitesDeckProps {
  sites: Site[]
  overviewBySite: Record<string, SiteOverview>
  overviewError: boolean
  onRetryOverview: () => void
}

/**
 * The Your Sites cards behind the new-sites beta (24-11-2026): a two-up grid of SiteCard. A failed overview read is a
 * line with an orange dot and the dashboard's own button, never a tinted panel (the app's colour rule). Loading and
 * the empty state belong to HomeDashboard.
 */
export default function SitesDeck({ sites, overviewBySite, overviewError, onRetryOverview }: SitesDeckProps) {
  return (
    <div>
      {overviewError && (
        <div className="mb-4 flex items-center justify-between gap-4" role="status">
          <p className="inline-flex items-center gap-2 text-sm text-neutral-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" aria-hidden="true" />
            Couldn&apos;t load the figures for your sites.
          </p>
          <Button variant="chrome" size="sm" onClick={onRetryOverview}>
            Try again
          </Button>
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {sites.map((site) => (
          <SiteCard key={site.id} site={site} overview={overviewBySite[site.id] ?? null} overviewError={overviewError} />
        ))}
      </div>
    </div>
  )
}

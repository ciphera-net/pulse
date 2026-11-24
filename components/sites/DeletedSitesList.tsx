'use client'

import { Button } from '@ciphera-net/facet'
import type { Site } from '@/lib/api/sites'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
import { FRAME_SURFACE } from '@/lib/dashboard/frameClasses'

/** A deleted site is kept for 7 days, then deleted for good (the server's purge). */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000

/** "Deleted in 3 days", from the site's deleted_at. Pure: `now` is injected for tests. */
export function deletionWords(deletedAt: string | null | undefined, now: number = Date.now()): string {
  if (!deletedAt) return 'Waiting to be deleted'
  const daysLeft = Math.max(0, Math.ceil((Date.parse(deletedAt) + KEEP_MS - now) / 86_400_000))
  return daysLeft === 0 ? 'Deleted within a day' : `Deleted in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
}

/**
 * Sites waiting to be deleted, under the new-sites beta (24-11-2026): one of the dashboard's blocks, a row a site with
 * its mark, name and address, the days left as an orange dot and words, and the dashboard's own buttons. Restore is
 * one press (small and reversible); Delete now opens the hold dialog HomeDashboard owns.
 */
export default function DeletedSitesList({
  sites,
  onRestore,
  onDeleteNow,
}: {
  sites: Site[]
  onRestore: (id: string) => void
  onDeleteNow: (id: string) => void
}) {
  if (sites.length === 0) return null
  return (
    <section className={`${FRAME_SURFACE} mt-8 px-6 py-5`} aria-labelledby="deleted-sites-heading">
      <h2 id="deleted-sites-heading" className="mb-3 text-base font-semibold text-white">
        Scheduled for deletion
      </h2>
      <ul className="space-y-2">
        {sites.map((site) => (
          <li key={site.id} className="flex flex-wrap items-center gap-x-3 gap-y-2" data-deleted-site={site.id}>
            <SiteFavicon domain={site.domain} name={site.name} size={18} />
            <span className="text-sm font-medium text-white">{site.name}</span>
            <span className="text-sm text-neutral-500">{site.domain}</span>
            <span className="inline-flex items-center gap-1.5 text-xs text-neutral-300">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" aria-hidden="true" />
              {deletionWords(site.deleted_at)}
            </span>
            <span className="ml-auto flex gap-2">
              <Button variant="chrome" size="sm" onClick={() => onRestore(site.id)}>
                Restore
              </Button>
              <Button variant="destructive" size="sm" aria-haspopup="dialog" onClick={() => onDeleteNow(site.id)}>
                Delete now
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

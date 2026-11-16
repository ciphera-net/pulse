'use client'

import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { DASHBOARD_REALTIME_MINUTES, REALTIME_EMPTY_LINE } from '@/lib/dashboard/realtimeRange'
import { useEmptyFacts } from '@/lib/dashboard/emptyFacts'
import { useCan } from '@/lib/auth/permissions'
import { canWrite, useOptionalSiteScope } from '@/lib/scope/SiteScope'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// A dashboard block's empty state: what is TRUE about why it is empty (owner rulings R11, R21 to R23, 14-11-2026).
//
// A block used to say one thing whatever the reason, and six of them offered an orange "Install tracking script"
// button on sites whose script had reported for months. The page knows why a block is empty (lib/dashboard/
// emptyFacts.tsx), so this component says one of:
//
//   live        Realtime. Nobody on the site in the last five minutes: the one line of 25-09-2026, said when the
//               live counter is known to be at zero. With somebody on the site a block can still have none of
//               its own kind, and says exactly that: "No outbound clicks in the last 5 minutes." (R25).
//   off         The kind is switched off for the site (Outbound links): said so, with the way to the setting.
//   fresh       No visit has ever arrived: "No visitors yet" and what THIS block will show. The banner above the
//               chart asks for the install; no block repeats it.
//   filtered    A filter is on and nothing matches: change it or clear it.
//   range       The site has visits and this range has none of the kind: the block's own heading, and a longer
//               range to try where there is one.
//
// At most ONE action, and only where there is something to do: clear the filter, open the setting, or read how to send
// what the block counts (Events, Campaigns). It is the dashboard's own bordered button, never the filled orange one
// (EmptyState's `block` look, ruling R57 of 16-11-2026: every empty block shows the one kind).
//
// In a public view (the demo, a share link) the reader is not the site's owner: a block says its heading and
// nothing else, with no way into settings (PUL-34). A filter the reader set themselves is the one exception: the
// demo lets a visitor filter, so it lets them clear it.
//
// It is decided HERE, from the ambient scope and facts, so a block added later cannot get it wrong.
// ---------------------------------------------------------------------------

/** Where the tracking options live. The settings page reads which site from `pulse_active_site`, as the banner's link does. */
const SITE_SETTINGS = '/settings/site/general'

export const EMPTY_FRESH_TITLE = 'No visitors yet'
export const EMPTY_FILTER_TITLE = 'Nothing matches this filter'
export const EMPTY_FILTER_LINE = 'Change the filter or clear it to see this block again.'
export const EMPTY_FILTER_ACTION = 'Clear filter'
export const EMPTY_RANGE_LINE = 'Try a longer range.'
export const EMPTY_OFF_ACTION = 'Open site settings'

/** The heading of a block whose range has none of its kind: "No visits in this range". */
export const emptyRangeTitle = (kind: string) => `No ${kind} in this range`
/** Realtime's heading for a block with none of its kind while somebody may be on the site. */
export const emptyLiveTitle = (kind: string) => `No ${kind} in the last ${DASHBOARD_REALTIME_MINUTES} minutes.`

interface CardEmptyStateProps {
  icon?: ReactNode
  /**
   * What the block counts, as its headings name it: "visits", "page views", "outbound clicks", "events". Both
   * headings are made from it HERE, "No visits in this range" and realtime's "No visits in the last 5 minutes.",
   * so the two cannot drift apart.
   */
  kind: string
  /** Said under "No visitors yet" on a site that has never had a visit: what this block will show. */
  fresh: string
  /**
   * One docs link, for a block that stays empty until the customer does something (Events, Campaigns).
   * `whenFresh` keeps it on a site with no visits yet too (Events: sending events is set up beside the script).
   */
  docs?: { label: string; href: string; whenFresh?: boolean }
  /** The kind is switched off for this site: said in place of everything else. */
  off?: { title: string; description: string } | null
  /** False for a block the page's filter does not reach (Outbound): it must never blame the filter. */
  filterable?: boolean
  /** Realtime mode: the one realtime line, or the block's own while somebody is on the site. */
  live?: boolean
  className?: string
}

export default function CardEmptyState({ icon, kind, fresh, docs, off, filterable = true, live = false, className }: CardEmptyStateProps) {
  const scope = useOptionalSiteScope()
  const facts = useEmptyFacts()
  const canEdit = useCan('sites.edit')
  // One block size: the state fills the block's body and sits in its middle. With the old 48 px of padding above
  // and under it, an empty block was taller than a block of seven rows.
  const box = cn('h-full py-6', className)

  // "Nobody on the site" is a claim about the whole site, so it is made only on a live count that is known and at
  // zero. Otherwise the block says what it has none of, which is true whoever is on the site, and true while the
  // count has not arrived.
  if (live) return <EmptyState variant="block" icon={icon} title={facts.nobodyLive ? REALTIME_EMPTY_LINE : emptyLiveTitle(kind)} className={box} />

  const title = emptyRangeTitle(kind)

  const reader = Boolean(scope && !canWrite(scope))
  const filtered = facts.filtered && filterable

  if (off && !reader) {
    const siteId = scope?.siteId
    return (
      <EmptyState
        variant="block"
        icon={icon}
        title={off.title}
        description={off.description}
        action={canEdit ? {
          label: EMPTY_OFF_ACTION,
          href: SITE_SETTINGS,
          onClick: siteId ? () => sessionStorage.setItem('pulse_active_site', siteId) : undefined,
        } : undefined}
        className={box}
      />
    )
  }

  if (facts.neverVisited && !reader) {
    return (
      <EmptyState
        variant="block"
        icon={icon}
        title={EMPTY_FRESH_TITLE}
        description={fresh}
        action={docs?.whenFresh ? { label: docs.label, href: docs.href, external: true } : undefined}
        className={box}
      />
    )
  }

  if (filtered) {
    return (
      <EmptyState
        variant="block"
        icon={icon}
        title={EMPTY_FILTER_TITLE}
        description={EMPTY_FILTER_LINE}
        action={facts.clearFilters ? { label: EMPTY_FILTER_ACTION, onClick: facts.clearFilters } : undefined}
        className={box}
      />
    )
  }

  // A public reader: the heading alone.
  if (reader) return <EmptyState variant="block" icon={icon} title={title} className={box} />

  return (
    <EmptyState
      variant="block"
      icon={icon}
      title={title}
      description={facts.canWiden ? EMPTY_RANGE_LINE : undefined}
      action={docs ? { label: docs.label, href: docs.href, external: true } : undefined}
      className={box}
    />
  )
}

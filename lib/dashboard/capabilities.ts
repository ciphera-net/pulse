import type { SiteScope } from '@/lib/scope/SiteScope'

/**
 * What the dashboard offers under a scope (PUL-34 Phase 2, design
 * Pulse/docs/plans/20-10-2026-pulse-demo-real-app-design.md §3.2).
 *
 * The product dashboard, the demo and a customer's share link are ONE composition
 * (components/surfaces/DashboardSurface.tsx). What differs between them is decided here,
 * once, from the scope, so the surface reads a flag instead of re-deriving "am I a member"
 * at every control, and a control added later has one place to be classified.
 *
 *  - `member`: the signed-in product (/sites/<id>).
 *  - `public` + `full`: the demo site, served the whole read surface exactly as a member
 *    reads it (filters, any range, every interval, live windows), anonymously.
 *  - `public` + `scoped`: a customer's share link, served five routes (stats, daily,
 *    realtime, dashboard, page-preview) as public-scoped reads: four fixed day-granular
 *    windows, no filters, no hourly buckets, breakdown rows under five visitors withheld
 *    (pulse-backend public_surface.go, public_floor.go). The page must not ask for more:
 *    every request outside that list is refused, and a refused request on a public page
 *    is a visible failure.
 */
export interface DashboardCapabilities {
  /**
   * The member's own affordances: the install banner, the product tour, the realtime
   * socket. Never in a public view: it has no account, and "set up" is not its business.
   */
  member: boolean
  /** The filter builder, its pills and click-to-filter rows. A filtered public-scoped read is refused. */
  filters: boolean
  /** The previous-period comparison (a second read over arbitrary dates, refused in public scope). */
  comparison: boolean
  /** Realtime as a mode entered from the orb. Without it the orb only shows the count. */
  realtimeMode: boolean
  /**
   * Hour-of-day and sub-day buckets: the interval picker, hourly single days and the
   * Behaviour heatmap. A public-scoped read is day-granular only.
   */
  hourlyBuckets: boolean
  /**
   * A read may carry explicit start/end dates beside (or instead of) a period token.
   * A public-scoped read accepts the allowlisted period token ALONE and refuses any date,
   * so under it the page names no date to a read at all.
   */
  explicitDates: boolean
  /**
   * The reads behind a card's full list, the Events drill-down, the Campaigns list and
   * Outbound. False only for a public-scoped read, which is served none of them: the
   * card pages what its own payload carries instead (the cards' `memberFeatures`).
   */
  fullReads: boolean
  /** The site record and the data window. A customer's link is served neither: the site rides the dashboard payload. */
  siteRecord: boolean
  /** The hero frames /demo and waits for the page to say it has drawn (lib/scope/embed.ts). */
  embedReady: boolean
}

export function dashboardCapabilities(scope: Pick<SiteScope, 'mode' | 'fidelity'>): DashboardCapabilities {
  const member = scope.mode === 'member'
  // A public view is scoped unless the scope says it is served the full surface.
  const scoped = scope.mode === 'public' && scope.fidelity === 'scoped'
  return {
    member,
    filters: !scoped,
    comparison: !scoped,
    realtimeMode: !scoped,
    hourlyBuckets: !scoped,
    explicitDates: !scoped,
    fullReads: !scoped,
    siteRecord: !scoped,
    embedReady: scope.mode === 'public',
  }
}

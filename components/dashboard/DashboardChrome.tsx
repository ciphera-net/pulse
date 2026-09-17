'use client'

import { usePathname } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import { useActiveSite } from '@/components/settings/active-site'

/**
 * The dashboard chrome's site hinge — one component whose whole job is deciding
 * which siteId the shell is rendering for.
 *
 * `/settings/site/*` configures ONE site, so the outer sidebar must stay in site
 * mode there: arriving at Site Settings from a site page used to swap the whole
 * rail for the home list (Your Sites / Add New Site / …), which read as being
 * thrown out of the site you were configuring. The URLs are unchanged; only the
 * chrome learned that those routes are still about a site.
 *
 * Organization and Account settings are genuinely not site-scoped and keep the
 * home rail — that is why this reads the path rather than "are we in settings".
 *
 * ⚠️ DashboardShell must stay at ONE tree position across every dashboard route,
 * or a navigation between two of them remounts the shell and the sidebar's
 * gliding highlight restarts instead of travelling. Hence a hinge on the prop,
 * never two branches each rendering their own shell.
 *
 * Since 17-09-2026 that includes the site pages: `/sites/<id>/*` used to take
 * its shell from the sites layout (SiteLayoutShell) and every other dashboard
 * route from here, so a site page → Site Settings navigation crossed a
 * route-group boundary and the shell remounted (measured on staging: the
 * highlight was a new element on arrival, zero intermediate frames). One shell
 * here, the site read from the path, and the block glides from the site's
 * Dashboard item to Site Settings.
 */
const SITE_PAGE = /^\/sites\/([^/]+)(?:\/|$)/

export default function DashboardChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { activeSiteId } = useActiveSite()
  const sitePage = pathname.match(SITE_PAGE)
  // `/sites/new` is the add-site form, a home page, not a site.
  const pathSiteId = sitePage && sitePage[1] !== 'new' ? sitePage[1] : null
  const siteId = pathSiteId ?? (pathname.startsWith('/settings/site') ? activeSiteId : null)

  return <DashboardShell siteId={siteId}>{children}</DashboardShell>
}

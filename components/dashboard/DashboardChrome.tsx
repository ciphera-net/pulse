'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import { useActiveSite } from '@/components/settings/active-site'
import { useOptionalSiteScope, type SiteScope } from '@/lib/scope/SiteScope'

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
 * Team and Account settings are not about one site, but they are a DETOUR: the
 * rail stays in whichever mode led into settings (PUL-20, 12-10-2026). Arrive
 * from a site — its pages or its settings — and Team and Account keep that
 * site's rail; switching tabs used to swap it for the home rail mid-task.
 * Arrive any other way (home, a bookmark, a reload) and they keep the home rail.
 * The memory is this component's, so it lives for the session's navigations
 * and a fresh load starts from home.
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

/**
 * Under a public scope (/demo, /share/<id>, PUL-34) the site is the scope's, and the hinge
 * has nothing to decide: there is no path to read it from and no account whose active site
 * could differ. Two components rather than a branch, because the member hinge reads the
 * active site, which only exists where its provider is mounted, and the public pages do
 * not mount it.
 */
export default function DashboardChrome({ children }: { children: React.ReactNode }) {
  const scope = useOptionalSiteScope()
  if (scope?.mode === 'public') return <PublicChrome scope={scope}>{children}</PublicChrome>
  return <MemberChrome>{children}</MemberChrome>
}

function PublicChrome({ scope, children }: { scope: SiteScope; children: React.ReactNode }) {
  return <DashboardShell siteId={scope.siteId}>{children}</DashboardShell>
}

function MemberChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { activeSiteId } = useActiveSite()
  const sitePage = pathname.match(SITE_PAGE)
  // `/sites/new` is the add-site form, a home page, not a site.
  const pathSiteId = sitePage && sitePage[1] !== 'new' ? sitePage[1] : null
  const inSettings = pathname.startsWith('/settings')
  const pageSite = pathSiteId ?? (pathname.startsWith('/settings/site') ? activeSiteId : null)
  // The site the route that led here was about: a site page or Site settings
  // sets it, any other page outside settings clears it, and Team / Account
  // keep it. Adjusted during render (React's pattern for state that follows a
  // changing input), so the navigation that changes it renders it at once.
  const [cameFromSite, setCameFromSite] = useState<string | null>(null)
  const remembered = inSettings ? (pageSite ?? cameFromSite) : pathSiteId
  if (remembered !== cameFromSite) setCameFromSite(remembered)
  const siteId = pageSite ?? (inSettings ? cameFromSite : null)

  return <DashboardShell siteId={siteId}>{children}</DashboardShell>
}

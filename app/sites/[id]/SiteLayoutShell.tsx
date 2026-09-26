'use client'

import { useEffect } from 'react'
import { rememberLastSite, markSessionEntered } from '@/lib/last-site'
import { useSite } from '@/lib/swr/dashboard'
import { SiteInAnotherTeam } from '@/components/sites/SiteInAnotherTeam'

/**
 * The sites layout's client half. It no longer mounts the dashboard shell —
 * app/layout-content.tsx mounts ONE DashboardShell for every dashboard route,
 * site pages included, so a site page → settings navigation keeps the same
 * shell and the sidebar's highlight glides across it (settings tail, item 10,
 * 17-09-2026; before that the shell lived here for site pages and in
 * layout-content for everything else, and the boundary remounted it).
 *
 * What stays is what was only ever this layout's: remembering the site — and,
 * since PULSE-87, the one place a site from ANOTHER of the reader's teams is
 * recognised. That site answers 403 to every request, and each page used to fail
 * its own way (a skeleton forever, empty data that was not true, a Retry that
 * could never work). Deciding it here, above every page, means no page mounts
 * against a site the session cannot read, and a page added later cannot forget.
 * The site request is the SAME SWR key the pages use, so it costs nothing extra.
 * Every other failure (404, 5xx, network) is left to the page, which states it.
 */
export default function SiteLayoutShell({
  siteId,
  children,
}: {
  siteId: string
  children: React.ReactNode
}) {
  const { data: site, error } = useSite(siteId)

  useEffect(() => {
    if (siteId) {
      sessionStorage.setItem('pulse_active_site', siteId)
      // * Feed the entry redirect ("/" → last-visited site) and spend this
      // * session's redirect, so a deep link into a site doesn't bounce the
      // * next "Your Sites" click straight back here. Both readers validate the
      // * id against the team's own sites, so remembering a site this session
      // * cannot read is harmless.
      rememberLastSite(siteId)
      markSessionEntered()
    }
  }, [siteId])

  // * Duck-typed, not instanceof: chunk-split bundles can hold two ApiError
  // * classes (the funnel detail page's measured lesson).
  if (!site && (error as { status?: number } | undefined)?.status === 403) {
    return <SiteInAnotherTeam siteId={siteId} />
  }
  return <>{children}</>
}

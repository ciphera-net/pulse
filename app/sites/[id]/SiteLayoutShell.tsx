'use client'

import { useEffect } from 'react'
import { rememberLastSite, markSessionEntered } from '@/lib/last-site'

/**
 * The sites layout's client half. It no longer mounts the dashboard shell —
 * app/layout-content.tsx mounts ONE DashboardShell for every dashboard route,
 * site pages included, so a site page → settings navigation keeps the same
 * shell and the sidebar's highlight glides across it (settings tail, item 10,
 * 17-09-2026; before that the shell lived here for site pages and in
 * layout-content for everything else, and the boundary remounted it).
 *
 * What stays is what was only ever this layout's: remembering the site.
 */
export default function SiteLayoutShell({
  siteId,
  children,
}: {
  siteId: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (siteId) {
      sessionStorage.setItem('pulse_active_site', siteId)
      // * Feed the entry redirect ("/" → last-visited site) and spend this
      // * session's redirect, so a deep link into a site doesn't bounce the
      // * next "Your Sites" click straight back here.
      rememberLastSite(siteId)
      markSessionEntered()
    }
  }, [siteId])

  return <>{children}</>
}

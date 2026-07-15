'use client'

import { useEffect } from 'react'
import DashboardShell from '@/components/dashboard/DashboardShell'
import { rememberLastSite, markSessionEntered } from '@/lib/last-site'

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

  return (
    <DashboardShell siteId={siteId}>
      {children}
    </DashboardShell>
  )
}

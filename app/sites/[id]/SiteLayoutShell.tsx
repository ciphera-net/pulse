'use client'

import { useEffect } from 'react'
import DashboardShell from '@/components/dashboard/DashboardShell'

export default function SiteLayoutShell({
  siteId,
  children,
}: {
  siteId: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (siteId) sessionStorage.setItem('pulse_active_site', siteId)
  }, [siteId])

  return (
    <DashboardShell siteId={siteId}>
      {children}
    </DashboardShell>
  )
}

'use client'

import DashboardShell from '@/components/dashboard/DashboardShell'

export default function SiteLayoutShell({
  siteId,
  children,
}: {
  siteId: string
  children: React.ReactNode
}) {
  return (
    <DashboardShell siteId={siteId}>
      {children}
    </DashboardShell>
  )
}

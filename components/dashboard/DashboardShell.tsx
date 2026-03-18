'use client'

import Sidebar from './Sidebar'
import { useSidebar } from '@/lib/sidebar-context'

export default function DashboardShell({
  siteId,
  children,
}: {
  siteId: string
  children: React.ReactNode
}) {
  const { mobileOpen, closeMobile } = useSidebar()

  return (
    <div className="flex flex-1 min-h-0">
      <Sidebar siteId={siteId} mobileOpen={mobileOpen} onMobileClose={closeMobile} />
      <main className="flex-1 min-w-0 overflow-auto pb-8">
        {children}
      </main>
    </div>
  )
}

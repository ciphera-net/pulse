'use client'

import Sidebar from './Sidebar'
import UtilityBar from './UtilityBar'
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar siteId={siteId} mobileOpen={mobileOpen} onMobileClose={closeMobile} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <UtilityBar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

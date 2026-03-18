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
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar: full width — logo left, actions right */}
      <UtilityBar />
      {/* Below: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar siteId={siteId} mobileOpen={mobileOpen} onMobileClose={closeMobile} />
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

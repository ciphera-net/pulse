'use client'

import PulseSidebar from './Sidebar'
import UtilityBar from './UtilityBar'

export default function DashboardShell({
  siteId,
  children,
}: {
  siteId: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <UtilityBar />
      <div className="flex flex-1 overflow-hidden">
        <PulseSidebar siteId={siteId} />
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

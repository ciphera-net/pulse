'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import ContentHeader from './ContentHeader'

// Load sidebar only on the client — prevents any SSR flash of text/labels
const Sidebar = dynamic(() => import('./Sidebar'), { ssr: false })

export default function DashboardShell({
  siteId,
  children,
}: {
  siteId: string
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeMobile = useCallback(() => setMobileOpen(false), [])
  const openMobile = useCallback(() => setMobileOpen(true), [])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        siteId={siteId}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
        onMobileOpen={openMobile}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ContentHeader onMobileMenuOpen={openMobile} />
        <main className="flex-1 overflow-y-auto pt-6">
          {children}
        </main>
      </div>
    </div>
  )
}

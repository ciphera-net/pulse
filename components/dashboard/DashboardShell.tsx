'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import ContentHeader from './ContentHeader'

// Load sidebar only on the client — prevents SSR flash
const Sidebar = dynamic(() => import('./Sidebar'), {
  ssr: false,
  // Placeholder reserves the sidebar's space in the server HTML
  // so page content never occupies the sidebar zone
  loading: () => (
    <div
      className="hidden md:block shrink-0 border-r border-neutral-800/60 bg-neutral-900/90 backdrop-blur-xl overflow-hidden relative"
      style={{ width: 64 }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-neutral-800/10 to-transparent animate-shimmer" />
    </div>
  ),
})

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
        <main className="flex-1 overflow-y-auto pt-4">
          {children}
        </main>
      </div>
    </div>
  )
}

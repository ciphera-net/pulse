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
      className="hidden md:block shrink-0 bg-neutral-950 overflow-hidden relative"
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
    <div className="flex h-screen overflow-hidden bg-neutral-950">
      <Sidebar
        siteId={siteId}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
        onMobileOpen={openMobile}
      />
      {/* Content panel — rounded corners, inset from edges. The left border doubles as the sidebar's right edge. */}
      <div className="flex-1 flex flex-col min-w-0 mt-2 mr-2 mb-2 rounded-2xl bg-neutral-950 border border-neutral-800/60 isolate overflow-clip">
        <ContentHeader onMobileMenuOpen={openMobile} />
        <main className="flex-1 overflow-y-auto pt-4">
          {children}
        </main>
      </div>
    </div>
  )
}

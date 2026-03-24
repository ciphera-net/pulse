'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { formatUpdatedAgo } from '@ciphera-net/ui'
import { SidebarSimple } from '@phosphor-icons/react'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context'
import { useRealtime } from '@/lib/swr/dashboard'
import ContentHeader from './ContentHeader'

// Load sidebar only on the client — prevents SSR flash
const Sidebar = dynamic(() => import('./Sidebar'), {
  ssr: false,
  loading: () => (
    <div
      className="hidden md:block shrink-0 bg-transparent overflow-hidden relative"
      style={{ width: 64 }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-neutral-800/10 to-transparent animate-shimmer" />
    </div>
  ),
})

function GlassTopBar({ siteId }: { siteId: string }) {
  const { collapsed, toggle } = useSidebar()
  const { data: realtime } = useRealtime(siteId)
  const lastUpdatedRef = useRef<number | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (realtime) lastUpdatedRef.current = Date.now()
  }, [realtime])

  useEffect(() => {
    if (lastUpdatedRef.current == null) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [realtime])

  return (
    <div className="hidden md:flex items-center justify-between h-10 shrink-0 px-3">
      {/* Collapse toggle — aligned above sidebar */}
      <button
        onClick={toggle}
        className="flex items-center justify-center p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <SidebarSimple className="w-[18px] h-[18px]" weight={collapsed ? 'regular' : 'fill'} />
      </button>

      {/* Realtime indicator — aligned above content right edge */}
      {lastUpdatedRef.current != null && (
        <div className="flex items-center gap-1.5 text-xs text-neutral-500 mr-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
          </span>
          Live · {formatUpdatedAgo(lastUpdatedRef.current)}
        </div>
      )}
    </div>
  )
}

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
    <SidebarProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-neutral-900/65 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:bg-neutral-900/60">
        {/* Full-width top bar in glass area */}
        <GlassTopBar siteId={siteId} />
        {/* Sidebar + content side by side */}
        <div className="flex flex-1 min-h-0">
          <Sidebar
            siteId={siteId}
            mobileOpen={mobileOpen}
            onMobileClose={closeMobile}
            onMobileOpen={openMobile}
          />
          {/* Content panel */}
          <div className="flex-1 flex flex-col min-w-0 mr-2 mb-2 rounded-2xl bg-neutral-950 border border-neutral-800/60 overflow-hidden">
            <ContentHeader onMobileMenuOpen={openMobile} />
            <main className="flex-1 overflow-y-auto pt-4">
              {children}
            </main>
          </div>
        </div>
      </div>
    </SidebarProvider>
  )
}

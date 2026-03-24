'use client'

import { useState, useEffect, useRef } from 'react'
import { MenuIcon, CollapseLeftIcon, formatUpdatedAgo } from '@ciphera-net/ui'
import { useSidebar } from '@/lib/sidebar-context'
import { useRealtime } from '@/lib/swr/dashboard'

export default function ContentHeader({
  siteId,
  onMobileMenuOpen,
}: {
  siteId: string
  onMobileMenuOpen: () => void
}) {
  const { collapsed, toggle } = useSidebar()
  const { data: realtime } = useRealtime(siteId)
  const lastUpdatedRef = useRef<number | null>(null)
  const [, setTick] = useState(0)

  // Track when realtime data last changed
  useEffect(() => {
    if (realtime) lastUpdatedRef.current = Date.now()
  }, [realtime])

  // Tick every second to keep "X seconds ago" fresh
  useEffect(() => {
    if (lastUpdatedRef.current == null) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [realtime])

  return (
    <div className="shrink-0 flex items-center justify-between border-b border-neutral-800/60 px-3 py-2">
      {/* Left — mobile hamburger or desktop collapse toggle */}
      <div className="flex items-center">
        {/* Mobile hamburger */}
        <button
          onClick={onMobileMenuOpen}
          className="p-2 text-neutral-400 hover:text-white md:hidden"
          aria-label="Open navigation"
        >
          <MenuIcon className="w-5 h-5" />
        </button>

        {/* Desktop collapse toggle */}
        <button
          onClick={toggle}
          className="hidden md:flex items-center justify-center p-2 text-neutral-500 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <CollapseLeftIcon className={`w-[18px] h-[18px] transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Right — realtime indicator */}
      {lastUpdatedRef.current != null && (
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
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

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { formatUpdatedAgo } from '@ciphera-net/ui'
import { CaretDown, CaretRight, SidebarSimple } from '@phosphor-icons/react'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context'
import { useRealtime } from '@/lib/swr/dashboard'
import { getSite, listSites, type Site } from '@/lib/api/sites'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'
import ContentHeader from './ContentHeader'

const PAGE_TITLES: Record<string, string> = {
  '': 'Dashboard',
  journeys: 'Journeys',
  funnels: 'Funnels',
  behavior: 'Behavior',
  search: 'Search',
  cdn: 'CDN',
  uptime: 'Uptime',
  pagespeed: 'PageSpeed',
  settings: 'Site Settings',
}

function usePageTitle() {
  const pathname = usePathname()
  // pathname is /sites/:id or /sites/:id/section/...
  const segment = pathname.replace(/^\/sites\/[^/]+\/?/, '').split('/')[0]
  return PAGE_TITLES[segment] ?? (segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : 'Dashboard')
}

const HOME_PAGE_TITLES: Record<string, string> = {
  '': 'Your Sites',
  integrations: 'Integrations',
  pricing: 'Pricing',
}

function useHomePageTitle() {
  const pathname = usePathname()
  const segment = pathname.split('/').filter(Boolean)[0] ?? ''
  return HOME_PAGE_TITLES[segment] ?? (segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : 'Your Sites')
}

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

// ─── Breadcrumb Site Picker ────────────────────────────────

function BreadcrumbSitePicker({ currentSiteId, currentSiteName }: { currentSiteId: string; currentSiteName: string }) {
  const [open, setOpen] = useState(false)
  const [sites, setSites] = useState<Site[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (open && sites.length === 0) {
      listSites().then(setSites).catch(() => {})
    }
  }, [open, sites.length])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const switchSite = (id: string) => {
    // Navigate to same section on the new site
    router.push(`/sites/${id}${pathname.replace(/^\/sites\/[^/]+/, '')}`)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-0.5 text-neutral-500 hover:text-neutral-300 transition-colors truncate max-w-[160px] cursor-pointer"
      >
        <span className="truncate">{currentSiteName}</span>
        <CaretDown className="w-3 h-3 shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-[220px] bg-neutral-900/90 backdrop-blur-2xl border border-white/[0.08] rounded-xl shadow-xl shadow-black/20 overflow-hidden">
          <div className="max-h-64 overflow-y-auto py-1">
            {sites.map((site) => (
              <button
                key={site.id}
                onClick={() => switchSite(site.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                  site.id === currentSiteId
                    ? 'bg-brand-orange/10 text-brand-orange font-medium'
                    : 'text-neutral-300 hover:bg-white/[0.06]'
                }`}
              >
                <img
                  src={`${FAVICON_SERVICE_URL}?domain=${site.domain}&sz=64`}
                  alt=""
                  className="w-4 h-4 rounded object-contain shrink-0"
                />
                <span className="truncate">{site.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Glass Top Bar ─────────────────────────────────────────

function GlassTopBar({ siteId }: { siteId: string | null }) {
  const { collapsed, toggle } = useSidebar()
  const { data: realtime } = useRealtime(siteId ?? '')
  const lastUpdatedRef = useRef<number | null>(null)
  const [, setTick] = useState(0)
  const [siteName, setSiteName] = useState<string | null>(null)

  useEffect(() => {
    if (siteId && realtime) lastUpdatedRef.current = Date.now()
  }, [siteId, realtime])

  useEffect(() => {
    if (lastUpdatedRef.current == null) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [realtime])

  useEffect(() => {
    if (!siteId) { setSiteName(null); return }
    getSite(siteId).then((s) => setSiteName(s.name)).catch(() => {})
  }, [siteId])

  const dashboardTitle = usePageTitle()
  const homeTitle = useHomePageTitle()
  const pageTitle = siteId ? dashboardTitle : homeTitle

  return (
    <div className="hidden md:flex items-center justify-between shrink-0 px-3 pt-1.5 pb-1">
      {/* Left: collapse toggle + breadcrumbs */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={toggle}
          className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <SidebarSimple className="w-[18px] h-[18px]" weight={collapsed ? 'regular' : 'fill'} />
        </button>
        {siteId && siteName ? (
          <nav className="flex items-center gap-1 text-sm font-medium">
            <Link href="/" className="text-neutral-500 hover:text-neutral-300 transition-colors">Your Sites</Link>
            <CaretRight className="w-3 h-3 text-neutral-600" />
            <BreadcrumbSitePicker currentSiteId={siteId} currentSiteName={siteName} />
            <CaretRight className="w-3 h-3 text-neutral-600" />
            <span className="text-neutral-400">{pageTitle}</span>
          </nav>
        ) : (
          <span className="text-sm text-neutral-400 font-medium">{pageTitle}</span>
        )}
      </div>

      {/* Realtime indicator */}
      {siteId && lastUpdatedRef.current != null && (
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

export default function DashboardShell({
  siteId,
  children,
}: {
  siteId: string | null
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeMobile = useCallback(() => setMobileOpen(false), [])
  const openMobile = useCallback(() => setMobileOpen(true), [])

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-neutral-900/65 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:bg-neutral-900/60">
        <Sidebar
          siteId={siteId}
          mobileOpen={mobileOpen}
          onMobileClose={closeMobile}
          onMobileOpen={openMobile}
        />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Glass top bar — above content only, collapse icon reaches back into sidebar column */}
          <GlassTopBar siteId={siteId} />
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

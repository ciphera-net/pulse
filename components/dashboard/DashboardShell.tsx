'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { formatUpdatedAgo, PlusIcon, ExternalLinkIcon, type CipheraApp } from '@ciphera-net/ui'
import { CaretDown, CaretRight, SidebarSimple } from '@phosphor-icons/react'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context'
import { LiveIndicatorProvider, useLiveIndicator } from '@/lib/live-indicator-context'
import { getSite, listSites, type Site } from '@/lib/api/sites'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'
import ContentHeader from './ContentHeader'

const CIPHERA_APPS: CipheraApp[] = [
  { id: 'pulse', name: 'Pulse', description: 'Your current app — Privacy-first analytics', icon: 'https://ciphera.net/pulse_icon_no_margins.png', href: 'https://pulse.ciphera.net', isAvailable: false },
  { id: 'drop', name: 'Drop', description: 'Secure file sharing', icon: 'https://ciphera.net/drop_icon_no_margins.png', href: 'https://drop.ciphera.net', isAvailable: true },
  { id: 'auth', name: 'Auth', description: 'Your Ciphera account settings', icon: 'https://ciphera.net/auth_icon_no_margins.png', href: 'https://auth.ciphera.net', isAvailable: true },
]

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

// ─── Breadcrumb App Switcher ───────────────────────────────

function BreadcrumbAppSwitcher() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [fixedPos, setFixedPos] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        ref.current && !ref.current.contains(target) &&
        (!panelRef.current || !panelRef.current.contains(target))
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      let top = rect.bottom + 4
      if (panelRef.current) {
        const maxTop = window.innerHeight - panelRef.current.offsetHeight - 8
        top = Math.min(top, Math.max(8, maxTop))
      }
      setFixedPos({ left: rect.left, top })
      requestAnimationFrame(() => {
        if (buttonRef.current) {
          const r = buttonRef.current.getBoundingClientRect()
          setFixedPos({ left: r.left, top: r.bottom + 4 })
        }
      })
    }
  }, [open])

  const dropdown = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="fixed z-50 w-72 bg-neutral-900/65 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:bg-neutral-900/60 border border-white/[0.08] rounded-xl shadow-xl shadow-black/20 overflow-hidden origin-top-left"
          style={fixedPos ? { left: fixedPos.left, top: fixedPos.top } : undefined}
        >
          <div className="p-4">
            <div className="text-xs font-medium text-neutral-400 tracking-wider mb-3">Ciphera Apps</div>
            <div className="grid grid-cols-3 gap-3">
              {CIPHERA_APPS.map((app) => {
                const isCurrent = app.id === 'pulse'
                return (
                  <a
                    key={app.id}
                    href={app.href}
                    onClick={(e) => { if (isCurrent) { e.preventDefault(); setOpen(false) } else setOpen(false) }}
                    className={`group flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${
                      isCurrent ? 'bg-neutral-800/50 cursor-default' : 'hover:bg-neutral-800/50'
                    }`}
                  >
                    <div className="w-10 h-10 flex items-center justify-center shrink-0">
                      <img src={app.icon} alt={app.name} className="w-8 h-8 object-contain" />
                    </div>
                    <span className="text-xs font-medium text-white text-center">{app.name}</span>
                  </a>
                )
              })}
            </div>
            <div className="h-px bg-white/[0.06] my-3" />
            <a href="https://ciphera.net/products" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1 text-xs text-brand-orange hover:underline">
              View all products
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
      >
        <span>Pulse</span>
        <CaretDown className="w-3 h-3 shrink-0 translate-y-px" />
      </button>
      {typeof document !== 'undefined' ? createPortal(dropdown, document.body) : dropdown}
    </div>
  )
}

// ─── Breadcrumb Site Picker ────────────────────────────────

function BreadcrumbSitePicker({ currentSiteId, currentSiteName }: { currentSiteId: string; currentSiteName: string }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [sites, setSites] = useState<Site[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [fixedPos, setFixedPos] = useState<{ left: number; top: number } | null>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (open && sites.length === 0) {
      listSites().then(setSites).catch(() => {})
    }
  }, [open, sites.length])

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      let top = rect.bottom + 4
      if (panelRef.current) {
        const maxTop = window.innerHeight - panelRef.current.offsetHeight - 8
        top = Math.min(top, Math.max(8, maxTop))
      }
      setFixedPos({ left: rect.left, top })
    }
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        ref.current && !ref.current.contains(target) &&
        (!panelRef.current || !panelRef.current.contains(target))
      ) {
        if (open) { setOpen(false); setSearch('') }
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) {
      updatePosition()
      requestAnimationFrame(() => updatePosition())
    }
  }, [open, updatePosition])

  const closePicker = () => { setOpen(false); setSearch('') }

  const switchSite = (id: string) => {
    router.push(`/sites/${id}${pathname.replace(/^\/sites\/[^/]+/, '')}`)
    closePicker()
  }

  const filtered = sites.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.domain.toLowerCase().includes(search.toLowerCase())
  )

  const dropdown = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="fixed z-50 w-[240px] bg-neutral-900/65 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:bg-neutral-900/60 border border-white/[0.08] rounded-xl shadow-xl shadow-black/20 overflow-hidden origin-top-left"
          style={fixedPos ? { left: fixedPos.left, top: fixedPos.top } : undefined}
        >
          <div className="p-2">
            <input
              type="text"
              placeholder="Search sites..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') closePicker() }}
              className="w-full px-3 py-1.5 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg outline-none focus:ring-2 focus:ring-brand-orange/40 text-white placeholder:text-neutral-400"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.map((site) => (
              <button
                key={site.id}
                onClick={() => switchSite(site.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left ${
                  site.id === currentSiteId
                    ? 'bg-brand-orange/10 text-brand-orange font-medium'
                    : 'text-neutral-300 hover:bg-white/[0.06]'
                }`}
              >
                <img
                  src={`${FAVICON_SERVICE_URL}?domain=${site.domain}&sz=64`}
                  alt=""
                  className="w-5 h-5 rounded object-contain shrink-0"
                />
                <span className="flex flex-col min-w-0">
                  <span className="truncate">{site.name}</span>
                  <span className="text-xs text-neutral-400 truncate">{site.domain}</span>
                </span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-4 py-3 text-sm text-neutral-400">No sites found</p>}
          </div>
          <div className="border-t border-white/[0.06] p-2">
            <Link href="/sites/new" onClick={() => closePicker()} className="flex items-center gap-2 px-3 py-1.5 text-sm text-brand-orange hover:bg-white/[0.06] rounded-lg">
              <PlusIcon className="w-4 h-4" />
              Add new site
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-300 transition-colors max-w-[160px] cursor-pointer"
      >
        <span className="truncate">{currentSiteName}</span>
        <CaretDown className="w-3 h-3 shrink-0 translate-y-px" />
      </button>
      {typeof document !== 'undefined' ? createPortal(dropdown, document.body) : dropdown}
    </div>
  )
}

// ─── Glass Top Bar ─────────────────────────────────────────

function GlassTopBar({ siteId }: { siteId: string | null }) {
  const { collapsed, toggle } = useSidebar()
  const { lastUpdatedAt } = useLiveIndicator()
  const [, setTick] = useState(0)
  const [siteName, setSiteName] = useState<string | null>(null)

  // * Tick every second to keep the "Live · Xs ago" display current
  useEffect(() => {
    if (lastUpdatedAt == null) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [lastUpdatedAt])

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
        <nav className="flex items-center gap-1 text-sm font-medium">
          <BreadcrumbAppSwitcher />
          <CaretRight className="w-3 h-3 text-neutral-600" />
          {siteId ? (
            siteName ? (
              <>
                <Link href="/" className="text-neutral-500 hover:text-neutral-300 transition-colors">Your Sites</Link>
                <CaretRight className="w-3 h-3 text-neutral-600" />
                <BreadcrumbSitePicker currentSiteId={siteId} currentSiteName={siteName} />
                <CaretRight className="w-3 h-3 text-neutral-600" />
                <span className="text-neutral-400">{pageTitle}</span>
              </>
            ) : null
          ) : (
            <span className="text-neutral-400">{pageTitle}</span>
          )}
        </nav>
      </div>

      {/* Live indicator — tied to dashboard data refresh (60s cycle) */}
      {siteId && lastUpdatedAt != null && (
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
          </span>
          Live · {formatUpdatedAgo(lastUpdatedAt)}
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
      <LiveIndicatorProvider>
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
          <div className="flex-1 flex flex-col min-w-0 mr-2 mb-2 rounded-2xl bg-neutral-950 border border-neutral-800/60 overflow-hidden relative">
            {/* Dulled background image */}
            <div
              className="absolute inset-0 bg-cover bg-top opacity-[0.25] pointer-events-none"
              style={{ backgroundImage: 'url(/pulse-showcase-bg.png)' }}
            />
            <ContentHeader onMobileMenuOpen={openMobile} />
            <main className="relative flex-1 overflow-y-auto overflow-x-hidden pt-4">
              {children}
            </main>
          </div>
        </div>
      </div>
      </LiveIndicatorProvider>
    </SidebarProvider>
  )
}

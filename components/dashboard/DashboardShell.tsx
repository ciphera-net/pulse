'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { PlusIcon, ExternalLinkIcon, LayoutDashboardIcon, PathIcon, FunnelIcon, CursorClickIcon, SearchIcon, CloudUploadIcon, HeartbeatIcon, SettingsIcon, UserMenu } from '@ciphera-net/facet'
import { formatUpdatedAgo } from '@/lib/utils/format'
import { useFunnelDetail } from '@/lib/swr/dashboard'
import { useAuth } from '@/lib/auth/context'
import NotificationCenter from '@/components/notifications/NotificationCenter'
import { getUserOrganizations, switchContext, type OrganizationMember } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import { logger } from '@/lib/utils/logger'
import {
  CaretDown, CaretRight, SidebarSimple, Gauge as GaugeIcon, Plugs as PlugsIcon, Tag as TagIcon, Globe as GlobeIcon,
  GearSix, Target, Eye, ShieldCheck, Robot, MagnifyingGlass, ChartBar,
  Buildings, UsersThree, Key, CreditCard, Bell, ClockCounterClockwise, User, Lock, DeviceMobile,
} from '@phosphor-icons/react'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { EmptyState } from '@/components/ui/EmptyState'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context'
import { LiveIndicatorProvider, useLiveIndicator } from '@/lib/live-indicator-context'
import { getSite } from '@/lib/api/sites'
import { useSites } from '@/lib/swr/sites'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
import ContentHeader from './ContentHeader'
import { CIPHERA_APPS } from '@/lib/ciphera-apps'
import { ShortcutHandler } from '@/components/keyboard/ShortcutHandler'
import { ShortcutsOverlay } from '@/components/keyboard/ShortcutsOverlay'
import { CommandPalette } from '@/components/command/CommandPalette'


/**
 * App tile icon with the same graceful monogram fallback as SiteFavicon — a
 * missing CDN asset must degrade to a lettered tile, not the broken-image box
 * with alt text bleeding through (exactly how the dead ID/Help URLs presented).
 * `alt` is empty: the app name is printed right under the tile.
 */
function AppSwitcherIcon({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div aria-hidden className="flex h-8 w-8 items-center justify-center bg-neutral-800 text-sm font-semibold text-neutral-400">
        {name.trim()[0]?.toUpperCase() ?? '?'}
      </div>
    )
  }
  return <img src={src} alt="" className="w-8 h-8 object-contain" onError={() => setFailed(true)} />
}

type PageMeta = {
  title: string
  icon: React.ComponentType<{ className?: string }>
  parent?: { title: string; icon: React.ComponentType<{ className?: string }>; href: string }
}

const PAGE_META: Record<string, PageMeta> = {
  '':         { title: 'Dashboard',     icon: LayoutDashboardIcon },
  journeys:   { title: 'Journeys',      icon: PathIcon },
  funnels:    { title: 'Funnels',       icon: FunnelIcon },
  behavior:   { title: 'Behavior',      icon: CursorClickIcon },
  search:     { title: 'Search',        icon: SearchIcon },
  cdn:        { title: 'CDN',           icon: CloudUploadIcon },
  uptime:     { title: 'Uptime',        icon: HeartbeatIcon },
  pagespeed:  { title: 'PageSpeed',     icon: GaugeIcon },
  settings:   { title: 'Site Settings', icon: SettingsIcon },
}

function usePageMeta(): PageMeta {
  const pathname = usePathname()
  const siteMatch = pathname.match(/^\/sites\/([^/]+)\/?(.*)$/)
  const siteId = siteMatch?.[1] ?? ''
  const rest = (siteMatch?.[2] ?? '').split('/')
  const segment = rest[0] ?? ''
  // * Funnel detail: the [funnelId] crumb shows the funnel's name (SWR dedupes
  // * with the detail page's own fetch), with Funnels as a linked parent.
  const funnelId = segment === 'funnels' && rest[1] && rest[1] !== 'new' ? rest[1] : ''
  const { data: funnel } = useFunnelDetail(siteId, funnelId)
  if (funnelId) {
    return {
      title: funnel?.name ?? 'Funnel',
      icon: FunnelIcon,
      parent: { title: 'Funnels', icon: FunnelIcon, href: `/sites/${siteId}/funnels` },
    }
  }
  return PAGE_META[segment] ?? { title: segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : 'Dashboard', icon: LayoutDashboardIcon }
}

const HOME_PAGE_META: Record<string, PageMeta> = {
  '':            { title: 'Your Sites',    icon: GlobeIcon },
  integrations:  { title: 'Integrations',  icon: PlugsIcon },
  pricing:       { title: 'Pricing',       icon: TagIcon },
}

function useHomePageMeta(): PageMeta {
  const pathname = usePathname()

  if (pathname.startsWith('/settings')) {
    const parts = pathname.split('/').filter(Boolean)
    const TAB_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
      general: { label: 'General', icon: GearSix },
      goals: { label: 'Goals', icon: Target },
      visibility: { label: 'Visibility', icon: Eye },
      privacy: { label: 'Privacy', icon: ShieldCheck },
      'bot-spam': { label: 'Bot & Spam', icon: Robot },
      'privacy-scan': { label: 'Privacy Scan', icon: MagnifyingGlass },
      reports: { label: 'Reports', icon: ChartBar },
      integrations: { label: 'Integrations', icon: PlugsIcon },
      workspace: { label: 'General', icon: Buildings },
      members: { label: 'Members', icon: UsersThree },
      roles: { label: 'Roles & Permissions', icon: Key },
      billing: { label: 'Billing', icon: CreditCard },
      notifications: { label: 'Notifications', icon: Bell },
      audit: { label: 'Audit Log', icon: ClockCounterClockwise },
      profile: { label: 'Profile', icon: User },
      security: { label: 'Security', icon: Lock },
      devices: { label: 'Devices', icon: DeviceMobile },
    }
    const tabSlug = parts[2] ?? ''
    const meta = TAB_META[tabSlug]
    // No concrete tab (the `/settings` landing page, or a bare group path) — a
    // single "Settings" crumb. Adding the "Settings" parent here would double it.
    if (!meta) {
      return { title: 'Settings', icon: SettingsIcon }
    }
    return {
      title: meta.label,
      icon: meta.icon,
      parent: { title: 'Settings', icon: SettingsIcon, href: '/settings' },
    }
  }

  const segment = pathname.split('/').filter(Boolean)[0] ?? ''
  return HOME_PAGE_META[segment] ?? { title: segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : 'Your Sites', icon: GlobeIcon }
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
          transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
          className="fixed z-50 w-72 bg-popover rounded-none border border-border overflow-hidden origin-top-left"
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
                    className={`group flex flex-col items-center gap-2 p-3 rounded-none transition-all ${
                      isCurrent ? 'bg-neutral-800/50 cursor-default' : 'hover:bg-neutral-800/50'
                    } ease-apple`}
                  >
                    <div className="w-10 h-10 flex items-center justify-center shrink-0">
                      <AppSwitcherIcon src={app.icon} name={app.name} />
                    </div>
                    <span className="text-xs font-medium text-white text-center">{app.name}</span>
                  </a>
                )
              })}
            </div>
            <div className="h-px bg-neutral-800 my-3" />
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
        className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer ease-apple"
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
  const { sites } = useSites()
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [fixedPos, setFixedPos] = useState<{ left: number; top: number } | null>(null)
  const pathname = usePathname()
  const router = useRouter()

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

  const currentSite = sites.find((s) => s.id === currentSiteId)

  const dropdown = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
          className="fixed z-50 w-[240px] bg-popover rounded-none border border-border overflow-hidden origin-top-left"
          style={fixedPos ? { left: fixedPos.left, top: fixedPos.top } : undefined}
        >
          <div className="p-2">
            <input
              type="text"
              placeholder="Search sites..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') closePicker() }}
              className="w-full px-3 py-1.5 text-sm bg-white/[0.04] border border-neutral-800 rounded-none outline-none focus:ring-2 focus:ring-brand-orange/40 text-white placeholder:text-neutral-400"
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
                <SiteFavicon
                  domain={site.domain}
                  name={site.name}
                  size={20}
                  className="w-5 h-5 rounded-none object-contain shrink-0"
                />
                <span className="flex flex-col min-w-0">
                  <span className="truncate">{site.name}</span>
                  <span className="text-xs text-neutral-400 truncate">{site.domain}</span>
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-neutral-500 text-center py-4">No sites match your search</p>
            )}
          </div>
          <div className="border-t border-neutral-800/60 p-2">
            <Link href="/sites/new" onClick={() => closePicker()} className="flex items-center gap-2 px-3 py-1.5 text-sm text-brand-orange hover:bg-white/[0.06] rounded-none">
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
        className="inline-flex items-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors max-w-[180px] cursor-pointer ease-apple"
      >
        {currentSite?.domain && (
          <SiteFavicon
            domain={currentSite.domain}
            name={currentSiteName}
            size={14}
            className="w-3.5 h-3.5 rounded-none object-contain shrink-0"
          />
        )}
        <span className="truncate">{currentSiteName}</span>
        <CaretDown className="w-3 h-3 shrink-0 translate-y-px" />
      </button>
      {typeof document !== 'undefined' ? createPortal(dropdown, document.body) : dropdown}
    </div>
  )
}

// ─── Glass Top Bar ─────────────────────────────────────────

function LiveAgo({ lastUpdatedAt }: { lastUpdatedAt: number }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  return <>{formatUpdatedAgo(lastUpdatedAt)}</>
}

function GlassTopBar({ siteId }: { siteId: string | null }) {
  const { collapsed, toggle } = useSidebar()
  const { lastUpdatedAt } = useLiveIndicator()
  const [siteName, setSiteName] = useState<string | null>(null)
  const auth = useAuth()
  const router = useRouter()
  const [orgs, setOrgs] = useState<OrganizationMember[]>([])

  useEffect(() => {
    if (!siteId) { setSiteName(null); return }
    getSite(siteId).then((s) => setSiteName(s.name)).catch(() => {})
  }, [siteId])

  useEffect(() => {
    if (auth.user) {
      getUserOrganizations()
        .then((organizations) => setOrgs(Array.isArray(organizations) ? organizations : []))
        .catch(err => logger.error('Failed to fetch orgs', err))
    }
  }, [auth.user])

  const handleSwitchOrganization = useCallback(async (orgId: string | null) => {
    if (!orgId) return
    try {
      const { access_token } = await switchContext(orgId)
      await setSessionAction(access_token)
      await auth.refresh()
      router.push('/')
    } catch (err) {
      logger.error('Failed to switch organization', err)
    }
  }, [auth, router])

  const pageMeta = usePageMeta()
  const homeMeta = useHomePageMeta()
  const currentMeta = siteId ? pageMeta : homeMeta
  const PageIcon = currentMeta.icon

  return (
    <div className="hidden md:flex items-center justify-between shrink-0 px-3 pt-1.5 pb-1">
      {/* Left: collapse toggle + breadcrumbs */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={toggle}
          className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-white rounded-none hover:bg-white/[0.06] transition-colors ease-apple"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <SidebarSimple className="size-5" weight={collapsed ? 'regular' : 'fill'} />
        </button>
        <nav className="flex items-center gap-1 text-sm font-medium">
          <BreadcrumbAppSwitcher />
          <CaretRight className="w-3 h-3 text-neutral-600" />
          {siteId ? (
            siteName ? (
              <>
                <Link href="/" className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-300 transition-colors ease-apple">
                  <GlobeIcon className="w-3.5 h-3.5" />
                  Your Sites
                </Link>
                <CaretRight className="w-3 h-3 text-neutral-600" />
                <BreadcrumbSitePicker currentSiteId={siteId} currentSiteName={siteName} />
                <CaretRight className="w-3 h-3 text-neutral-600" />
                {currentMeta.parent && (
                  <>
                    <Link href={currentMeta.parent.href} className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-300 transition-colors ease-apple">
                      <currentMeta.parent.icon className="w-3.5 h-3.5" />
                      {currentMeta.parent.title}
                    </Link>
                    <CaretRight className="w-3 h-3 text-neutral-600" />
                  </>
                )}
                <span className="inline-flex items-center gap-1 text-neutral-400">
                  <PageIcon className="w-3.5 h-3.5" />
                  {currentMeta.title}
                </span>
              </>
            ) : null
          ) : currentMeta.parent ? (
            <>
              <Link href={currentMeta.parent.href} className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-300 transition-colors ease-apple">
                <currentMeta.parent.icon className="w-3.5 h-3.5" />
                {currentMeta.parent.title}
              </Link>
              <CaretRight className="w-3 h-3 text-neutral-600" />
              <span className="inline-flex items-center gap-1 text-neutral-400">
                <PageIcon className="w-3.5 h-3.5" />
                {currentMeta.title}
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-neutral-400">
              <PageIcon className="w-3.5 h-3.5" />
              {currentMeta.title}
            </span>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-1">
        {siteId && lastUpdatedAt != null && (
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 shrink-0 mr-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
            </span>
            Live · <LiveAgo lastUpdatedAt={lastUpdatedAt} />
          </div>
        )}
        <NotificationCenter anchor="bottom" variant="default" />
        <UserMenu
          auth={auth}
          LinkComponent={Link}
          orgs={orgs}
          activeOrgId={auth.user?.org_id}
          onSwitchOrganization={handleSwitchOrganization}
          onCreateOrganization={() => router.push('/setup/org?new=1')}
          allowPersonalOrganization={false}
          onOpenSettings={() => router.push('/settings/account/profile')}
          onOpenOrgSettings={() => router.push('/settings/organization/general')}
          compact
          anchor="bottom"
        />
      </div>
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const pathname = usePathname()
  const closeMobile = useCallback(() => setMobileOpen(false), [])
  const openMobile = useCallback(() => setMobileOpen(true), [])

  return (
    <SidebarProvider>
      <LiveIndicatorProvider>
      <ShortcutHandler
        onShowOverlay={() => setShortcutsOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} currentSiteId={siteId ?? undefined} />
      <div className="flex h-screen overflow-hidden bg-neutral-950">
        <Sidebar
          siteId={siteId}
          mobileOpen={mobileOpen}
          onMobileClose={closeMobile}
          onMobileOpen={openMobile}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Glass top bar — above content only, collapse icon reaches back into sidebar column */}
          <GlassTopBar siteId={siteId} />
          {/* Content panel — elevated: inset top highlight + outer shadow for perceived depth */}
          <div
            className="flex-1 flex flex-col min-w-0 mr-3 mb-3 rounded-none bg-neutral-950 border border-neutral-800 overflow-hidden relative"
          >
            <ContentHeader onMobileMenuOpen={openMobile} />
            {/* pb-24 on mobile: scroll clearance for the floating checklist
                pill + support button (S2-i) */}
            <main
              id="main-content"
              tabIndex={-1}
              className="relative flex-1 overflow-y-auto overflow-x-hidden pb-24 sm:pb-0"
            >
              {/* * Top spacing lives INSIDE the scrolled content, never as padding on
               * the scroll container — sticky children pin below a scroller's
               * padding while content scrolls visibly through it (the settings
               * header floated 16px down with rows showing above it). */}
              <div
                key={pathname}
                className="animate-in fade-in slide-in-from-bottom-4 pt-4"
                style={{ animationDuration: '500ms', animationTimingFunction: 'var(--ease-apple)' }}
              >
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
      </LiveIndicatorProvider>
    </SidebarProvider>
  )
}

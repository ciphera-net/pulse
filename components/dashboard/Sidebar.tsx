'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { listSites, type Site } from '@/lib/api/sites'
import { useAuth } from '@/lib/auth/context'
import { useSettingsModal } from '@/lib/settings-modal-context'
import { getUserOrganizations, switchContext, type OrganizationMember } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import { logger } from '@/lib/utils/logger'
import { FAVICON_SERVICE_URL } from '@/lib/utils/icons'
import {
  LayoutDashboardIcon,
  PathIcon,
  FunnelIcon,
  CursorClickIcon,
  SearchIcon,
  CloudUploadIcon,
  HeartbeatIcon,
  SettingsIcon,
  CollapseLeftIcon,
  CollapseRightIcon,
  ChevronUpDownIcon,
  PlusIcon,
  XIcon,
  ThemeToggle,
  AppLauncher,
  UserMenu,
  type CipheraApp,
} from '@ciphera-net/ui'
import NotificationCenter from '@/components/notifications/NotificationCenter'

const CIPHERA_APPS: CipheraApp[] = [
  {
    id: 'pulse',
    name: 'Pulse',
    description: 'Your current app — Privacy-first analytics',
    icon: 'https://ciphera.net/pulse_icon_no_margins.png',
    href: 'https://pulse.ciphera.net',
    isAvailable: false,
  },
  {
    id: 'drop',
    name: 'Drop',
    description: 'Secure file sharing',
    icon: 'https://ciphera.net/drop_icon_no_margins.png',
    href: 'https://drop.ciphera.net',
    isAvailable: true,
  },
  {
    id: 'auth',
    name: 'Auth',
    description: 'Your Ciphera account settings',
    icon: 'https://ciphera.net/auth_icon_no_margins.png',
    href: 'https://auth.ciphera.net',
    isAvailable: true,
  },
]

const SIDEBAR_KEY = 'pulse_sidebar_collapsed'
const EXPANDED = 256
const COLLAPSED = 64

type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'

interface NavItem {
  label: string
  href: (siteId: string) => string
  icon: React.ComponentType<{ className?: string; weight?: IconWeight }>
  matchPrefix?: boolean
}

interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Analytics',
    items: [
      { label: 'Dashboard', href: (id) => `/sites/${id}`, icon: LayoutDashboardIcon },
      { label: 'Journeys', href: (id) => `/sites/${id}/journeys`, icon: PathIcon, matchPrefix: true },
      { label: 'Funnels', href: (id) => `/sites/${id}/funnels`, icon: FunnelIcon, matchPrefix: true },
      { label: 'Behavior', href: (id) => `/sites/${id}/behavior`, icon: CursorClickIcon, matchPrefix: true },
      { label: 'Search', href: (id) => `/sites/${id}/search`, icon: SearchIcon, matchPrefix: true },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { label: 'CDN', href: (id) => `/sites/${id}/cdn`, icon: CloudUploadIcon, matchPrefix: true },
      { label: 'Uptime', href: (id) => `/sites/${id}/uptime`, icon: HeartbeatIcon, matchPrefix: true },
    ],
  },
]

const SETTINGS_ITEM: NavItem = {
  label: 'Settings', href: (id) => `/sites/${id}/settings`, icon: SettingsIcon, matchPrefix: true,
}

// Label that fades with the sidebar — always in the DOM, never removed
function Label({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  return (
    <span
      className="whitespace-nowrap overflow-hidden transition-opacity duration-150"
      style={{ opacity: collapsed ? 0 : 1 }}
    >
      {children}
    </span>
  )
}

// ─── Site Picker ────────────────────────────────────────────

function SitePicker({ sites, siteId, collapsed, onExpand, onCollapse, wasCollapsed }: {
  sites: Site[]; siteId: string; collapsed: boolean
  onExpand: () => void; onCollapse: () => void; wasCollapsed: React.MutableRefObject<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [faviconFailed, setFaviconFailed] = useState(false)
  const [faviconLoaded, setFaviconLoaded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()
  const currentSite = sites.find((s) => s.id === siteId)
  const faviconUrl = currentSite?.domain ? `${FAVICON_SERVICE_URL}?domain=${currentSite.domain}&sz=64` : null

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (open) {
          setOpen(false); setSearch('')
          // Re-collapse if we auto-expanded
          if (wasCollapsed.current) { onCollapse(); wasCollapsed.current = false }
        }
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onCollapse, wasCollapsed])

  const switchSite = (id: string) => {
    router.push(`/sites/${id}${pathname.replace(/^\/sites\/[^/]+/, '')}`)
    setOpen(false); setSearch('')
    // Re-collapse if we auto-expanded
    if (wasCollapsed.current) { onCollapse(); wasCollapsed.current = false }
  }

  const filtered = sites.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.domain.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="relative mb-4 px-2" ref={ref}>
      <button
        onClick={() => {
          if (collapsed) {
            wasCollapsed.current = true
            onExpand()
            // Open picker after sidebar expands
            setTimeout(() => setOpen(true), 220)
          } else {
            setOpen(!open)
          }
        }}
        className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 overflow-hidden"
      >
        <span className="w-7 h-7 rounded-md bg-brand-orange/10 flex items-center justify-center shrink-0 overflow-hidden">
          {faviconUrl && !faviconFailed ? (
            <>
              {!faviconLoaded && <span className="w-5 h-5 rounded animate-pulse bg-neutral-100 dark:bg-neutral-800" />}
              <img
                src={faviconUrl}
                alt=""
                className={`w-5 h-5 object-contain ${faviconLoaded ? '' : 'hidden'}`}
                onLoad={() => setFaviconLoaded(true)}
                onError={() => setFaviconFailed(true)}
              />
            </>
          ) : null}
        </span>
        <Label collapsed={collapsed}>
          <span className="flex items-center gap-1">
            <span className="truncate">{currentSite?.name || ''}</span>
            <ChevronUpDownIcon className="w-4 h-4 text-neutral-400 shrink-0" />
          </span>
        </Label>
      </button>

      {open && (
        <div className="absolute left-3 top-full mt-1 z-50 w-[240px] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2">
            <input
              type="text"
              placeholder="Search sites..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-orange/40 text-neutral-900 dark:text-white placeholder:text-neutral-400"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.map((site) => (
              <button
                key={site.id}
                onClick={() => switchSite(site.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left ${
                  site.id === siteId
                    ? 'bg-brand-orange/10 text-brand-orange font-medium'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
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
          <div className="border-t border-neutral-200 dark:border-neutral-700 p-2">
            <Link href="/sites/new" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-1.5 text-sm text-brand-orange hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg">
              <PlusIcon className="w-4 h-4" />
              Add new site
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Nav Item ───────────────────────────────────────────────

function NavLink({
  item, siteId, collapsed, onClick, pendingHref, onNavigate,
}: {
  item: NavItem; siteId: string; collapsed: boolean; onClick?: () => void
  pendingHref: string | null; onNavigate: (href: string) => void
}) {
  const pathname = usePathname()
  const href = item.href(siteId)
  const matchesPathname = item.matchPrefix ? pathname.startsWith(href) : pathname === href
  const matchesPending = pendingHref !== null && (item.matchPrefix ? pendingHref.startsWith(href) : pendingHref === href)
  const active = matchesPathname || matchesPending

  return (
    <Link
      href={href}
      onClick={() => { onNavigate(href); onClick?.() }}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium overflow-hidden ${
        active
          ? 'bg-brand-orange/10 text-brand-orange'
          : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      <span className="w-7 h-7 flex items-center justify-center shrink-0">
        <item.icon className="w-[18px] h-[18px]" weight={active ? 'fill' : 'regular'} />
      </span>
      <Label collapsed={collapsed}>{item.label}</Label>
    </Link>
  )
}

// ─── Main Sidebar ───────────────────────────────────────────

export default function Sidebar({
  siteId, mobileOpen, onMobileClose, onMobileOpen,
}: {
  siteId: string; mobileOpen: boolean; onMobileClose: () => void; onMobileOpen: () => void
}) {
  const auth = useAuth()
  const { user } = auth
  const canEdit = user?.role === 'owner' || user?.role === 'admin'
  const pathname = usePathname()
  const router = useRouter()
  const { openSettings } = useSettingsModal()
  const [sites, setSites] = useState<Site[]>([])
  const [orgs, setOrgs] = useState<OrganizationMember[]>([])
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const wasCollapsedRef = useRef(false)
  // Safe to read localStorage directly — this component is loaded with ssr:false
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_KEY) !== 'false'
  })

  useEffect(() => { listSites().then(setSites).catch(() => {}) }, [])
  useEffect(() => {
    if (user) {
      getUserOrganizations()
        .then((organizations) => setOrgs(Array.isArray(organizations) ? organizations : []))
        .catch(err => logger.error('Failed to fetch orgs', err))
    }
  }, [user])

  const handleSwitchOrganization = async (orgId: string | null) => {
    if (!orgId) return
    try {
      const { access_token } = await switchContext(orgId)
      await setSessionAction(access_token)
      sessionStorage.setItem('pulse_switching_org', 'true')
      window.location.reload()
    } catch (err) {
      logger.error('Failed to switch organization', err)
    }
  }
  useEffect(() => { setPendingHref(null); onMobileClose() }, [pathname, onMobileClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault(); toggle()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [collapsed])

  const toggle = useCallback(() => {
    setCollapsed((prev) => { const next = !prev; localStorage.setItem(SIDEBAR_KEY, String(next)); return next })
  }, [])

  const expand = useCallback(() => {
    setCollapsed(false); localStorage.setItem(SIDEBAR_KEY, 'false')
  }, [])

  const collapse = useCallback(() => {
    setCollapsed(true); localStorage.setItem(SIDEBAR_KEY, 'true')
  }, [])

  const handleNavigate = useCallback((href: string) => { setPendingHref(href) }, [])

  const sidebarContent = (isMobile: boolean) => {
    const c = isMobile ? false : collapsed

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* App Switcher — top of sidebar (scope-level switch) */}
        <div className="flex items-center gap-2.5 px-[14px] pt-3 pb-1 shrink-0 overflow-hidden">
          <span className="w-9 h-9 flex items-center justify-center shrink-0">
            <AppLauncher apps={CIPHERA_APPS} currentAppId="pulse" anchor="right" />
          </span>
          <Label collapsed={c}>
            <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Ciphera</span>
          </Label>
        </div>

        {/* Logo — fixed layout, text fades */}
        <Link href="/" className="flex items-center gap-3 px-[14px] py-4 shrink-0 group overflow-hidden">
          <span className="w-9 h-9 flex items-center justify-center shrink-0">
            <img src="/pulse_icon_no_margins.png" alt="Pulse" className="w-9 h-9 shrink-0 object-contain group-hover:scale-105 transition-transform duration-200" />
          </span>
          <span className={`text-xl font-bold text-neutral-900 dark:text-white tracking-tight group-hover:text-brand-orange whitespace-nowrap transition-opacity duration-150 ${c ? 'opacity-0' : 'opacity-100'}`}>
            Pulse
          </span>
        </Link>

        {/* Site Picker */}
        <SitePicker sites={sites} siteId={siteId} collapsed={c} onExpand={expand} onCollapse={collapse} wasCollapsed={wasCollapsedRef} />

        {/* Nav Groups */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="h-5 flex items-center overflow-hidden">
                <p className={`px-2.5 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap transition-opacity duration-150 ${c ? 'opacity-0' : 'opacity-100'}`}>
                  {group.label}
                </p>
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.label} item={item} siteId={siteId} collapsed={c} onClick={isMobile ? onMobileClose : undefined} pendingHref={pendingHref} onNavigate={handleNavigate} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom — utility items */}
        <div className="border-t border-neutral-200/60 dark:border-neutral-800/60 px-2 py-3 shrink-0">
          {/* Theme, Notifications, Profile */}
          <div className="space-y-0.5 mb-1">
            <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1 overflow-hidden">
              <ThemeToggle />
              <Label collapsed={c}>Theme</Label>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1 overflow-hidden">
              <NotificationCenter anchor="right" />
              <Label collapsed={c}>Notifications</Label>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1 overflow-hidden">
              <UserMenu
                auth={auth}
                LinkComponent={Link}
                orgs={orgs}
                activeOrgId={auth.user?.org_id}
                onSwitchOrganization={handleSwitchOrganization}
                onCreateOrganization={() => router.push('/onboarding')}
                allowPersonalOrganization={false}
                onOpenSettings={openSettings}
                compact
                anchor="right"
              />
              <Label collapsed={c}>{user?.display_name?.trim() || 'Profile'}</Label>
            </div>
          </div>

          {/* Settings + Collapse */}
          <div className="space-y-0.5">
            {canEdit && (
              <NavLink item={SETTINGS_ITEM} siteId={siteId} collapsed={c} onClick={isMobile ? onMobileClose : undefined} pendingHref={pendingHref} onNavigate={handleNavigate} />
            )}
            {!isMobile && (
              <button
                onClick={toggle}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 w-full overflow-hidden"
                title={collapsed ? 'Expand sidebar (press [)' : 'Collapse sidebar (press [)'}
              >
                <span className="w-7 h-7 flex items-center justify-center shrink-0">
                  <CollapseLeftIcon className={`w-[18px] h-[18px] transition-transform duration-200 ${c ? 'rotate-180' : ''}`} />
                </span>
                <Label collapsed={c}>Collapse</Label>
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Desktop — ssr:false means this only renders on client, no hydration flash */}
      <aside
        className="hidden md:flex flex-col shrink-0 border-r border-neutral-200/60 dark:border-neutral-800/60 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl overflow-hidden"
        style={{ width: collapsed ? COLLAPSED : EXPANDED, transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        {sidebarContent(false)}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onMobileClose} />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 shadow-xl md:hidden animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">Navigation</span>
              <button onClick={onMobileClose} className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            {sidebarContent(true)}
          </aside>
        </>
      )}
    </>
  )
}

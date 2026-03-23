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
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'
import { Gauge as GaugeIcon } from '@phosphor-icons/react'
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
      { label: 'PageSpeed', href: (id) => `/sites/${id}/pagespeed`, icon: GaugeIcon, matchPrefix: true },
    ],
  },
]

const SETTINGS_ITEM: NavItem = {
  label: 'Site Settings', href: (id) => `/sites/${id}/settings`, icon: SettingsIcon, matchPrefix: true,
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

function SitePicker({ sites, siteId, collapsed, onExpand, onCollapse, wasCollapsed, pickerOpenCallback }: {
  sites: Site[]; siteId: string; collapsed: boolean
  onExpand: () => void; onCollapse: () => void; wasCollapsed: React.MutableRefObject<boolean>
  pickerOpenCallback: React.MutableRefObject<(() => void) | null>
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
            pickerOpenCallback.current = () => setOpen(true)
            onExpand()
          } else {
            setOpen(!open)
          }
        }}
        className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800 overflow-hidden"
      >
        <span className="w-7 h-7 rounded-md bg-brand-orange/10 flex items-center justify-center shrink-0 overflow-hidden">
          {faviconUrl && !faviconFailed ? (
            <>
              {!faviconLoaded && <span className="w-5 h-5 rounded animate-pulse bg-neutral-800" />}
              <img
                src={faviconUrl}
                alt=""
                className={`w-5 h-5 object-contain ${faviconLoaded ? '' : 'hidden'}`}
                onLoad={() => setFaviconLoaded(true)}
                onError={() => setFaviconFailed(true)}
              />
            </>
          ) : (
            <span className="text-xs font-bold text-brand-orange">
              {currentSite?.name?.charAt(0).toUpperCase() || '?'}
            </span>
          )}
        </span>
        <Label collapsed={collapsed}>
          <span className="flex items-center gap-1">
            <span className="truncate">{currentSite?.name || ''}</span>
            <ChevronUpDownIcon className="w-4 h-4 text-neutral-400 shrink-0" />
          </span>
        </Label>
      </button>

      {open && (
        <div className="absolute left-3 top-full mt-1 z-50 w-[240px] bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-2">
            <input
              type="text"
              placeholder="Search sites..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false)
                  setSearch('')
                  if (wasCollapsed.current) { onCollapse(); wasCollapsed.current = false }
                }
              }}
              className="w-full px-3 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-orange/40 text-white placeholder:text-neutral-400"
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
                    : 'text-neutral-300 hover:bg-neutral-800'
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
          <div className="border-t border-neutral-700 p-2">
            <Link href="/sites/new" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-1.5 text-sm text-brand-orange hover:bg-neutral-800 rounded-lg">
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
    <div className="relative group/nav">
      <Link
        href={href}
        onClick={() => { onNavigate(href); onClick?.() }}
        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium overflow-hidden transition-all duration-150 ${
          active
            ? 'bg-brand-orange/10 text-brand-orange'
            : 'text-neutral-400 hover:text-white hover:bg-neutral-800 hover:translate-x-0.5'
        }`}
      >
        <span className="w-7 h-7 flex items-center justify-center shrink-0">
          <item.icon className="w-[18px] h-[18px]" weight={active ? 'fill' : 'regular'} />
        </span>
        <Label collapsed={collapsed}>{item.label}</Label>
      </Link>
      {collapsed && (
        <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-neutral-800 text-white text-xs whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 delay-150 z-50">
          {item.label}
        </span>
      )}
    </div>
  )
}

// ─── Sidebar Content ────────────────────────────────────────

interface SidebarContentProps {
  isMobile: boolean
  collapsed: boolean
  siteId: string
  sites: Site[]
  canEdit: boolean
  pendingHref: string | null
  onNavigate: (href: string) => void
  onMobileClose: () => void
  onExpand: () => void
  onCollapse: () => void
  onToggle: () => void
  wasCollapsed: React.MutableRefObject<boolean>
  pickerOpenCallbackRef: React.MutableRefObject<(() => void) | null>
  auth: ReturnType<typeof useAuth>
  orgs: OrganizationMember[]
  onSwitchOrganization: (orgId: string | null) => Promise<void>
  openSettings: () => void
}

function SidebarContent({
  isMobile, collapsed, siteId, sites, canEdit, pendingHref,
  onNavigate, onMobileClose, onExpand, onCollapse, onToggle,
  wasCollapsed, pickerOpenCallbackRef, auth, orgs, onSwitchOrganization, openSettings,
}: SidebarContentProps) {
  const router = useRouter()
  const c = isMobile ? false : collapsed
  const { user } = auth

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
        <span className={`text-xl font-bold text-white tracking-tight group-hover:text-brand-orange whitespace-nowrap transition-opacity duration-150 ${c ? 'opacity-0' : 'opacity-100'}`}>
          Pulse
        </span>
      </Link>

      {/* Site Picker */}
      <SitePicker sites={sites} siteId={siteId} collapsed={c} onExpand={onExpand} onCollapse={onCollapse} wasCollapsed={wasCollapsed} pickerOpenCallback={pickerOpenCallbackRef} />

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {c ? (
              <div className="mx-3 my-2 border-t border-neutral-800/40" />
            ) : (
              <div className="h-5 flex items-center overflow-hidden">
                <p className="px-2.5 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                  {group.label}
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.label} item={item} siteId={siteId} collapsed={c} onClick={isMobile ? onMobileClose : undefined} pendingHref={pendingHref} onNavigate={onNavigate} />
              ))}
              {group.label === 'Infrastructure' && canEdit && (
                <NavLink item={SETTINGS_ITEM} siteId={siteId} collapsed={c} onClick={isMobile ? onMobileClose : undefined} pendingHref={pendingHref} onNavigate={onNavigate} />
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom — utility items */}
      <div className="border-t border-neutral-800/60 px-2 py-3 shrink-0">
        {/* Notifications, Profile — same layout as nav items */}
        <div className="space-y-0.5 mb-1">
          <div className="relative group/notif">
            <NotificationCenter anchor="right" variant="sidebar">
              <Label collapsed={c}>Notifications</Label>
            </NotificationCenter>
            {c && (
              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-neutral-800 text-white text-xs whitespace-nowrap opacity-0 group-hover/notif:opacity-100 transition-opacity duration-150 delay-150 z-50">
                Notifications
              </span>
            )}
          </div>
          <div className="relative group/user">
            <UserMenu
              auth={auth}
              LinkComponent={Link}
              orgs={orgs}
              activeOrgId={auth.user?.org_id}
              onSwitchOrganization={onSwitchOrganization}
              onCreateOrganization={() => router.push('/onboarding')}
              allowPersonalOrganization={false}
              onOpenSettings={openSettings}
              compact
              anchor="right"
            >
              <Label collapsed={c}>{user?.display_name?.trim() || 'Profile'}</Label>
            </UserMenu>
            {c && (
              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-neutral-800 text-white text-xs whitespace-nowrap opacity-0 group-hover/user:opacity-100 transition-opacity duration-150 delay-150 z-50">
                {user?.display_name?.trim() || 'Profile'}
              </span>
            )}
          </div>
        </div>

        {/* Settings + Collapse */}
        <div className="space-y-0.5">
          {!isMobile && (
            <div className="relative group/collapse">
              <button
                onClick={onToggle}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-neutral-400 dark:text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 w-full overflow-hidden"
              >
                <span className="w-7 h-7 flex items-center justify-center shrink-0">
                  <CollapseLeftIcon className={`w-[18px] h-[18px] transition-transform duration-200 ${c ? 'rotate-180' : ''}`} />
                </span>
                <Label collapsed={c}>{c ? 'Expand' : 'Collapse'}</Label>
              </button>
              {c && (
                <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-neutral-800 text-white text-xs whitespace-nowrap opacity-0 group-hover/collapse:opacity-100 transition-opacity duration-150 delay-150 z-50">
                  Expand (press [)
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
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
  const [mobileClosing, setMobileClosing] = useState(false)
  const wasCollapsedRef = useRef(false)
  const pickerOpenCallbackRef = useRef<(() => void) | null>(null)
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

  const handleMobileClose = useCallback(() => {
    setMobileClosing(true)
    setTimeout(() => {
      setMobileClosing(false)
      onMobileClose()
    }, 200)
  }, [onMobileClose])

  const handleNavigate = useCallback((href: string) => { setPendingHref(href) }, [])

  return (
    <>
      {/* Desktop — ssr:false means this only renders on client, no hydration flash */}
      <aside
        className="hidden md:flex flex-col shrink-0 bg-neutral-900 overflow-hidden relative z-10"
        style={{ width: collapsed ? COLLAPSED : EXPANDED, transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        onTransitionEnd={(e) => {
          if (e.propertyName === 'width' && pickerOpenCallbackRef.current) {
            pickerOpenCallbackRef.current()
            pickerOpenCallbackRef.current = null
          }
        }}
      >
        <SidebarContent
          isMobile={false}
          collapsed={collapsed}
          siteId={siteId}
          sites={sites}
          canEdit={canEdit}
          pendingHref={pendingHref}
          onNavigate={handleNavigate}
          onMobileClose={onMobileClose}
          onExpand={expand}
          onCollapse={collapse}
          onToggle={toggle}
          wasCollapsed={wasCollapsedRef}
          pickerOpenCallbackRef={pickerOpenCallbackRef}
          auth={auth}
          orgs={orgs}
          onSwitchOrganization={handleSwitchOrganization}
          openSettings={openSettings}
        />
      </aside>

      {/* Mobile overlay */}
      {(mobileOpen || mobileClosing) && (
        <>
          <div
            className={`fixed inset-0 z-40 bg-black/30 md:hidden transition-opacity duration-200 ${
              mobileClosing ? 'opacity-0' : 'opacity-100'
            }`}
            onClick={handleMobileClose}
          />
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-72 bg-neutral-900 border-r border-neutral-800 shadow-xl md:hidden ${
              mobileClosing
                ? 'animate-out slide-out-to-left duration-200 fill-mode-forwards'
                : 'animate-in slide-in-from-left duration-200'
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <span className="text-sm font-semibold text-white">Navigation</span>
              <button onClick={handleMobileClose} className="p-1.5 text-neutral-400 hover:text-neutral-300">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent
              isMobile={true}
              collapsed={collapsed}
              siteId={siteId}
              sites={sites}
              canEdit={canEdit}
              pendingHref={pendingHref}
              onNavigate={handleNavigate}
              onMobileClose={handleMobileClose}
              onExpand={expand}
              onCollapse={collapse}
              onToggle={toggle}
              wasCollapsed={wasCollapsedRef}
              pickerOpenCallbackRef={pickerOpenCallbackRef}
              auth={auth}
              orgs={orgs}
              onSwitchOrganization={handleSwitchOrganization}
              openSettings={openSettings}
            />
          </aside>
        </>
      )}
    </>
  )
}

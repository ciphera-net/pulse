'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type Site } from '@/lib/api/sites'
import { useAuth } from '@/lib/auth/context'
import { useSites, FaviconPreloader } from '@/lib/swr/sites'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import { useSidebar } from '@/lib/sidebar-context'
// `,` shortcut handled globally by UnifiedSettingsModal
import { getUserOrganizations, switchContext, type OrganizationMember } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import { logger } from '@/lib/utils/logger'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'
import { Gauge as GaugeIcon, Plugs as PlugsIcon, Tag as TagIcon } from '@phosphor-icons/react'
import {
  LayoutDashboardIcon,
  PathIcon,
  FunnelIcon,
  CursorClickIcon,
  SearchIcon,
  CloudUploadIcon,
  HeartbeatIcon,
  SettingsIcon,
  PlusIcon,
  XIcon,
  BookOpenIcon,
  UserMenu,
} from '@ciphera-net/ui'
import NotificationCenter from '@/components/notifications/NotificationCenter'

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
      className="whitespace-nowrap overflow-hidden transition-opacity duration-fast"
      style={{ opacity: collapsed ? 0 : 1 }}
    >
      {children}
    </span>
  )
}

// ─── Sidebar Tooltip (portal-based, escapes overflow-hidden) ──

function SidebarTooltip({ children, label }: { children: React.ReactNode; label: string }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleEnter = () => {
    timerRef.current = setTimeout(() => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect()
        setPos({ x: rect.right + 8, y: rect.top + rect.height / 2 })
        setShow(true)
      }
    }, 100)
  }

  const handleLeave = () => {
    clearTimeout(timerRef.current)
    setShow(false)
  }

  return (
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {show && typeof document !== 'undefined' && createPortal(
        <span
          className="fixed z-[100] px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800/60 text-white text-sm font-medium whitespace-nowrap pointer-events-none shadow-lg shadow-black/20 -translate-y-1/2"
          style={{ left: pos.x, top: pos.y }}
        >
          {label}
        </span>,
        document.body
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

  const link = (
    <Link
      href={href}
      onClick={() => { onNavigate(href); onClick?.() }}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium overflow-hidden transition-all duration-fast ${
        active
          ? 'bg-brand-orange/10 text-brand-orange'
          : 'text-neutral-400 hover:text-white hover:bg-white/[0.06] hover:translate-x-0.5'
      }`}
    >
      <span className="w-7 h-7 flex items-center justify-center shrink-0">
        <item.icon className="w-[18px] h-[18px]" weight={active ? 'fill' : 'regular'} />
      </span>
      <Label collapsed={collapsed}>{item.label}</Label>
    </Link>
  )

  if (collapsed) return <SidebarTooltip label={item.label}>{link}</SidebarTooltip>
  return link
}

// ─── Settings Button (opens unified modal instead of navigating) ─────

function SettingsButton({
  item, collapsed, onClick, settingsContext = 'site',
}: {
  item: NavItem; collapsed: boolean; onClick?: () => void; settingsContext?: 'site' | 'workspace'
}) {
  const { openUnifiedSettings } = useUnifiedSettings()

  const btn = (
    <button
      onClick={() => {
        openUnifiedSettings({ context: settingsContext, tab: 'general' })
        onClick?.()
      }}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium overflow-hidden transition-all duration-fast text-neutral-400 hover:text-white hover:bg-white/[0.06] hover:translate-x-0.5 w-full cursor-pointer"
    >
      <span className="w-7 h-7 flex items-center justify-center shrink-0">
        <item.icon className="w-[18px] h-[18px]" weight="regular" />
      </span>
      <Label collapsed={collapsed}>{item.label}</Label>
    </button>
  )

  if (collapsed) return <SidebarTooltip label={item.label}>{btn}</SidebarTooltip>
  return btn
}

// ─── Home Nav Link (static href, no siteId) ───────────────

function HomeNavLink({
  href, icon: Icon, label, collapsed, onClick, external,
}: {
  href: string; icon: React.ComponentType<{ className?: string; weight?: IconWeight }>
  label: string; collapsed: boolean; onClick?: () => void; external?: boolean
}) {
  const pathname = usePathname()
  const active = !external && pathname === href

  const link = (
    <Link
      href={href}
      onClick={onClick}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium overflow-hidden transition-all duration-fast ${
        active
          ? 'bg-brand-orange/10 text-brand-orange'
          : 'text-neutral-400 hover:text-white hover:bg-white/[0.06] hover:translate-x-0.5'
      }`}
    >
      <span className="w-7 h-7 flex items-center justify-center shrink-0">
        <Icon className="w-[18px] h-[18px]" weight={active ? 'fill' : 'regular'} />
      </span>
      <Label collapsed={collapsed}>{label}</Label>
    </Link>
  )

  if (collapsed) return <SidebarTooltip label={label}>{link}</SidebarTooltip>
  return link
}

// ─── Home Site Link (favicon + name) ───────────────────────

function HomeSiteLink({
  site, collapsed, onClick,
}: {
  site: Site; collapsed: boolean; onClick?: () => void
}) {
  const pathname = usePathname()
  const href = `/sites/${site.id}`
  const active = pathname.startsWith(href)

  const link = (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium overflow-hidden transition-all duration-fast ${
        active
          ? 'bg-brand-orange/10 text-brand-orange'
          : 'text-neutral-400 hover:text-white hover:bg-white/[0.06] hover:translate-x-0.5'
      }`}
    >
      <span className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center shrink-0 overflow-hidden">
        <img
          src={`${FAVICON_SERVICE_URL}?domain=${site.domain}&sz=64`}
          alt=""
          className="w-[18px] h-[18px] rounded object-contain"
        />
      </span>
      <Label collapsed={collapsed}>{site.name}</Label>
    </Link>
  )

  if (collapsed) return <SidebarTooltip label={site.name}>{link}</SidebarTooltip>
  return link
}

// ─── Sidebar Content ────────────────────────────────────────

interface SidebarContentProps {
  isMobile: boolean
  collapsed: boolean
  siteId: string | null
  sites: Site[]
  canEdit: boolean
  pendingHref: string | null
  onNavigate: (href: string) => void
  onMobileClose: () => void
  onToggle: () => void
  auth: ReturnType<typeof useAuth>
  orgs: OrganizationMember[]
  onSwitchOrganization: (orgId: string | null) => Promise<void>
  openSettings: () => void
  openOrgSettings: () => void
}

function SidebarContent({
  isMobile, collapsed, siteId, sites, canEdit, pendingHref,
  onNavigate, onMobileClose, onToggle,
  auth, orgs, onSwitchOrganization, openSettings, openOrgSettings,
}: SidebarContentProps) {
  const router = useRouter()
  const c = isMobile ? false : collapsed
  const { user } = auth

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo — fixed layout, text fades */}
      <Link href="/" className="flex items-center gap-3 px-[14px] py-4 shrink-0 group overflow-hidden">
        <span className="w-9 h-9 flex items-center justify-center shrink-0">
          <img src="/pulse_icon_no_margins.png" alt="Pulse" className="w-9 h-9 shrink-0 object-contain group-hover:scale-105 transition-transform duration-base" />
        </span>
        <span className={`text-xl font-bold text-white tracking-tight group-hover:text-brand-orange whitespace-nowrap transition-opacity duration-fast ${c ? 'opacity-0' : 'opacity-100'}`}>
          Pulse
        </span>
      </Link>

      {/* Nav Groups */}
      {siteId ? (
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="h-5 flex items-center overflow-hidden">
                {c ? (
                  <div className="mx-1 w-full border-t border-white/[0.04]" />
                ) : (
                  <p className="px-2.5 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                    {group.label}
                  </p>
                )}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.label} item={item} siteId={siteId} collapsed={c} onClick={isMobile ? onMobileClose : undefined} pendingHref={pendingHref} onNavigate={onNavigate} />
                ))}
                {group.label === 'Infrastructure' && canEdit && (
                  <SettingsButton item={SETTINGS_ITEM} collapsed={c} onClick={isMobile ? onMobileClose : undefined} />
                )}
              </div>
            </div>
          ))}
        </nav>
      ) : (
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-4">
          {/* Your Sites */}
          <div>
            {c ? (
              <div className="mx-3 my-2 border-t border-white/[0.04]" />
            ) : (
              <div className="h-5 flex items-center overflow-hidden">
                <p className="px-2.5 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                  Your Sites
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              {sites.map((site) => (
                <HomeSiteLink key={site.id} site={site} collapsed={c} onClick={isMobile ? onMobileClose : undefined} />
              ))}
              <HomeNavLink href="/sites/new" icon={PlusIcon} label="Add New Site" collapsed={c} onClick={isMobile ? onMobileClose : undefined} />
            </div>
          </div>

          {/* Organization */}
          <div>
            {c ? (
              <div className="mx-3 my-2 border-t border-white/[0.04]" />
            ) : (
              <div className="h-5 flex items-center overflow-hidden">
                <p className="px-2.5 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                  Organization
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              <HomeNavLink href="/integrations" icon={PlugsIcon} label="Integrations" collapsed={c} onClick={isMobile ? onMobileClose : undefined} />
              <HomeNavLink href="/pricing" icon={TagIcon} label="Pricing" collapsed={c} onClick={isMobile ? onMobileClose : undefined} />
              <SettingsButton item={{ label: 'Organization Settings', href: () => '', icon: SettingsIcon, matchPrefix: false }} collapsed={c} onClick={isMobile ? onMobileClose : undefined} settingsContext="workspace" />
            </div>
          </div>

          {/* Resources */}
          <div>
            {c ? (
              <div className="mx-3 my-2 border-t border-white/[0.04]" />
            ) : (
              <div className="h-5 flex items-center overflow-hidden">
                <p className="px-2.5 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                  Resources
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              <HomeNavLink href="https://docs.ciphera.net" icon={BookOpenIcon} label="Documentation" collapsed={c} onClick={isMobile ? onMobileClose : undefined} external />
            </div>
          </div>
        </nav>
      )}

      {/* Bottom — utility items */}
      <div className="border-t border-white/[0.06] px-2 py-3 shrink-0">
        {/* Notifications, Profile — same layout as nav items */}
        <div className="space-y-0.5 mb-1">
          {c ? (
            <SidebarTooltip label="Notifications">
              <NotificationCenter anchor="right" variant="sidebar">
                <Label collapsed={c}>Notifications</Label>
              </NotificationCenter>
            </SidebarTooltip>
          ) : (
            <NotificationCenter anchor="right" variant="sidebar">
              <Label collapsed={c}>Notifications</Label>
            </NotificationCenter>
          )}
          {c ? (
            <SidebarTooltip label={user?.display_name?.trim() || 'Profile'}>
              <UserMenu
                auth={auth}
                LinkComponent={Link}
                orgs={orgs}
                activeOrgId={auth.user?.org_id}
                onSwitchOrganization={onSwitchOrganization}
                onCreateOrganization={() => router.push('/onboarding')}
                allowPersonalOrganization={false}
                onOpenSettings={openSettings}
                onOpenOrgSettings={openOrgSettings}
                compact
                anchor="right"
              >
                <Label collapsed={c}>{user?.display_name?.trim() || 'Profile'}</Label>
              </UserMenu>
            </SidebarTooltip>
          ) : (
            <UserMenu
              auth={auth}
              LinkComponent={Link}
              orgs={orgs}
              activeOrgId={auth.user?.org_id}
              onSwitchOrganization={onSwitchOrganization}
              onCreateOrganization={() => router.push('/onboarding')}
              allowPersonalOrganization={false}
              onOpenSettings={openSettings}
              onOpenOrgSettings={openOrgSettings}
              compact
              anchor="right"
            >
              <Label collapsed={c}>{user?.display_name?.trim() || 'Profile'}</Label>
            </UserMenu>
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
  siteId: string | null; mobileOpen: boolean; onMobileClose: () => void; onMobileOpen: () => void
}) {
  const auth = useAuth()
  const { user } = auth
  const canEdit = user?.role === 'owner' || user?.role === 'admin'
  const pathname = usePathname()
  const router = useRouter()
  const { openUnifiedSettings } = useUnifiedSettings()
  const { sites } = useSites()
  const [orgs, setOrgs] = useState<OrganizationMember[]>([])
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [mobileClosing, setMobileClosing] = useState(false)
  const { collapsed, toggle } = useSidebar()

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
      await auth.refresh()
      router.push('/')
    } catch (err) {
      logger.error('Failed to switch organization', err)
    }
  }
  useEffect(() => { setPendingHref(null); onMobileClose() }, [pathname, onMobileClose])

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
      <FaviconPreloader sites={sites} />
      {/* Desktop — ssr:false means this only renders on client, no hydration flash */}
      <aside
        className="hidden md:flex flex-col shrink-0 bg-transparent overflow-hidden relative z-10"
        style={{ width: collapsed ? COLLAPSED : EXPANDED, transition: 'width var(--duration-base) var(--ease-apple)' }}
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
          onToggle={toggle}
          auth={auth}
          orgs={orgs}
          onSwitchOrganization={handleSwitchOrganization}
          openSettings={() => openUnifiedSettings({ context: 'account', tab: 'profile' })}
          openOrgSettings={() => openUnifiedSettings({ context: 'workspace', tab: 'general' })}
        />
      </aside>

      {/* Mobile overlay */}
      {(mobileOpen || mobileClosing) && (
        <>
          <div
            className={`fixed inset-0 z-40 bg-black/30 md:hidden transition-opacity duration-base ${
              mobileClosing ? 'opacity-0' : 'opacity-100'
            }`}
            onClick={handleMobileClose}
          />
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-72 bg-neutral-900/65 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:bg-neutral-900/60 border-r border-white/[0.08] shadow-xl shadow-black/20 md:hidden ${
              mobileClosing
                ? 'animate-out slide-out-to-left duration-base fill-mode-forwards'
                : 'animate-in slide-in-from-left duration-base'
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
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
              onToggle={toggle}
              auth={auth}
              orgs={orgs}
              onSwitchOrganization={handleSwitchOrganization}
              openSettings={() => openUnifiedSettings({ context: 'account', tab: 'profile' })}
              openOrgSettings={() => openUnifiedSettings({ context: 'workspace', tab: 'general' })}
            />
          </aside>
        </>
      )}
    </>
  )
}

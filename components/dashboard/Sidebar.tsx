'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { listSites, type Site } from '@/lib/api/sites'
import { useAuth } from '@/lib/auth/context'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import { useSidebar } from '@/lib/sidebar-context'
import { getUserOrganizations, switchContext, type OrganizationMember } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import { logger } from '@/lib/utils/logger'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'
import { Gauge as GaugeIcon, Plugs as PlugsIcon, Tag as TagIcon, House as HomeIcon } from '@phosphor-icons/react'
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

const RAIL_WIDTH = 56
const PANEL_WIDTH = 200

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

// ─── Rail ──────────────────────────────────────────────────

function SidebarRail({
  sites, currentSiteId, auth, orgs, onSwitchOrganization, openSettings, openOrgSettings, onMobileClose, isMobile,
}: {
  sites: Site[]; currentSiteId: string | null
  auth: ReturnType<typeof useAuth>; orgs: OrganizationMember[]
  onSwitchOrganization: (orgId: string | null) => Promise<void>
  openSettings: () => void; openOrgSettings: () => void
  onMobileClose?: () => void; isMobile?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = auth
  const isHome = !currentSiteId

  return (
    <div className="w-14 flex flex-col items-center shrink-0 border-r border-white/[0.06] py-2 gap-1">
      {/* Pulse logo */}
      <Link href="/" className="w-9 h-9 flex items-center justify-center shrink-0 group mb-1" onClick={isMobile ? onMobileClose : undefined}>
        <img src="/pulse_icon_no_margins.png" alt="Pulse" className="w-7 h-7 object-contain group-hover:scale-110 transition-transform duration-200" />
      </Link>

      <div className="w-7 border-t border-white/[0.06] my-1" />

      {/* Home */}
      <div className="relative group/rail">
        <Link
          href="/"
          onClick={isMobile ? onMobileClose : undefined}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 ${
            isHome
              ? 'bg-brand-orange/10 text-brand-orange'
              : 'text-neutral-500 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <HomeIcon className="w-[18px] h-[18px]" weight={isHome ? 'fill' : 'regular'} />
        </Link>
        <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-neutral-800 text-white text-xs whitespace-nowrap opacity-0 group-hover/rail:opacity-100 transition-opacity duration-150 delay-150 z-50">
          Your Sites
        </span>
      </div>

      {/* Site favicons */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center gap-1 py-1 min-h-0">
        {sites.map((site) => {
          const isActive = currentSiteId === site.id
          const siteSection = pathname.replace(/^\/sites\/[^/]+/, '')
          return (
            <div key={site.id} className="relative group/rail shrink-0">
              <Link
                href={`/sites/${site.id}${siteSection || ''}`}
                onClick={isMobile ? onMobileClose : undefined}
                className={`w-9 h-9 flex items-center justify-center rounded-lg overflow-hidden transition-all duration-150 ${
                  isActive
                    ? 'ring-2 ring-brand-orange/60 ring-offset-1 ring-offset-neutral-900'
                    : 'hover:bg-white/[0.06]'
                }`}
              >
                <img
                  src={`${FAVICON_SERVICE_URL}?domain=${site.domain}&sz=64`}
                  alt={site.name}
                  className="w-5 h-5 rounded object-contain"
                />
              </Link>
              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-neutral-800 text-white text-xs whitespace-nowrap opacity-0 group-hover/rail:opacity-100 transition-opacity duration-150 delay-150 z-50">
                {site.name}
              </span>
            </div>
          )
        })}

        {/* Add new site */}
        <div className="relative group/rail shrink-0">
          <Link
            href="/sites/new"
            onClick={isMobile ? onMobileClose : undefined}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-neutral-600 hover:text-brand-orange hover:bg-white/[0.06] transition-all duration-150"
          >
            <PlusIcon className="w-4 h-4" />
          </Link>
          <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-neutral-800 text-white text-xs whitespace-nowrap opacity-0 group-hover/rail:opacity-100 transition-opacity duration-150 delay-150 z-50">
            Add new site
          </span>
        </div>
      </div>

      <div className="w-7 border-t border-white/[0.06] my-1" />

      {/* Bottom: Notifications + Profile */}
      <div className="flex flex-col items-center gap-1">
        <div className="relative group/rail">
          <NotificationCenter anchor="right" variant="sidebar" />
          <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-neutral-800 text-white text-xs whitespace-nowrap opacity-0 group-hover/rail:opacity-100 transition-opacity duration-150 delay-150 z-50">
            Notifications
          </span>
        </div>
        <div className="relative group/rail">
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
          />
          <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-neutral-800 text-white text-xs whitespace-nowrap opacity-0 group-hover/rail:opacity-100 transition-opacity duration-150 delay-150 z-50">
            {user?.display_name?.trim() || 'Profile'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Panel Nav Link ────────────────────────────────────────

function NavLink({
  item, siteId, onClick, pendingHref, onNavigate,
}: {
  item: NavItem; siteId: string; onClick?: () => void
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
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-brand-orange/10 text-brand-orange'
          : 'text-neutral-400 hover:text-white hover:bg-white/[0.06] hover:translate-x-0.5'
      }`}
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0">
        <item.icon className="w-[16px] h-[16px]" weight={active ? 'fill' : 'regular'} />
      </span>
      <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
    </Link>
  )
}

// ─── Panel Settings Button ─────────────────────────────────

function SettingsButton({
  item, onClick, settingsContext = 'site',
}: {
  item: NavItem; onClick?: () => void; settingsContext?: 'site' | 'workspace'
}) {
  const { openUnifiedSettings } = useUnifiedSettings()

  return (
    <button
      onClick={() => { openUnifiedSettings({ context: settingsContext, tab: 'general' }); onClick?.() }}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150 text-neutral-400 hover:text-white hover:bg-white/[0.06] hover:translate-x-0.5 w-full cursor-pointer"
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0">
        <item.icon className="w-[16px] h-[16px]" weight="regular" />
      </span>
      <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
    </button>
  )
}

// ─── Panel Home Nav Link ───────────────────────────────────

function HomeNavLink({
  href, icon: Icon, label, onClick, external,
}: {
  href: string; icon: React.ComponentType<{ className?: string; weight?: IconWeight }>
  label: string; onClick?: () => void; external?: boolean
}) {
  const pathname = usePathname()
  const active = !external && pathname === href

  return (
    <Link
      href={href}
      onClick={onClick}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-brand-orange/10 text-brand-orange'
          : 'text-neutral-400 hover:text-white hover:bg-white/[0.06] hover:translate-x-0.5'
      }`}
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0">
        <Icon className="w-[16px] h-[16px]" weight={active ? 'fill' : 'regular'} />
      </span>
      <span className="whitespace-nowrap overflow-hidden">{label}</span>
    </Link>
  )
}

// ─── Panel ─────────────────────────────────────────────────

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-5 flex items-center overflow-hidden">
      <p className="px-2.5 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">
        {children}
      </p>
    </div>
  )
}

function SidebarPanel({
  collapsed, siteId, sites, canEdit, pendingHref, onNavigate, onMobileClose, isMobile,
}: {
  collapsed: boolean; siteId: string | null; sites: Site[]; canEdit: boolean
  pendingHref: string | null; onNavigate: (href: string) => void
  onMobileClose?: () => void; isMobile?: boolean
}) {
  const c = isMobile ? false : collapsed
  const mobileClick = isMobile ? onMobileClose : undefined

  return (
    <div
      className="overflow-hidden shrink-0 transition-all duration-200"
      style={{ width: c ? 0 : PANEL_WIDTH }}
    >
      <div className="h-full flex flex-col overflow-hidden" style={{ width: PANEL_WIDTH }}>
        {/* Panel nav content */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 space-y-4">
          {siteId ? (
            /* Site context: Analytics + Infrastructure */
            NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <GroupLabel>{group.label}</GroupLabel>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink key={item.label} item={item} siteId={siteId} onClick={mobileClick} pendingHref={pendingHref} onNavigate={onNavigate} />
                  ))}
                  {group.label === 'Infrastructure' && canEdit && (
                    <SettingsButton item={SETTINGS_ITEM} onClick={mobileClick} />
                  )}
                </div>
              </div>
            ))
          ) : (
            /* Home context: Workspace + Resources */
            <>
              <div>
                <GroupLabel>Workspace</GroupLabel>
                <div className="space-y-0.5">
                  <HomeNavLink href="/integrations" icon={PlugsIcon} label="Integrations" onClick={mobileClick} />
                  <HomeNavLink href="/pricing" icon={TagIcon} label="Pricing" onClick={mobileClick} />
                  <SettingsButton item={{ label: 'Workspace Settings', href: () => '', icon: SettingsIcon, matchPrefix: false }} onClick={mobileClick} settingsContext="workspace" />
                </div>
              </div>
              <div>
                <GroupLabel>Resources</GroupLabel>
                <div className="space-y-0.5">
                  <HomeNavLink href="https://docs.ciphera.net" icon={BookOpenIcon} label="Documentation" onClick={mobileClick} external />
                </div>
              </div>
            </>
          )}
        </nav>
      </div>
    </div>
  )
}

// ─── Main Sidebar ──────────────────────────────────────────

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
  const [sites, setSites] = useState<Site[]>([])
  const [orgs, setOrgs] = useState<OrganizationMember[]>([])
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [mobileClosing, setMobileClosing] = useState(false)
  const { collapsed, toggle } = useSidebar()

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
      await auth.refresh()
      router.push('/')
    } catch (err) {
      logger.error('Failed to switch organization', err)
    }
  }
  useEffect(() => { setPendingHref(null); onMobileClose() }, [pathname, onMobileClose])

  const handleMobileClose = useCallback(() => {
    setMobileClosing(true)
    setTimeout(() => { setMobileClosing(false); onMobileClose() }, 200)
  }, [onMobileClose])

  const handleNavigate = useCallback((href: string) => { setPendingHref(href) }, [])

  const railProps = {
    sites,
    currentSiteId: siteId,
    auth,
    orgs,
    onSwitchOrganization: handleSwitchOrganization,
    openSettings: () => openUnifiedSettings({ context: 'account', tab: 'profile' }),
    openOrgSettings: () => openUnifiedSettings({ context: 'workspace', tab: 'general' }),
  }

  const panelProps = {
    siteId,
    sites,
    canEdit,
    pendingHref,
    onNavigate: handleNavigate,
  }

  return (
    <>
      {/* Desktop */}
      <aside
        className="hidden md:flex shrink-0 bg-transparent overflow-hidden relative z-10"
        style={{ width: collapsed ? RAIL_WIDTH : RAIL_WIDTH + PANEL_WIDTH, transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <SidebarRail {...railProps} />
        <SidebarPanel {...panelProps} collapsed={collapsed} />
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
            className={`fixed inset-y-0 left-0 z-50 bg-neutral-900/65 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:bg-neutral-900/60 border-r border-white/[0.08] shadow-xl shadow-black/20 md:hidden ${
              mobileClosing
                ? 'animate-out slide-out-to-left duration-200 fill-mode-forwards'
                : 'animate-in slide-in-from-left duration-200'
            }`}
            style={{ width: RAIL_WIDTH + PANEL_WIDTH }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white">Navigation</span>
              <button onClick={handleMobileClose} className="p-1.5 text-neutral-400 hover:text-neutral-300">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex h-[calc(100%-49px)]">
              <SidebarRail {...railProps} onMobileClose={handleMobileClose} isMobile />
              <SidebarPanel {...panelProps} collapsed={false} onMobileClose={handleMobileClose} isMobile />
            </div>
          </aside>
        </>
      )}
    </>
  )
}

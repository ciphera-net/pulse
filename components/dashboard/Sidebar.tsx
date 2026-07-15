'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type Site } from '@/lib/api/sites'
import { useCan } from '@/lib/auth/permissions'
import { useSites, FaviconPreloader } from '@/lib/swr/sites'
import { cdnUrl } from '@/lib/cdn'
import { useSidebar } from '@/lib/sidebar-context'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
import { Gauge as GaugeIcon, Plugs as PlugsIcon, Tag as TagIcon, MagnifyingGlass } from '@phosphor-icons/react'
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
} from '@ciphera-net/facet'
import { ReportIssueButton } from '@/components/support/ReportIssueButton'

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
  label: 'Site Settings', href: () => '/settings/site/general', icon: SettingsIcon, matchPrefix: true,
}

const NAV_SHORTCUTS: Record<string, string> = {
  Dashboard: 'G D', Journeys: 'G J', Funnels: 'G F', Behavior: 'G B', Search: 'G S',
  CDN: 'G C', Uptime: 'G U', PageSpeed: 'G P', 'Site Settings': ',',
}

// Label that fades with the sidebar — always in the DOM, never removed
function Label({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  return (
    <span
      className="whitespace-nowrap overflow-hidden transition-opacity duration-fast ease-apple"
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
          className="fixed z-[100] px-3 py-2 rounded-none bg-neutral-950 border border-neutral-800/60 text-white text-sm font-medium whitespace-nowrap pointer-events-none -translate-y-1/2"
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
      className={`group/nav flex items-center gap-2.5 rounded-none px-2.5 py-2 text-sm font-medium overflow-hidden transition-all duration-fast ${
        active
          ? 'bg-brand-orange/10 text-brand-orange'
          : 'text-neutral-400 hover:text-white hover:bg-white/[0.06] hover:translate-x-0.5'
      } ease-apple`}
    >
      <span className="w-7 h-7 flex items-center justify-center shrink-0">
        <item.icon className="w-[18px] h-[18px]" weight={active ? 'fill' : 'regular'} />
      </span>
      <Label collapsed={collapsed}>{item.label}</Label>
      {!collapsed && NAV_SHORTCUTS[item.label] && (
        <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/nav:opacity-100 transition-opacity duration-fast ease-apple">
          {NAV_SHORTCUTS[item.label].split(' ').map((key) => (
            <kbd key={key} className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-medium text-neutral-500 bg-neutral-800/80 border border-neutral-700/50 rounded-none leading-none">
              {key}
            </kbd>
          ))}
        </span>
      )}
    </Link>
  )

  if (collapsed) return <SidebarTooltip label={item.label}>{link}</SidebarTooltip>
  return link
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
      className={`flex items-center gap-2.5 rounded-none px-2.5 py-2 text-sm font-medium overflow-hidden transition-all duration-fast ${
        active
          ? 'bg-brand-orange/10 text-brand-orange'
          : 'text-neutral-400 hover:text-white hover:bg-white/[0.06] hover:translate-x-0.5'
      } ease-apple`}
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
      className={`flex items-center gap-2.5 rounded-none px-2.5 py-2 text-sm font-medium overflow-hidden transition-all duration-fast ${
        active
          ? 'bg-brand-orange/10 text-brand-orange'
          : 'text-neutral-400 hover:text-white hover:bg-white/[0.06] hover:translate-x-0.5'
      } ease-apple`}
    >
      <span className="w-7 h-7 rounded-none bg-white/[0.04] flex items-center justify-center shrink-0 overflow-hidden">
        <SiteFavicon
          domain={site.domain}
          name={site.name}
          size={18}
          className="w-[18px] h-[18px] rounded-none object-contain"
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
  onOpenPalette: () => void
}

function SidebarContent({
  isMobile, collapsed, siteId, sites, canEdit, pendingHref,
  onNavigate, onMobileClose, onToggle,
  onOpenPalette,
}: SidebarContentProps) {
  const c = isMobile ? false : collapsed

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo — fixed layout, text fades */}
      <Link href="/" className="flex items-center gap-3 px-[14px] py-4 shrink-0 group overflow-hidden">
        <span className="w-9 h-9 flex items-center justify-center shrink-0">
          <img src={cdnUrl('/pulse_icon_no_margins.png')} alt="Pulse" className="w-9 h-9 shrink-0 object-contain group-hover:scale-105 transition-transform duration-base ease-apple" />
        </span>
        <span className={`text-xl font-bold text-white tracking-tight group-hover:text-brand-orange whitespace-nowrap transition-opacity duration-fast ${c ? 'opacity-0' : 'opacity-100'} ease-apple`}>
          Pulse
        </span>
      </Link>

      {/* Search trigger — opens ⌘K command palette */}
      <div className="px-2 mb-2 shrink-0">
        <button
          onClick={onOpenPalette}
          className={`${c
            ? 'w-9 h-9 flex items-center justify-center mx-auto'
            : 'w-full h-9 flex items-center gap-2 px-3'
          } rounded-none border border-neutral-800 bg-neutral-900 text-neutral-500 hover:border-neutral-700 hover:text-neutral-400 transition-colors ease-apple cursor-pointer`}
        >
          <MagnifyingGlass className="w-4 h-4 shrink-0" />
          {!c && (
            <>
              <span className="text-sm">Search...</span>
              <span className="ml-auto flex items-center gap-0.5">
                <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-medium text-neutral-500 bg-neutral-800/80 border border-neutral-700/50 rounded-none leading-none">⌘</kbd>
                <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-medium text-neutral-500 bg-neutral-800/80 border border-neutral-700/50 rounded-none leading-none">K</kbd>
              </span>
            </>
          )}
        </button>
      </div>

      {/* Nav Groups */}
      {siteId ? (
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="h-5 flex items-center overflow-hidden">
                {c ? (
                  <div className="mx-1 w-full border-t border-neutral-800" />
                ) : (
                  <p className="px-2.5 text-caption font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                    {group.label}
                  </p>
                )}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.label} item={item} siteId={siteId} collapsed={c} onClick={isMobile ? onMobileClose : undefined} pendingHref={pendingHref} onNavigate={onNavigate} />
                ))}
                {group.label === 'Infrastructure' && canEdit && siteId && (
                  <NavLink item={SETTINGS_ITEM} siteId={siteId} collapsed={c} onClick={isMobile ? onMobileClose : undefined} pendingHref={pendingHref} onNavigate={onNavigate} />
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
              <div className="mx-3 my-2 border-t border-neutral-800" />
            ) : (
              <div className="h-5 flex items-center overflow-hidden">
                <p className="px-2.5 text-caption font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">
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
              <div className="mx-3 my-2 border-t border-neutral-800" />
            ) : (
              <div className="h-5 flex items-center overflow-hidden">
                <p className="px-2.5 text-caption font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                  Organization
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              <HomeNavLink href="/integrations" icon={PlugsIcon} label="Integrations" collapsed={c} onClick={isMobile ? onMobileClose : undefined} />
              <HomeNavLink href="/pricing" icon={TagIcon} label="Pricing" collapsed={c} onClick={isMobile ? onMobileClose : undefined} />
              <HomeNavLink href="/settings/organization/general" icon={SettingsIcon} label="Organization Settings" collapsed={c} onClick={isMobile ? onMobileClose : undefined} />
            </div>
          </div>

          {/* Resources */}
          <div>
            {c ? (
              <div className="mx-3 my-2 border-t border-neutral-800" />
            ) : (
              <div className="h-5 flex items-center overflow-hidden">
                <p className="px-2.5 text-caption font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                  Resources
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              <HomeNavLink href="https://help.ciphera.net" icon={BookOpenIcon} label="Documentation" collapsed={c} onClick={isMobile ? onMobileClose : undefined} external />
            </div>
          </div>
        </nav>
      )}

      {/* Report Issue — sidebar bottom */}
      <div className="shrink-0 px-2 pb-3 pt-2 border-t border-neutral-800/60">
        {c ? (
          <SidebarTooltip label="Report Issue">
            <div className="flex justify-center">
              <ReportIssueButton siteId={siteId ?? undefined} collapsed />
            </div>
          </SidebarTooltip>
        ) : (
          <ReportIssueButton siteId={siteId ?? undefined} />
        )}
      </div>

    </div>
  )
}

// ─── Main Sidebar ───────────────────────────────────────────

export default function Sidebar({
  siteId, mobileOpen, onMobileClose, onMobileOpen, onOpenPalette,
}: {
  siteId: string | null; mobileOpen: boolean; onMobileClose: () => void; onMobileOpen: () => void; onOpenPalette: () => void
}) {
  const canEdit = useCan('sites.edit')
  const pathname = usePathname()
  const { sites } = useSites()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [mobileClosing, setMobileClosing] = useState(false)
  const { collapsed, toggle } = useSidebar()

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
          onOpenPalette={onOpenPalette}
        />
      </aside>

      {/* Mobile overlay */}
      {(mobileOpen || mobileClosing) && (
        <>
          <div
            className={`fixed inset-0 z-40 bg-black/30 md:hidden transition-opacity duration-base ${
              mobileClosing ? 'opacity-0' : 'opacity-100'
            } ease-apple`}
            onClick={handleMobileClose}
          />
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-72 bg-popover border-r md:hidden ${
              mobileClosing
                ? 'animate-out slide-out-to-left duration-base fill-mode-forwards'
                : 'animate-in slide-in-from-left duration-base'
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800/60">
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
              onOpenPalette={onOpenPalette}
            />
          </aside>
        </>
      )}
    </>
  )
}

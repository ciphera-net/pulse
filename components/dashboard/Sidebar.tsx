'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { listSites, type Site } from '@/lib/api/sites'
import { useAuth } from '@/lib/auth/context'
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
  MenuIcon,
} from '@ciphera-net/ui'

const SIDEBAR_COLLAPSED_KEY = 'pulse_sidebar_collapsed'

interface NavItem {
  label: string
  href: (siteId: string) => string
  icon: React.ComponentType<{ className?: string; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone' }>
  matchPrefix?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

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
  label: 'Settings',
  href: (id) => `/sites/${id}/settings`,
  icon: SettingsIcon,
  matchPrefix: true,
}

function SitePicker({
  sites,
  currentSiteId,
  collapsed,
}: {
  sites: Site[]
  currentSiteId: string
  collapsed: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  const currentSite = sites.find((s) => s.id === currentSiteId)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = sites.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.domain.toLowerCase().includes(search.toLowerCase())
  )

  const switchSite = (siteId: string) => {
    // Preserve current page type
    const currentPageType = pathname.replace(/^\/sites\/[^/]+/, '')
    router.push(`/sites/${siteId}${currentPageType}`)
    setOpen(false)
    setSearch('')
  }

  const initial = currentSite?.name?.charAt(0)?.toUpperCase() || '?'

  return (
    <div className="relative px-3 mb-2" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${
          collapsed ? 'justify-center' : ''
        }`}
        title={collapsed ? currentSite?.name || 'Select site' : undefined}
      >
        <span className="w-7 h-7 rounded-md bg-brand-orange/10 text-brand-orange flex items-center justify-center text-xs font-bold shrink-0">
          {initial}
        </span>
        {!collapsed && (
          <>
            <span className="truncate flex-1 text-left">{currentSite?.name || 'Select site'}</span>
            <ChevronUpDownIcon className="w-4 h-4 text-neutral-400 shrink-0" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl overflow-hidden min-w-[220px]">
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
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left ${
                  site.id === currentSiteId
                    ? 'bg-brand-orange/10 text-brand-orange font-medium'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                }`}
              >
                <span className="w-5 h-5 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {site.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="truncate">{site.name}</span>
                  <span className="text-xs text-neutral-400 truncate">{site.domain}</span>
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-sm text-neutral-400">No sites found</p>
            )}
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-700 p-2">
            <Link
              href="/sites/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-brand-orange hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Add new site
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function NavItemLink({
  item,
  siteId,
  collapsed,
  onClick,
}: {
  item: NavItem
  siteId: string
  collapsed: boolean
  onClick?: () => void
}) {
  const pathname = usePathname()
  const href = item.href(siteId)
  const isActive = item.matchPrefix ? pathname.startsWith(href) : pathname === href

  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium ${
        collapsed ? 'justify-center' : ''
      } ${
        isActive
          ? 'bg-brand-orange/10 text-brand-orange'
          : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      <item.icon className="w-[18px] h-[18px] shrink-0" weight={isActive ? 'fill' : 'regular'} />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  )
}

export default function Sidebar({
  siteId,
  mobileOpen,
  onMobileClose,
}: {
  siteId: string
  mobileOpen: boolean
  onMobileClose: () => void
}) {
  const { user } = useAuth()
  const canEdit = user?.role === 'owner' || user?.role === 'admin'
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  })
  const [sites, setSites] = useState<Site[]>([])
  const pathname = usePathname()

  // Close mobile drawer on navigation
  useEffect(() => {
    onMobileClose()
  }, [pathname, onMobileClose])

  useEffect(() => {
    listSites()
      .then(setSites)
      .catch(() => {})
  }, [])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
  }

  const sidebarContent = (isMobile: boolean) => {
    const isCollapsed = isMobile ? false : collapsed

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Site Picker */}
        <div className="pt-3 pb-2">
          <SitePicker sites={sites} currentSiteId={siteId} collapsed={isCollapsed} />
        </div>

        {/* Nav Groups */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!isCollapsed && (
                <p className="px-2.5 mb-1 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItemLink
                    key={item.label}
                    item={item}
                    siteId={siteId}
                    collapsed={isCollapsed}
                    onClick={isMobile ? () => onMobileClose() : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: Settings + Collapse toggle */}
        <div className="border-t border-neutral-200 dark:border-neutral-800 px-3 py-3 space-y-1">
          {canEdit && (
            <NavItemLink
              item={SETTINGS_ITEM}
              siteId={siteId}
              collapsed={isCollapsed}
              onClick={isMobile ? () => onMobileClose() : undefined}
            />
          )}
          {!isMobile && (
            <button
              onClick={toggleCollapsed}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors w-full"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <CollapseRightIcon className="w-[18px] h-[18px] shrink-0 mx-auto" />
              ) : (
                <>
                  <CollapseLeftIcon className="w-[18px] h-[18px] shrink-0" />
                  <span>Collapse</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile hamburger trigger — rendered in the header via leftActions */}

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 transition-[width] duration-200 ${
          collapsed ? 'w-[68px]' : 'w-60'
        }`}
      >
        {sidebarContent(false)}
      </aside>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => onMobileClose()}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 shadow-xl lg:hidden animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">Navigation</span>
              <button
                onClick={() => onMobileClose()}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
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

export function SidebarMobileToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
      aria-label="Open navigation"
    >
      <MenuIcon className="w-5 h-5" />
    </button>
  )
}

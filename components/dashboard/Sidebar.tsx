'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { listSites, type Site } from '@/lib/api/sites'
import { useAuth } from '@/lib/auth/context'
import {
  Sidebar as SidebarPrimitive,
  SidebarBody,
  SidebarLink,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  LayoutDashboardIcon,
  PathIcon,
  FunnelIcon,
  CursorClickIcon,
  SearchIcon,
  CloudUploadIcon,
  HeartbeatIcon,
  SettingsIcon,
  ChevronUpDownIcon,
  PlusIcon,
} from '@ciphera-net/ui'

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

function SitePicker({ sites, siteId }: { sites: Site[]; siteId: string }) {
  const { open: sidebarOpen } = useSidebar()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  const currentSite = sites.find((s) => s.id === siteId)

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

  const switchSite = (id: string) => {
    const currentPageType = pathname.replace(/^\/sites\/[^/]+/, '')
    router.push(`/sites/${id}${currentPageType}`)
    setOpen(false)
    setSearch('')
  }

  const initial = currentSite?.name?.charAt(0)?.toUpperCase() || '?'

  return (
    <div className="relative mb-4" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 rounded-lg px-1 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-white/10 dark:hover:bg-white/5"
      >
        <span className="w-7 h-7 rounded-md bg-brand-orange/10 text-brand-orange flex items-center justify-center text-xs font-bold shrink-0">
          {initial}
        </span>
        {sidebarOpen && (
          <>
            <span className="truncate flex-1 text-left">{currentSite?.name || 'Select site'}</span>
            <ChevronUpDownIcon className="w-4 h-4 text-neutral-400 shrink-0" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl overflow-hidden min-w-[220px]">
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
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-brand-orange hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg"
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

function SidebarContent({ siteId }: { siteId: string }) {
  const { user } = useAuth()
  const { open } = useSidebar()
  const pathname = usePathname()
  const canEdit = user?.role === 'owner' || user?.role === 'admin'
  const [sites, setSites] = useState<Site[]>([])

  useEffect(() => {
    listSites().then(setSites).catch(() => {})
  }, [])

  const isActive = (item: NavItem) => {
    const href = item.href(siteId)
    return item.matchPrefix ? pathname.startsWith(href) : pathname === href
  }

  return (
    <>
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        {/* Site Picker */}
        <SitePicker sites={sites} siteId={siteId} />

        {/* Nav Groups */}
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            {open && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-1 mb-1 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider"
              >
                {group.label}
              </motion.p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <SidebarLink
                  key={item.label}
                  active={isActive(item)}
                  link={{
                    label: item.label,
                    href: item.href(siteId),
                    icon: (
                      <item.icon
                        className={`h-5 w-5 flex-shrink-0 ${
                          isActive(item)
                            ? 'text-brand-orange'
                            : 'text-neutral-700 dark:text-neutral-200'
                        }`}
                        weight={isActive(item) ? 'fill' : 'regular'}
                      />
                    ),
                  }}
                  className={
                    isActive(item)
                      ? 'bg-brand-orange/10 text-brand-orange rounded-lg px-1'
                      : 'rounded-lg px-1'
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom: Settings */}
      <div className="border-t border-neutral-700/30 pt-3">
        {canEdit && (
          <SidebarLink
            active={isActive(SETTINGS_ITEM)}
            link={{
              label: SETTINGS_ITEM.label,
              href: SETTINGS_ITEM.href(siteId),
              icon: (
                <SETTINGS_ITEM.icon
                  className={`h-5 w-5 flex-shrink-0 ${
                    isActive(SETTINGS_ITEM)
                      ? 'text-brand-orange'
                      : 'text-neutral-700 dark:text-neutral-200'
                  }`}
                  weight={isActive(SETTINGS_ITEM) ? 'fill' : 'regular'}
                />
              ),
            }}
            className={
              isActive(SETTINGS_ITEM)
                ? 'bg-brand-orange/10 text-brand-orange rounded-lg px-1'
                : 'rounded-lg px-1'
            }
          />
        )}
      </div>
    </>
  )
}

export default function PulseSidebar({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false)

  return (
    <SidebarPrimitive open={open} setOpen={setOpen}>
      <SidebarBody className="justify-between gap-6 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <SidebarContent siteId={siteId} />
      </SidebarBody>
    </SidebarPrimitive>
  )
}

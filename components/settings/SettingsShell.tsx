'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  GearSix,
  Target,
  Eye,
  ShieldCheck,
  Robot,
  MagnifyingGlass,
  ChartBar,
  Plugs,
  Buildings,
  UsersThree,
  Key,
  CreditCard,
  Bell,
  ClockCounterClockwise,
  User,
  Lock,
  DeviceMobile,
} from '@phosphor-icons/react'
import Select from '@/components/ui/select'
import { useCan } from '@/lib/auth/permissions'

// ─── Types ──────────────────────────────────────────────────────

type IconWeight = 'regular' | 'fill'

interface TabDef {
  id: string
  label: string
  href: string
  Icon: React.ComponentType<{ className?: string; weight?: IconWeight }>
  /** When set, the tab is only visible when this permission is held. */
  requires?: string
}

interface NavGroup {
  label: string
  tabs: TabDef[]
}

// ─── Static nav ──────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Site',
    tabs: [
      { id: 'general',        label: 'General',       href: '/settings/site/general',        Icon: GearSix,          requires: 'sites.edit' },
      { id: 'goals',          label: 'Goals',         href: '/settings/site/goals',          Icon: Target,           requires: 'goals.manage' },
      { id: 'visibility',     label: 'Visibility',    href: '/settings/site/visibility',     Icon: Eye,              requires: 'sites.edit' },
      { id: 'privacy',        label: 'Privacy',       href: '/settings/site/privacy',        Icon: ShieldCheck,      requires: 'sites.edit' },
      { id: 'bot-spam',       label: 'Bot & Spam',    href: '/settings/site/bot-spam',       Icon: Robot,            requires: 'quarantine.manage' },
      { id: 'privacy-scan',   label: 'Privacy Scan',  href: '/settings/site/privacy-scan',   Icon: MagnifyingGlass,  requires: 'privacy_scan.manage' },
      { id: 'reports',        label: 'Reports',       href: '/settings/site/reports',        Icon: ChartBar,         requires: 'reports.manage' },
      { id: 'integrations',   label: 'Integrations',  href: '/settings/site/integrations',   Icon: Plugs,            requires: 'integrations.manage' },
    ],
  },
  {
    label: 'Organization',
    tabs: [
      { id: 'general',       label: 'General',            href: '/settings/organization/general',       Icon: Buildings },
      { id: 'members',       label: 'Members',            href: '/settings/organization/members',       Icon: UsersThree,          requires: 'team.view' },
      { id: 'roles',         label: 'Roles & Permissions', href: '/settings/organization/roles',         Icon: Key,                 requires: 'roles.manage' },
      { id: 'billing',       label: 'Billing',            href: '/settings/organization/billing',       Icon: CreditCard,          requires: 'billing.view' },
      { id: 'notifications', label: 'Notifications',      href: '/settings/organization/notifications', Icon: Bell },
      { id: 'audit',         label: 'Audit Log',          href: '/settings/organization/audit',         Icon: ClockCounterClockwise, requires: 'audit.view' },
    ],
  },
  {
    label: 'Account',
    tabs: [
      { id: 'profile',  label: 'Profile',  href: '/settings/account/profile',  Icon: User },
      { id: 'security', label: 'Security', href: '/settings/account/security', Icon: Lock },
      { id: 'devices',  label: 'Devices',  href: '/settings/account/devices',  Icon: DeviceMobile },
    ],
  },
]

// ─── Page header ──────────────────────────────────────────────────

function resolvePageHeader(pathname: string): { title: string; subtitle: string } {
  if (pathname.startsWith('/settings/site')) {
    return { title: 'Site Settings', subtitle: 'Manage your site configuration' }
  }
  if (pathname.startsWith('/settings/organization')) {
    return { title: 'Organization Settings', subtitle: 'Manage your workspace' }
  }
  if (pathname.startsWith('/settings/account')) {
    return { title: 'Account Settings', subtitle: 'Manage your profile and security' }
  }
  return { title: 'Settings', subtitle: '' }
}

// ─── Component ───────────────────────────────────────────────────

export default function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { title, subtitle } = resolvePageHeader(pathname)
  const [search, setSearch] = useState('')

  const canGoalsManage      = useCan('goals.manage')
  const canReportsManage    = useCan('reports.manage')
  const canSitesEdit        = useCan('sites.edit')
  const canQuarantineManage = useCan('quarantine.manage')
  const canPrivacyScan      = useCan('privacy_scan.manage')
  const canIntegrations     = useCan('integrations.manage')
  const canTeamView         = useCan('team.view')
  const canRolesManage      = useCan('roles.manage')
  const canBillingView      = useCan('billing.view')
  const canAuditView        = useCan('audit.view')

  const permMap: Record<string, boolean> = {
    'goals.manage':        canGoalsManage,
    'reports.manage':      canReportsManage,
    'sites.edit':          canSitesEdit,
    'quarantine.manage':   canQuarantineManage,
    'privacy_scan.manage': canPrivacyScan,
    'integrations.manage': canIntegrations,
    'team.view':           canTeamView,
    'roles.manage':        canRolesManage,
    'billing.view':        canBillingView,
    'audit.view':          canAuditView,
  }

  // Filter tabs based on permission requirements
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => {
      if (tab.requires) return permMap[tab.requires] ?? true
      return true
    }),
  }))

  const allVisibleTabs = visibleGroups.flatMap((g) => g.tabs)

  // Mobile select options
  const mobileOptions = allVisibleTabs.map((t) => ({ value: t.href, label: t.label }))
  const mobileValue = allVisibleTabs.find((t) => pathname === t.href)?.href ?? ''

  // Filtered nav groups for search
  const filteredGroups = search.trim()
    ? visibleGroups.map(group => ({
        ...group,
        tabs: group.tabs.filter(tab =>
          tab.label.toLowerCase().includes(search.toLowerCase()) ||
          group.label.toLowerCase().includes(search.toLowerCase())
        )
      })).filter(group => group.tabs.length > 0)
    : visibleGroups.filter(group => group.tabs.length > 0)

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8">
      {/* Page header — sticky so long tab content keeps its context. Fixed h-16
          so the nav's sticky offset (top-16) is exactly the header's height —
          a guessed pixel offset here lets the nav slide underneath. The border
          marks the edge content is meant to pass under; bg must be opaque. */}
      <div className="sticky top-0 z-20 h-16 flex flex-col justify-center border-b border-neutral-800 bg-neutral-950 mb-6">
        <h1 className="text-lg font-semibold text-neutral-200">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-400 mt-0.5">{subtitle}</p>}
      </div>

      {/* Mobile tab selector */}
      <div className="md:hidden mb-4">
        <Select
          value={mobileValue}
          onChange={(href: string) => router.push(href)}
          options={mobileOptions}
          variant="input"
          fullWidth
        />
      </div>

      {/* Main layout */}
      <div className="flex gap-8">
        {/* Left nav — sticks below the header; taller-than-viewport navs scroll
            internally instead of pinning the tail out of reach. */}
        <nav className="w-52 shrink-0 hidden md:block md:sticky md:top-16 md:self-start md:max-h-[calc(100vh-140px)] md:overflow-y-auto">
          <div className="relative mb-4">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Search settings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-transparent border border-neutral-800 rounded-none text-sm text-white placeholder-neutral-500 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/10 focus:outline-none transition-colors ease-apple"
            />
          </div>
          <div className="flex flex-col gap-6">
            {filteredGroups.length === 0 && search.trim() && (
              <p className="px-3 text-xs text-neutral-500">No settings found</p>
            )}
            {filteredGroups.map((group) => (
              <div key={group.label}>
                <p className="px-3 mb-1 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                  {group.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {group.tabs.map((tab) => {
                    const active = pathname === tab.href
                    return (
                      <li key={tab.href}>
                        <Link
                          href={tab.href}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-none text-sm font-medium transition-colors duration-fast ease-apple ${
                            active
                              ? 'bg-brand-orange/10 text-brand-orange'
                              : 'text-neutral-400 hover:text-white hover:bg-white/[0.06]'
                          }`}
                        >
                          <tab.Icon
                            className="w-[18px] h-[18px] shrink-0"
                            weight={active ? 'fill' : 'regular'}
                          />
                          {tab.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-card p-6 border border-border">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

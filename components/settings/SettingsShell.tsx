'use client'

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
  CreditCard,
  Bell,
  ClockCounterClockwise,
  User,
  Lock,
  DeviceMobile,
} from '@phosphor-icons/react'
import { Select } from '@ciphera-net/ui'

// ─── Types ──────────────────────────────────────────────────────

type IconWeight = 'regular' | 'fill'

interface TabDef {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string; weight?: IconWeight }>
}

interface NavGroup {
  label: string
  tabs: TabDef[]
}

interface Props {
  siteId?: string
  children: React.ReactNode
}

// ─── Tab definitions ─────────────────────────────────────────────

const SITE_TABS: TabDef[] = [
  { id: 'general',      label: 'General',      Icon: GearSix },
  { id: 'goals',        label: 'Goals',        Icon: Target },
  { id: 'visibility',   label: 'Visibility',   Icon: Eye },
  { id: 'privacy',      label: 'Privacy',      Icon: ShieldCheck },
  { id: 'bot-spam',     label: 'Bot & Spam',   Icon: Robot },
  { id: 'privacy-scan', label: 'Privacy Scan', Icon: MagnifyingGlass },
  { id: 'reports',      label: 'Reports',      Icon: ChartBar },
  { id: 'integrations', label: 'Integrations', Icon: Plugs },
]

const WORKSPACE_TABS: TabDef[] = [
  { id: 'workspace',     label: 'General',       Icon: Buildings },
  { id: 'members',       label: 'Members',        Icon: UsersThree },
  { id: 'billing',       label: 'Billing',        Icon: CreditCard },
  { id: 'notifications', label: 'Notifications',  Icon: Bell },
  { id: 'audit',         label: 'Audit Log',      Icon: ClockCounterClockwise },
]

const ACCOUNT_TABS: TabDef[] = [
  { id: 'profile',  label: 'Profile',  Icon: User },
  { id: 'security', label: 'Security', Icon: Lock },
  { id: 'devices',  label: 'Devices',  Icon: DeviceMobile },
]

// ─── Helpers ─────────────────────────────────────────────────────

function buildHref(tabId: string, siteId?: string): string {
  if (siteId) return `/sites/${siteId}/settings/${tabId}`
  return `/settings/${tabId}`
}

function buildGroups(siteId?: string): NavGroup[] {
  const groups: NavGroup[] = []
  if (siteId) {
    groups.push({ label: 'Site', tabs: SITE_TABS })
  }
  groups.push({ label: 'Workspace', tabs: WORKSPACE_TABS })
  groups.push({ label: 'Account',   tabs: ACCOUNT_TABS })
  return groups
}

function buildAllTabs(siteId?: string): TabDef[] {
  if (siteId) return [...SITE_TABS, ...WORKSPACE_TABS, ...ACCOUNT_TABS]
  return [...WORKSPACE_TABS, ...ACCOUNT_TABS]
}

// ─── Page header ──────────────────────────────────────────────────

function resolvePageTitle(pathname: string, siteId?: string): { title: string; subtitle: string } {
  const all = buildAllTabs(siteId)
  const segment = pathname.split('/').pop() ?? ''
  const match = all.find(t => t.id === segment)
  if (!match) return { title: 'Settings', subtitle: '' }

  if (siteId && SITE_TABS.some(t => t.id === match.id)) {
    return { title: match.label, subtitle: 'Site settings' }
  }
  if (WORKSPACE_TABS.some(t => t.id === match.id)) {
    return { title: match.label, subtitle: 'Workspace settings' }
  }
  return { title: match.label, subtitle: 'Account settings' }
}

// ─── Component ───────────────────────────────────────────────────

export default function SettingsShell({ siteId, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const groups = buildGroups(siteId)
  const allTabs = buildAllTabs(siteId)
  const { title, subtitle } = resolvePageTitle(pathname, siteId)

  // Determine active tab by matching the last pathname segment
  const activeSegment = pathname.split('/').pop() ?? ''

  // Mobile select options
  const mobileOptions = allTabs.map(t => ({
    value: buildHref(t.id, siteId),
    label: t.label,
  }))
  const mobileValue = buildHref(activeSegment, siteId)

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8">
      {/* Page header */}
      <div className="mb-6">
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
        {/* Left nav */}
        <nav className="w-52 shrink-0 hidden md:block">
          <div className="flex flex-col gap-6">
            {groups.map(group => (
              <div key={group.label}>
                <p className="px-3 mb-1 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                  {group.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {group.tabs.map(tab => {
                    const href = buildHref(tab.id, siteId)
                    const active = activeSegment === tab.id
                    return (
                      <li key={tab.id}>
                        <Link
                          href={href}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-fast ease-apple ${
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
          <div className="glass-surface rounded-2xl p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

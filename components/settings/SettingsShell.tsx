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
  href: string
  Icon: React.ComponentType<{ className?: string; weight?: IconWeight }>
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
      { id: 'general',        label: 'General',       href: '/settings/site/general',        Icon: GearSix },
      { id: 'goals',          label: 'Goals',         href: '/settings/site/goals',          Icon: Target },
      { id: 'visibility',     label: 'Visibility',    href: '/settings/site/visibility',     Icon: Eye },
      { id: 'privacy',        label: 'Privacy',       href: '/settings/site/privacy',        Icon: ShieldCheck },
      { id: 'bot-spam',       label: 'Bot & Spam',    href: '/settings/site/bot-spam',       Icon: Robot },
      { id: 'privacy-scan',   label: 'Privacy Scan',  href: '/settings/site/privacy-scan',   Icon: MagnifyingGlass },
      { id: 'reports',        label: 'Reports',       href: '/settings/site/reports',        Icon: ChartBar },
      { id: 'integrations',   label: 'Integrations',  href: '/settings/site/integrations',   Icon: Plugs },
    ],
  },
  {
    label: 'Organization',
    tabs: [
      { id: 'general',       label: 'General',       href: '/settings/organization/general',       Icon: Buildings },
      { id: 'members',       label: 'Members',       href: '/settings/organization/members',       Icon: UsersThree },
      { id: 'billing',       label: 'Billing',       href: '/settings/organization/billing',       Icon: CreditCard },
      { id: 'notifications', label: 'Notifications', href: '/settings/organization/notifications', Icon: Bell },
      { id: 'audit',         label: 'Audit Log',     href: '/settings/organization/audit',         Icon: ClockCounterClockwise },
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

const ALL_TABS = NAV_GROUPS.flatMap((g) => g.tabs)

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

  // Mobile select options
  const mobileOptions = ALL_TABS.map((t) => ({ value: t.href, label: t.label }))
  const mobileValue = ALL_TABS.find((t) => pathname === t.href)?.href ?? ''

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
            {NAV_GROUPS.map((group) => (
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
                          className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-fast ease-apple ${
                            active
                              ? 'bg-brand-orange/10 text-brand-orange'
                              : 'text-neutral-400 hover:text-white hover:bg-white/[0.06]'
                          }`}
                        >
                          {active && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-brand-orange rounded-full" />
                          )}
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

import type { Icon } from '@phosphor-icons/react'
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
  BellRinging,
} from '@phosphor-icons/react'

/**
 * Settings navigation config — the ONE place the tab list and its icon
 * metaphors live. Shared by the desktop nav rail + mobile bottom-sheet
 * (`SettingsShell`) and the `/settings` landing page's section rows, so the
 * three surfaces can never drift apart.
 *
 * Kept dependency-free (icons + types only): the landing page imports this
 * without pulling the shell's framer-motion / context graph along.
 *
 * Icon treatment is the consumer's job (spec §2.1 + owner direction 18-07):
 * `weight="regular"`, w-4 h-4, muted — the active row's icon simply inherits
 * the row's orange with the text. Group band headers stay text-only.
 */

export type Section = 'site' | 'organization' | 'account'

export interface NavTab {
  label: string
  href: string
  /** Phosphor icon for the row (rail, sheet, landing tile). */
  icon: Icon
  /** Only visible when this permission is held. */
  requires?: string
}

export interface NavGroup {
  label: string
  section: Section
  tabs: NavTab[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Site',
    section: 'site',
    tabs: [
      { label: 'General', href: '/settings/site/general', icon: GearSix, requires: 'sites.edit' },
      { label: 'Goals', href: '/settings/site/goals', icon: Target, requires: 'goals.manage' },
      { label: 'Visibility', href: '/settings/site/visibility', icon: Eye, requires: 'sites.edit' },
      { label: 'Privacy', href: '/settings/site/privacy', icon: ShieldCheck, requires: 'sites.edit' },
      // Bot & Spam is viewable by anyone with quarantine.view; the tab gates
      // mutations on quarantine.manage internally.
      { label: 'Bot & Spam', href: '/settings/site/bot-spam', icon: Robot, requires: 'quarantine.view' },
      { label: 'Privacy Scan', href: '/settings/site/privacy-scan', icon: MagnifyingGlass, requires: 'privacy_scan.manage' },
      { label: 'Reports', href: '/settings/site/reports', icon: ChartBar, requires: 'reports.manage' },
      { label: 'Integrations', href: '/settings/site/integrations', icon: Plugs, requires: 'integrations.manage' },
    ],
  },
  {
    label: 'Organization',
    section: 'organization',
    tabs: [
      { label: 'General', href: '/settings/organization/general', icon: Buildings },
      { label: 'Members', href: '/settings/organization/members', icon: UsersThree, requires: 'team.view' },
      { label: 'Roles & Permissions', href: '/settings/organization/roles', icon: Key, requires: 'roles.manage' },
      { label: 'Billing', href: '/settings/organization/billing', icon: CreditCard, requires: 'billing.view' },
      { label: 'Notifications', href: '/settings/organization/notifications', icon: Bell, requires: 'notification_settings.manage' },
      { label: 'Audit Log', href: '/settings/organization/audit', icon: ClockCounterClockwise, requires: 'audit.view' },
    ],
  },
  {
    label: 'Account',
    section: 'account',
    tabs: [
      { label: 'Profile', href: '/settings/account/profile', icon: User },
      { label: 'Security', href: '/settings/account/security', icon: Lock },
      { label: 'Devices', href: '/settings/account/devices', icon: DeviceMobile },
      // BellRinging, deliberately distinct from the org tab's Bell.
      { label: 'Notifications', href: '/settings/account/notifications', icon: BellRinging },
    ],
  },
]

/**
 * href → icon lookup, derived from NAV_GROUPS (never a second table). The
 * landing page keys its section rows by the same hrefs.
 */
export const SETTINGS_TAB_ICONS: Record<string, Icon> = Object.fromEntries(
  NAV_GROUPS.flatMap((group) => group.tabs.map((tab) => [tab.href, tab.icon])),
)

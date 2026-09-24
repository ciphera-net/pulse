import type { Icon } from '@phosphor-icons/react'
import {
  GearSix,
  Target,
  Eye,
  ShieldCheck,
  Robot,
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
  EnvelopeSimple,
  Terminal,
  Heartbeat,
} from '@phosphor-icons/react'
import { McpIcon } from '@/components/icons/McpIcon'

/**
 * Settings navigation config — the ONE place the tab list, its icon
 * metaphors and its one-line descriptions live. Shared by the desktop nav
 * rail + mobile bottom-sheet (`SettingsShell`) and the `/settings` landing
 * page's section rows, so the three surfaces can never drift apart. (The
 * landing page used to carry its own copy of the descriptions and had already
 * lost a tab — API Keys — by the time the rail started showing them too.)
 *
 * Kept dependency-free (icons + types only): the landing page imports this
 * without pulling the shell's framer-motion / context graph along.
 *
 * Icon treatment is the consumer's job: `weight="regular"`, w-4 h-4, muted —
 * the active row's icon simply inherits the row's orange with the text.
 *
 * Descriptions are the rail's second line (owner pick A6, 16-09-2026). They
 * have to fit two lines at the rail's 224px, so they are short and end with a
 * full stop; `nav.test.ts` pins both.
 */

export type Section = 'site' | 'organization' | 'account'

export interface NavTab {
  label: string
  href: string
  /** One line, under the label, in the rail and on the landing page. */
  description: string
  /** Phosphor icon for the row (rail, sheet, landing tile). */
  icon: Icon
  /** Only visible when this permission is held. */
  requires?: string
  /**
   * A short marker beside the label, such as "New" (MCP, owner 24-09-2026). Drawn as Facet's
   * neutral Badge: no colour, because colour lives in a dot or a single word, never on a surface.
   */
  badge?: string
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
      { label: 'General', href: '/settings/site/general', description: 'Name, domain, timezone, tracking script.', icon: GearSix, requires: 'sites.edit' },
      { label: 'Goals', href: '/settings/site/goals', description: 'Conversions and key actions.', icon: Target, requires: 'goals.manage' },
      { label: 'Visibility', href: '/settings/site/visibility', description: 'Public dashboard and share links.', icon: Eye, requires: 'sites.edit' },
      { label: 'Privacy', href: '/settings/site/privacy', description: 'Collection and retention.', icon: ShieldCheck, requires: 'sites.edit' },
      // Bot & Spam is viewable by every member (the server authorises reads on
      // membership); the tab gates mutations on quarantine.manage internally.
      { label: 'Bot & Spam', href: '/settings/site/bot-spam', description: 'Filtering and excluded traffic.', icon: Robot },
      // Heartbeat — the uptime instrument's own glyph (app/sites/[id]/uptime),
      // promoted to the tab that gathers what Pulse watches on a site. Visible
      // to every member like Bot & Spam: the panels are read surfaces, and the
      // one mutation (enable/disable uptime) gates on uptime.manage inside.
      { label: 'Monitoring', href: '/settings/site/monitoring', description: 'Uptime and install health.', icon: Heartbeat },
      { label: 'Integrations', href: '/settings/site/integrations', description: 'Search Console and Bunny CDN.', icon: Plugs, requires: 'integrations.manage' },
    ],
  },
  {
    label: 'Organization',
    section: 'organization',
    tabs: [
      { label: 'General', href: '/settings/organization/general', description: 'Workspace name and slug.', icon: Buildings },
      { label: 'Members', href: '/settings/organization/members', description: 'Invite and manage your team.', icon: UsersThree },
      { label: 'Roles & Permissions', href: '/settings/organization/roles', description: 'What each role can access.', icon: Key, requires: 'roles.manage' },
      { label: 'Billing', href: '/settings/organization/billing', description: 'Plan, usage and invoices.', icon: CreditCard, requires: 'billing.view' },
      // * Terminal, not Key — Key is already the Roles metaphor, and an API key is
      // * a developer-surface credential rather than a permissions concept.
      { label: 'API Keys', href: '/settings/organization/api-keys', description: 'Read your analytics programmatically.', icon: Terminal, requires: 'integrations.manage' },
      // * MCP (PULSE-54, owner 24-09-2026): set up an assistant, then see what is connected.
      // * It was "Connected apps" at /connected-apps until the owner renamed it; that slug redirects.
      { label: 'MCP', href: '/settings/organization/mcp', description: 'Connect Claude, ChatGPT and other assistants.', icon: McpIcon, requires: 'integrations.manage', badge: 'New' },
      { label: 'Audit Log', href: '/settings/organization/audit', description: 'Workspace activity.', icon: ClockCounterClockwise, requires: 'audit.view' },
    ],
  },
  {
    label: 'Account',
    section: 'account',
    tabs: [
      { label: 'Profile', href: '/settings/account/profile', description: 'Display name and email.', icon: User },
      { label: 'Security', href: '/settings/account/security', description: 'Password, two-factor and passkeys.', icon: Lock },
      { label: 'Devices', href: '/settings/account/devices', description: 'Trusted devices and security activity.', icon: DeviceMobile },
      // BellRinging, deliberately distinct from the org tab's Bell.
      { label: 'Notifications', href: '/settings/account/notifications', description: 'Which categories email you.', icon: BellRinging },
      // EnvelopeSimple, not a third bell: these are the emails Ciphera ID sends
      // about the ACCOUNT, a different system from Pulse's own notifications.
      { label: 'Security alerts', href: '/settings/account/security-alerts', description: 'Emails Ciphera ID sends about your account.', icon: EnvelopeSimple },
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

/** The section a settings pathname belongs to, or null on the landing page. */
export function sectionOf(pathname: string): Section | null {
  if (pathname.startsWith('/settings/site')) return 'site'
  if (pathname.startsWith('/settings/organization')) return 'organization'
  if (pathname.startsWith('/settings/account')) return 'account'
  return null
}

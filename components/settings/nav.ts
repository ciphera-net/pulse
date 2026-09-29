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
  DownloadSimple,
} from '@phosphor-icons/react'
import { McpIcon } from '@/components/icons/McpIcon'
import type { TeamState } from '@/lib/hooks/useTeamState'

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
  /**
   * Listed only while this runtime condition holds, decided by the server rather than
   * by a permission. `import_available`: the Import tab exists only where the site can
   * import (GET …/data-imports/sources answers 200 with a source, design §3.10b M11-b),
   * so it stays out of every list while imports are off.
   */
  when?: NavCondition
}

/** A runtime condition a tab can depend on. Every list that shows tabs passes each one's state. */
export type NavCondition = 'import_available'

export interface NavGroup {
  label: string
  section: Section
  tabs: NavTab[]
}

const SITE_TABS: NavTab[] = [
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
  // Import (PULSE-118, owner ruling Q-M11): no `requires`, because every member
  // reads an import's status (§3.9); the write controls gate on
  // integrations.manage inside the tab. Listed only where imports exist.
  { label: 'Import', href: '/settings/site/import', description: 'Bring history from another tool.', icon: ClockCounterClockwise, when: 'import_available' },
  // Export (PULSE-132, design §5.1): Import's mirror image, so it sits right
  // after it. Gated on analytics.export, the permission the download itself
  // needs; a viewer never sees it.
  { label: 'Export', href: '/settings/site/export', description: 'Download data and share reports.', icon: DownloadSimple, requires: 'analytics.export' },
]

// * The organization's tabs, one object each so both groupings share them.
// * 🔴 HREFS NEVER CHANGE: /settings/organization/mcp is a published URL, and
// * the alone grouping lists some of these under Account at the same address.
const ORG_GENERAL: NavTab = { label: 'General', href: '/settings/organization/general', description: 'Team name and slug.', icon: Buildings }
const ORG_MEMBERS: NavTab = { label: 'Members', href: '/settings/organization/members', description: 'Invite and manage your team.', icon: UsersThree }
const ORG_ROLES: NavTab = { label: 'Roles & Permissions', href: '/settings/organization/roles', description: 'What each role can access.', icon: Key, requires: 'roles.manage' }
const ORG_BILLING: NavTab = { label: 'Billing', href: '/settings/organization/billing', description: 'Plan, usage and invoices.', icon: CreditCard, requires: 'billing.view' }
// * Terminal, not Key — Key is already the Roles metaphor, and an API key is
// * a developer-surface credential rather than a permissions concept.
const ORG_API_KEYS: NavTab = { label: 'API Keys', href: '/settings/organization/api-keys', description: 'Read your analytics programmatically.', icon: Terminal, requires: 'integrations.manage' }
// * MCP (PULSE-54, owner 24-09-2026): set up an assistant, then see what is connected.
// * It was "Connected apps" at /connected-apps until the owner renamed it; that slug redirects.
const ORG_MCP: NavTab = { label: 'MCP', href: '/settings/organization/mcp', description: 'Connect Claude, ChatGPT and other assistants.', icon: McpIcon, requires: 'integrations.manage', badge: 'New' }
const ORG_AUDIT: NavTab = { label: 'Audit Log', href: '/settings/organization/audit', description: 'Team activity.', icon: ClockCounterClockwise, requires: 'audit.view' }

/**
 * The Members page as a person who works alone sees it (option B1): the way
 * to a team is inviting somebody, at the Members route.
 */
const INVITE_PEOPLE: NavTab = { label: 'Invite people', href: '/settings/organization/members', description: 'Share your sites with others.', icon: UsersThree }

const ACCOUNT_TABS: NavTab[] = [
  { label: 'Profile', href: '/settings/account/profile', description: 'Display name and email.', icon: User },
  { label: 'Security', href: '/settings/account/security', description: 'Password, two-factor and passkeys.', icon: Lock },
  { label: 'Devices', href: '/settings/account/devices', description: 'Trusted devices and security activity.', icon: DeviceMobile },
  // BellRinging, deliberately distinct from the org tab's Bell.
  { label: 'Notifications', href: '/settings/account/notifications', description: 'Which categories email you.', icon: BellRinging },
  // EnvelopeSimple, not a third bell: these are the emails Ciphera ID sends
  // about the ACCOUNT, a different system from Pulse's own notifications.
  { label: 'Security alerts', href: '/settings/account/security-alerts', description: 'Emails Ciphera ID sends about your account.', icon: EnvelopeSimple },
]

/**
 * TEAM (and not-known-yet) grouping: Site, Team, Account. Team is today's
 * seven organization tabs; the owner named the container a team (W1).
 */
const TEAM_GROUPS: NavGroup[] = [
  { label: 'Site', section: 'site', tabs: SITE_TABS },
  {
    label: 'Team',
    section: 'organization',
    tabs: [ORG_GENERAL, ORG_MEMBERS, ORG_ROLES, ORG_BILLING, ORG_API_KEYS, ORG_MCP, ORG_AUDIT],
  },
  { label: 'Account', section: 'account', tabs: ACCOUNT_TABS },
]

/**
 * ALONE grouping (option B1, owner 25-09-2026): Site and Account. Billing, API
 * keys and MCP are simply the person's own, so they sit under Account, and
 * "Invite people" is the way to a team. The team's name, roles and audit log
 * are not listed; their routes still render, under Account (`sectionOf`).
 */
const ALONE_GROUPS: NavGroup[] = [
  { label: 'Site', section: 'site', tabs: SITE_TABS },
  {
    label: 'Account',
    section: 'account',
    tabs: [...ACCOUNT_TABS, ORG_BILLING, ORG_API_KEYS, ORG_MCP, INVITE_PEOPLE],
  },
]

/**
 * The settings navigation for a team state (PULSE-59). Every surface that
 * lists settings (the rail, the mobile sheet, the landing page) calls this
 * with the ONE team-state signal (lib/hooks/useTeamState.ts). null, "not
 * known yet or the lookup failed", gets the team grouping: a failure must
 * never hide team settings from a team.
 */
export function navGroups(state: TeamState | null): NavGroup[] {
  return state === 'alone' ? ALONE_GROUPS : TEAM_GROUPS
}

/**
 * Whether one tab is listed: its permission is held (an unknown permission stays
 * listed, as it always has) and its runtime condition, if it has one, holds. A
 * condition that has not been answered yet is false: a tab never flashes into a
 * list and back out.
 */
export function tabIsVisible(
  tab: NavTab,
  perm: Record<string, boolean>,
  conditions: Partial<Record<NavCondition, boolean>>,
): boolean {
  if (tab.requires && !(perm[tab.requires] ?? true)) return false
  if (tab.when && conditions[tab.when] !== true) return false
  return true
}

/** Every tab either grouping can list, each href once. */
const ALL_TABS: NavTab[] = [...SITE_TABS, ...TEAM_GROUPS[1].tabs, ...ACCOUNT_TABS]

/**
 * href → icon lookup, derived from the registry (never a second table). The
 * landing page keys its section rows by the same hrefs.
 */
export const SETTINGS_TAB_ICONS: Record<string, Icon> = Object.fromEntries(
  ALL_TABS.map((tab) => [tab.href, tab.icon]),
)

/**
 * The tab a pathname shows, looked up in the grouping first (so an alone
 * person's Members page is "Invite people"), then in every tab, so a route the
 * grouping does not list still has a name in the header.
 */
export function tabFor(pathname: string, groups: NavGroup[]): NavTab | undefined {
  return (
    groups.flatMap((g) => g.tabs).find((t) => t.href === pathname) ??
    ALL_TABS.find((t) => t.href === pathname)
  )
}

/**
 * The section a settings pathname belongs to, or null on the landing page.
 * For somebody alone there is no organization section: every organization
 * route, listed or not, renders under Account. Hrefs never change, so a route
 * the alone grouping does not list (a bookmark, a redirect) is never a dead
 * link.
 */
export function sectionOf(pathname: string, state: TeamState | null = null): Section | null {
  if (pathname.startsWith('/settings/site')) return 'site'
  if (pathname.startsWith('/settings/organization')) return state === 'alone' ? 'account' : 'organization'
  if (pathname.startsWith('/settings/account')) return 'account'
  return null
}

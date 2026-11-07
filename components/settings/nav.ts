import type { Icon } from '@phosphor-icons/react'
import {
  BellRinging,
  Code,
  CreditCard,
  Database,
  GearSix,
  ShareNetwork,
  ShieldCheck,
  Target,
  UserCircle,
  UsersThree,
} from '@phosphor-icons/react'

/**
 * Settings navigation: ONE list of ten pages (settings overhaul, rulings R1–R4 and R41, 05/06-11-2026; record
 * Pulse/docs/plans/05-11-2026-settings-overhaul-plan.md). There are no Site / Team / Account scopes any more: the
 * five site pages name their site in the header (with a picker when the team has more than one), and the rest are
 * the team's and your own. Everyone gets the same list, whether they work alone or in a team.
 *
 * The ONE place the pages, their icons and their one-line descriptions live: the desktop rail, the mobile sheet and
 * the breadcrumb all read it. Kept dependency-free (icons and types only).
 *
 * Icon treatment is the consumer's job: `weight="regular"`, w-4 h-4, muted; the current row's icon inherits the
 * row's orange with the text. Descriptions are the rail's second line and fit two lines at its 224 px.
 */

export type SettingsPageKey =
  | 'general' | 'goals' | 'sharing' | 'privacy' | 'data'
  | 'team' | 'billing' | 'developers' | 'account' | 'notifications'

export interface SettingsPage {
  key: SettingsPageKey
  label: string
  /**
   * The page's route: today's route that carries most of its content. 🔴 Routes never change: emails already sent
   * link to billing, api-keys and notifications (Iris), and docs and bookmarks link to the rest.
   */
  href: string
  /** One line, under the label, in the rail and the mobile sheet. */
  description: string
  icon: Icon
  /** A site page: its header names the active site instead of "Settings". */
  site: boolean
  /** Listed only while this permission is held. A page opened by its address says why it is closed. */
  requires?: string
  /**
   * Today's other routes this page takes in. Each shows this page's row as current, and redirects here once its
   * content has moved into the page.
   */
  absorbs: string[]
}

export const SETTINGS_PAGES: SettingsPage[] = [
  { key: 'general', label: 'General', href: '/settings/site/general', description: "Your site's name, timezone and tracking script.", icon: GearSix, site: true, requires: 'sites.edit', absorbs: ['/settings/site/monitoring', '/settings/site/bot-spam'] },
  { key: 'goals', label: 'Goals', href: '/settings/site/goals', description: 'The events you count as goals.', icon: Target, site: true, requires: 'goals.manage', absorbs: [] },
  // Members read Sharing's two lists and download the PDFs, with no buttons that make or delete (R23).
  { key: 'sharing', label: 'Sharing', href: '/settings/site/visibility', description: 'Your public dashboard, growth reports and scheduled emails.', icon: ShareNetwork, site: true, absorbs: [] },
  { key: 'privacy', label: 'Privacy', href: '/settings/site/privacy', description: 'Visitor views, how long data is kept, and text for your privacy policy.', icon: ShieldCheck, site: true, requires: 'sites.edit', absorbs: [] },
  // Members read an import's status here (R23, carried over in round 6); the services stay with owners and admins.
  { key: 'data', label: 'Data', href: '/settings/site/integrations', description: 'Search Console, Bing, Bunny CDN, imports and exports.', icon: Database, site: true, absorbs: ['/settings/site/import', '/settings/site/export'] },
  { key: 'team', label: 'Team', href: '/settings/organization/members', description: "Your team's name, people, beta features and activity.", icon: UsersThree, site: false, absorbs: ['/settings/organization/general', '/settings/organization/roles', '/settings/organization/beta', '/settings/organization/audit'] },
  { key: 'billing', label: 'Billing', href: '/settings/organization/billing', description: 'Your plan, events, invoices and payment.', icon: CreditCard, site: false, requires: 'billing.view', absorbs: [] },
  { key: 'developers', label: 'Developers', href: '/settings/organization/api-keys', description: 'API keys and AI assistants that read your stats.', icon: Code, site: false, requires: 'integrations.manage', absorbs: ['/settings/organization/mcp'] },
  { key: 'account', label: 'Account', href: '/settings/account/profile', description: 'Your profile, sign-in and devices.', icon: UserCircle, site: false, absorbs: ['/settings/account/security', '/settings/account/devices'] },
  // Its own page since R41 ("move all email/notifications to a seperate tab"), on today's route.
  { key: 'notifications', label: 'Notifications', href: '/settings/account/notifications', description: 'Which emails you get.', icon: BellRinging, site: false, absorbs: [] },
]

/**
 * The pages one person sees: each one's permission is held. An unknown permission keeps its page listed, as the old
 * registry did, so a permission lookup that fails never hides a page from somebody who can use it.
 */
export function pagesVisibleTo(perm: Record<string, boolean>): SettingsPage[] {
  return SETTINGS_PAGES.filter((p) => !p.requires || (perm[p.requires] ?? true))
}

/** The page a settings pathname shows: its own route, or a route it takes in. Undefined anywhere else. */
export function pageFor(pathname: string): SettingsPage | undefined {
  return SETTINGS_PAGES.find((p) => p.href === pathname || p.absorbs.includes(pathname))
}

/**
 * Where `/settings` lands among the pages a person sees: the first one, or, for a team with no sites yet, the first
 * that is not a site's (a site page has nothing to show until there is a site).
 */
export function landingPage(pages: SettingsPage[], hasSites: boolean): SettingsPage | undefined {
  return hasSites ? pages[0] : pages.find((p) => !p.site) ?? pages[0]
}

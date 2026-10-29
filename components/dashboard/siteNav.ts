import { CardsThree as CardsThreeIcon, Gauge as GaugeIcon, UsersThree as UsersThreeIcon } from '@phosphor-icons/react'
import { CloudUploadIcon, FunnelIcon, HeartbeatIcon, LayoutDashboardIcon, PathIcon, SearchIcon, SettingsIcon } from '@ciphera-net/facet'
import type { SitePage } from '@/lib/scope/SiteScope'

/**
 * The site rail's navigation: ONE definition, read by the member sidebar, by the public
 * sidebar (/demo and /share/<id>, PUL-34) and by the public top bar's breadcrumb, so a page
 * is called and drawn the same way everywhere it is listed.
 *
 * `page` is what makes an item public: the public sidebar lists exactly the items whose page
 * its scope shares, in this order and under these headings. Visitors and Site Settings carry
 * none, so no public scope can list them.
 */

export type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'

export interface NavItem {
  label: string
  href: (siteId: string) => string
  icon: React.ComponentType<{ className?: string; weight?: IconWeight }>
  matchPrefix?: boolean
  /**
   * The path the active rule matches on, when it differs from where the link
   * GOES. Settings needs both: the href carries ?siteId= so the destination
   * knows which site, while the match has to be the bare route prefix.
   */
  matchHref?: (siteId: string) => string
  /** The shareable page this item opens. Absent for Visitors and Site Settings, which are never public. */
  page?: SitePage
}

export interface NavGroup { label: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Analytics',
    items: [
      { label: 'Dashboard', href: (id) => `/sites/${id}`, icon: LayoutDashboardIcon, page: 'dashboard' },
      { label: 'Pages', href: (id) => `/sites/${id}/pages`, icon: CardsThreeIcon, matchPrefix: true, page: 'pages' },
      { label: 'Journeys', href: (id) => `/sites/${id}/journeys`, icon: PathIcon, matchPrefix: true, page: 'journeys' },
      { label: 'Visitors', href: (id) => `/sites/${id}/visitors`, icon: UsersThreeIcon, matchPrefix: true },
      { label: 'Funnels', href: (id) => `/sites/${id}/funnels`, icon: FunnelIcon, matchPrefix: true, page: 'funnels' },
      { label: 'Search', href: (id) => `/sites/${id}/search`, icon: SearchIcon, matchPrefix: true, page: 'search' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { label: 'CDN', href: (id) => `/sites/${id}/cdn`, icon: CloudUploadIcon, matchPrefix: true, page: 'cdn' },
      { label: 'Uptime', href: (id) => `/sites/${id}/uptime`, icon: HeartbeatIcon, matchPrefix: true, page: 'uptime' },
      { label: 'Performance', href: (id) => `/sites/${id}/performance`, icon: GaugeIcon, matchPrefix: true, page: 'performance' },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = {
  // Carry the CURRENT site into settings — ActiveSiteProvider adopts the
  // ?siteId= deep link; without it, settings opened on whatever site was
  // stored (or the org's first site) instead of the one being viewed.
  //
  // 🔴 The href can never be the match target: usePathname() returns the path
  // WITHOUT the query, so `pathname.startsWith('/settings/site/general?siteId=…')`
  // was false on every settings tab and this entry could not light up anywhere.
  // Match the bare section instead, so every tab under /settings/site is "here".
  // (Written without a trailing glob on purpose: sidebar-highlight.test.tsx
  // strips block comments before line comments, so a `/` + `*` anywhere in a
  // line comment opens a comment that swallows the rest of this file.)
  label: 'Site Settings',
  href: (id) => `/settings/site/general?siteId=${id}`,
  matchHref: () => '/settings/site',
  icon: SettingsIcon,
  matchPrefix: true,
}

/** The nav item of a shareable page. Every page has one: the parity test holds the list to it. */
export function navItemForPage(page: SitePage): NavItem {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((candidate) => candidate.page === page)
    if (item) return item
  }
  throw new Error(`siteNav: no navigation item for the page "${page}"`)
}

/** The groups a public scope lists: the member groups, kept in order, with only the pages it shares. */
export function publicNavGroups(pages: readonly SitePage[]): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => item.page !== undefined && pages.includes(item.page)),
  })).filter((group) => group.items.length > 0)
}

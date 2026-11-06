// nav.ts is the ONE registry behind the rail, the mobile sheet and the breadcrumb: one list of ten pages (settings
// overhaul R1–R4 and R41). These pin what would otherwise drift: the order and the words of the list, the routes that
// emails, docs and bookmarks already point at, which route each page takes in, who sees which page, and where
// `/settings` lands.
import { describe, it, expect } from 'vitest'
import { SETTINGS_PAGES, landingPage, pageFor, pagesVisibleTo } from '@/components/settings/nav'

const ALL = { 'sites.edit': true, 'goals.manage': true, 'billing.view': true, 'integrations.manage': true }
// The member role's two permissions are analytics.export and billing.view (R1).
const MEMBER = { 'sites.edit': false, 'goals.manage': false, 'billing.view': true, 'integrations.manage': false }

describe('settings registry: one list of ten pages', () => {
  it('lists the ten pages in the decided order, the same for everyone', () => {
    expect(SETTINGS_PAGES.map((p) => p.label)).toEqual([
      'General', 'Goals', 'Sharing', 'Privacy', 'Data', 'Team', 'Billing', 'Developers', 'Account', 'Notifications',
    ])
    expect(new Set(SETTINGS_PAGES.map((p) => p.key)).size).toBe(10)
  })

  it('keeps each page on today\'s route, so links already sent and published keep working', () => {
    expect(Object.fromEntries(SETTINGS_PAGES.map((p) => [p.key, p.href]))).toEqual({
      general: '/settings/site/general',
      goals: '/settings/site/goals',
      sharing: '/settings/site/visibility',
      privacy: '/settings/site/privacy',
      data: '/settings/site/integrations',
      team: '/settings/organization/members',
      billing: '/settings/organization/billing',
      developers: '/settings/organization/api-keys',
      account: '/settings/account/profile',
      notifications: '/settings/account/notifications',
    })
  })

  it('marks the five site pages, and only those', () => {
    expect(SETTINGS_PAGES.filter((p) => p.site).map((p) => p.key)).toEqual(['general', 'goals', 'sharing', 'privacy', 'data'])
    for (const p of SETTINGS_PAGES) expect(p.href.startsWith('/settings/site/'), p.key).toBe(p.site)
  })

  it('gives every one of today\'s merged routes to exactly one page, never a page\'s own route', () => {
    const absorbed = SETTINGS_PAGES.flatMap((p) => p.absorbs)
    expect(new Set(absorbed).size).toBe(absorbed.length)
    const hrefs = new Set(SETTINGS_PAGES.map((p) => p.href))
    for (const route of absorbed) expect(hrefs.has(route), route).toBe(false)
    expect(absorbed.sort()).toEqual([
      '/settings/account/devices', '/settings/account/security',
      '/settings/organization/audit', '/settings/organization/beta', '/settings/organization/general',
      '/settings/organization/mcp', '/settings/organization/roles',
      '/settings/site/bot-spam', '/settings/site/export', '/settings/site/import', '/settings/site/monitoring',
    ])
  })

  it('names a route by its page, its own or one it takes in', () => {
    expect(pageFor('/settings/site/monitoring')?.key).toBe('general')
    expect(pageFor('/settings/site/export')?.key).toBe('data')
    expect(pageFor('/settings/organization/mcp')?.key).toBe('developers')
    expect(pageFor('/settings/organization/audit')?.key).toBe('team')
    expect(pageFor('/settings/account/devices')?.key).toBe('account')
    expect(pageFor('/settings/account/notifications')?.key).toBe('notifications')
    expect(pageFor('/settings')).toBeUndefined()
    expect(pageFor('/settings/account/nope')).toBeUndefined()
    expect(pageFor('/sites/abc')).toBeUndefined()
  })

  it('shows an owner or admin all ten, and a member the six a member can use', () => {
    expect(pagesVisibleTo(ALL)).toHaveLength(10)
    // Sharing and Data stay for members: they read the reports and an import's status (R23).
    expect(pagesVisibleTo(MEMBER).map((p) => p.key)).toEqual(['sharing', 'data', 'team', 'billing', 'account', 'notifications'])
  })

  it('keeps a page listed when its permission is unknown: a failed lookup never hides a page', () => {
    expect(pagesVisibleTo({}).map((p) => p.key)).toEqual(SETTINGS_PAGES.map((p) => p.key))
  })

  it('lands /settings on the first page, or the first that is not a site\'s when there are no sites', () => {
    expect(landingPage(pagesVisibleTo(ALL), true)?.key).toBe('general')
    expect(landingPage(pagesVisibleTo(ALL), false)?.key).toBe('team')
    expect(landingPage(pagesVisibleTo(MEMBER), true)?.key).toBe('sharing')
    expect(landingPage(pagesVisibleTo(MEMBER), false)?.key).toBe('team')
    expect(landingPage([], true)).toBeUndefined()
  })

  it('gives every page a one-line description that fits the rail', () => {
    for (const p of SETTINGS_PAGES) {
      expect(p.description, p.key).toMatch(/\.$/)
      // Two lines of text-xs at 224 px minus the icon column hold ~48 characters; Privacy's runs to a third line in
      // the approved drawing, and nothing longer.
      expect(p.description.length, p.key).toBeLessThanOrEqual(72)
      expect(p.description.length, p.key).toBeGreaterThan(8)
    }
  })

  it('carries no em or en dashes and no ellipsis-as-dots anywhere in its copy', () => {
    for (const p of SETTINGS_PAGES) {
      expect(`${p.label} ${p.description}`).not.toMatch(/[—–]|\.\.\./)
    }
  })
})

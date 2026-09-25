// nav.ts is the ONE registry behind the rail, the mobile sheet and the landing
// page. These pin what a second table would let drift: every tab has a
// description short enough for the rail's second line, the copy carries none
// of the machine tells the overhaul removed, and the landing page reads the
// registry rather than keeping its own list (which is how it lost API Keys).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { navGroups, SETTINGS_TAB_ICONS, sectionOf, tabFor } from '@/components/settings/nav'

const TEAM = navGroups('team')
const ALONE = navGroups('alone')
const tabs = TEAM.flatMap((g) => g.tabs)
// Every row either grouping can show (the alone grouping adds "Invite people").
const allRows = [...tabs, ...ALONE.flatMap((g) => g.tabs)]

describe('settings nav registry', () => {
  it('has three scopes for a team, seven / seven / five tabs, the middle one named Team', () => {
    // Workspace lost its Notifications tab on 21-09-2026 (ruling D7): there
    // was no workspace-level setting behind it. It gained Connected apps on
    // 24-09-2026 (PULSE-41), renamed MCP the same day (PULSE-54). The owner
    // named the container a team on 25-09-2026 (PULSE-59, W1).
    expect(TEAM.map((g) => [g.section, g.label, g.tabs.length])).toEqual([
      ['site', 'Site', 7], ['organization', 'Team', 7], ['account', 'Account', 5],
    ])
  })

  it('is the team grouping while the state is unknown: a failure never hides team settings', () => {
    expect(navGroups(null)).toEqual(TEAM)
  })

  it('has two scopes for somebody alone: Site, and Account with billing, keys, MCP and Invite people (B1)', () => {
    expect(ALONE.map((g) => [g.section, g.label])).toEqual([['site', 'Site'], ['account', 'Account']])
    const account = ALONE.find((g) => g.section === 'account')!
    expect(account.tabs.map((t) => t.label)).toEqual([
      'Profile', 'Security', 'Devices', 'Notifications', 'Security alerts',
      'Billing', 'API Keys', 'MCP', 'Invite people',
    ])
    const invite = account.tabs.find((t) => t.label === 'Invite people')!
    expect(invite.href).toBe('/settings/organization/members')
    expect(invite.description).toBe('Share your sites with others.')
    // The team's name, roles and audit log are not listed when alone.
    const hrefs = account.tabs.map((t) => t.href)
    for (const hidden of ['/settings/organization/general', '/settings/organization/roles', '/settings/organization/audit']) {
      expect(hrefs).not.toContain(hidden)
    }
    // And nothing in it says team, workspace or organization except the way in.
    for (const tab of ALONE.flatMap((g) => g.tabs)) {
      expect(`${tab.label} ${tab.description}`, tab.href).not.toMatch(/team|workspace|organi[sz]ation/i)
    }
  })

  it('never changes an href between the two groupings', () => {
    const teamHrefs = new Set(tabs.map((t) => t.href))
    for (const tab of ALONE.flatMap((g) => g.tabs)) expect(teamHrefs.has(tab.href), tab.href).toBe(true)
    // /settings/organization/mcp is a published URL.
    expect(ALONE.flatMap((g) => g.tabs).some((t) => t.href === '/settings/organization/mcp')).toBe(true)
  })

  it('words the Team rows for a team', () => {
    const team = TEAM.find((g) => g.section === 'organization')!
    const byLabel = Object.fromEntries(team.tabs.map((t) => [t.label, t.description]))
    expect(byLabel['General']).toBe('Team name and slug.')
    expect(byLabel['Members']).toBe('Invite and manage your team.')
    expect(byLabel['Audit Log']).toBe('Team activity.')
    for (const tab of team.tabs) expect(tab.description, tab.href).not.toMatch(/workspace|organi[sz]ation/i)
  })

  it('names the MCP page MCP, marks it New, and gates it like API keys', () => {
    const mcp = tabs.find((t) => t.href === '/settings/organization/mcp')
    expect(mcp?.label).toBe('MCP')
    expect(mcp?.badge).toBe('New')
    expect(mcp?.requires).toBe('integrations.manage')
    expect(tabs.some((t) => t.href.endsWith('/connected-apps'))).toBe(false)
  })

  it('gives every tab a one-line description that fits the rail', () => {
    for (const tab of allRows) {
      expect(tab.description, tab.href).toMatch(/\.$/)
      // Two lines of text-xs at 224px minus the icon column: ~48 characters.
      expect(tab.description.length, tab.href).toBeLessThanOrEqual(48)
      expect(tab.description.length, tab.href).toBeGreaterThan(8)
    }
  })

  it('carries no em or en dashes and no ellipsis-as-dots anywhere in its copy', () => {
    for (const tab of allRows) {
      expect(`${tab.label} ${tab.description}`).not.toMatch(/[—–]|\.\.\./)
    }
  })

  it('keys icons by href, one per tab', () => {
    expect(Object.keys(SETTINGS_TAB_ICONS).sort()).toEqual(tabs.map((t) => t.href).sort())
  })

  it('maps a pathname to its scope', () => {
    expect(sectionOf('/settings/site/goals')).toBe('site')
    expect(sectionOf('/settings/organization/billing')).toBe('organization')
    expect(sectionOf('/settings/organization/billing', 'team')).toBe('organization')
    expect(sectionOf('/settings/organization/billing', null)).toBe('organization')
    expect(sectionOf('/settings/account/security-alerts')).toBe('account')
    expect(sectionOf('/settings')).toBeNull()
    expect(sectionOf('/sites/abc')).toBeNull()
  })

  it('puts every organization route under Account for somebody alone, listed or not', () => {
    for (const tab of ['billing', 'members', 'api-keys', 'mcp', 'general', 'roles', 'audit']) {
      expect(sectionOf(`/settings/organization/${tab}`, 'alone'), tab).toBe('account')
    }
    expect(sectionOf('/settings/site/goals', 'alone')).toBe('site')
  })

  it('names a route by the grouping first, then by any tab', () => {
    expect(tabFor('/settings/organization/members', ALONE)?.label).toBe('Invite people')
    expect(tabFor('/settings/organization/members', TEAM)?.label).toBe('Members')
    // Unlisted when alone, still named.
    expect(tabFor('/settings/organization/roles', ALONE)?.label).toBe('Roles & Permissions')
    expect(tabFor('/settings/organization/nope', ALONE)).toBeUndefined()
  })

  it('is the landing page\'s only source of rows', () => {
    const source = readFileSync(join(process.cwd(), 'app/settings/page.tsx'), 'utf8')
    expect(source).toContain("from '@/components/settings/nav'")
    expect(source).toContain('navGroups(teamState)')
    // The three hand-kept tables the page used to carry.
    expect(source).not.toMatch(/SITE_ROWS|ORG_ROWS|ACCOUNT_ROWS/)
    expect(source).not.toMatch(/description: '/)
  })
})

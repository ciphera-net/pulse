// nav.ts is the ONE registry behind the rail, the mobile sheet and the landing
// page. These pin what a second table would let drift: every tab has a
// description short enough for the rail's second line, the copy carries none
// of the machine tells the overhaul removed, and the landing page reads the
// registry rather than keeping its own list (which is how it lost API Keys).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NAV_GROUPS, SETTINGS_TAB_ICONS, sectionOf } from '@/components/settings/nav'

const tabs = NAV_GROUPS.flatMap((g) => g.tabs)

describe('settings nav registry', () => {
  it('has three scopes, seven / seven / five tabs', () => {
    expect(NAV_GROUPS.map((g) => [g.section, g.tabs.length])).toEqual([
      ['site', 7], ['organization', 7], ['account', 5],
    ])
  })

  it('gives every tab a one-line description that fits the rail', () => {
    for (const tab of tabs) {
      expect(tab.description, tab.href).toMatch(/\.$/)
      // Two lines of text-xs at 224px minus the icon column: ~48 characters.
      expect(tab.description.length, tab.href).toBeLessThanOrEqual(48)
      expect(tab.description.length, tab.href).toBeGreaterThan(8)
    }
  })

  it('carries no em or en dashes and no ellipsis-as-dots anywhere in its copy', () => {
    for (const tab of tabs) {
      expect(`${tab.label} ${tab.description}`).not.toMatch(/[—–]|\.\.\./)
    }
  })

  it('keys icons by href, one per tab', () => {
    expect(Object.keys(SETTINGS_TAB_ICONS).sort()).toEqual(tabs.map((t) => t.href).sort())
  })

  it('maps a pathname to its scope', () => {
    expect(sectionOf('/settings/site/goals')).toBe('site')
    expect(sectionOf('/settings/organization/billing')).toBe('organization')
    expect(sectionOf('/settings/account/security-alerts')).toBe('account')
    expect(sectionOf('/settings')).toBeNull()
    expect(sectionOf('/sites/abc')).toBeNull()
  })

  it('is the landing page\'s only source of rows', () => {
    const source = readFileSync(join(process.cwd(), 'app/settings/page.tsx'), 'utf8')
    expect(source).toContain("from '@/components/settings/nav'")
    expect(source).toContain('NAV_GROUPS')
    // The three hand-kept tables the page used to carry.
    expect(source).not.toMatch(/SITE_ROWS|ORG_ROWS|ACCOUNT_ROWS/)
    expect(source).not.toMatch(/description: '/)
  })
})

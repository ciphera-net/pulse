import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// PULSE-121, design §3.10c M13-h: pulse-backend's ImportTabURL sends
// `/sites/:id/settings?tab=import` in both the mail body and this page's own
// `link_url`. Before TAB_MAP grew an `import` entry, the `?? 'general'`
// fallback below silently sent every one of those links to General.
const h = vi.hoisted(() => ({
  siteId: 'site-1',
  params: new URLSearchParams(),
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: h.siteId }),
  useSearchParams: () => h.params,
  useRouter: () => ({ replace: h.replace }),
}))

import SiteSettingsRedirect from '../page'

beforeEach(() => {
  h.siteId = 'site-1'
  h.params = new URLSearchParams()
  h.replace.mockClear()
  sessionStorage.clear()
})

describe('the site-settings tab redirect (?tab=)', () => {
  it('routes ?tab=import to the M11 Import tab', () => {
    h.params = new URLSearchParams({ tab: 'import' })
    render(<SiteSettingsRedirect />)
    expect(h.replace).toHaveBeenCalledWith('/settings/site/import')
  })

  it('an unknown tab still falls back to General', () => {
    h.params = new URLSearchParams({ tab: 'not-a-real-tab' })
    render(<SiteSettingsRedirect />)
    expect(h.replace).toHaveBeenCalledWith('/settings/site/general')
  })

  it('no ?tab= at all goes to General', () => {
    render(<SiteSettingsRedirect />)
    expect(h.replace).toHaveBeenCalledWith('/settings/site/general')
  })

  // Mutation check on the map itself, not just the new entry: every existing
  // query key must keep resolving to its own destination.
  it.each(Object.entries({
    general: 'general',
    visibility: 'visibility',
    data: 'privacy',
    privacy: 'privacy',
    bot: 'bot-spam',
    goals: 'goals',
    integrations: 'integrations',
    import: 'import',
  }))('?tab=%s resolves to /settings/site/%s', (query, dest) => {
    h.params = new URLSearchParams({ tab: query })
    render(<SiteSettingsRedirect />)
    expect(h.replace).toHaveBeenCalledWith(`/settings/site/${dest}`)
  })

  it('remembers the active site id for the destination tab to read', () => {
    h.siteId = 'site-42'
    h.params = new URLSearchParams({ tab: 'import' })
    render(<SiteSettingsRedirect />)
    expect(sessionStorage.getItem('pulse_active_site')).toBe('site-42')
  })

  it('a ?gsc= callback still takes priority over ?tab=', () => {
    h.params = new URLSearchParams({ tab: 'import', gsc: 'connected' })
    render(<SiteSettingsRedirect />)
    expect(h.replace).toHaveBeenCalledWith('/settings/site/integrations?gsc=connected')
  })
})

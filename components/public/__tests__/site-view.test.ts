import { describe, it, expect } from 'vitest'
import { dashboardOnlyScope, scopeFromView, FALLBACK_DEMO_SITE_ID, type PublicSiteView } from '@/components/public/site-view'

function view(overrides: Partial<PublicSiteView> = {}): PublicSiteView {
  return {
    id: 'site-1', domain: 'shop.example', display_domain: 'shop.example', name: 'Shop', timezone: 'Europe/Oslo',
    is_public: true, is_demo: false, share_pages: ['dashboard'],
    collect_page_paths: true, collect_referrers: true, collect_device_info: true, collect_geo_data: 'country',
    collect_screen_resolution: true, collect_audience_data: true, hide_unknown_locations: false,
    show_referrer_domains: false, uptime_enabled: false, first_event_at: null, last_event_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('scopeFromView', () => {
  it('reads the sample site at full fidelity, with the pages it shares', () => {
    const scope = scopeFromView(view({ id: 'demo-1', is_demo: true, share_pages: ['dashboard', 'pages', 'cdn'] }), '/demo')
    expect(scope).toEqual({ siteId: 'demo-1', mode: 'public', basePath: '/demo', pages: ['dashboard', 'pages', 'cdn'], demo: true, fidelity: 'full' })
  })

  it("reads any other site as a customer's link: scoped, and never labelled as sample data", () => {
    const scope = scopeFromView(view({ share_pages: ['dashboard', 'funnels'] }), '/share/site-1')
    expect(scope).toMatchObject({ mode: 'public', demo: false, fidelity: 'scoped', basePath: '/share/site-1' })
  })

  it('lists the pages in the navigation order, not the order they came in', () => {
    const scope = scopeFromView(view({ share_pages: ['cdn', 'dashboard', 'funnels', 'pages'] }), '/share/x')
    expect(scope.pages).toEqual(['dashboard', 'pages', 'funnels', 'cdn'])
  })

  it('drops a page this build does not know, and a repeated one', () => {
    const scope = scopeFromView(view({ share_pages: ['dashboard', 'visitors', 'billing', 'pages', 'pages', ''] }), '/share/x')
    expect(scope.pages).toEqual(['dashboard', 'pages'])
  })

  it('shares nothing when the view names nothing it knows', () => {
    expect(scopeFromView(view({ share_pages: [] }), '/share/x').pages).toEqual([])
  })
})

describe('dashboardOnlyScope', () => {
  it("is a customer's link that shares the dashboard", () => {
    expect(dashboardOnlyScope('site-9', '/share/site-9')).toEqual({
      siteId: 'site-9', mode: 'public', basePath: '/share/site-9', pages: ['dashboard'], demo: false, fidelity: 'scoped',
    })
  })
})

describe('the fallback site', () => {
  it("is ciphera.net's, the one public site before the sample site exists", () => {
    expect(FALLBACK_DEMO_SITE_ID).toBe('e6a95eb8-8edb-44d4-a4e2-c400aea174a4')
  })
})

import { SITE_PAGES, isSitePage, type SitePage, type SiteScope } from '@/lib/scope/SiteScope'

/**
 * The public view of a site: GET /api/v1/public/sites/<id> and GET /api/v1/public/demo
 * answer with it (pulse-backend internal/api/public_share.go, PublicSiteView). The site's
 * name and domain, what it collects, and the pages its owner shares: nothing that
 * configures the site.
 */
export interface PublicSiteView {
  id: string
  domain: string
  display_domain: string
  name: string
  timezone: string
  is_public: boolean
  is_demo: boolean
  /** The backend's spelling of the pages (SITE_PAGES); a name this build does not know is ignored. */
  share_pages: string[]
  collect_page_paths: boolean
  collect_referrers: boolean
  collect_device_info: boolean
  collect_geo_data: string
  collect_screen_resolution: boolean
  collect_audience_data: boolean
  hide_unknown_locations: boolean
  show_referrer_domains: boolean
  uptime_enabled: boolean
  first_event_at: string | null
  last_event_at: string | null
  created_at: string
}

/**
 * ciphera.net's own site: public since 12-07-2026, shared as a customer-style link that shows
 * the dashboard and nothing else. /demo falls back to it while no sample site exists
 * (`GET /public/demo` answers 404), which is exactly what /demo showed before the sample site.
 */
export const FALLBACK_DEMO_SITE_ID = 'e6a95eb8-8edb-44d4-a4e2-c400aea174a4'

/** The pages a view shares, in the navigation's order, with names this build does not know dropped. */
function sharedPages(view: PublicSiteView): readonly SitePage[] {
  const named = new Set(view.share_pages.filter(isSitePage))
  return SITE_PAGES.filter((page) => named.has(page))
}

/**
 * The scope of a site whose public view was read. The sample site is served exactly as a
 * member sees it; any other site is a customer's link and is read within its public-scoped
 * rules (fixed periods, no filters).
 */
export function scopeFromView(view: PublicSiteView, basePath: string): SiteScope {
  return {
    siteId: view.id,
    mode: 'public',
    basePath,
    pages: sharedPages(view),
    demo: view.is_demo,
    fidelity: view.is_demo ? 'full' : 'scoped',
  }
}

/**
 * The scope of a site whose public view is not served: a customer's link. Its owner has
 * shared the dashboard, which is every link's default, and the dashboard read itself says
 * whether the site exists and is public.
 */
export function dashboardOnlyScope(siteId: string, basePath: string): SiteScope {
  return { siteId, mode: 'public', basePath, pages: ['dashboard'], demo: false, fidelity: 'scoped' }
}

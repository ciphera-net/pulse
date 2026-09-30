import type { MetadataRoute } from 'next'
import { integrations } from '@/lib/integrations'
import { comparisons } from '@/lib/comparisons'
import { STATIC_ROUTES, CATEGORY_ROUTES, TOOL_ROUTES } from '@/lib/marketing-routes'

const BASE_URL = 'https://pulse.ciphera.net'

// * Per-route last-modified dates. Routes touched by the 21-07 SEO pass carry
// * that date; leave a route on its prior date only if its content genuinely
// * has not changed. Kept as an explicit map so a future edit updates the one
// * route it touches rather than a single global stamp drifting for all.
//
// * Keyed the sitemap's own way — `''` for the root, matching `route.url`
// * below — not lib/marketing-routes.ts's `'/'` (that module's job is the
// * exact-path allowlist; this map is purely cosmetic per-route history).
const LAST_MODIFIED: Record<string, string> = {
  '': '2026-07-21',
  '/about': '2026-07-21',
  '/features': '2026-07-21',
  '/pricing': '2026-07-21',
  '/faq': '2026-07-21',
  '/changelog': '2026-07-21',
  '/installation': '2026-07-21',
  '/integrations': '2026-07-21',
  '/demo': '2026-07-21',
  '/open-source': '2026-09-02',
  '/startups': '2026-09-05',
}

const INTEGRATIONS_LASTMOD = '2026-07-21'
// * The category-SEO cluster (/vs, category landing pages, tools) — all shipped
// * in the 21-07 pass.
const SEO_LASTMOD = '2026-07-21'

export default function sitemap(): MetadataRoute.Sitemap {
  // * lib/marketing-routes.ts uses '/' for the homepage; the sitemap's own
  // * convention is '' (so `${BASE_URL}${url}` never doubles a slash) — this
  // * is the one place that translates between the two.
  const publicRoutes = STATIC_ROUTES.map((route) => ({
    url: route.path === '/' ? '' : route.path,
    priority: route.priority,
    changeFrequency: route.changeFrequency,
  }))

  const staticEntries: MetadataRoute.Sitemap = publicRoutes.map((route) => ({
    url: `${BASE_URL}${route.url}`,
    lastModified: new Date(LAST_MODIFIED[route.url] ?? '2026-07-21'),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  // * Every built /integrations/[slug] guide (the long-tail "<framework>
  // * analytics" pages) — previously absent from the sitemap. Not part of the
  // * L1 marketing-routes allowlist (D38) — see lib/marketing-routes.ts.
  const integrationEntries: MetadataRoute.Sitemap = integrations.map((integration) => ({
    url: `${BASE_URL}/integrations/${integration.id}`,
    lastModified: new Date(INTEGRATIONS_LASTMOD),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  // * The /vs/[slug] comparison cluster — one page per competitor.
  const comparisonEntries: MetadataRoute.Sitemap = comparisons.map((comparison) => ({
    url: `${BASE_URL}/vs/${comparison.slug}`,
    lastModified: new Date(SEO_LASTMOD),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  // * Category landing pages.
  const categoryEntries: MetadataRoute.Sitemap = CATEGORY_ROUTES.map((url) => ({
    url: `${BASE_URL}${url}`,
    lastModified: new Date(SEO_LASTMOD),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  // * Tool pages.
  const toolEntries: MetadataRoute.Sitemap = TOOL_ROUTES.map((url) => ({
    url: `${BASE_URL}${url}`,
    lastModified: new Date(SEO_LASTMOD),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [
    ...staticEntries,
    ...comparisonEntries,
    ...categoryEntries,
    ...toolEntries,
    ...integrationEntries,
  ]
}

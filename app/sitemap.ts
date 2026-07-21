import type { MetadataRoute } from 'next'
import { integrations } from '@/lib/integrations'

const BASE_URL = 'https://pulse.ciphera.net'

// * Per-route last-modified dates. Routes touched by the 21-07 SEO pass carry
// * that date; leave a route on its prior date only if its content genuinely
// * has not changed. Kept as an explicit map so a future edit updates the one
// * route it touches rather than a single global stamp drifting for all.
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
}

const INTEGRATIONS_LASTMOD = '2026-07-21'

export default function sitemap(): MetadataRoute.Sitemap {
  const publicRoutes = [
    { url: '', priority: 1.0, changeFrequency: 'weekly' as const },
    { url: '/about', priority: 0.8, changeFrequency: 'monthly' as const },
    { url: '/features', priority: 0.9, changeFrequency: 'monthly' as const },
    { url: '/pricing', priority: 0.9, changeFrequency: 'monthly' as const },
    { url: '/faq', priority: 0.7, changeFrequency: 'monthly' as const },
    { url: '/changelog', priority: 0.6, changeFrequency: 'weekly' as const },
    { url: '/installation', priority: 0.8, changeFrequency: 'monthly' as const },
    { url: '/integrations', priority: 0.8, changeFrequency: 'monthly' as const },
    { url: '/demo', priority: 0.8, changeFrequency: 'weekly' as const },
  ]

  const staticEntries: MetadataRoute.Sitemap = publicRoutes.map((route) => ({
    url: `${BASE_URL}${route.url}`,
    lastModified: new Date(LAST_MODIFIED[route.url] ?? '2026-07-21'),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  // * Every built /integrations/[slug] guide (the long-tail "<framework>
  // * analytics" pages) — previously absent from the sitemap.
  const integrationEntries: MetadataRoute.Sitemap = integrations.map((integration) => ({
    url: `${BASE_URL}/integrations/${integration.id}`,
    lastModified: new Date(INTEGRATIONS_LASTMOD),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  return [...staticEntries, ...integrationEntries]
}

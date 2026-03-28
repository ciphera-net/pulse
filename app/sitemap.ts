import type { MetadataRoute } from 'next'
import { integrations } from '@/lib/integrations'
import { getIntegrationGuides } from '@/lib/integration-content'

const BASE_URL = 'https://pulse.ciphera.net'

export default function sitemap(): MetadataRoute.Sitemap {
  const guides = getIntegrationGuides()
  const guidesBySlug = new Map(guides.map((g) => [g.slug, g]))

  const publicRoutes = [
    { url: '', priority: 1.0, changeFrequency: 'weekly' as const },
    { url: '/about', priority: 0.8, changeFrequency: 'monthly' as const },
    { url: '/features', priority: 0.9, changeFrequency: 'monthly' as const },
    { url: '/pricing', priority: 0.9, changeFrequency: 'monthly' as const },
    { url: '/faq', priority: 0.7, changeFrequency: 'monthly' as const },
    { url: '/changelog', priority: 0.6, changeFrequency: 'weekly' as const },
    { url: '/installation', priority: 0.8, changeFrequency: 'monthly' as const },
    { url: '/integrations', priority: 0.8, changeFrequency: 'monthly' as const },
    { url: '/integrations/script-tag', priority: 0.6, changeFrequency: 'monthly' as const },
  ]

  const integrationRoutes = integrations
    .filter((i) => i.dedicatedPage)
    .map((i) => {
      const guide = guidesBySlug.get(i.id)
      return {
        url: `/integrations/${i.id}`,
        priority: 0.7,
        changeFrequency: 'monthly' as const,
        lastModified: guide?.date ? new Date(guide.date) : new Date('2026-03-28'),
      }
    })

  return [
    ...publicRoutes.map((route) => ({
      url: `${BASE_URL}${route.url}`,
      lastModified: new Date('2026-03-28'),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...integrationRoutes.map((route) => ({
      url: `${BASE_URL}${route.url}`,
      lastModified: route.lastModified,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
  ]
}

import type { MetadataRoute } from 'next'

const BASE_URL = 'https://pulse.ciphera.net'

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
  ]

  return publicRoutes.map((route) => ({
    url: `${BASE_URL}${route.url}`,
    lastModified: new Date('2026-03-28'),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}

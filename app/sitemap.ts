import type { MetadataRoute } from 'next'

const BASE_URL = 'https://pulse.ciphera.net'

export default function sitemap(): MetadataRoute.Sitemap {
  const integrationSlugs = [
    'nextjs',
    'react',
    'vue',
    'wordpress',
  ]

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

  const integrationRoutes = integrationSlugs.map((slug) => ({
    url: `/integrations/${slug}`,
    priority: 0.7,
    changeFrequency: 'monthly' as const,
  }))

  const allRoutes = [...publicRoutes, ...integrationRoutes]

  return allRoutes.map((route) => ({
    url: `${BASE_URL}${route.url}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}

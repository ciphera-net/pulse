import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/about',
          '/features',
          '/pricing',
          '/faq',
          '/changelog',
          '/installation',
          '/integrations',
        ],
        disallow: [
          '/api/',
          '/admin/',
          '/sites/',
          '/notifications/',
          '/onboarding/',
          '/org-settings/',
          '/welcome/',
          '/auth/',
          '/actions/',
          '/share/',
        ],
      },
      {
        userAgent: 'GPTBot',
        disallow: ['/'],
      },
      {
        userAgent: 'ChatGPT-User',
        disallow: ['/'],
      },
      {
        userAgent: 'Google-Extended',
        disallow: ['/'],
      },
      {
        userAgent: 'CCBot',
        disallow: ['/'],
      },
    ],
    sitemap: 'https://pulse.ciphera.net/sitemap.xml',
  }
}

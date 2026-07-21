import type { MetadataRoute } from 'next'

// * Public marketing paths crawlers may index.
const PUBLIC_ALLOW = [
  '/',
  '/about',
  '/features',
  '/pricing',
  '/faq',
  '/changelog',
  '/installation',
  '/integrations',
  '/demo',
]

// * App / auth surfaces kept out of every index (prefix match). `/sites` is the
// * authenticated home; `/share` stays disallowed so the demo's underlying
// * share view is never indexed directly (the /demo landing carries the
// * crawlable metadata instead).
const APP_DISALLOW = [
  '/api/',
  '/admin/',
  '/sites',
  '/notifications/',
  '/onboarding/',
  '/welcome/',
  '/auth/',
  '/actions/',
  '/share/',
  '/settings/',
  '/setup/',
  '/switch/',
  '/checkout/',
  '/join/',
  '/login',
  '/signup',
]

// * AI *search* crawlers — allowed on the public paths (aligned with
// * ciphera.net, owner-approved): visibility in AI-powered search answers.
const AI_SEARCH_AGENTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot']

// * AI *training* crawlers — blocked entirely (content must not feed model
// * training), same stance as ciphera.net.
const AI_TRAINING_AGENTS = ['CCBot', 'Google-Extended', 'anthropic-ai', 'Bytespider']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: PUBLIC_ALLOW, disallow: APP_DISALLOW },
      // AI search crawlers get the same public allowlist as everyone else.
      ...AI_SEARCH_AGENTS.map((userAgent) => ({
        userAgent,
        allow: PUBLIC_ALLOW,
        disallow: APP_DISALLOW,
      })),
      // AI training crawlers are blocked from the whole host.
      ...AI_TRAINING_AGENTS.map((userAgent) => ({
        userAgent,
        disallow: ['/'],
      })),
    ],
    sitemap: 'https://pulse.ciphera.net/sitemap.xml',
  }
}

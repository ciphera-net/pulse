/**
 * The Level 1 marketing route set (design doc §4.1, D38) — the ONE enumeration
 * of every path whose <head> a CMS stub may override.
 *
 * Design: Pulse/docs/plans/30-09-2026-pulse-headless-cms-phase-4-design.md §4.1
 *
 * 🔑 SINGLE SOURCE OF TRUTH. app/sitemap.ts and scripts/generate-seo.ts both
 * import from here instead of each keeping its own copy of the route lists —
 * the two drifting apart is exactly the failure D38 exists to prevent (a stub
 * for a path nobody enumerated would ship silently, or a route the sitemap
 * advertises would have no corresponding allowlist entry).
 *
 * 🔴 THE 75 /integrations/[slug] GUIDES ARE DELIBERATELY NOT HERE (D38, D35).
 * Their prose is a later phase (L3) with its own, different content model
 * (lib/integration-deep-dive.ts-shaped, not a route-stub); seeding a CMS route
 * stub for one today would fail the build the moment it shipped, since no
 * generator here ever emits an allowlist entry for them.
 */
import { comparisonSlugs } from './comparisons'

export interface StaticMarketingRoute {
  path: string
  priority: number
  changeFrequency: 'weekly' | 'monthly' | 'yearly'
}

/** The 12 fixed marketing pages — root included, one entry each. */
export const STATIC_ROUTES: StaticMarketingRoute[] = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/features', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/faq', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/changelog', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/installation', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/integrations', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/demo', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/open-source', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/startups', priority: 0.8, changeFrequency: 'monthly' },
  // * /contact was a real 200 page that no sitemap and no robots Allow line ever
  // * mentioned (found 10-09-2026). robots.txt opens with `Allow: /`, so it was
  // * crawlable all along — it was simply never advertised, which is the half a
  // * sitemap exists to do.
  { path: '/contact', priority: 0.6, changeFrequency: 'yearly' },
]

/** The 5 category landing pages — each a distinct angle on the same cluster of queries. */
export const CATEGORY_ROUTES: string[] = [
  '/cookieless-analytics',
  '/gdpr-compliant-analytics',
  '/google-analytics-alternative',
  '/analytics-without-cookie-banner',
  '/eu-web-analytics',
]

/** The 2 client-side tool pages (no backend), indexable and linked from the cluster. */
export const TOOL_ROUTES: string[] = ['/tools/utm-builder', '/tools/cookie-banner-loss-calculator']

/**
 * The 6 comparison pages, derived from lib/comparisons.ts's own registry —
 * that file, not this one, is the source of truth for which comparisons
 * exist; this only turns each slug into the route it renders at.
 */
export const COMPARISON_ROUTES: string[] = comparisonSlugs.map((slug) => `/vs/${slug}`)

/**
 * 🔴 THE EXACT-PATH ALLOWLIST (D38). A stub is admitted only if its path is
 * EXACTLY one of these 25 — `'/'` matches only `/`, never as a prefix. Order
 * is deterministic (declaration order above); a path cannot appear twice
 * because each source above is disjoint by construction.
 */
export const MARKETING_ROUTES: string[] = [
  ...STATIC_ROUTES.map((route) => route.path),
  ...CATEGORY_ROUTES,
  ...TOOL_ROUTES,
  ...COMPARISON_ROUTES,
]

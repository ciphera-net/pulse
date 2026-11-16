/**
 * The paths on this host that the marketing app (pulse-website) serves, not the
 * dashboard. One hostname carries both apps: the Ingress `pulse-website` takes
 * these paths and every other path reaches this app. Keep it in step with that
 * Ingress (Infra `Kubernetes/workloads/pulse-website/pulse-website.yaml`).
 *
 * Why the dashboard needs to know: a next/link to one of these makes the
 * dashboard's router prefetch and fetch another app's pages as RSC data. For a
 * signed-in visitor `/` answers that fetch with a redirect to `/sites`, which
 * browsers stored and replayed on Back as a page without its stylesheet (the
 * blank dashboard, 16-11-2026). A plain link loads the other app as a page.
 */
const EXACT = new Set([
  '/', '/about', '/features', '/faq', '/changelog', '/contact', '/open-source', '/startups', '/pricing',
  '/installation', '/cookieless-analytics', '/gdpr-compliant-analytics', '/google-analytics-alternative',
  '/analytics-without-cookie-banner', '/analytics-without-the-cookie-banner', '/eu-web-analytics', '/privacy',
  '/terms', '/security', '/glossary', '/vs', '/compare', '/tools', '/guides', '/integrations', '/blog',
])

const PREFIXES = ['/integrations/', '/vs/', '/tools/', '/blog/']

/** True when `href` is a same-host path the marketing app serves. Absolute URLs are never matched. */
export function isMarketingPath(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) return false
  const path = href.split(/[?#]/)[0]
  return EXACT.has(path) || PREFIXES.some((p) => path.startsWith(p))
}

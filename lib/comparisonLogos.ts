/**
 * Competitor logo on the shared CDN (the same assets the ciphera.net comparison
 * blog posts use). Filenames match the comparison slug. Referenced as an
 * absolute cross-property URL — cdn.ciphera.net is allowlisted in next.config
 * remotePatterns and the CSP img-src; never copied into public/.
 *
 * Its own module so a screen that needs only the logo (the history-import tab,
 * PULSE-118) does not pull the comparison tables into its bundle.
 * lib/comparisons.ts re-exports both names, so every existing import holds.
 */
export const COMPARISON_LOGO_BASE = 'https://cdn.ciphera.net/website/blog/tools'

export function comparisonLogoUrl(slug: string): string {
  return `${COMPARISON_LOGO_BASE}/${slug}.png`
}

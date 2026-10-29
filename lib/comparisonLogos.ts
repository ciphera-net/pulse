/**
 * Competitor logo on the shared CDN (the same assets the ciphera.net comparison
 * blog posts use). Referenced as an absolute cross-property URL — cdn.ciphera.net
 * is allowlisted in next.config remotePatterns and the CSP img-src; never copied
 * into public/.
 *
 * 🔑 The file name is the comparison slug written in hex (`google-analytics` →
 * `_676f6f676c652d616e616c7974696373.png`), never the slug itself (27-10-2026).
 * Blocker lists hide images by the words in their address: AdGuard Tracking
 * Protection's `/google-analytics.` hid the Google Analytics logo for every reader
 * running it. Hex carries no word a list can match. The files under their plain
 * names stay on the CDN for anything that still points at them.
 *
 * Its own module so a screen that needs only the logo (the history-import tab,
 * PULSE-118) does not pull the comparison tables into its bundle.
 * lib/comparisons.ts re-exports both names, so every existing import holds.
 */
export const COMPARISON_LOGO_BASE = 'https://cdn.ciphera.net/website/blog/tools'

/** `s` as lowercase hex of its UTF-8 bytes. TextEncoder, not Buffer: client components draw these logos. */
function hexOf(s: string): string {
  return Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function comparisonLogoUrl(slug: string): string {
  return `${COMPARISON_LOGO_BASE}/_${hexOf(slug)}.png`
}

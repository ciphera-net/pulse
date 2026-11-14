/**
 * Same-origin favicon proxy endpoint (see app/api/favicon/route.ts).
 * Append `?domain=<host>&sz=<px>` to get a favicon (sz ∈ 16/32/64/128).
 *
 * Never point this at a third-party service directly: favicons render in the
 * authenticated app, so a third-party URL leaks every customer's referrer and
 * page domains (plus the user's IP) to that party on each dashboard view.
 *
 * Kept in a separate module so server components can import it
 * without pulling in the React-dependent icon registry.
 */
export const FAVICON_SERVICE_URL = '/api/favicon'

/**
 * Top-level names reserved for documentation and testing (RFC 2606, RFC 6761). Nothing can be served from one, so
 * no such domain has a favicon, and asking the proxy for it is a certain 404. The demo's sample site lives on
 * `.example`: every load of /demo asked for its favicon and logged that 404 (measured 14-11-2026).
 */
const RESERVED_TLD = /\.(example|test|invalid|localhost)$/i

/**
 * The address <SiteFavicon> asks for (`size` is the drawn size in px; it picks the proxy's 64 or 128 px picture).
 * Kept here so a caller can load a site's favicon before the element that shows it exists (usePreloadImages): the
 * two addresses have to be the same, character for character.
 */
export function siteFaviconUrl(domain: string, size = 40): string {
  return `${FAVICON_SERVICE_URL}?domain=${encodeURIComponent(domain)}&sz=${size >= 64 ? 128 : 64}`
}

/** False for a domain that cannot have a favicon, so its monogram is drawn without a request. */
export function canHaveFavicon(domain: string | null | undefined): boolean {
  return !!domain && !RESERVED_TLD.test(domain.trim())
}

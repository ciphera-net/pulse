/**
 * The readable label for a site's domain.
 *
 * 🔴 THE RULE: `domain` is the value, `display_domain` is a caption.
 * Use this ONLY where a human eye is the sole consumer and the string is not
 * compared, copied, fetched, linked, stored or serialized. If you can name any
 * consumer other than a person reading the screen, use `site.domain`.
 *
 * Decode at the LEAF render, never on a Site object or a prop named `domain` —
 * a prop called `domain` must keep carrying the real value downstream.
 *
 * The server computes the caption (Go's idna, with a round-trip assert so a
 * label that does not re-encode to the stored domain is never shown). This is a
 * dumb accessor on purpose: there is no decoding policy in the browser to drift.
 *
 * 🔴 Never call this on a domain the customer did not author — referrer and
 * reputation tables show attacker-supplied domains, and a decoded homograph is
 * exactly the deception those tables exist to expose.
 */
export function displayDomain(site: { domain: string; display_domain?: string }): string {
  return site.display_domain || site.domain
}

/**
 * Does this site match a user's search term? Matches BOTH forms, so typing
 * "müller" finds a site stored as "xn--mller-kva.de" and typing the punycode
 * finds it too. Additive: never replaces a `domain` comparison, only widens it.
 */
export function siteMatchesQuery(
  site: { domain: string; display_domain?: string; name?: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    site.domain.toLowerCase().includes(q) ||
    (site.display_domain?.toLowerCase().includes(q) ?? false) ||
    (site.name?.toLowerCase().includes(q) ?? false)
  )
}

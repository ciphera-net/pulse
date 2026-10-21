/**
 * Which site a read is for, and how it is read (PUL-34 Phase 2).
 *
 * The product reads a site as a MEMBER: `GET /api/v1/sites/<id>/<surface>`, with the
 * bearer, the team header and CSRF on writes. /demo and /share/<id> read the SAME pages
 * through the public share surface, which mirrors the member paths one for one:
 * `GET /api/v1/public/sites/<id>/<same path>` (pulse-backend internal/api/
 * public_share_routes.go), with no credential at all.
 *
 * A plain string stays the member read, so every caller written before this file is
 * unchanged. A public read is the object form, which nothing produces by accident:
 * only a public SiteScope (lib/scope/SiteScope.tsx) hands one out.
 *
 * 🔴 The cache key must say which surface it is for. A public answer is a different
 * document from the member one (the site record is its public subset, a customer's link
 * is floored), so a key that could not tell them apart would let one tab serve a member
 * the public body or the reverse. `siteRefKey` is that difference.
 */
export interface PublicSiteRef {
  readonly id: string
  readonly public: true
}

export type SiteRef = string | PublicSiteRef

export function publicSiteRef(id: string): PublicSiteRef {
  return { id, public: true }
}

export function isPublicSiteRef(ref: SiteRef): ref is PublicSiteRef {
  return typeof ref !== 'string' && ref.public === true
}

/** The site's id, whichever way it is read. */
export function siteIdOf(ref: SiteRef): string {
  return typeof ref === 'string' ? ref : ref.id
}

/**
 * The API path of a site read: `/sites/<id><rest>` for a member, `/public/sites/<id><rest>`
 * for the public surface. `rest` starts with `/` or `?`, or is empty for the site record.
 */
export function sitePath(ref: SiteRef, rest = ''): string {
  const id = encodeURIComponent(siteIdOf(ref))
  return isPublicSiteRef(ref) ? `/public/sites/${id}${rest}` : `/sites/${id}${rest}`
}

/** The id part of an SWR key: the member id as before, `public:<id>` for a public read. */
export function siteRefKey(ref: SiteRef): string {
  return isPublicSiteRef(ref) ? `public:${ref.id}` : ref
}

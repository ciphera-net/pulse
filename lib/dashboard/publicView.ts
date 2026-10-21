import { isLiveListKey } from '@/lib/swr/dashboard'
import { publicSiteRef, siteRefKey } from '@/lib/scope/site-ref'

// ─── What only a public dashboard needs (PUL-34 Phase 2) ─────────────────────

/**
 * Matches every live-list SWR key of one site, whichever way it was read.
 *
 * A member's keys carry the plain site id; a public read's keys carry `public:<id>`
 * (lib/scope/site-ref.ts siteRefKey), so a member and a public answer can never share a
 * cache entry. `isLiveListKey(siteId)` alone would miss the second shape, and a live
 * public card would then wait for its own timer instead of refreshing with the rail.
 */
export function liveListKeyMatcher(siteId: string): (key: unknown) => boolean {
  const member = isLiveListKey(siteId)
  const pub = isLiveListKey(siteRefKey(publicSiteRef(siteId)))
  return (key) => member(key) || pub(key)
}

/**
 * A password-protected share link whose unlock has lapsed: the dashboard request answers
 * 401 with `is_protected` until the share cookie is set again (POST /public/sites/:id/auth).
 *
 * Duck-typed, not `instanceof ApiError`: chunk-split bundles can hold two ApiError classes.
 */
export function isLockedShare(error: unknown): boolean {
  const e = error as { status?: unknown; data?: { is_protected?: unknown } } | null | undefined
  return e?.status === 401 && e?.data?.is_protected === true
}

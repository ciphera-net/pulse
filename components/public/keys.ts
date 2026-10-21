/**
 * Whether an SWR key is a public read.
 *
 * lib/scope/site-ref.ts names the surface in a read's cache key: `siteRefKey` gives
 * `public:<id>` for a public read and the bare id for a member's, so the two never share an
 * entry. Where that segment sits in a key (an array element, part of a string) is the
 * hooks' business, so the match is on the serialised key rather than on a position.
 *
 * Used to forget what a locked page taught the cache once its password is accepted.
 */
const PUBLIC_MARK = 'public:'

export function mentionsPublicRead(key: unknown): boolean {
  if (typeof key === 'string') return key.includes(PUBLIC_MARK)
  try {
    return JSON.stringify(key)?.includes(PUBLIC_MARK) ?? false
  } catch {
    return false
  }
}

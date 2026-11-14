/**
 * The favicon route's query, read ONE way.
 *
 * A cache in front of the route stores an answer under the address as THE CACHE reads it, while the answer is made
 * from the address as THE ROUTE reads it. Where the two readings can differ, one request leaves its answer under
 * another request's key. `?%64omain=a.example&domain=b.example` is `a.example` to the URL API (a name is
 * percent-decoded, and the first one wins) and can be `b.example` to a cache that compares names as written. The
 * icon of a.example is then shown for b.example, to every visitor, for as long as the copy lives.
 *
 * Browsers keep these answers for a day since 14-11-2026, and the zone's edge cache is meant to keep them too. So
 * the route answers only an address that has ONE reading: the names below, each at most once, each written
 * literally, each with a value that needs no decoding. Anything else is refused with a 400 no cache may keep.
 *
 * Every caller already writes exactly this: `?domain=<host>&sz=<px>` in the app (lib/utils/favicon.ts,
 * lib/utils/icons.tsx) and the same plus `&fallback=email` in the summary email. A NEW parameter is added here and
 * to the zone's vary list (`QueryStringVaryParameters`) in the same change, or two answers share one stored copy.
 */
const NAMES = new Set(['domain', 'sz', 'fallback'])

/** Letters, digits, dots and hyphens: all a hostname, a size or `email` needs, and nothing a parser could decode. */
const LITERAL = /^[A-Za-z0-9.-]*$/

export interface FaviconQuery {
  /** As written; the route lowercases it. Empty when the address names none. */
  domain: string
  sz: string | null
  fallback: string | null
}

/** The query when it has exactly one reading, else null. `search` is the raw query string, with or without `?`. */
export function readFaviconQuery(search: string): FaviconQuery | null {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const seen = new Map<string, string>()
  if (raw !== '') {
    for (const pair of raw.split('&')) {
      const at = pair.indexOf('=')
      if (at < 1) return null
      const name = pair.slice(0, at)
      const value = pair.slice(at + 1)
      if (!NAMES.has(name) || seen.has(name) || !LITERAL.test(value)) return null
      seen.set(name, value)
    }
  }
  return { domain: seen.get('domain') ?? '', sz: seen.get('sz') ?? null, fallback: seen.get('fallback') ?? null }
}

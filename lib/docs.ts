/** The Pulse documentation, served at the root of its own host since 11-09-2026
 *  (was help.ciphera.net/docs/pulse, which now 308s here). One constant so the
 *  host can never be half-moved again. */
export const DOCS_ORIGIN = 'https://docs.ciphera.net/pulse'

/** `docsUrl('billing#pageview-limits')` → the full URL; `docsUrl()` → the docs
 *  home. Tolerates a leading slash on `path`. */
export function docsUrl(path = ''): string {
  const trimmed = path.replace(/^\/+/, '')
  return trimmed ? `${DOCS_ORIGIN}/${trimmed}` : DOCS_ORIGIN
}

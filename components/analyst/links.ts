/**
 * Which links an answer may carry (plan §4c, the web lookup). An answer may link to the site's own pages, to
 * Ciphera's own hosts and to the exact pages its own web searches returned; any other link is drawn as its words.
 *
 * Web text is the first untrusted text Analyst reads at length, and a page can ask the model to write a link that
 * carries the site's figures in its address. The page's CSP already stops an image doing that without a click; this
 * stops a link doing it with one. Measured 14-11-2026: none of the 134 answers kept so far held a link, so the rule
 * takes nothing away from an answer without web searches.
 */

/** The web search lookup's tool name (pulse-backend's search_web). */
export const WEB_TOOL = 'search_web'

/** An address as the rule compares it: origin, path without its trailing slash, query; never the fragment. */
function normalised(u: URL): string {
  return u.origin + u.pathname.replace(/\/+$/, '') + u.search
}

function hostOf(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, '')
}

/** The addresses a message's web searches returned, normalised, from its lookups as the message holds them. */
export function webResultURLs(parts: readonly unknown[]): string[] {
  const urls: string[] = []
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue
    const p = part as { type?: unknown; toolName?: unknown; result?: unknown }
    if (p.type !== 'tool-call' || p.toolName !== WEB_TOOL || !p.result || typeof p.result !== 'object') continue
    const step = p.result as { result?: unknown }
    const results = step.result && typeof step.result === 'object' ? (step.result as { results?: unknown }).results : null
    if (!Array.isArray(results)) continue
    for (const r of results) {
      const url = r && typeof r === 'object' ? (r as { url?: unknown }).url : null
      if (typeof url !== 'string') continue
      try {
        const u = new URL(url)
        if (u.protocol === 'https:' || u.protocol === 'http:') urls.push(normalised(u))
      } catch {
        // * Not an address: nothing to allow.
      }
    }
  }
  return urls
}

/**
 * Whether an answer may link to href. base resolves a relative link (the page's own origin in the browser);
 * siteDomain is the site the question is about.
 */
export function answerLinkAllowed(href: string | undefined, siteDomain: string | null, webURLs: ReadonlySet<string>, base: string): boolean {
  if (!href) return false
  let u: URL
  try {
    u = new URL(href, base)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = u.hostname.toLowerCase()
  if (host === 'ciphera.net' || host.endsWith('.ciphera.net')) return true
  const site = siteDomain ? hostOf(siteDomain) : ''
  if (site && (host === site || host.endsWith(`.${site}`))) return true
  return webURLs.has(normalised(u))
}

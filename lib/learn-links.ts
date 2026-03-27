/**
 * Maps Google/Deque documentation URLs to ciphera.net/learn articles.
 * Keys are normalized URLs (no protocol, no trailing slash, no query/hash).
 * Add entries as new /learn articles are published on ciphera.net.
 */
const LEARN_URL_MAP: Record<string, string> = {
  // Performance Metrics
  'developer.chrome.com/docs/lighthouse/performance/first-contentful-paint': 'https://ciphera.net/learn/pulse/first-contentful-paint',
  'developer.chrome.com/docs/lighthouse/performance/lighthouse-largest-contentful-paint': 'https://ciphera.net/learn/pulse/largest-contentful-paint',
  'developer.chrome.com/docs/lighthouse/performance/lighthouse-total-blocking-time': 'https://ciphera.net/learn/pulse/total-blocking-time',
  'web.dev/articles/cls': 'https://ciphera.net/learn/pulse/cumulative-layout-shift',
  'developer.chrome.com/docs/lighthouse/performance/speed-index': 'https://ciphera.net/learn/pulse/speed-index',
  'web.dev/articles/inp': 'https://ciphera.net/learn/pulse/interaction-to-next-paint',
  'developer.chrome.com/docs/lighthouse/performance/interactive': 'https://ciphera.net/learn/pulse/time-to-interactive',
  'developer.chrome.com/docs/lighthouse/performance/lighthouse-max-potential-fid': 'https://ciphera.net/learn/pulse/max-potential-first-input-delay',
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    return (u.host + u.pathname).replace(/\/+$/, '')
  } catch {
    return url
  }
}

export function remapLearnUrl(url: string): string {
  const normalized = normalizeUrl(url)
  return LEARN_URL_MAP[normalized] || url
}

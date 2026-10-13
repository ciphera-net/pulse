import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getReferrerDisplayName,
  getReferrerCanonicalAddress,
  getReferrerFavicon,
  getOpenHostname,
  mergeReferrersByDisplayName,
} from '@/lib/utils/icons'

// PUL-23 (13-10-2026). The Referrers card printed "Product%20hunt" with a globe,
// beside a separate producthunt.com row. The API sent "Product Hunt": the label
// pulse-backend stores when ingest falls back to utm_source (ingestnorm's
// knownReferrerLabel). The registry had no entry for it, so the label was
// URL-parsed as a host, and Chrome percent-encodes the space.

// Every label pulse-backend can store for a known platform, copied from
// internal/ingestnorm/referrer.go (knownReferrerLabel) and the user-agent and
// Meta-redirect fallbacks in internal/api/events.go. A label added there must
// be added here AND resolve in the registry, or its row shows as an unknown.
const BACKEND_LABELS = [
  'LinkedIn', 'YouTube', 'GitHub', 'Facebook', 'Instagram', 'Twitter', 'TikTok', 'Pinterest',
  'Reddit', 'Snapchat', 'WhatsApp', 'Telegram', 'Threads', 'Medium', 'Quora', 'Stack Overflow',
  'Hacker News', 'Product Hunt', 'Google', 'Bing', 'Yahoo', 'DuckDuckGo', 'ChatGPT', 'Perplexity',
  'Claude', 'Gemini', 'Copilot', 'Meta AI', 'DeepSeek', 'Grok', 'You.com', 'Phind',
]

// pulse-backend's knownReferrerDomains: an exact host → the label it stores.
// A browser referrer from that host is stored as the lowercase host instead,
// so the two spellings must land in ONE row.
const BACKEND_DOMAINS: Record<string, string> = {
  'linkedin.com': 'LinkedIn', 'youtube.com': 'YouTube', 'github.com': 'GitHub', 'facebook.com': 'Facebook',
  'instagram.com': 'Instagram', 'twitter.com': 'Twitter', 'x.com': 'Twitter', 'tiktok.com': 'TikTok',
  'pinterest.com': 'Pinterest', 'reddit.com': 'Reddit', 'snapchat.com': 'Snapchat', 'whatsapp.com': 'WhatsApp',
  'telegram.org': 'Telegram', 'threads.net': 'Threads', 'medium.com': 'Medium', 'quora.com': 'Quora',
  'stackoverflow.com': 'Stack Overflow', 'news.ycombinator.com': 'Hacker News', 'producthunt.com': 'Product Hunt',
  'google.com': 'Google', 'bing.com': 'Bing', 'yahoo.com': 'Yahoo', 'duckduckgo.com': 'DuckDuckGo',
  'chatgpt.com': 'ChatGPT', 'openai.com': 'ChatGPT', 'perplexity.ai': 'Perplexity', 'claude.ai': 'Claude',
  'anthropic.com': 'Claude', 'gemini.google.com': 'Gemini', 'copilot.microsoft.com': 'Copilot',
  'deepseek.com': 'DeepSeek', 'grok.com': 'Grok', 'you.com': 'You.com', 'phind.com': 'Phind',
}

describe('every label pulse-backend stores resolves to a registry brand (PUL-23)', () => {
  it.each(BACKEND_LABELS)('%s has a registry entry with an address', (label) => {
    expect(getReferrerCanonicalAddress(label), `${label} has no registry entry`).not.toBeNull()
    expect(getReferrerDisplayName(label)).not.toMatch(/%/)
  })

  it.each(Object.entries(BACKEND_DOMAINS))('%s and the label %s are one row in name mode', (host, label) => {
    expect(getReferrerDisplayName(host)).toBe(getReferrerDisplayName(label))
  })

  it('the brand-name spelling and the host spelling merge, in name mode and in domain mode', () => {
    const rows = [
      { referrer: 'Product Hunt', pageviews: 14, visitors: 7 },
      { referrer: 'producthunt.com', pageviews: 9, visitors: 5 },
    ]
    const byName = mergeReferrersByDisplayName(rows, false)
    expect(byName).toHaveLength(1)
    expect(getReferrerDisplayName(byName[0].referrer)).toBe('Product Hunt')
    expect(byName[0].allReferrers.sort()).toEqual(['Product Hunt', 'producthunt.com'])
    const byDomain = mergeReferrersByDisplayName(rows, true)
    expect(byDomain).toHaveLength(1)
    expect(byDomain[0].address).toBe('producthunt.com')
    expect(byDomain[0].visitors).toBe(12)
  })

  it('a brand-name row opens the brand\'s site', () => {
    expect(getOpenHostname('Product Hunt')).toBe('producthunt.com')
    expect(getOpenHostname('Hacker News')).toBe('news.ycombinator.com')
    expect(getOpenHostname('Twitter')).toBe('x.com')
  })
})

describe('a brand with no curated artwork draws its domain\'s favicon (PUL-23)', () => {
  it.each([['Yahoo', 'yahoo.com'], ['search.yahoo.com', 'yahoo.com'], ['Medium', 'medium.com'], ['TikTok', 'tiktok.com'], ['Quora', 'quora.com']])(
    '%s → the %s favicon', (referrer, domain) => {
      expect(getReferrerFavicon(referrer)).toBe(`/api/favicon?domain=${domain}&sz=32`)
    })

  it('a brand WITH curated artwork draws no favicon (its own mark)', () => {
    for (const r of ['Product Hunt', 'producthunt.com', 'Google', 'news.ycombinator.com', 'Stack Overflow', 'Meta AI']) {
      expect(getReferrerFavicon(r), r).toBeNull()
    }
  })

  it('an unknown host still draws its own favicon, unchanged', () => {
    expect(getReferrerFavicon('uneed.best')).toBe('/api/favicon?domain=uneed.best&sz=32')
  })
})

// Chrome's URL parser percent-encodes whitespace in a host instead of
// rejecting it; Node (where these tests run) throws. Measured 13-10-2026 in
// Chromium 147: new URL('https://Product Hunt').hostname === 'product%20hunt',
// new URL('https://foo bar.com').hostname === 'foo%20bar.com'. This stub
// reproduces that, so the guard is proven against the engine that broke.
class ChromeLikeURL extends URL {
  private readonly chromeHost: string | null
  constructor(input: string | URL, base?: string | URL) {
    const s = String(input)
    const m = /^https?:\/\/([^/?#]*\s[^/?#]*)/i.exec(s)
    super(m ? s.replace(m[1], 'placeholder.invalid') : s, base)
    this.chromeHost = m ? m[1].toLowerCase().replace(/\s/g, '%20') : null
  }
  get hostname() { return this.chromeHost ?? super.hostname }
}

describe('a label with whitespace is never parsed as a host (PUL-23)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('the stub really reproduces Chrome (positive control)', () => {
    vi.stubGlobal('URL', ChromeLikeURL)
    expect(new URL('https://Product Hunt').hostname).toBe('product%20hunt')
  })

  it('an unknown multi-word label shows verbatim, never percent-encoded', () => {
    vi.stubGlobal('URL', ChromeLikeURL)
    expect(getReferrerDisplayName('Some App')).toBe('Some App')
    expect(getReferrerDisplayName('Product Hunt')).toBe('Product Hunt')
  })

  it('a value with whitespace never yields a host, a link or a favicon', () => {
    vi.stubGlobal('URL', ChromeLikeURL)
    expect(getOpenHostname('foo bar.com')).toBeNull()
    expect(getReferrerFavicon('foo bar.com')).toBeNull()
    expect(getReferrerCanonicalAddress('Some App')).toBeNull()
  })
})

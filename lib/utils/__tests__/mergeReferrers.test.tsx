import { describe, it, expect } from 'vitest'
import { getReferrerAddress, getReferrerCanonicalAddress, mergeReferrersByDisplayName } from '@/lib/utils/icons'

// The regression that shipped 01-09-2026: the server ranks referrer rows by
// visitors, and this merge re-sorted them by pageviews on the way to the
// card — Google (89 visitors, 152 pageviews) rendered above Shared Link
// (129 visitors) on the live dashboard. Merged rows must keep the visitors
// ordering the whole page ranks by.
describe('mergeReferrersByDisplayName ordering', () => {
  it('sorts merged rows by visitors, not pageviews', () => {
    const merged = mergeReferrersByDisplayName([
      { referrer: 'https://google.com', pageviews: 142, visitors: 60 },
      { referrer: 'https://www.google.com/search', pageviews: 10, visitors: 29 },
      { referrer: 'Shared Link', pageviews: 147, visitors: 129 },
      { referrer: 'https://chatgpt.com', pageviews: 36, visitors: 32 },
    ])
    expect(merged.map((r) => r.visitors)).toEqual([129, 89, 32])
    expect(merged[0].referrer).toBe('Shared Link')
  })

  it('breaks visitor ties by pageviews', () => {
    const merged = mergeReferrersByDisplayName([
      { referrer: 'a.example', pageviews: 5, visitors: 10 },
      { referrer: 'b.example', pageviews: 50, visitors: 10 },
    ])
    expect(merged.map((r) => r.referrer)).toEqual(['b.example', 'a.example'])
  })
})

// PULSE-171: referrer-domain display. getReferrerAddress is the "is this raw
// value a host" check the domain-mode merge and Sources' row label both use —
// it must never derive or guess an address, only recognise one.
describe('getReferrerAddress', () => {
  it('recognises a plain host', () => {
    expect(getReferrerAddress('google.com')).toBe('google.com')
  })

  it('recognises a subdomain host', () => {
    expect(getReferrerAddress('l.instagram.com')).toBe('l.instagram.com')
  })

  it('recognises a host with a port', () => {
    expect(getReferrerAddress('example.com:8080')).toBe('example.com:8080')
  })

  it('lowercases a mixed-case host', () => {
    expect(getReferrerAddress('GOOGLE.com')).toBe('google.com')
    expect(getReferrerAddress('L.Instagram.COM')).toBe('l.instagram.com')
  })

  it('returns null for the special, dot-less registry keys', () => {
    expect(getReferrerAddress('Direct')).toBeNull()
    expect(getReferrerAddress('Shared Link')).toBeNull()
  })

  it('returns null for a bare brand word with no dot', () => {
    expect(getReferrerAddress('ChatGPT')).toBeNull()
    expect(getReferrerAddress('Google')).toBeNull()
  })

  it('returns null for a value with a space, even one that contains a dot', () => {
    expect(getReferrerAddress('my site.com')).toBeNull()
  })

  it('returns null for a value carrying a scheme, never derives the host from it', () => {
    expect(getReferrerAddress('https://google.com')).toBeNull()
    expect(getReferrerAddress('http://example.com/path')).toBeNull()
  })

  it('returns null for empty or missing input', () => {
    expect(getReferrerAddress('')).toBeNull()
    expect(getReferrerAddress(null)).toBeNull()
    expect(getReferrerAddress(undefined)).toBeNull()
  })
})

describe('mergeReferrersByDisplayName domain mode (PULSE-171)', () => {
  it('off (default): grouping is byte-for-byte the same as today, by display name', () => {
    const rows = [
      { referrer: 'reddit.com', pageviews: 10, visitors: 5 },
      { referrer: 'old.reddit.com', pageviews: 3, visitors: 2 },
    ]
    const withoutFlag = mergeReferrersByDisplayName(rows)
    const withFlagOff = mergeReferrersByDisplayName(rows, false)
    expect(withFlagOff).toEqual(withoutFlag)
    // "Reddit" (reddit.com) and "Old" (old.reddit.com, no subdomain-skip
    // entry for "old") are already two different display names today.
    expect(withoutFlag).toHaveLength(2)
  })

  it('on: keys by the lowercased host, not the brand label — reddit.com and old.reddit.com stay separate rows', () => {
    const merged = mergeReferrersByDisplayName(
      [
        { referrer: 'reddit.com', pageviews: 10, visitors: 5 },
        { referrer: 'REDDIT.com', pageviews: 4, visitors: 3 },
        { referrer: 'old.reddit.com', pageviews: 3, visitors: 2 },
      ],
      true,
    )
    // reddit.com and REDDIT.com are the SAME host case-insensitively — one row.
    const redditRow = merged.find((r) => r.referrer.toLowerCase() === 'reddit.com' || r.referrer === 'REDDIT.com')
    expect(redditRow?.pageviews).toBe(14)
    expect(redditRow?.visitors).toBe(8)
    // old.reddit.com is a DIFFERENT host — its own row, not folded into reddit.com's.
    const oldRow = merged.find((r) => r.referrer === 'old.reddit.com')
    expect(oldRow?.pageviews).toBe(3)
    expect(oldRow?.visitors).toBe(2)
    expect(merged).toHaveLength(2)
  })

  it('on: a host-less row (Direct, Shared Link, a brand-only value) still merges by display name', () => {
    const merged = mergeReferrersByDisplayName(
      [
        { referrer: 'Direct', pageviews: 20, visitors: 15 },
        { referrer: 'Direct', pageviews: 5, visitors: 4 },
        { referrer: 'ChatGPT', pageviews: 6, visitors: 4 },
      ],
      true,
    )
    const direct = merged.find((r) => r.referrer === 'Direct')
    expect(direct?.pageviews).toBe(25)
    expect(direct?.visitors).toBe(19)
    const chatgpt = merged.find((r) => r.referrer === 'ChatGPT')
    expect(chatgpt?.pageviews).toBe(6)
    expect(merged).toHaveLength(2)
  })

  it('on: sums counts and keeps allReferrers for a merged host group', () => {
    const merged = mergeReferrersByDisplayName(
      [
        { referrer: 'reddit.com', pageviews: 10, visitors: 5 },
        { referrer: 'reddit.com', pageviews: 2, visitors: 1 },
      ],
      true,
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].pageviews).toBe(12)
    expect(merged[0].visitors).toBe(6)
    expect(merged[0].allReferrers).toEqual(['reddit.com'])
  })
})

// One row per platform in referrer-domain mode (owner, 01-10-2026: "why is reddit
// in here twice?"). Ingest stores a platform as its host when the browser sent a
// referrer (reddit.com) and as its brand name when it fell back to utm_source or
// the in-app user agent (Reddit). Name mode merged them by display name; domain
// mode must merge them by the platform's address. Measured in production: the
// same split exists for Facebook, Instagram, ChatGPT, LinkedIn and Perplexity.
describe('referrer-domain mode keeps one row per known platform', () => {
  it('merges a brand-only value into its platform host row, labelled by the host', () => {
    const merged = mergeReferrersByDisplayName([
      { referrer: 'Reddit', pageviews: 15, visitors: 5 },
      { referrer: 'reddit.com', pageviews: 5, visitors: 4 },
      { referrer: 'github.com', pageviews: 6, visitors: 4 },
    ], true)
    const reddit = merged.find((r) => r.allReferrers.includes('Reddit'))
    expect(reddit).toBeDefined()
    expect(reddit!.allReferrers.sort()).toEqual(['Reddit', 'reddit.com'])
    expect(reddit!.visitors).toBe(9)
    expect(merged).toHaveLength(2)
    expect(getReferrerCanonicalAddress('Reddit')).toBe('reddit.com')
  })

  it('merges the other measured splits the same way', () => {
    for (const [brand, host] of [['Facebook', 'facebook.com'], ['Instagram', 'instagram.com'], ['ChatGPT', 'chatgpt.com'], ['LinkedIn', 'linkedin.com'], ['Perplexity', 'perplexity.ai']]) {
      const merged = mergeReferrersByDisplayName([
        { referrer: brand, pageviews: 3, visitors: 2 },
        { referrer: host, pageviews: 4, visitors: 3 },
      ], true)
      expect(merged, brand).toHaveLength(1)
      expect(getReferrerCanonicalAddress(brand), brand).toBe(host)
    }
  })

  it('keeps a real but different host of the same platform as its own row', () => {
    const merged = mergeReferrersByDisplayName([
      { referrer: 'reddit.com', pageviews: 5, visitors: 4 },
      { referrer: 'old.reddit.com', pageviews: 2, visitors: 2 },
    ], true)
    expect(merged).toHaveLength(2)
  })

  it('keeps names for rows with no address of their own', () => {
    for (const name of ['Direct', 'Shared Link', 'Some Newsletter']) {
      expect(getReferrerCanonicalAddress(name), name).toBeNull()
    }
    const merged = mergeReferrersByDisplayName([
      { referrer: 'Direct', pageviews: 10, visitors: 8 },
      { referrer: 'Shared Link', pageviews: 4, visitors: 3 },
    ], true)
    expect(merged.map((r) => r.referrer).sort()).toEqual(['Direct', 'Shared Link'])
  })

  it('leaves name mode exactly as it was: brand and host already merge by display name', () => {
    const merged = mergeReferrersByDisplayName([
      { referrer: 'Reddit', pageviews: 15, visitors: 5 },
      { referrer: 'reddit.com', pageviews: 5, visitors: 4 },
    ], false)
    expect(merged).toHaveLength(1)
    expect(merged[0].visitors).toBe(9)
  })
})

// Domain mode as an exact refinement of name mode (01-10-2026, after the first fix
// shipped): a platform the registry does not know is split the same way —
// pulse.ciphera.net showed "uneed.best" (8) and "Uneed" (3) as two rows.
describe('referrer-domain mode merges a brand-only value into its host row from the list', () => {
  it('merges an unknown brand into the host that shows its name in name mode, labelled by the host', () => {
    const merged = mergeReferrersByDisplayName([
      { referrer: 'uneed.best', pageviews: 10, visitors: 8 },
      { referrer: 'Uneed', pageviews: 20, visitors: 3 },
    ], true)
    expect(merged).toHaveLength(1)
    expect(merged[0].visitors).toBe(11)
    expect(merged[0].allReferrers.sort()).toEqual(['Uneed', 'uneed.best'])
    // The brand member has the most pageviews, so it is the representative referrer;
    // the label must still be the address the row groups by.
    expect(merged[0].referrer).toBe('Uneed')
    expect(merged[0].address).toBe('uneed.best')
  })

  it('joins the most-visited host when a platform has several, and keeps the others separate', () => {
    const merged = mergeReferrersByDisplayName([
      { referrer: 'reddit.com', pageviews: 5, visitors: 4 },
      { referrer: 'old.reddit.com', pageviews: 2, visitors: 2 },
      { referrer: 'Reddit', pageviews: 15, visitors: 5 },
    ], true)
    expect(merged).toHaveLength(2)
    const main = merged.find((r) => r.address === 'reddit.com')!
    expect(main.allReferrers.sort()).toEqual(['Reddit', 'reddit.com'])
    expect(merged.find((r) => r.address === 'old.reddit.com')!.allReferrers).toEqual(['old.reddit.com'])
  })

  it('keeps an unknown name with no host in the list as a name, with no address', () => {
    const merged = mergeReferrersByDisplayName([
      { referrer: 'Newsletter', pageviews: 4, visitors: 3 },
      { referrer: 'github.com', pageviews: 6, visitors: 4 },
    ], true)
    const nl = merged.find((r) => r.referrer === 'Newsletter')!
    expect(nl.address).toBeNull()
  })

  it('sets no address in name mode', () => {
    const merged = mergeReferrersByDisplayName([
      { referrer: 'uneed.best', pageviews: 10, visitors: 8 },
      { referrer: 'Uneed', pageviews: 20, visitors: 3 },
    ], false)
    expect(merged).toHaveLength(1)
    expect(merged[0].address).toBeNull()
  })
})

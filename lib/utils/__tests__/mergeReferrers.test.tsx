import { describe, it, expect } from 'vitest'
import { getReferrerAddress, mergeReferrersByDisplayName } from '@/lib/utils/icons'

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

import { describe, it, expect } from 'vitest'
import { getOpenHostname } from '@/lib/utils/icons'

// PULSE-197: "is this referrer a real, openable website" — the gate a
// Referrers row's name-link uses to decide whether it becomes an <a> at all.
// Ported from Pulse/docs/data/01-10-2026-referrer-open-mocks/referrer-logic.mjs,
// which this round measured against ciphera.net's own live data before
// settling on the rule (see that file's header comment for why
// `getReferrerHostname` could not be reused unmodified: it returns the bogus
// one-label "hostname" `chatgpt` for the bare brand word "ChatGPT").
describe('getOpenHostname', () => {
  it('returns null for the special non-URL values, case-insensitively', () => {
    // Mutation checked: dropping `REFERRER_NO_FAVICON.has(lower)` (or its
    // lowercasing) makes 'Direct' and 'SHARED LINK' fall through to the
    // bare-registry lookup, which has no 'direct' entry wired without the
    // special-value short-circuit, but DOES for the exact-cased registry key
    // match on 'direct' lowercase — so without the guard the test still
    // passing on exact case would hide a case-sensitivity regression; this
    // asserts mixed case explicitly so a removed `.toLowerCase()` on `lower`
    // is caught too.
    expect(getOpenHostname('direct')).toBeNull()
    expect(getOpenHostname('Direct')).toBeNull()
    expect(getOpenHostname('DIRECT')).toBeNull()
    expect(getOpenHostname('shared link')).toBeNull()
    expect(getOpenHostname('Shared Link')).toBeNull()
    expect(getOpenHostname('unknown')).toBeNull()
    expect(getOpenHostname('Unknown')).toBeNull()
    expect(getOpenHostname('')).toBeNull()
  })

  it('trusts a dotted raw value as a real hostname', () => {
    // Mutation checked: removing the `lower.includes('.')` gate (or the
    // nested `url.hostname.includes('.')` check) and this would still pass
    // for plain hosts — the gate's own failure mode is a BARE value getting
    // treated as dotted, which the registry-bypass tests below pin instead.
    // What this test alone catches: deleting the URL-construction branch
    // entirely (returning null unconditionally for dotted input).
    expect(getOpenHostname('google.com')).toBe('google.com')
    expect(getOpenHostname('search.google.com')).toBe('search.google.com')
  })

  it('resolves a bare registry brand to its declared hostname', () => {
    // Mutation checked: swapping `entry.hostnames[0]` for `entry.domain` (the
    // OTHER per-brand address icons.tsx carries, used by
    // getReferrerCanonicalAddress for a different purpose) changes this to
    // 'chatgpt.com' — the exact bug this round's README documents finding
    // and rejecting. This pins the hostnames[0] choice specifically.
    expect(getOpenHostname('ChatGPT')).toBe('chat.openai.com')
  })

  it("resolves a bare registry brand with no declared hostnames to its auto-derived `${key}.com`", () => {
    // Mutation checked: removing the `${key}.com` fallback (returning null
    // instead when `entry.hostnames` is absent) breaks this, since LinkedIn's
    // registry entry carries no `hostnames` field.
    expect(getOpenHostname('LinkedIn')).toBe('linkedin.com')
  })

  it('returns null for a bare value matching no registry entry', () => {
    // Mutation checked: removing the final `if (!entry) return null` (falling
    // through to `${key}.com` with key undefined) would throw or stringify to
    // "undefined.com" instead of returning null.
    expect(getOpenHostname('SomeInAppWidget')).toBeNull()
    expect(getOpenHostname('Uneed')).toBeNull()
  })

  it('never builds a link from an unparseable or unsafe raw value', () => {
    // Mutation checked: dropping the dot-gate before URL construction would
    // make `new URL('https://javascript:alert(1)')` or similar attempts run;
    // the current implementation never even reaches `new URL` for any of
    // these three, which is itself the safety property worth pinning —
    // removing the gate lets 'http://x' (no dot) or a spaced value slip
    // through to a registry lookup that still correctly returns null, so the
    // real regression this guards is a FUTURE loosening of the dot gate that
    // starts constructing URLs from these.
    expect(getOpenHostname('javascript:alert(1)')).toBeNull()
    expect(getOpenHostname('http://x')).toBeNull()
    expect(getOpenHostname('my site.com')).toBeNull()
  })

  it('returns null for null, undefined, and non-string input', () => {
    expect(getOpenHostname(null)).toBeNull()
    expect(getOpenHostname(undefined)).toBeNull()
  })

  it('links a schemeless hostname that merely starts with the letters "http"', () => {
    expect(getOpenHostname('httpbin.org')).toBe('httpbin.org')
    expect(getOpenHostname('http2.pro')).toBe('http2.pro')
    expect(getOpenHostname('https://www.example.com/path')).toBe('www.example.com')
  })
})

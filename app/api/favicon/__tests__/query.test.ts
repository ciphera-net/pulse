import { describe, it, expect } from 'vitest'
import { readFaviconQuery } from '../query'

// The reader works on the RAW query string, because the point is the difference between two parsers of the same
// string. Each "two readings" case states what the URL API makes of it, so the test shows the gap it closes.

/** What a route reading `searchParams` would have resolved: the first `domain` after percent-decoding the names. */
function urlApiDomain(search: string): string | null {
  return new URLSearchParams(search).get('domain')
}

describe('readFaviconQuery', () => {
  it('reads the addresses the callers write', () => {
    expect(readFaviconQuery('?domain=github.com&sz=32')).toEqual({ domain: 'github.com', sz: '32', fallback: null })
    expect(readFaviconQuery('?domain=github.com&sz=32&fallback=email')).toEqual({ domain: 'github.com', sz: '32', fallback: 'email' })
    // Order is free: each name is still read exactly once.
    expect(readFaviconQuery('?sz=128&domain=sub.example.co.uk')).toEqual({ domain: 'sub.example.co.uk', sz: '128', fallback: null })
    // The leading "?" is optional, and a punycode name needs no decoding.
    expect(readFaviconQuery('domain=example.xn--p1ai&sz=64')).toEqual({ domain: 'example.xn--p1ai', sz: '64', fallback: null })
  })

  it('keeps the value as written and leaves judging it to the route', () => {
    // Case is the route's to fold, and whether "999" is a size or "10.0.0.1" a hostname is the route's to refuse.
    expect(readFaviconQuery('?domain=GitHub.com&sz=999')).toEqual({ domain: 'GitHub.com', sz: '999', fallback: null })
    expect(readFaviconQuery('?domain=10.0.0.1')).toEqual({ domain: '10.0.0.1', sz: null, fallback: null })
    expect(readFaviconQuery('?domain=&sz=32')).toEqual({ domain: '', sz: '32', fallback: null })
  })

  it('reads an empty query as no domain', () => {
    expect(readFaviconQuery('')).toEqual({ domain: '', sz: null, fallback: null })
    expect(readFaviconQuery('?')).toEqual({ domain: '', sz: null, fallback: null })
  })

  it('refuses a name written with a percent-escape, which the URL API reads as the name itself', () => {
    const search = '?%64omain=evil.example.org&domain=github.com&sz=32'
    // The gap: the URL API resolves the FIRST domain, a cache comparing names as written keys the SECOND.
    expect(urlApiDomain(search)).toBe('evil.example.org')
    expect(readFaviconQuery(search)).toBeNull()
  })

  it('refuses a name given twice', () => {
    const search = '?domain=evil.example.org&domain=github.com&sz=32'
    expect(urlApiDomain(search)).toBe('evil.example.org')
    expect(readFaviconQuery(search)).toBeNull()
    expect(readFaviconQuery('?domain=github.com&sz=32&sz=64')).toBeNull()
    expect(readFaviconQuery('?domain=github.com&fallback=email&fallback=email')).toBeNull()
  })

  it('refuses every name it does not know, a different case included', () => {
    expect(readFaviconQuery('?Domain=evil.example.org&domain=github.com&sz=32')).toBeNull()
    expect(readFaviconQuery('?domain=github.com&sz=32&x=1')).toBeNull()
    expect(readFaviconQuery('?domain=github.com&sz=32&x=.png')).toBeNull()
    expect(readFaviconQuery('?domain=github.com&SZ=32')).toBeNull()
    expect(readFaviconQuery('?domain=github.com&_rsc=abc')).toBeNull()
  })

  it('refuses a value that a parser could decode into something else', () => {
    for (const search of [
      '?domain=git%68ub.com&sz=32', // percent-escape
      '?domain=github.com+&sz=32', // "+" is a space to a form parser
      '?domain=%20github.com&sz=32',
      '?domain=github.com&sz=%33%32',
      '?domain=github.com/x&sz=32',
      '?domain=github.com:443&sz=32',
      '?domain=a=b&sz=32', // a second "=" inside a pair
      '?domain=github.com&sz=32&fallback=https://evil.example/x.png',
      '?domain=münchen.de&sz=32', // not ASCII
    ]) {
      expect(readFaviconQuery(search), search).toBeNull()
    }
  })

  it('refuses a pair with no name or no "="', () => {
    for (const search of ['?domain=github.com&sz=32&', '?&domain=github.com', '?domain=github.com&&sz=32', '?domain', '?=github.com', '?domain=github.com&fallback']) {
      expect(readFaviconQuery(search), search).toBeNull()
    }
  })
})

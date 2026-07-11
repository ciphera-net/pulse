import { describe, it, expect } from 'vitest'
import {
  serializeFilters,
  parseFiltersFromURL,
  escapeFilterValue,
  unescapeFilterValue,
  filterLabel,
  DIMENSIONS,
  OPERATORS,
  type DimensionFilter,
} from '../filters'

describe('serializeFilters', () => {
  it('returns empty string for empty array', () => {
    expect(serializeFilters([])).toBe('')
  })

  it('serializes a single filter with the v2 prefix', () => {
    const filters: DimensionFilter[] = [
      { dimension: 'browser', operator: 'is', values: ['Chrome'] },
    ]
    expect(serializeFilters(filters)).toBe('v2:browser|is|Chrome')
  })

  it('serializes multiple values with semicolons', () => {
    const filters: DimensionFilter[] = [
      { dimension: 'country', operator: 'is', values: ['US', 'GB', 'DE'] },
    ]
    expect(serializeFilters(filters)).toBe('v2:country|is|US;GB;DE')
  })

  it('serializes multiple filters with commas', () => {
    const filters: DimensionFilter[] = [
      { dimension: 'browser', operator: 'is', values: ['Chrome'] },
      { dimension: 'country', operator: 'is_not', values: ['CN'] },
    ]
    expect(serializeFilters(filters)).toBe('v2:browser|is|Chrome,country|is_not|CN')
  })
})

describe('parseFiltersFromURL', () => {
  it('returns empty array for empty string', () => {
    expect(parseFiltersFromURL('')).toEqual([])
  })

  it('parses a single filter', () => {
    const result = parseFiltersFromURL('browser|is|Chrome')
    expect(result).toEqual([
      { dimension: 'browser', operator: 'is', values: ['Chrome'] },
    ])
  })

  it('parses multiple values', () => {
    const result = parseFiltersFromURL('country|is|US;GB;DE')
    expect(result).toEqual([
      { dimension: 'country', operator: 'is', values: ['US', 'GB', 'DE'] },
    ])
  })

  it('parses multiple filters', () => {
    const result = parseFiltersFromURL('browser|is|Chrome,country|is_not|CN')
    expect(result).toHaveLength(2)
    expect(result[0].dimension).toBe('browser')
    expect(result[1].dimension).toBe('country')
  })

  it('drops filters with missing values', () => {
    const result = parseFiltersFromURL('browser|is')
    expect(result).toEqual([])
  })

  it('handles completely invalid input', () => {
    const result = parseFiltersFromURL('|||')
    expect(result).toEqual([])
  })

  it('drops filters with an empty or whitespace-only value (would 400 forever)', () => {
    expect(parseFiltersFromURL('browser|is|')).toEqual([])
    expect(parseFiltersFromURL('browser|is|   ')).toEqual([])
    // keeps the non-empty values, drops the empty ones
    expect(parseFiltersFromURL('country|is|US;;GB')).toEqual([
      { dimension: 'country', operator: 'is', values: ['US', 'GB'] },
    ])
  })

  it('drops malformed entries but keeps valid ones', () => {
    const result = parseFiltersFromURL('browser|is|Chrome,bad|input,country|is|US')
    expect(result).toHaveLength(2)
    expect(result[0].dimension).toBe('browser')
    expect(result[1].dimension).toBe('country')
  })
})

describe('escapeFilterValue / unescapeFilterValue', () => {
  it('escapes only the structural delimiters and %', () => {
    expect(escapeFilterValue('a,b')).toBe('a%2Cb')
    expect(escapeFilterValue('a|b')).toBe('a%7Cb')
    expect(escapeFilterValue('a;b')).toBe('a%3Bb')
    expect(escapeFilterValue('100%')).toBe('100%25')
    // plain values (incl. spaces, slashes) stay byte-identical to legacy format
    expect(escapeFilterValue('/blog/post one')).toBe('/blog/post one')
  })

  it('escapes % first so escape sequences are unambiguous', () => {
    // a value that literally contains an escape sequence
    expect(escapeFilterValue('%2C')).toBe('%252C')
    expect(unescapeFilterValue('%252C')).toBe('%2C')
  })

  it('unescape is the exact inverse of escape', () => {
    const nasty = ['a,b', 'a|b', 'a;b', '100%', '%2C', '%25', ',;|%', 'a%2Cb', '%%,,;;||']
    for (const v of nasty) {
      expect(unescapeFilterValue(escapeFilterValue(v))).toBe(v)
    }
  })

  it('leaves legacy percent-sequences it did not produce untouched', () => {
    // URL-encoded page paths are real filter values in analytics data
    expect(unescapeFilterValue('/caf%C3%A9')).toBe('/caf%C3%A9')
    expect(unescapeFilterValue('q=a%20b')).toBe('q=a%20b')
    expect(unescapeFilterValue('100%')).toBe('100%')
    // lowercase variants are not encoder output — passed through
    expect(unescapeFilterValue('a%2cb')).toBe('a%2cb')
  })
})

describe('serialize/parse roundtrip', () => {
  it('roundtrips a complex filter set', () => {
    const filters: DimensionFilter[] = [
      { dimension: 'page', operator: 'contains', values: ['/blog'] },
      { dimension: 'country', operator: 'is', values: ['US', 'GB'] },
      { dimension: 'browser', operator: 'is_not', values: ['IE'] },
    ]
    const serialized = serializeFilters(filters)
    const parsed = parseFiltersFromURL(serialized)
    expect(parsed).toEqual(filters)
  })

  it('roundtrips values containing the structural delimiters', () => {
    const filters: DimensionFilter[] = [
      { dimension: 'page', operator: 'is', values: ['/a,b', '/c;d', '/e|f'] },
      { dimension: 'utm_campaign', operator: 'contains', values: ['summer|sale, 50%'] },
    ]
    const serialized = serializeFilters(filters)
    // delimiters never appear raw inside values on the wire
    expect(serialized).toBe(
      'v2:page|is|/a%2Cb;/c%3Bd;/e%7Cf,utm_campaign|contains|summer%7Csale%2C 50%25'
    )
    expect(parseFiltersFromURL(serialized)).toEqual(filters)
  })

  it('roundtrips values that look like escape sequences', () => {
    const filters: DimensionFilter[] = [
      { dimension: 'page', operator: 'contains', values: ['/x%2Cy', '%25'] },
    ]
    expect(parseFiltersFromURL(serializeFilters(filters))).toEqual(filters)
  })

  it('parses legacy (unprefixed) URLs verbatim — no unescaping', () => {
    // Pre-v2 bookmarked URLs: ingest stores page paths with literal %2C/%25
    // (re-encoded query strings), and legacy filters on them must keep matching.
    expect(
      parseFiltersFromURL('page|is|/search?q=a%2Cb,country|is|US;GB')
    ).toEqual([
      { dimension: 'page', operator: 'is', values: ['/search?q=a%2Cb'] },
      { dimension: 'country', operator: 'is', values: ['US', 'GB'] },
    ])
    expect(parseFiltersFromURL('page|contains|/caf%C3%A9')).toEqual([
      { dimension: 'page', operator: 'contains', values: ['/caf%C3%A9'] },
    ])
    expect(parseFiltersFromURL('page|contains|/promo%25off')).toEqual([
      { dimension: 'page', operator: 'contains', values: ['/promo%25off'] },
    ])
  })

  it('re-serializing a parsed legacy URL preserves its meaning', () => {
    // legacy raw value /search?q=a%2Cb -> parse keeps it verbatim -> v2
    // serialize escapes the % -> v2 parse restores the identical value
    const legacy = parseFiltersFromURL('page|is|/search?q=a%2Cb')
    const reserialized = serializeFilters(legacy)
    expect(reserialized).toBe('v2:page|is|/search?q=a%252Cb')
    expect(parseFiltersFromURL(reserialized)).toEqual(legacy)
  })
})

describe('filterLabel', () => {
  it('returns human-readable label for known dimension', () => {
    const f: DimensionFilter = { dimension: 'browser', operator: 'is', values: ['Chrome'] }
    expect(filterLabel(f)).toBe('Browser is Chrome')
  })

  it('shows count for multiple values', () => {
    const f: DimensionFilter = { dimension: 'country', operator: 'is', values: ['US', 'GB', 'DE'] }
    expect(filterLabel(f)).toBe('Country is US +2')
  })

  it('falls back to raw dimension name if unknown', () => {
    const f: DimensionFilter = { dimension: 'custom_dim', operator: 'contains', values: ['foo'] }
    expect(filterLabel(f)).toBe('custom_dim contains foo')
  })

  it('uses readable operator labels', () => {
    const f: DimensionFilter = { dimension: 'page', operator: 'not_contains', values: ['/admin'] }
    expect(filterLabel(f)).toBe('Page does not contain /admin')
  })
})

describe('constants', () => {
  it('DIMENSIONS includes expected entries', () => {
    expect(DIMENSIONS).toContain('page')
    expect(DIMENSIONS).toContain('browser')
    expect(DIMENSIONS).toContain('utm_source')
  })

  it('OPERATORS includes all four types', () => {
    expect(OPERATORS).toEqual(['is', 'is_not', 'contains', 'not_contains'])
  })
})

import { describe, it, expect } from 'vitest'
import {
  serializeFilters,
  parseFiltersFromURL,
  escapeFilterValue,
  unescapeFilterValue,
  filterLabel,
  DIMENSIONS,
  OPERATORS,
  canMatchAny,
  modeFor,
  parseFilterMode,
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

  it('names the two dimensions only a Locations row can set', () => {
    // Without a label the pill showed the raw keys: "language is en-US", "timezone is Europe/Brussels".
    expect(filterLabel({ dimension: 'language', operator: 'is', values: ['en-US'] })).toBe('Language is en-US')
    expect(filterLabel({ dimension: 'timezone', operator: 'is', values: ['Europe/Brussels'] })).toBe('Timezone is Europe/Brussels')
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

describe('the event filter kinds (R45)', () => {
  it('writes and reads a property kind with its key escaped, the event lower-cased', async () => {
    const { eventPropertyKind, eventPropertyOf, isEventKind, OUTBOUND_KIND } = await import('../filters')
    const kind = eventPropertyKind('Signup', 'a:b,c|d;e%f')
    expect(kind).toBe('event_property:signup:a:b%2Cc%7Cd%3Be%25f')
    expect(eventPropertyOf(kind)).toEqual({ event: 'signup', key: 'a:b,c|d;e%f' })
    expect(OUTBOUND_KIND).toBe('event_property:outbound_link:url')
    expect(isEventKind('event')).toBe(true)
    expect(isEventKind(kind)).toBe(true)
    expect(isEventKind('event_name')).toBe(false)
    expect(isEventKind('event_property:signup')).toBe(false)
    expect(isEventKind('event_property::plan')).toBe(false)
    expect(isEventKind('event_property:signup:')).toBe(false)
  })

  it('round-trips through the address exactly as the server parses it', async () => {
    const { eventPropertyKind } = await import('../filters')
    const filters: DimensionFilter[] = [
      { dimension: 'country', operator: 'is', values: ['NO'] },
      { dimension: 'event', operator: 'is_not', values: ['signup', 'purchase'] },
      { dimension: eventPropertyKind('signup', 'plan;tier'), operator: 'is', values: ['pro,annual'] },
    ]
    const raw = serializeFilters(filters)
    expect(raw).toBe('v2:country|is|NO,event|is_not|signup;purchase,event_property:signup:plan%3Btier|is|pro%2Cannual')
    expect(parseFiltersFromURL(raw)).toEqual(filters)
  })

  it('reads an old event_name as an event, lower-cased, and leaves the rest alone', async () => {
    const { readEventNameAsEvent } = await import('../filters')
    const filters: DimensionFilter[] = [
      { dimension: 'event_name', operator: 'contains', values: ['Sign'] },
      { dimension: 'page', operator: 'is', values: ['/Pricing'] },
    ]
    expect(readEventNameAsEvent(filters)).toEqual([
      { dimension: 'event', operator: 'contains', values: ['sign'] },
      { dimension: 'page', operator: 'is', values: ['/Pricing'] },
    ])
    const none: DimensionFilter[] = [{ dimension: 'page', operator: 'is', values: ['/'] }]
    expect(readEventNameAsEvent(none)).toBe(none)
  })

  it('names the kinds as a pill reads them', async () => {
    const { eventPropertyKind, kindLabel, OUTBOUND_KIND } = await import('../filters')
    expect(kindLabel('event')).toBe('Event')
    expect(kindLabel(OUTBOUND_KIND)).toBe('Outbound link')
    expect(kindLabel(eventPropertyKind('signup', 'plan'), (e) => (e === 'signup' ? 'Sign-ups' : e))).toBe('Sign-ups: plan')
    expect(filterLabel({ dimension: OUTBOUND_KIND, operator: 'is', values: ['shop.example/cart'] })).toBe('Outbound link is shop.example/cart')
    expect(filterLabel({ dimension: eventPropertyKind('signup', 'plan'), operator: 'is_not', values: ['pro'] })).toBe('signup: plan is not pro')
  })
})

// Match any (R65 of 16-11-2026): the mode travels inside the filters string, in front of the version.
describe('Match any', () => {
  const germany: DimensionFilter = { dimension: 'country', operator: 'is', values: ['DE'] }
  const google: DimensionFilter = { dimension: 'referrer', operator: 'is', values: ['google'] }
  const signup: DimensionFilter = { dimension: 'event', operator: 'is', values: ['signup'] }
  const oldEvent: DimensionFilter = { dimension: 'event_name', operator: 'is', values: ['signup'] }

  it('writes any: in front of the version, and leaves Match all byte for byte as it was', () => {
    expect(serializeFilters([germany, google])).toBe('v2:country|is|DE,referrer|is|google')
    expect(serializeFilters([germany, google], 'all')).toBe('v2:country|is|DE,referrer|is|google')
    expect(serializeFilters([germany, google], 'any')).toBe('any:v2:country|is|DE,referrer|is|google')
  })

  it('reads the mode and the filters apart, and the two round-trip', () => {
    const text = serializeFilters([germany, google], 'any')
    expect(parseFilterMode(text)).toBe('any')
    expect(parseFiltersFromURL(text)).toEqual([germany, google])
    expect(parseFilterMode('v2:country|is|DE,referrer|is|google')).toBe('all')
    expect(parseFilterMode('')).toBe('all')
    expect(parseFilterMode(null)).toBe('all')
  })

  it('takes any: only in front of the version', () => {
    // A legacy (unversioned) string that starts with "any:" is a dimension the allowlist refuses, never a mode.
    expect(parseFilterMode('any:country|is|DE')).toBe('all')
    expect(parseFiltersFromURL('any:country|is|DE')).toEqual([{ dimension: 'any:country', operator: 'is', values: ['DE'] }])
  })

  it('one filter says the same under both, so it is written as Match all', () => {
    expect(canMatchAny([germany])).toBe(false)
    expect(modeFor([germany], 'any')).toBe('all')
    expect(serializeFilters([germany], 'any')).toBe('v2:country|is|DE')
  })

  it('an event filter keeps the set on Match all: the server refuses Any beside one', () => {
    for (const event of [signup, oldEvent]) {
      expect(canMatchAny([germany, google, event])).toBe(false)
      expect(modeFor([germany, google, event], 'any')).toBe('all')
      expect(serializeFilters([germany, event], 'any').startsWith('v2:')).toBe(true)
    }
    expect(canMatchAny([germany, google])).toBe(true)
    expect(modeFor([germany, google], 'any')).toBe('any')
  })
})

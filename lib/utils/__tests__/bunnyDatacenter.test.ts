import { describe, it, expect } from 'vitest'
import { extractCountryCode, extractCity } from '../bunnyDatacenter'

describe('extractCountryCode', () => {
  it('returns the ISO country for non-NA regions', () => {
    expect(extractCountryCode('EU: Zurich, CH')).toBe('CH')
    // * DE is Germany here, not Delaware
    expect(extractCountryCode('EU: Frankfurt, DE')).toBe('DE')
    // * NL is the Netherlands here, not Newfoundland
    expect(extractCountryCode('EU: Amsterdam, NL')).toBe('NL')
    expect(extractCountryCode('AS: Singapore, SG')).toBe('SG')
    expect(extractCountryCode('SA: Sao Paulo, BR')).toBe('BR')
  })

  it('maps NA state and province suffixes to their country', () => {
    expect(extractCountryCode('NA: Chicago, IL')).toBe('US')
    expect(extractCountryCode('NA: Ashburn, VA')).toBe('US')
    expect(extractCountryCode('NA: Toronto, ON')).toBe('CA')
  })

  it('breaks the CA ambiguity inside NA by city', () => {
    // * California
    expect(extractCountryCode('NA: Los Angeles, CA')).toBe('US')
    // * Canada-as-country suffix
    expect(extractCountryCode('NA: Toronto, CA')).toBe('CA')
    expect(extractCountryCode('NA: Vancouver, CA')).toBe('CA')
  })

  it('passes plain country suffixes through inside NA', () => {
    expect(extractCountryCode('NA: Mexico City, MX')).toBe('MX')
  })

  it('returns empty for unparseable strings', () => {
    expect(extractCountryCode('')).toBe('')
    expect(extractCountryCode('Zurich')).toBe('')
    expect(extractCountryCode('EU: Somewhere, ABC')).toBe('')
  })
})

describe('extractCity', () => {
  it('extracts the city between region and code', () => {
    expect(extractCity('EU: Zurich, CH')).toBe('Zurich')
    expect(extractCity('NA: Los Angeles, CA')).toBe('Los Angeles')
  })

  it('falls back to the raw string without a region prefix', () => {
    expect(extractCity('Zurich')).toBe('Zurich')
  })
})

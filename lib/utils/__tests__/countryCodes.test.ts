import { describe, it, expect } from 'vitest'
import { alpha3ToAlpha2, countryName } from '../countryCodes'

describe('countryCodes', () => {
  it('alpha3ToAlpha2 maps known ISO 3166-1 codes', () => {
    expect(alpha3ToAlpha2('USA')).toBe('US')
    expect(alpha3ToAlpha2('GBR')).toBe('GB')
    expect(alpha3ToAlpha2('DEU')).toBe('DE')
  })

  it('alpha3ToAlpha2 is case-insensitive', () => {
    expect(alpha3ToAlpha2('usa')).toBe('US')
    expect(alpha3ToAlpha2('gbr')).toBe('GB')
  })

  it('alpha3ToAlpha2 returns null for unknown or empty codes', () => {
    expect(alpha3ToAlpha2('ZZZ')).toBeNull()
    expect(alpha3ToAlpha2('')).toBeNull()
  })

  it('countryName resolves display names', () => {
    expect(countryName('USA')).toMatch(/United States/)
    expect(countryName('DEU')).toBe('Germany')
  })

  it('countryName falls back to the raw code when unknown', () => {
    expect(countryName('ZZZ')).toBe('ZZZ')
  })
})

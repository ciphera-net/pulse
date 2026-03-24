import { describe, it, expect } from 'vitest'
import {
  serializeFilters,
  parseFiltersFromURL,
  filterLabel,
  DIMENSIONS,
  OPERATORS,
  type DimensionFilter,
} from '../filters'

describe('serializeFilters', () => {
  it('returns empty string for empty array', () => {
    expect(serializeFilters([])).toBe('')
  })

  it('serializes a single filter', () => {
    const filters: DimensionFilter[] = [
      { dimension: 'browser', operator: 'is', values: ['Chrome'] },
    ]
    expect(serializeFilters(filters)).toBe('browser|is|Chrome')
  })

  it('serializes multiple values with semicolons', () => {
    const filters: DimensionFilter[] = [
      { dimension: 'country', operator: 'is', values: ['US', 'GB', 'DE'] },
    ]
    expect(serializeFilters(filters)).toBe('country|is|US;GB;DE')
  })

  it('serializes multiple filters with commas', () => {
    const filters: DimensionFilter[] = [
      { dimension: 'browser', operator: 'is', values: ['Chrome'] },
      { dimension: 'country', operator: 'is_not', values: ['CN'] },
    ]
    expect(serializeFilters(filters)).toBe('browser|is|Chrome,country|is_not|CN')
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

  it('drops malformed entries but keeps valid ones', () => {
    const result = parseFiltersFromURL('browser|is|Chrome,bad|input,country|is|US')
    expect(result).toHaveLength(2)
    expect(result[0].dimension).toBe('browser')
    expect(result[1].dimension).toBe('country')
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

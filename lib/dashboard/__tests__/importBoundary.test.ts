import { describe, expect, it } from 'vitest'
import {
  DIMENSION_WORDS,
  cardImportNote,
  importBoundaryDay,
  importBoundaryLabel,
  importBoundaryX,
  importLeftOutByFilter,
  railIncludesImported,
} from '@/lib/dashboard/importBoundary'
import type { ImportedProvenance } from '@/lib/api/stats'

// Dashboard option 2 (PULSE-118, M11-h): every mark reads the response's own
// provenance, and a mark whose place is off the chart draws nothing.

const NONE: ImportedProvenance = { included: false, from: null, through: null, source: null, reason: null }
const incl = (through: string, over: Partial<ImportedProvenance> = {}): ImportedProvenance => ({
  included: true,
  from: '2026-08-29',
  through,
  source: 'plausible',
  reason: null,
  ...over,
})
const RANGE = { start: '2026-08-29', end: '2026-09-27' }

describe('the boundary line', () => {
  it('sits on the day after the last imported day when that day is in the range', () => {
    expect(importBoundaryDay(incl('2026-09-14'), RANGE)).toBe('2026-09-15')
  })

  it('draws at the range edges: the second day, and the last day', () => {
    expect(importBoundaryDay(incl('2026-08-29'), RANGE)).toBe('2026-08-30')
    expect(importBoundaryDay(incl('2026-09-26'), RANGE)).toBe('2026-09-27')
  })

  it('draws nothing when the range is all imported (the boundary is past its end)', () => {
    expect(importBoundaryDay(incl('2026-09-27'), RANGE)).toBeNull()
    expect(importBoundaryDay(incl('2026-10-30'), RANGE)).toBeNull()
  })

  it('crosses a month and a year end', () => {
    expect(importBoundaryDay(incl('2025-12-31'), { start: '2025-12-01', end: '2026-01-31' })).toBe('2026-01-01')
  })

  it('draws nothing unless the response says the imported days are included', () => {
    expect(importBoundaryDay(NONE, RANGE)).toBeNull()
    expect(importBoundaryDay(undefined, RANGE)).toBeNull()
    expect(importBoundaryDay(incl('2026-09-14', { included: false, reason: 'filtered' }), RANGE)).toBeNull()
    expect(importBoundaryDay(incl('2026-09-14', { included: false, reason: 'granularity' }), RANGE)).toBeNull()
    expect(importBoundaryDay(incl('2026-09-14'), null)).toBeNull()
  })

  it('is the day at the chart\'s wall-clock midnight (UTC fields)', () => {
    expect(importBoundaryX('2026-09-15').toISOString()).toBe('2026-09-15T00:00:00.000Z')
  })

  it('is labelled with what lies to its left, in the tool\'s own name', () => {
    expect(importBoundaryLabel(incl('2026-09-14'))).toBe('← imported from Plausible')
    expect(importBoundaryLabel(incl('2026-09-14', { source: 'simple_analytics' }))).toBe('← imported from Simple Analytics')
    // A source this build does not know is not an error.
    expect(importBoundaryLabel(incl('2026-09-14', { source: 'brand_new_tool' }))).toBe('← imported from the other tool')
  })
})

describe('the rail word and the filtered note', () => {
  it('says the rail includes imported days when the current OR the comparison period does', () => {
    expect(railIncludesImported(incl('2026-09-14'), NONE)).toBe(true)
    expect(railIncludesImported(NONE, incl('2026-09-14'))).toBe(true)
    expect(railIncludesImported(NONE, NONE)).toBe(false)
    expect(railIncludesImported(undefined, undefined)).toBe(false)
  })

  it('notes a filtered view only when the server says the imported days were left out by the filter', () => {
    expect(importLeftOutByFilter(incl('2026-09-14', { included: false, reason: 'filtered' }))).toBe(true)
    expect(importLeftOutByFilter(incl('2026-09-14'))).toBe(false)
    expect(importLeftOutByFilter(NONE)).toBe(false)
    expect(importLeftOutByFilter(undefined)).toBe(false)
  })
})

describe('the card footnote', () => {
  const unsupported = (source: string): ImportedProvenance => ({
    included: false,
    from: '2026-08-29',
    through: '2026-09-14',
    source,
    reason: 'surface_unsupported',
  })

  it('names the dimension, the first measured day, and why when the source metadata knows', () => {
    expect(cardImportNote(unsupported('plausible'), 'language', 2026)).toBe(
      "Languages before 15 Sep aren't in the import. Plausible doesn't export them.",
    )
    expect(cardImportNote(unsupported('fathom'), 'exit_page', 2026)).toBe(
      "Exit pages before 15 Sep aren't in the import. Fathom doesn't export them.",
    )
  })

  it('says only the first sentence when no reason is known', () => {
    expect(cardImportNote(unsupported('plausible'), 'region', 2026)).toBe("Regions before 15 Sep aren't in the import.")
    expect(cardImportNote(unsupported('brand_new_tool'), 'language', 2026)).toBe("Languages before 15 Sep aren't in the import.")
  })

  it('adds the year when the day is in another one', () => {
    expect(cardImportNote(unsupported('plausible'), 'language', 2027)).toMatch(/before 15 Sep 2026 aren't/)
  })

  it('says nothing for a card the import supplies, a filtered card, or a native-only card', () => {
    expect(cardImportNote(incl('2026-09-14'), 'language', 2026)).toBeNull()
    expect(cardImportNote({ ...unsupported('plausible'), reason: 'filtered' }, 'language', 2026)).toBeNull()
    expect(cardImportNote(NONE, 'language', 2026)).toBeNull()
    expect(cardImportNote(unsupported('plausible'), null, 2026)).toBeNull()
    expect(cardImportNote(undefined, 'language', 2026)).toBeNull()
  })

  it('has words for every card dimension, without a dash or an exclamation mark', () => {
    for (const w of Object.values(DIMENSION_WORDS)) expect(w).not.toMatch(/[—–!]/)
    expect(Object.keys(DIMENSION_WORDS)).toHaveLength(14)
  })
})

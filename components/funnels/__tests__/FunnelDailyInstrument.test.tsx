import { describe, it, expect } from 'vitest'

import { isMeasuredDay } from '../FunnelDailyInstrument'

// The Daily card's conversion line draws every day anyone entered, however few (22-10-2026; it
// left out days under five entrants before). A day nobody entered, or one without a rate, stays a
// gap: there is nothing to measure.
//
// MUTATION CHECK: put a minimum-entrants threshold back in isMeasuredDay (>= 2 or more) and the
// one-entrant days go red.
describe('isMeasuredDay', () => {
  it('draws a day one person entered, at 0% or 100%', () => {
    expect(isMeasuredDay({ rate: 100, entered: 1 })).toBe(true)
    expect(isMeasuredDay({ rate: 0, entered: 1 })).toBe(true)
    expect(isMeasuredDay({ rate: 50, entered: 4 })).toBe(true)
    expect(isMeasuredDay({ rate: 12.5, entered: 8 })).toBe(true)
  })

  it('leaves a gap where nobody entered or the day has no rate', () => {
    expect(isMeasuredDay({ rate: null, entered: 0 })).toBe(false)
    expect(isMeasuredDay({ rate: 0, entered: 0 })).toBe(false)
    expect(isMeasuredDay({ rate: null, entered: 3 })).toBe(false)
  })
})

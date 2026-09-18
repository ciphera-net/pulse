import { describe, it, expect } from 'vitest'
import {
  getThisWeekRange,
  getThisMonthRange,
  getYesterdayRange,
  getLast24HoursRange,
  getLast30MinutesRange,
  getLast6HoursRange,
  getLast1HourRange,
  getThisYearRange,
  getLastWeekRange,
  getLastMonthRange,
  getLastQuarterRange,
  getLastYearRange,
  getQuarterToDateRange,
} from '../dateRanges'

// Every resolver takes an optional trailing `now` (18-09-2026 preset-site-zone
// alignment) so a caller can inject the SITE's wall clock instead of letting
// the resolver reach for the browser's `new Date()`. These pin each
// resolver's answer against a FIXED `now`, proving it is actually consumed —
// a resolver that silently ignored the argument and fell back to the real
// clock would fail every one of these on any day other than the fixture's.

// A Wednesday, deliberately not a week/month/quarter boundary, so "this
// week"/"this month" etc. all have a non-trivial start.
const NOW = new Date(2026, 8, 16, 14, 30) // 2026-09-16 14:30, local parts

describe('dateRanges resolvers honour an injected `now`', () => {
  it('getThisWeekRange: Monday of the given week through the given day', () => {
    expect(getThisWeekRange(NOW)).toEqual({ start: '2026-09-14', end: '2026-09-16' })
  })

  it('getThisMonthRange: the 1st of the given month through the given day', () => {
    expect(getThisMonthRange(NOW)).toEqual({ start: '2026-09-01', end: '2026-09-16' })
  })

  it('getYesterdayRange: the single day before the given day', () => {
    expect(getYesterdayRange(NOW)).toEqual({ start: '2026-09-15', end: '2026-09-15' })
  })

  it('getLast24HoursRange: the two calendar days the window can touch', () => {
    expect(getLast24HoursRange(NOW)).toEqual({ start: '2026-09-15', end: '2026-09-16' })
  })

  it('getLast30MinutesRange / getLast6HoursRange: end on the given instant', () => {
    expect(getLast30MinutesRange(NOW)).toEqual({ start: '2026-09-16', end: '2026-09-16' })
    expect(getLast6HoursRange(NOW)).toEqual({ start: '2026-09-16', end: '2026-09-16' })
  })

  it('getLast1HourRange: the given day, both ends', () => {
    expect(getLast1HourRange(NOW)).toEqual({ start: '2026-09-16', end: '2026-09-16' })
  })

  it('getThisYearRange: Jan 1 of the given year through the given day', () => {
    expect(getThisYearRange(NOW)).toEqual({ start: '2026-01-01', end: '2026-09-16' })
  })

  it('getLastWeekRange: the FULL Monday–Sunday week before the current one', () => {
    // The week of NOW is Mon 2026-09-14 – Sun 2026-09-20; last week is
    // Mon 2026-09-07 – Sun 2026-09-13.
    expect(getLastWeekRange(NOW)).toEqual({ start: '2026-09-07', end: '2026-09-13' })
  })

  it('getLastMonthRange: the whole of the previous calendar month', () => {
    expect(getLastMonthRange(NOW)).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })

  it('getLastQuarterRange: the whole of the previous calendar quarter', () => {
    // NOW is in Q3 (Jul–Sep); last quarter is Q2 (Apr–Jun).
    expect(getLastQuarterRange(NOW)).toEqual({ start: '2026-04-01', end: '2026-06-30' })
  })

  it('getLastQuarterRange crosses a year boundary from Q1', () => {
    const q1 = new Date(2026, 1, 10) // Feb 2026, Q1
    expect(getLastQuarterRange(q1)).toEqual({ start: '2025-10-01', end: '2025-12-31' })
  })

  it('getLastYearRange: the whole of the previous calendar year', () => {
    expect(getLastYearRange(NOW)).toEqual({ start: '2025-01-01', end: '2025-12-31' })
  })

  it('getQuarterToDateRange: the start of the given quarter through the given day', () => {
    expect(getQuarterToDateRange(NOW)).toEqual({ start: '2026-07-01', end: '2026-09-16' })
  })

  it('every resolver defaults to the real clock when `now` is omitted', () => {
    // Not a value assertion (that would be a flaky clock-dependent test) —
    // just proves the parameter is truly optional and nothing throws.
    expect(() => getThisWeekRange()).not.toThrow()
    expect(() => getLastMonthRange()).not.toThrow()
    expect(() => getQuarterToDateRange()).not.toThrow()
  })
})

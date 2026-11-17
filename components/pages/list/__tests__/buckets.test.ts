import { describe, it, expect } from 'vitest'
import { bucketName, bucketValues, bucketsFor, hourName, seconds } from '../buckets'

// The Pages page's row bars: how a range's days fold into the bars that fit a row, and the words a bar is named by.

describe('bucketsFor', () => {
  it('gives a bar a day while the days fit', () => {
    const { kind, buckets } = bucketsFor('2026-11-01', 30, 42)
    expect(kind).toBe('day')
    expect(buckets).toHaveLength(30)
    expect(buckets[0]).toEqual({ from: 0, days: 1, date: '2026-11-01' })
    expect(buckets[29].date).toBe('2026-11-30')
  })

  it('folds into runs of seven days, the last one as short as the range leaves it', () => {
    const { kind, buckets } = bucketsFor('2026-08-01', 100, 42)
    expect(kind).toBe('week')
    expect(buckets).toHaveLength(15)
    expect(buckets[14]).toEqual({ from: 98, days: 2, date: '2026-11-07' })
  })

  it('folds a year into calendar months', () => {
    const { kind, buckets } = bucketsFor('2026-01-01', 365, 42)
    expect(kind).toBe('month')
    expect(buckets).toHaveLength(12)
    expect(buckets.map((b) => b.days)).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
  })

  it('has no bar for no day or for a date that is not one', () => {
    expect(bucketsFor('2026-11-01', 0, 42).buckets).toEqual([])
    expect(bucketsFor('not-a-date', 7, 42).buckets).toEqual([])
  })
})

describe('bucketValues', () => {
  const { buckets } = bucketsFor('2026-11-01', 14, 2)
  it('adds a bucket\'s days', () => {
    expect(bucketValues([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2], buckets, false, 14).map((b) => b.views)).toEqual([7, 14])
  })
  it('keeps the day still being counted in the views and out of the rate', () => {
    const [, last] = bucketValues([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 50], buckets, true, 14)
    expect(last.views).toBe(62)
    expect(last.rate).toBe(2)
  })
})

describe('the words', () => {
  it('names a day, a run of days and a month', () => {
    expect(bucketName('day', { from: 0, days: 1, date: '2026-11-15' })).toBe('Sunday 15 November')
    expect(bucketName('week', { from: 0, days: 7, date: '2026-11-09' })).toBe('9 to 15 November')
    expect(bucketName('week', { from: 0, days: 7, date: '2026-10-30' })).toBe('30 October to 5 November')
    expect(bucketName('month', { from: 0, days: 30, date: '2026-11-01' })).toBe('November 2026')
  })
  it('names an hour by its span, the last one into midnight', () => {
    expect(hourName(0)).toBe('00:00 – 01:00')
    expect(hourName(9)).toBe('09:00 – 10:00')
    expect(hourName(23)).toBe('23:00 – 00:00')
  })
  it('writes a time on page, and a dash where there is none', () => {
    expect(seconds(null)).toBe('—')
    expect(seconds(45)).toBe('45s')
    expect(seconds(93.4)).toBe('1m 33s')
  })
})

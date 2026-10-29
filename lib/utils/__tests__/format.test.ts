import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatNumber,
  formatCompactNumber,
  EM_DASH,
  formatDate,
  getDateRange,
  formatDuration,
  formatUpdatedAgo,
  formatUpdatedLabel,
} from '../format'

describe('format (machine/number)', () => {
  it('formatNumber adds thousands separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber(0)).toBe('0')
  })

  // PULSE-190 (owner ruling D11, 01-10-2026): large counts render compact on
  // every page, exact value on hover/focus. Rule and every boundary mocked in
  // Pulse/docs/data/01-10-2026-number-format-mocks/format-logic.mjs.
  describe('formatCompactNumber', () => {
    it('is exact, comma-grouped, below 10,000 — unchanged from formatNumber', () => {
      expect(formatCompactNumber(9876)).toBe('9,876')
      expect(formatCompactNumber(1234)).toBe('1,234')
      expect(formatCompactNumber(999)).toBe('999')
      expect(formatCompactNumber(1)).toBe('1')
    })

    it('one decimal below 100 of the compact unit', () => {
      expect(formatCompactNumber(12345)).toBe('12.3K')
      expect(formatCompactNumber(99900)).toBe('99.9K')
      expect(formatCompactNumber(1400000)).toBe('1.4M')
    })

    it('no decimal once the digits before the unit reach 100', () => {
      expect(formatCompactNumber(153000)).toBe('153K')
      expect(formatCompactNumber(13800000)).toBe('13.8M')
      expect(formatCompactNumber(100000)).toBe('100K')
    })

    it('rounding that crosses a unit boundary reads correctly', () => {
      expect(formatCompactNumber(9999)).toBe('9,999') // one below the threshold, stays exact
      expect(formatCompactNumber(10000)).toBe('10K') // the threshold itself
      expect(formatCompactNumber(99950)).toBe('100K') // rounds up into the "no decimal" band, not "100.0K"
      expect(formatCompactNumber(999950)).toBe('1M') // rounds up into the next unit, not "1000.0K"
    })

    it('the task brief\'s own worked examples, verbatim', () => {
      expect(formatCompactNumber(4218903)).toBe('4.2M')
      expect(formatCompactNumber(2104559)).toBe('2.1M')
      expect(formatCompactNumber(918330)).toBe('918K')
      expect(formatCompactNumber(412007)).toBe('412K')
      expect(formatCompactNumber(88214)).toBe('88.2K')
    })

    it('negatives mirror the positive rule, sign preserved', () => {
      expect(formatCompactNumber(-9876)).toBe('-9,876')
      expect(formatCompactNumber(-12345)).toBe('-12.3K')
      expect(formatCompactNumber(-99950)).toBe('-100K')
    })

    it('zero (and negative zero) render a plain "0", never "-0"', () => {
      expect(formatCompactNumber(0)).toBe('0')
      expect(formatCompactNumber(-0)).toBe('0')
    })

    it('null/undefined render the em dash — never a fabricated zero', () => {
      expect(formatCompactNumber(null)).toBe(EM_DASH)
      expect(formatCompactNumber(undefined)).toBe(EM_DASH)
      expect(formatCompactNumber(null)).toBe('—')
    })

    it('is always en-US, regardless of the runtime locale', () => {
      // Not de-DE's "." thousands / "," decimal, not fr-FR's narrow space —
      // this file's suite runs under America/New_York (vitest.setup.ts) and
      // the formatter must still read the American way.
      expect(formatCompactNumber(1234567)).toBe('1.2M')
      expect(formatCompactNumber(9876)).toContain(',')
      expect(formatCompactNumber(9876)).not.toContain('.')
    })
  })

  it('formatDate is machine YYYY-MM-DD from local parts', () => {
    expect(formatDate(new Date(2026, 5, 11))).toBe('2026-06-11')
    expect(formatDate(new Date(2025, 0, 3))).toBe('2025-01-03')
  })

  it('formatDuration: zero, sub-minute, and minutes', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(30)).toBe('30s')
    expect(formatDuration(90)).toBe('1m 30s')
  })

  it('getDateRange spans N inclusive days, end >= start', () => {
    const { start, end } = getDateRange(7)
    expect(start <= end).toBe(true)
    const startD = new Date(start)
    const endD = new Date(end)
    const diffDays = Math.round((endD.getTime() - startD.getTime()) / 86400000)
    expect(diffDays).toBe(6) // 7 days inclusive => 6-day span
  })

  it('getDateRange(days, now) resolves against the given `now`, not the real clock', () => {
    expect(getDateRange(7, new Date(2026, 8, 19))).toEqual({ start: '2026-09-13', end: '2026-09-19' })
  })

  it('getDateRange does not mutate the `now` it is given — callers reuse one instance', () => {
    const now = new Date(2026, 8, 19)
    getDateRange(7, now)
    getDateRange(30, now)
    expect(now.getFullYear()).toBe(2026)
    expect(now.getMonth()).toBe(8)
    expect(now.getDate()).toBe(19)
  })

  it('formatUpdatedAgo buckets', () => {
    const now = Date.now()
    expect(formatUpdatedAgo(now)).toBe('Just now')
    expect(formatUpdatedAgo(now - 30_000)).toBe('30 seconds ago')
    expect(formatUpdatedAgo(now - 90_000)).toBe('1 minute ago')
    expect(formatUpdatedAgo(now - 180_000)).toBe('3 minutes ago')
  })

  // * The top bar's own refresh line, kept apart from formatUpdatedAgo's "Just now" /
  // * "N ago" shape (which leads a sentence). Owner, 25-09-2026: the old "Live · 6
  // * seconds ago" said "live" three times in three colours once the orb shipped its own
  // * meaning for the word — "Updated N ago" is about the DATA, not who is on the site.
  describe('formatUpdatedLabel', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('lower-cases "Just now" so it reads mid-sentence', () => {
      const now = Date.now()
      expect(formatUpdatedLabel(now)).toBe('Updated just now')
      expect(formatUpdatedLabel(now - 4_000)).toBe('Updated just now')
    })

    it('reads seconds', () => {
      expect(formatUpdatedLabel(Date.now() - 12_000)).toBe('Updated 12 seconds ago')
    })

    it('reads a single minute', () => {
      expect(formatUpdatedLabel(Date.now() - 90_000)).toBe('Updated 1 minute ago')
    })

    it('reads several minutes', () => {
      expect(formatUpdatedLabel(Date.now() - 180_000)).toBe('Updated 3 minutes ago')
    })
  })
})

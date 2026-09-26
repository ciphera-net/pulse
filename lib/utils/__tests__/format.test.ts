import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatNumber, formatDate, getDateRange, formatDuration, formatUpdatedAgo, formatUpdatedLabel } from '../format'

describe('format (machine/number)', () => {
  it('formatNumber adds thousands separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber(0)).toBe('0')
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

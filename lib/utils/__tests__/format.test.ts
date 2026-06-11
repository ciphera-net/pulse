import { describe, it, expect } from 'vitest'
import { formatNumber, formatDate, getDateRange, formatDuration, formatUpdatedAgo } from '../format'

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

  it('formatUpdatedAgo buckets', () => {
    const now = Date.now()
    expect(formatUpdatedAgo(now)).toBe('Just now')
    expect(formatUpdatedAgo(now - 30_000)).toBe('30 seconds ago')
    expect(formatUpdatedAgo(now - 90_000)).toBe('1 minute ago')
    expect(formatUpdatedAgo(now - 180_000)).toBe('3 minutes ago')
  })
})

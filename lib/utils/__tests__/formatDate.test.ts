import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatTime,
  formatMonth,
  formatDateISO,
  formatDateFull,
  formatDateTimeFull,
  formatDateLong,
  formatRelativeTime,
  formatDateTimeShort,
} from '../formatDate'

// Fixed date: Friday 14 March 2025, 14:30:00 UTC
const date = new Date('2025-03-14T14:30:00Z')

describe('formatDate', () => {
  it('returns day-first format with short month', () => {
    const result = formatDate(date)
    expect(result).toContain('14')
    expect(result).toContain('Mar')
    expect(result).toContain('2025')
  })
})

describe('formatDateShort', () => {
  it('omits year when same as current year', () => {
    const now = new Date()
    const sameYear = new Date(`${now.getFullYear()}-06-15T10:00:00Z`)
    const result = formatDateShort(sameYear)
    expect(result).toContain('15')
    expect(result).toContain('Jun')
    expect(result).not.toContain(String(now.getFullYear()))
  })

  it('includes year when different from current year', () => {
    const oldDate = new Date('2020-06-15T10:00:00Z')
    const result = formatDateShort(oldDate)
    expect(result).toContain('2020')
  })
})

describe('formatDateTime', () => {
  it('includes date and 24-hour time', () => {
    const result = formatDateTime(date)
    expect(result).toContain('14')
    expect(result).toContain('Mar')
    expect(result).toContain('2025')
    // 24-hour format check: should contain 14:30 (UTC) or local equivalent
    expect(result).toMatch(/\d{2}:\d{2}/)
  })
})

describe('formatTime', () => {
  it('returns HH:MM in 24-hour format', () => {
    const result = formatTime(date)
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('formatMonth', () => {
  it('returns full month name and year', () => {
    const result = formatMonth(date)
    expect(result).toContain('March')
    expect(result).toContain('2025')
  })
})

describe('formatDateISO', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(formatDateISO(date)).toBe('2025-03-14')
  })
})

describe('formatDateFull', () => {
  it('includes weekday', () => {
    const result = formatDateFull(date)
    expect(result).toContain('Fri')
    expect(result).toContain('14')
    expect(result).toContain('Mar')
    expect(result).toContain('2025')
  })
})

describe('formatDateTimeFull', () => {
  it('includes weekday and time', () => {
    const result = formatDateTimeFull(date)
    expect(result).toContain('Fri')
    expect(result).toMatch(/\d{2}:\d{2}/)
  })
})

describe('formatDateLong', () => {
  it('uses full month name', () => {
    const result = formatDateLong(date)
    expect(result).toContain('March')
    expect(result).toContain('2025')
    expect(result).toContain('14')
  })
})

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Just now" for times less than a minute ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-14T14:30:30Z'))
    expect(formatRelativeTime('2025-03-14T14:30:00Z')).toBe('Just now')
  })

  it('returns minutes ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-14T14:35:00Z'))
    expect(formatRelativeTime('2025-03-14T14:30:00Z')).toBe('5m ago')
  })

  it('returns hours ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-14T16:30:00Z'))
    expect(formatRelativeTime('2025-03-14T14:30:00Z')).toBe('2h ago')
  })

  it('returns days ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-17T14:30:00Z'))
    expect(formatRelativeTime('2025-03-14T14:30:00Z')).toBe('3d ago')
  })

  it('falls back to short date after 7 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-25T14:30:00Z'))
    const result = formatRelativeTime('2025-03-14T14:30:00Z')
    expect(result).toContain('14')
    expect(result).toContain('Mar')
  })
})

describe('formatDateTimeShort', () => {
  it('includes date and time', () => {
    const result = formatDateTimeShort(date)
    expect(result).toContain('14')
    expect(result).toContain('Mar')
    expect(result).toMatch(/\d{2}:\d{2}/)
  })
})

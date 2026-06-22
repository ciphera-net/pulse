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

// Local fixture: Friday 14 March 2025, 14:30 (local time) — deterministic across runner TZ.
const date = new Date(2025, 2, 14, 14, 30, 0)
// UTC fixture for the machine ISO assertion (toISOString is always UTC).
const isoDate = new Date('2025-03-14T12:00:00Z')

describe('formatDate', () => {
  it('returns numeric DD/MM/YYYY', () => {
    expect(formatDate(date)).toBe('14/03/2025')
  })
})

describe('formatDateShort', () => {
  it('omits year when same as current year (DD/MM)', () => {
    const now = new Date()
    const sameYear = new Date(now.getFullYear(), 5, 15)
    expect(formatDateShort(sameYear)).toBe('15/06')
  })

  it('includes year when different from current year (DD/MM/YYYY)', () => {
    const oldDate = new Date(2020, 5, 15)
    expect(formatDateShort(oldDate)).toBe('15/06/2020')
  })
})

describe('formatDateTime', () => {
  it('returns DD/MM/YYYY HH:MM (24-hour)', () => {
    expect(formatDateTime(date)).toBe('14/03/2025 14:30')
  })
})

describe('formatTime', () => {
  it('returns HH:MM in 24-hour format', () => {
    expect(formatTime(date)).toBe('14:30')
  })
})

describe('formatMonth', () => {
  it('returns full month name and year (period label)', () => {
    const result = formatMonth(date)
    expect(result).toContain('March')
    expect(result).toContain('2025')
  })
})

describe('formatDateISO', () => {
  it('returns machine YYYY-MM-DD (unchanged)', () => {
    expect(formatDateISO(isoDate)).toBe('2025-03-14')
  })
})

describe('formatDateFull', () => {
  it('includes weekday then numeric date', () => {
    const result = formatDateFull(date)
    expect(result).toContain('Fri')
    expect(result).toContain('14/03/2025')
  })
})

describe('formatDateTimeFull', () => {
  it('includes weekday, numeric date, and time', () => {
    const result = formatDateTimeFull(date)
    expect(result).toContain('Fri')
    expect(result).toContain('14/03/2025')
    expect(result).toContain('14:30')
  })
})

describe('formatDateLong', () => {
  it('returns numeric DD/MM/YYYY', () => {
    expect(formatDateLong(date)).toBe('14/03/2025')
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

  it('falls back to numeric short date after 7 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-25T14:30:00Z'))
    const result = formatRelativeTime('2025-03-14T14:30:00Z')
    expect(result).toMatch(/^\d{2}\/\d{2}/)
  })
})

describe('formatDateTimeShort', () => {
  it('returns DD/MM HH:MM', () => {
    expect(formatDateTimeShort(date)).toBe('14/03 14:30')
  })
})

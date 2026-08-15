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
  formatDateUTC,
  formatDateFullUTC,
  formatCalendarDate,
  formatCalendarDateFull,
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


// ─────────────────────────────────────────────────────────────────────────────
// Server-decided dates (15-08-2026)
//
// This block runs TWICE with different pinned timezones and must produce identical
// results both times:
//   npm test                 → vitest.setup.ts pins America/New_York (UTC-4/-5)
//   npm run test:tz-positive → PULSE_TEST_TZ=Pacific/Kiritimati    (UTC+14)
//
// Two pins, because one sign is half a guard and the missing half is the half that
// shipped. formatDate.ts records a customer WEST of UTC shown 14/05 for a plan
// renewing 15/05 — caught by the negative pin. On 15-08-2026 the billing page showed
// "RENEWS Sun, 16/08/2026" for a stored 2026-08-15T23:24:01Z, a charge Mollie had
// already taken that morning. That is the opposite sign, and under America/New_York
// the same instant renders 15/08, so the existing pin could never have caught it.
// ─────────────────────────────────────────────────────────────────────────────

/** The exact instant from the 15-08-2026 incident. */
const incidentInstant = new Date('2026-08-15T23:24:01.369Z')

describe('timezone pin', () => {
  // Guards the guard. process.env.TZ can be set and still not reach Intl inside the
  // vitest workers, in which case every assertion below would be satisfied by the
  // environment rather than by the code — which is the exact failure vitest.setup.ts
  // was written to end.
  it('is actually in force inside the worker, not merely in process.env', () => {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(['America/New_York', 'Pacific/Kiritimati']).toContain(resolved)
    expect(resolved).toBe(process.env.PULSE_TEST_TZ || 'America/New_York')
  })

  it('shifts a late-in-day UTC instant to a different LOCAL day under at least one pin', () => {
    // The premise of this whole block: under a positive offset the incident instant
    // really does fall on the next local day. If this ever stops being true the
    // regression tests below become tautologies.
    const localDay = incidentInstant.getDate()
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Pacific/Kiritimati') {
      expect(localDay).toBe(16)
    } else {
      expect(localDay).toBe(15)
    }
  })
})

describe('formatDateUTC', () => {
  it('renders the UTC day of a server-decided instant, under either pin', () => {
    expect(formatDateUTC(incidentInstant)).toBe('15/08/2026')
  })
})

describe('formatDateFullUTC', () => {
  it('renders weekday + UTC day, identically under either pin', () => {
    expect(formatDateFullUTC(incidentInstant)).toBe('Sat, 15/08/2026')
  })

  // 🔴 THE INCIDENT, as a regression test. formatDateFull reads the LOCAL day AND
  // the local weekday, so under UTC+14 it produces the screenshot's exact string.
  // Both halves are wrong together, which is what made it read as authoritative.
  it('differs from the local-day formatDateFull exactly where the bug was', () => {
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Pacific/Kiritimati') {
      expect(formatDateFull(incidentInstant)).toBe('Sun, 16/08/2026')
      expect(formatDateFullUTC(incidentInstant)).toBe('Sat, 15/08/2026')
      expect(formatDateFullUTC(incidentInstant)).not.toBe(formatDateFull(incidentInstant))
    } else {
      // Under the negative pin the two agree — which is precisely why the
      // pre-existing single pin could not have caught this.
      expect(formatDateFull(incidentInstant)).toBe('Sat, 15/08/2026')
    }
  })
})

describe('formatCalendarDateFull', () => {
  // The strongest form of the fix: a value that never becomes a Date cannot shift.
  it('renders a wire date verbatim with a timezone-free weekday', () => {
    expect(formatCalendarDateFull('2026-08-15')).toBe('Sat, 15/08/2026')
    expect(formatCalendarDateFull('2026-09-15')).toBe('Tue, 15/09/2026')
    expect(formatCalendarDateFull('2027-01-01')).toBe('Fri, 01/01/2027')
  })

  it('returns null for absence rather than a fallback date', () => {
    // "No scheduled charge" is a real state for a grant, the free tier or a
    // cancelled subscription. Rendering today, or the epoch, would be a fabrication.
    expect(formatCalendarDateFull(null)).toBeNull()
    expect(formatCalendarDateFull(undefined)).toBeNull()
    expect(formatCalendarDateFull('')).toBeNull()
  })

  it('returns null for a malformed value rather than guessing', () => {
    expect(formatCalendarDateFull('15/08/2026')).toBeNull()
    expect(formatCalendarDateFull('2026-08-15T23:24:01Z')).toBeNull()
    expect(formatCalendarDateFull('not-a-date')).toBeNull()
  })

  it('is stable across every day of a month under either pin', () => {
    // A per-day sweep, because an off-by-one only bites on the days where the
    // offset crosses a boundary — the single-fixture test above would pass on a
    // formatter that was wrong for half the month.
    for (let d = 1; d <= 31; d++) {
      const iso = `2026-08-${String(d).padStart(2, '0')}`
      expect(formatCalendarDateFull(iso)).toContain(`${String(d).padStart(2, '0')}/08/2026`)
      expect(formatCalendarDate(iso)).toBe(`${String(d).padStart(2, '0')}/08/2026`)
    }
  })
})

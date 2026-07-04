import {
  getDateRange,
  getThisWeekRange,
  getThisMonthRange,
  getThisYearRange,
  getYesterdayRange,
  getLast24HoursRange,
  getLast1HourRange,
  formatDate,
} from '@/lib/utils/dateRanges'

// ---------------------------------------------------------------------------
// Shared URL period grammar for date-ranged pages (journeys, funnels).
// One parse/normalize rulebook so every page reads and writes the same
// ?period=&start=&end= params.
// ---------------------------------------------------------------------------

export type Period =
  | '1h'
  | '24h'
  | 'today'
  | 'yesterday'
  | '7'
  | '30'
  | 'week'
  | 'month'
  | 'year'
  | 'custom'

export const DEFAULT_PERIOD: Period = '30'

const PERIODS: ReadonlySet<Period> = new Set([
  '1h',
  '24h',
  'today',
  'yesterday',
  '7',
  '30',
  'week',
  'month',
  'year',
  'custom',
])

export function parsePeriod(raw: string | null): Period {
  if (raw && PERIODS.has(raw as Period)) return raw as Period
  return DEFAULT_PERIOD
}

export function isValidDateString(s: string | null): s is string {
  if (!s) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export function periodToDateRange(period: Period): { start: string; end: string } {
  switch (period) {
    case '1h':
      return getLast1HourRange()
    case '24h':
      return getLast24HoursRange()
    case 'today': {
      const today = formatDate(new Date())
      return { start: today, end: today }
    }
    case 'yesterday':
      return getYesterdayRange()
    case '7':
      return getDateRange(7)
    case '30':
      return getDateRange(30)
    case 'week':
      return getThisWeekRange()
    case 'month':
      return getThisMonthRange()
    case 'year':
      return getThisYearRange()
    case 'custom':
      // * Fallback only — actual custom range comes from the URL read path
      return getDateRange(30)
  }
}

const DAY_MS = 86400000

/**
 * The same range shifted by its own span, or null when the shift would land
 * past today (local date parts throughout — no UTC drift).
 */
export function shiftDateRange(
  range: { start: string; end: string },
  direction: -1 | 1,
): { start: string; end: string } | null {
  const shift = (date: string, days: number) => {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + days)
    return formatDate(d)
  }
  const startDate = new Date(range.start + 'T00:00:00')
  const endDate = new Date(range.end + 'T00:00:00')
  const spanDays = Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1
  const offsetDays = spanDays * direction
  const next = { start: shift(range.start, offsetDays), end: shift(range.end, offsetDays) }
  if (next.end > formatDate(new Date())) return null
  return next
}

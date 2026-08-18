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
  | '28'
  | '30'
  | '3m'
  | '6m'
  | '12m'
  | '16m'
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
  '28',
  '30',
  '3m',
  '6m',
  '12m',
  '16m',
  'week',
  'month',
  'year',
  'custom',
])

export function parsePeriod(raw: string | null): Period {
  if (raw && PERIODS.has(raw as Period)) return raw as Period
  return DEFAULT_PERIOD
}

/**
 * True when a preset key round-trips through the URL as ?period=<key>. The
 * DateRangePicker fires only onPeriodChange for these — writing the rolling
 * period, not a frozen custom range. Keys outside this set (e.g. 'last-week')
 * cannot live in the URL, so the picker keeps its legacy period+range double
 * write for them and they land as custom dates.
 */
export function isUrlPeriod(key: string): boolean {
  return PERIODS.has(key as Period)
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
    case '28':
      return getDateRange(28)
    case '30':
      return getDateRange(30)
    // * GSC pill ranges (Search page). 16m = Google's ~480-day retention cap.
    case '3m':
      return getDateRange(90)
    case '6m':
      return getDateRange(180)
    case '12m':
      return getDateRange(365)
    case '16m':
      return getDateRange(480)
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
 * The equal-length window immediately before `range`, or null when the span
 * is unreasonable (>366 days) or would reach before 2020. Local date parts
 * throughout — a toISOString() here shifts a day near midnight outside UTC.
 */
export function previousDateRange(range: {
  start: string
  end: string
}): { start: string; end: string } | null {
  const s = new Date(range.start + 'T00:00:00')
  const e = new Date(range.end + 'T00:00:00')
  const duration = e.getTime() - s.getTime()
  if (duration > 366 * DAY_MS) return null
  const prevEnd = new Date(s.getTime() - DAY_MS)
  const prevStart = new Date(prevEnd.getTime() - duration)
  if (prevStart.getFullYear() < 2020) return null
  return { start: formatDate(prevStart), end: formatDate(prevEnd) }
}

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

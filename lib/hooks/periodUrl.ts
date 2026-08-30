import {
  getDateRange,
  getThisWeekRange,
  getThisMonthRange,
  getThisYearRange,
  getYesterdayRange,
  getLast24HoursRange,
  getLast1HourRange,
  getLast30MinutesRange,
  getLast6HoursRange,
  getQuarterToDateRange,
  getLastWeekRange,
  getLastMonthRange,
  getLastQuarterRange,
  getLastYearRange,
  formatDate,
} from '@/lib/utils/dateRanges'

// ---------------------------------------------------------------------------
// Shared URL period grammar for date-ranged pages (journeys, funnels).
// One parse/normalize rulebook so every page reads and writes the same
// ?period=&start=&end= params.
// ---------------------------------------------------------------------------

export type Period =
  // '30m' and '6h' join '1h'/'24h' as first-class URL periods so the Visitors
  // page's live windows are shareable and survive a refresh like every other
  // preset. They are NOT in PERIOD_PRESETS — only a page that declares them in
  // extraPresets shows them in its menu — but they must be in this grammar, or
  // the picker double-writes period+range and the preset lands as ?period=custom.
  | '30m'
  | '1h'
  | '6h'
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
  | 'qtd'
  | 'year'
  | 'last-week'
  | 'last-month'
  | 'last-quarter'
  | 'last-year'
  | 'custom'

export const DEFAULT_PERIOD: Period = '30'

// Every GLOBAL picker preset is a first-class URL period (Phase 2 review fix):
// a key outside this set makes the picker double-write period+custom-range, and
// the second write clobbers the first in the shared query-params merge — the
// preset landed as ?period=custom and its label degraded to a raw date span.
// Exported since 22-08-2026: useUrlDateRange derives each page's APPLIED
// vocabulary from this grammar (minus the page's declared exclusions).
export const PERIODS: ReadonlySet<Period> = new Set([
  '30m',
  '1h',
  '6h',
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
  'qtd',
  'year',
  'last-week',
  'last-month',
  'last-quarter',
  'last-year',
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
    case '30m':
      return getLast30MinutesRange()
    case '1h':
      return getLast1HourRange()
    case '6h':
      return getLast6HoursRange()
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
    case 'qtd':
      return getQuarterToDateRange()
    case 'year':
      return getThisYearRange()
    case 'last-week':
      return getLastWeekRange()
    case 'last-month':
      return getLastMonthRange()
    case 'last-quarter':
      return getLastQuarterRange()
    case 'last-year':
      return getLastYearRange()
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
  // 🔴 A GUARD THAT COMPARES AGAINST NaN IS NOT A GUARD. An unparseable range
  // (most easily an empty one) makes every Date here Invalid, and BOTH checks
  // below are `>` / `<` comparisons — which are false for NaN — so an invalid
  // input sailed through and this returned {start:"NaN-NaN-NaN", end:"NaN-NaN-NaN"}.
  // That value is a non-empty string, so callers guarding on `prevRange?.start ?? ''`
  // saw something truthy and issued a REAL request with NaN dates. Measured on
  // staging 20-08-2026 against /funnels, once the pages began withholding their
  // range while the period resolved (fetchableRange returns empty strings).
  // Rejecting here fixes every caller at once; guarding at each call site would
  // leave the next one to rediscover it.
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
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
// * The MAXIMUM number of days a preset can span — the unit every API cap is
// * expressed in (the analytics API refuses > 366; Search Console > 480).
// *
// * Deliberately a static table rather than measuring the resolved range: the
// * ceiling is a property of the PRESET, so it must not vary with the clock,
// * the site timezone, or a stubbed date helper. Variable-length presets take
// * their upper bound (a month is at most 31 days, a quarter at most 92).
// * 'custom' is unbounded here — a custom span carries explicit start/end and
// * is validated where it is chosen, not by preset identity.
const PERIOD_MAX_DAYS: Record<Period, number> = {
  '30m': 1,
  '1h': 1,
  '6h': 1,
  '24h': 1,
  today: 1,
  yesterday: 1,
  '7': 7,
  '28': 28,
  '30': 30,
  '3m': 92,
  '6m': 184,
  '12m': 366,
  '16m': 480,
  week: 7,
  month: 31,
  qtd: 92,
  year: 366,
  'last-week': 7,
  'last-month': 31,
  'last-quarter': 92,
  'last-year': 366,
  custom: Number.POSITIVE_INFINITY,
}

export function periodMaxDays(p: Period): number {
  return PERIOD_MAX_DAYS[p] ?? Number.POSITIVE_INFINITY
}

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

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
  // 'realtime' is the dashboard's LIVE MODE, not a window length: picking it puts
  // the whole page on a rolling last-30-minutes window that a WebSocket refreshes
  // as visitors arrive. It is a real URL period so a live view is shareable and
  // survives a refresh, and it is deliberately NOT in PERIOD_PRESETS — only the
  // site dashboard declares it, via extraPresets.
  //
  // ⚠️ Distinct from the 'Real-time' PRESET GROUP that already holds '1h'/'24h'.
  // Those are genuine now-relative windows but they are polled on the ordinary
  // 60s cadence; they are not a live mode, and the names are close enough to be
  // worth saying so here.
  | 'realtime'
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
  'realtime',
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

/**
 * `now` defaults to the browser's `new Date()`, but every caller reachable
 * from a date-ranged page must pass a SITE wall clock instead —
 * `siteWallClockNow(site.timezone)` — or a relative preset resolves in the
 * viewer's calendar rather than the site's (the bug useUrlDateRange's
 * `timezone` option exists to close).
 */
export function periodToDateRange(period: Period, now: Date = new Date()): { start: string; end: string } {
  switch (period) {
    // 'realtime' is a live MODE, not a window length. It still resolves to the
    // last 30 minutes so a caller that insists on dates gets something true,
    // but the dashboard fetches it as `minutes=` — see lib/dashboard/realtimeRange.
    case 'realtime':
      return getLast30MinutesRange(now)
    case '30m':
      return getLast30MinutesRange(now)
    case '1h':
      return getLast1HourRange(now)
    case '6h':
      return getLast6HoursRange(now)
    case '24h':
      return getLast24HoursRange(now)
    case 'today': {
      const today = formatDate(now)
      return { start: today, end: today }
    }
    case 'yesterday':
      return getYesterdayRange(now)
    case '7':
      return getDateRange(7, now)
    case '28':
      return getDateRange(28, now)
    case '30':
      return getDateRange(30, now)
    // * GSC pill ranges (Search page). 16m = Google's ~480-day retention cap.
    case '3m':
      return getDateRange(90, now)
    case '6m':
      return getDateRange(180, now)
    case '12m':
      return getDateRange(365, now)
    case '16m':
      return getDateRange(480, now)
    case 'week':
      return getThisWeekRange(now)
    case 'month':
      return getThisMonthRange(now)
    case 'qtd':
      return getQuarterToDateRange(now)
    case 'year':
      return getThisYearRange(now)
    case 'last-week':
      return getLastWeekRange(now)
    case 'last-month':
      return getLastMonthRange(now)
    case 'last-quarter':
      return getLastQuarterRange(now)
    case 'last-year':
      return getLastYearRange(now)
    case 'custom':
      // * Fallback only — actual custom range comes from the URL read path
      return getDateRange(30, now)
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
  realtime: 1,
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
  now: Date = new Date(),
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
  // `now` must be the SITE's wall clock (siteWallClockNow) — "not into the
  // future" means the site's future, or a viewer east of the site is
  // refused a day the site has already reached.
  if (next.end > formatDate(now)) return null
  return next
}

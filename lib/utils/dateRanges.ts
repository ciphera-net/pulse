import { getDateRange, formatDate } from '@/lib/utils/format'

// Every resolver below takes an optional trailing `now`, defaulting to the
// browser's `new Date()`. A caller that knows the SITE must pass
// `siteWallClockNow(site.timezone)` instead — see lib/utils/siteTime.ts —
// or "this week"/"last month"/etc. resolve in the viewer's calendar instead
// of the site's. `now` is never mutated (every setDate/setMonth below runs
// on a clone), so one shared Date can be reused across many calls in a
// render.

/** Monday–today range for "This week" option */
export function getThisWeekRange(now: Date = new Date()): { start: string; end: string } {
  const today = now
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  return { start: formatDate(monday), end: formatDate(today) }
}

/** 1st of month–today range for "This month" option */
export function getThisMonthRange(now: Date = new Date()): { start: string; end: string } {
  const today = now
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  return { start: formatDate(firstOfMonth), end: formatDate(today) }
}

/** Yesterday only (single day) */
export function getYesterdayRange(now: Date = new Date()): { start: string; end: string } {
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const d = formatDate(yesterday)
  return { start: d, end: d }
}

/** The two calendar days the rolling 24h window can touch. The SERVER resolves
 * period=24h as a genuine rolling now−24h window (D3, 18-08-2026); this
 * client-side range exists only as the pre-resolution placeholder and for
 * previous-window arithmetic. It is NOT itself a rolling window. */
export function getLast24HoursRange(now: Date = new Date()): { start: string; end: string } {
  const today = now
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  return { start: formatDate(yesterday), end: formatDate(today) }
}

/**
 * Last 30 minutes / last 6 hours — the DATE span a rolling minute window
 * touches, for pages that still need start/end as a fallback or a label.
 *
 * A rolling window is not really a date range, which is the whole reason
 * useUrlDateRange's `rollingMinutes` exists: a page that declares one sends the
 * width in minutes and lets the server resolve the instant. These functions
 * only answer "which calendar days does it touch", so a 30-minute window that
 * straddles midnight still covers both.
 */
export function getLast30MinutesRange(now: Date = new Date()): { start: string; end: string } {
  return { start: formatDate(new Date(now.getTime() - 30 * 60_000)), end: formatDate(now) }
}

export function getLast6HoursRange(now: Date = new Date()): { start: string; end: string } {
  return { start: formatDate(new Date(now.getTime() - 6 * 60 * 60_000)), end: formatDate(now) }
}

/** Last 1 hour — same-day range, caller should narrow to minute interval */
export function getLast1HourRange(now: Date = new Date()): { start: string; end: string } {
  const today = formatDate(now)
  return { start: today, end: today }
}

/** Jan 1 of current year–today range for "This year" option */
export function getThisYearRange(now: Date = new Date()): { start: string; end: string } {
  const today = now
  const jan1 = new Date(today.getFullYear(), 0, 1)
  return { start: formatDate(jan1), end: formatDate(today) }
}

export function getLastWeekRange(now: Date = new Date()): { start: string; end: string } {
  const day = now.getDay()
  const diffToMonday = day === 0 ? 6 : day - 1
  const thisMonday = new Date(now)
  thisMonday.setDate(now.getDate() - diffToMonday)
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)
  return { start: formatDate(lastMonday), end: formatDate(lastSunday) }
}

export function getLastMonthRange(now: Date = new Date()): { start: string; end: string } {
  const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  return { start: formatDate(firstOfPrevMonth), end: formatDate(lastOfPrevMonth) }
}

export function getLastQuarterRange(now: Date = new Date()): { start: string; end: string } {
  const currentQuarter = Math.floor(now.getMonth() / 3)
  const prevQuarterStart = currentQuarter === 0
    ? new Date(now.getFullYear() - 1, 9, 1)
    : new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1)
  const prevQuarterEnd = currentQuarter === 0
    ? new Date(now.getFullYear() - 1, 12, 0)
    : new Date(now.getFullYear(), currentQuarter * 3, 0)
  return { start: formatDate(prevQuarterStart), end: formatDate(prevQuarterEnd) }
}

export function getLastYearRange(now: Date = new Date()): { start: string; end: string } {
  const prevYear = now.getFullYear() - 1
  return { start: `${prevYear}-01-01`, end: `${prevYear}-12-31` }
}

export function getQuarterToDateRange(now: Date = new Date()): { start: string; end: string } {
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  return { start: formatDate(quarterStart), end: formatDate(now) }
}

// Re-export for convenience
export { getDateRange, formatDate }

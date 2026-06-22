import { getDateRange, formatDate } from '@/lib/utils/format'

/** Monday–today range for "This week" option */
export function getThisWeekRange(): { start: string; end: string } {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  return { start: formatDate(monday), end: formatDate(today) }
}

/** 1st of month–today range for "This month" option */
export function getThisMonthRange(): { start: string; end: string } {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  return { start: formatDate(firstOfMonth), end: formatDate(today) }
}

/** Yesterday only (single day) */
export function getYesterdayRange(): { start: string; end: string } {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const d = formatDate(yesterday)
  return { start: d, end: d }
}

/** Rolling 24-hour window — crosses midnight, two-day range */
export function getLast24HoursRange(): { start: string; end: string } {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  return { start: formatDate(yesterday), end: formatDate(today) }
}

/** Last 1 hour — same-day range, caller should narrow to minute interval */
export function getLast1HourRange(): { start: string; end: string } {
  const today = formatDate(new Date())
  return { start: today, end: today }
}

/** Jan 1 of current year–today range for "This year" option */
export function getThisYearRange(): { start: string; end: string } {
  const today = new Date()
  const jan1 = new Date(today.getFullYear(), 0, 1)
  return { start: formatDate(jan1), end: formatDate(today) }
}

export function getLastWeekRange(): { start: string; end: string } {
  const now = new Date()
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

export function getLastMonthRange(): { start: string; end: string } {
  const now = new Date()
  const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  return { start: formatDate(firstOfPrevMonth), end: formatDate(lastOfPrevMonth) }
}

export function getLastQuarterRange(): { start: string; end: string } {
  const now = new Date()
  const currentQuarter = Math.floor(now.getMonth() / 3)
  const prevQuarterStart = currentQuarter === 0
    ? new Date(now.getFullYear() - 1, 9, 1)
    : new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1)
  const prevQuarterEnd = currentQuarter === 0
    ? new Date(now.getFullYear() - 1, 12, 0)
    : new Date(now.getFullYear(), currentQuarter * 3, 0)
  return { start: formatDate(prevQuarterStart), end: formatDate(prevQuarterEnd) }
}

export function getLastYearRange(): { start: string; end: string } {
  const prevYear = new Date().getFullYear() - 1
  return { start: `${prevYear}-01-01`, end: `${prevYear}-12-31` }
}

export function getQuarterToDateRange(): { start: string; end: string } {
  const now = new Date()
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  return { start: formatDate(quarterStart), end: formatDate(now) }
}

// Re-export for convenience
export { getDateRange, formatDate }

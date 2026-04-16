import { getDateRange, formatDate } from '@ciphera-net/ui'

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

// Re-export for convenience
export { getDateRange, formatDate }

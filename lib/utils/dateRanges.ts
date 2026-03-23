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

// Re-export for convenience
export { getDateRange, formatDate }

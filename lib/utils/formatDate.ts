// Centralised date/time formatting for Pulse.
// All functions use explicit European conventions:
//   • Day-first ordering (14 Mar 2025)
//   • 24-hour clock (14:30)
//   • en-GB locale for Intl consistency

const LOCALE = 'en-GB'

/** 14 Mar 2025 — tables, lists, general display */
export function formatDate(d: Date): string {
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** 14 Mar — charts, compact spaces. Adds year if different from current. */
export function formatDateShort(d: Date): string {
  const now = new Date()
  return d.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

/** 14 Mar 2025, 14:30 — logs, events, audit trails */
export function formatDateTime(d: Date): string {
  return d.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** 14:30 — intraday charts, time-only contexts */
export function formatTime(d: Date): string {
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** March 2025 — monthly aggregations */
export function formatMonth(d: Date): string {
  return d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })
}

/** 2025-03-14 — exports, filenames, API params */
export function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Fri, 14 Mar 2025 — full date with weekday for tooltips */
export function formatDateFull(d: Date): string {
  return d.toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Fri, 14 Mar 2025, 14:30 — full date+time with weekday */
export function formatDateTimeFull(d: Date): string {
  return d.toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** 14 March 2025 — long-form display (invoices, billing) */
export function formatDateLong(d: Date): string {
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "Just now", "5m ago", "2h ago", "3d ago", then falls back to formatDateShort */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`

  return formatDateShort(date)
}

/** 14 Mar, 14:30 — compact date + time (uptime checks, recent activity) */
export function formatDateTimeShort(d: Date): string {
  return d.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

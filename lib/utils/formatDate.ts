// Centralised date/time formatting for Pulse.
// All functions use explicit European conventions:
//   • Numeric day-first ordering (14/03/2025)
//   • 24-hour clock (14:30)
// Date parts are composed locally for a deterministic DD/MM/YYYY that does not
// depend on runtime locale/ICU availability.

const LOCALE = 'en-GB'

const pad = (n: number) => String(n).padStart(2, '0')

/** DD/MM/YYYY */
function dmy(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** DD/MM */
function dm(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

/** HH:MM (24-hour) */
function hm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 14/03/2025 — tables, lists, general display */
export function formatDate(d: Date): string {
  return dmy(d)
}

/** 14/03 — charts, compact spaces. Adds year if different from current. */
export function formatDateShort(d: Date): string {
  const now = new Date()
  return d.getFullYear() !== now.getFullYear() ? dmy(d) : dm(d)
}

/** 14/03/2025 14:30 — logs, events, audit trails */
export function formatDateTime(d: Date): string {
  return `${dmy(d)} ${hm(d)}`
}

/** 14:30 — intraday charts, time-only contexts */
export function formatTime(d: Date): string {
  return hm(d)
}

/** March 2025 — monthly aggregations (period label; no day component) */
export function formatMonth(d: Date): string {
  return d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })
}

/** 2025-03-14 — exports, filenames, API params (machine ISO; unchanged) */
export function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Fri, 14/03/2025 — full date with weekday for tooltips */
export function formatDateFull(d: Date): string {
  const weekday = d.toLocaleDateString(LOCALE, { weekday: 'short' })
  return `${weekday}, ${dmy(d)}`
}

/** Fri, 14/03/2025 14:30 — full date+time with weekday */
export function formatDateTimeFull(d: Date): string {
  const weekday = d.toLocaleDateString(LOCALE, { weekday: 'short' })
  return `${weekday}, ${dmy(d)} ${hm(d)}`
}

/** 14/03/2025 — long-form display (invoices, billing) */
export function formatDateLong(d: Date): string {
  return dmy(d)
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

/** 14/03 14:30 — compact date + time (uptime checks, recent activity) */
export function formatDateTimeShort(d: Date): string {
  return `${dm(d)} ${hm(d)}`
}

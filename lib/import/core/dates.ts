// ─── Calendar dates as "YYYY-MM-DD" strings ────────────────────────────────
//
// Every date in the import pipeline is a CALENDAR DAY, never an instant: the
// wire format (M2-r) says so, and the rows are per-day aggregates. Arithmetic is
// done on a day number (days since 1970-01-01) so no machine timezone can ever
// shift a date — `new Date('2026-03-29')` read back through local getters is the
// class of bug this module exists to make impossible.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 86_400_000

/** True when `value` is a real calendar date written as YYYY-MM-DD (2026-02-30 is not). */
export function isCalendarDate(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const t = Date.UTC(year, month - 1, day)
  const d = new Date(t)
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

/** Days since 1970-01-01 for a valid YYYY-MM-DD. */
export function dayNumber(date: string): number {
  const m = DATE_RE.exec(date)
  if (!m) throw new RangeError(`not a YYYY-MM-DD date: ${date}`)
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY)
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

/** YYYY-MM-DD for a day number. */
export function fromDayNumber(n: number): string {
  const d = new Date(n * MS_PER_DAY)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(dayNumber(date) + days)
}

/** The first day of the date's month. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`
}

/** The last day of the date's month. */
export function monthEnd(date: string): string {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  return fromDayNumber(Math.round(Date.UTC(year, month, 0) / MS_PER_DAY))
}

/** Which calendar day it is right now in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** True when Intl accepts `timeZone` as an IANA zone. */
export function isTimeZone(timeZone: string): boolean {
  if (!timeZone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

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

/** 14/03/2025 — tables, lists, general display.
 *
 * ⚠️ LOCAL-DAY, and that is correct for what it is used for: a date the USER
 * chose or is choosing (date-range pickers, "today"). It is the wrong function
 * for an instant the SERVER decided — see formatDateUTC.
 */
export function formatDate(d: Date): string {
  return dmy(d)
}

/** 14/03/2025, in UTC — for a calendar date the SERVER decided.
 *
 * A billing date, a renewal date or a retry date is not a fact about where the
 * reader is sitting; it is a date chosen server-side and stored as a UTC
 * instant. Rendering one with formatDate() reads the LOCAL day, so every viewer
 * west of UTC sees a midnight-UTC date one day early — a customer in New York
 * was shown 14/05 for a plan that renews on 15/05.
 *
 * Found by pinning a negative-offset timezone in vitest.setup.ts; under the UTC
 * that CI inherited, the bug and the fix are indistinguishable.
 */
export function formatDateUTC(d: Date): string {
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
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

/** Fri, 14/03/2025 — full date with weekday for tooltips.
 *
 * ⚠️ LOCAL-DAY, like formatDate. The weekday makes it worse, not better: when the
 * day shifts the weekday shifts with it, so a wrong render is wrong twice and reads
 * as more authoritative for it. On 15-08-2026 the billing page showed
 * "RENEWS Sun, 16/08/2026" for a stored 2026-08-15T23:24:01Z — a charge Mollie had
 * already taken that morning. Use formatDateFullUTC for a server-decided instant,
 * or formatCalendarDateFull for a value that is a calendar date to begin with.
 */
export function formatDateFull(d: Date): string {
  const weekday = d.toLocaleDateString(LOCALE, { weekday: 'short' })
  return `${weekday}, ${dmy(d)}`
}

/** Fri, 14/03/2025, in UTC — weekday + date for an instant the SERVER decided.
 *
 * The UTC counterpart of formatDateFull, for the same reason formatDateUTC exists:
 * a date chosen server-side is not a fact about where the reader is sitting. The
 * recorded case before this one was a customer WEST of UTC shown a date a day
 * EARLY; the 15-08-2026 case was east of UTC and a day LATE. Same mechanism,
 * opposite sign — which is why the date suite runs under a pinned positive offset
 * as well as a negative one. One pinned sign is half a guard.
 */
export function formatDateFullUTC(d: Date): string {
  const weekday = d.toLocaleDateString(LOCALE, { weekday: 'short', timeZone: 'UTC' })
  return `${weekday}, ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}

/** Sat, 15/08/2026 — weekday + date for a value that IS a calendar date.
 *
 * Takes the wire string "YYYY-MM-DD" and never constructs a Date from it for the
 * DATE part: the day, month and year are read straight out of the string, so there
 * is no instant to shift and no timezone that can change what is shown. This is the
 * strongest form of the fix — with no time-of-day in the value, rendering on the
 * wrong day is unrepresentable rather than merely avoided by convention.
 *
 * The weekday still needs a calendar computation; it is done at NOON UTC so that
 * even if a runtime interpreted the components locally, no offset on earth (max
 * ±14h) could carry it into an adjacent day.
 *
 * Returns null for a missing or malformed value. Callers must render an explicit
 * absent state rather than a fallback date — "no scheduled charge" is a real state
 * for a grant, the free tier, or a cancelled subscription.
 */
export function formatCalendarDateFull(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) return null
  const [, y, mo, d] = m
  const weekday = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12)).toLocaleDateString(LOCALE, {
    weekday: 'short',
    timeZone: 'UTC',
  })
  return `${weekday}, ${d}/${mo}/${y}`
}

/** 15/08/2026 — a calendar date with no weekday. Same guarantees as
 *  formatCalendarDateFull; returns null for a missing or malformed value. */
export function formatCalendarDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) return null
  const [, y, mo, d] = m
  return `${d}/${mo}/${y}`
}

/** Parse a time-series bucket from the stats API into a Date whose UTC fields
 * ARE the site's wall clock.
 *
 * The server buckets in the SITE's timezone and (since 18-08-2026) attaches the
 * site's real offset: `2026-08-12T03:00:00+02:00` means 03:00 on the site's
 * clock. Before that it sent the same wall clock mislabelled `Z`. Under BOTH
 * formats the literal yyyy-mm-ddThh:mm prefix is the site's wall clock — so this
 * reads the digits out of the string and never lets a runtime timezone (the
 * viewer's, or the offset itself) shift what is shown. Read the result with UTC
 * getters (getUTCHours/getUTCDay) or the *UTC formatters; local getters would
 * re-apply the VIEWER's offset, which is the exact bug (PeakHours shifted +2h
 * for a Brussels owner, a whole weekday for Auckland) this replaces.
 *
 * Returns null for a malformed value; callers fall back rather than fabricate.
 */
export function parseSiteWallClock(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)))
}

/** 14/03 in UTC — the chart-axis counterpart of formatDateShort, for wall-clock
 *  Dates built by parseSiteWallClock. Adds the year when it differs. */
export function formatDateShortUTC(d: Date): string {
  const now = new Date()
  const short = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`
  return d.getUTCFullYear() !== now.getUTCFullYear() ? `${short}/${d.getUTCFullYear()}` : short
}

/** 14:30 in UTC — the time counterpart, for wall-clock Dates. */
export function formatTimeUTC(d: Date): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
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

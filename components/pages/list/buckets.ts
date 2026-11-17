// ---------------------------------------------------------------------------
// The Pages page's row bars: a page's daily views folded into as many bars as fit its column, and the words a
// bar is named by. Arithmetic on the rows the server answers with; nothing is estimated.
// ---------------------------------------------------------------------------

export type BucketKind = 'day' | 'week' | 'month'
export interface Bucket {
  /** The index of its first day in the range. */
  from: number
  /** How many days of the range it holds. */
  days: number
  /** Its first day, YYYY-MM-DD. */
  date: string
}

const DAY_MS = 86_400_000
const dateAt = (start: string, index: number): string | null => {
  const day0 = Date.parse(`${start}T00:00:00Z`)
  return Number.isNaN(day0) ? null : new Date(day0 + index * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The range's days as columns: one a day while they fit `max` columns, then runs of seven days from the range's
 * first, then calendar months. A year of days side by side would be columns a few pixels wide.
 */
export function bucketsFor(start: string, days: number, max: number): { kind: BucketKind; buckets: Bucket[] } {
  if (days <= 0 || dateAt(start, 0) === null) return { kind: 'day', buckets: [] }
  if (days <= max) return { kind: 'day', buckets: Array.from({ length: days }, (_, i) => ({ from: i, days: 1, date: dateAt(start, i)! })) }
  if (Math.ceil(days / 7) <= max) {
    const buckets: Bucket[] = []
    for (let i = 0; i < days; i += 7) buckets.push({ from: i, days: Math.min(7, days - i), date: dateAt(start, i)! })
    return { kind: 'week', buckets }
  }
  const buckets: Bucket[] = []
  for (let i = 0; i < days; i++) {
    const date = dateAt(start, i)!
    const last = buckets[buckets.length - 1]
    if (last && last.date.slice(0, 7) === date.slice(0, 7)) last.days += 1
    else buckets.push({ from: i, days: 1, date })
  }
  return { kind: 'month', buckets }
}

export interface BucketValue {
  /** Every view of the bucket's days, the day still being counted included. */
  views: number
  /** Views a day over its ENDED days, or null where it has none (the bucket is today alone). */
  rate: number | null
}

/**
 * A row's daily views folded into the buckets. `live`: the range's last day is today, which is still being counted,
 * so it is left out of the rate a bucket is compared by: half a day read as a quiet day would be false.
 */
export function bucketValues(trend: number[], buckets: Bucket[], live: boolean, days: number): BucketValue[] {
  return buckets.map((b) => {
    let views = 0
    let ended = 0
    let endedDays = 0
    for (let i = b.from; i < b.from + b.days; i++) {
      const v = trend[i] ?? 0
      views += v
      if (live && i === days - 1) continue
      ended += v
      endedDays += 1
    }
    return { views, rate: endedDays > 0 ? ended / endedDays : null }
  })
}

const long = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...options })

/** A bucket's name over the drawing: "Sunday 15 November", "9 to 15 November", "30 October to 5 November", "November 2026". */
export function bucketName(kind: BucketKind, b: Bucket): string {
  if (kind === 'day') return long(b.date, { weekday: 'long', day: 'numeric', month: 'long' })
  if (kind === 'month') return long(b.date, { month: 'long', year: 'numeric' })
  const end = new Date(Date.parse(`${b.date}T00:00:00Z`) + (b.days - 1) * DAY_MS).toISOString().slice(0, 10)
  if (b.days === 1) return long(b.date, { day: 'numeric', month: 'long' })
  const sameMonth = end.slice(0, 7) === b.date.slice(0, 7)
  return `${long(b.date, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' })} to ${long(end, { day: 'numeric', month: 'long' })}`
}

/** An hour of a day by its span, as the dashboard's chart names one: "09:00 – 10:00". */
export function hourName(hour: number): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(hour)}:00 – ${two((hour + 1) % 24)}:00`
}

/** A duration in seconds as the page writes it: "45s", "1m 33s"; a dash where it was not measured. */
export const seconds = (v: number | null): string => {
  if (v == null) return '—'
  const s = Math.round(v)
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

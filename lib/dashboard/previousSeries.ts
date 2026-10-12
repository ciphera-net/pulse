import type { DailyStat } from '@/lib/api/stats'

/**
 * The previous period drawn behind the dashboard chart (PUL-19, design record
 * Pulse/docs/plans/12-10-2026-previous-period-chart.md).
 *
 * Each current bucket is paired with the previous-period bucket at the SAME
 * PLACE IN ITS WINDOW — the same day offset from the window's first day and the
 * same wall-clock time — never with the bucket at the same array index. The two
 * agree on an ordinary range, but an hourly window holding a DST change has 23
 * or 25 buckets in one period and 24 in the other, and pairing by index would
 * shift every later hour by one. Pairing by place leaves the missing hour
 * without a partner instead.
 */

/** The first day visit duration is engaged time (an instrument boundary). */
// Visit duration is ENGAGED time since 04-09-2026 (migration 177). Rows before
// it carry no engaged measurement: their duration is wall-clock time bounded at
// read time, a different instrument. Drawn behind an engaged-time line, the gap
// between the two would read as a change in visitors that is really a change
// in the measuring, so a previous-period duration before this day is left out.
export const ENGAGED_DURATION_SINCE = '2026-09-04'

export interface PreviousPoint {
  /** The previous bucket's own wall-clock timestamp, as the server sent it. */
  date: string
  pageviews: number | null
  visitors: number | null
  /** Pages per VISIT (never per visitor): null where `visits` is unknown or zero. */
  pages_per_visit: number | null
  bounce_rate: number | null
  avg_duration: number | null
}

/** "2026-09-16T14:00:00+02:00" → its wall-clock day and time, as written. */
function wallParts(date: string): { day: string; time: string } {
  return { day: date.slice(0, 10), time: date.length >= 16 ? date.slice(11, 16) : '00:00' }
}

function dayOffset(day: string, start: string): number {
  return Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000)
}

/**
 * For every current bucket, its previous-period partner — or null when there is
 * none (no bucket at that place). A partner dated before `floor` (the first day
 * the dashboard has data for) keeps its date but carries no values: those days
 * predate the site's history, and drawing them as zero would claim a
 * measurement nobody made.
 */
export function pairPreviousSeries(
  current: readonly DailyStat[],
  previous: readonly DailyStat[],
  currentStart: string,
  previousStart: string,
  floor?: string | null,
): (PreviousPoint | null)[] {
  const byPlace = new Map<string, DailyStat>()
  for (const row of previous) {
    const { day, time } = wallParts(row.date)
    const key = `${dayOffset(day, previousStart)}|${time}`
    // A fall-back day repeats one wall-clock hour; the first occurrence is the
    // one that sits where the current window's single hour sits.
    if (!byPlace.has(key)) byPlace.set(key, row)
  }
  return current.map((row) => {
    const { day, time } = wallParts(row.date)
    const partner = byPlace.get(`${dayOffset(day, currentStart)}|${time}`)
    if (!partner) return null
    const pDay = wallParts(partner.date).day
    if (floor && pDay < floor) {
      return { date: partner.date, pageviews: null, visitors: null, pages_per_visit: null, bounce_rate: null, avg_duration: null }
    }
    return {
      date: partner.date,
      pageviews: partner.pageviews,
      visitors: partner.visitors,
      pages_per_visit: partner.visits != null && partner.visits > 0 ? partner.pageviews / partner.visits : null,
      bounce_rate: partner.bounce_rate,
      avg_duration: pDay < ENGAGED_DURATION_SINCE ? null : partner.avg_duration,
    }
  })
}

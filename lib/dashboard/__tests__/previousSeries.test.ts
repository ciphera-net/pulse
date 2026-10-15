import { describe, it, expect } from 'vitest'
import { ENGAGED_DURATION_SINCE, pairPreviousSeries } from '@/lib/dashboard/previousSeries'
import type { DailyStat } from '@/lib/api/stats'

const row = (date: string, visitors: number, extra: Partial<DailyStat> = {}): DailyStat => ({
  date, visitors, visits: visitors, pageviews: visitors * 2,
  bounce_rate: 50, avg_duration: 60, avg_scroll_depth: 50, avg_visible_duration: 30,
  ...extra,
})
const days = (start: string, n: number, base: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse(start + 'T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10)
    return row(`${d}T00:00:00+02:00`, base + i)
  })
const hours = (day: string, n: number, base: number, offset = '+02:00') =>
  Array.from({ length: n }, (_, i) => row(`${day}T${String(i).padStart(2, '0')}:00:00${offset}`, base + i))

describe('pairPreviousSeries (PUL-19)', () => {
  it('pairs daily buckets by their day in the window', () => {
    const cur = days('2026-09-13', 30, 100)
    const prev = days('2026-08-14', 30, 0)
    const out = pairPreviousSeries(cur, prev, '2026-09-13', '2026-08-14')
    expect(out).toHaveLength(30)
    expect(out[0]?.date.slice(0, 10)).toBe('2026-08-14')
    expect(out[29]?.date.slice(0, 10)).toBe('2026-09-12')
    expect(out[3]?.visitors).toBe(3)
  })

  it('a Today view pairs only the hours that have happened — yesterday stops at the same hour', () => {
    const cur = hours('2026-10-12', 10, 100) // 00:00 … 09:00, now is 09:xx
    const prev = hours('2026-10-11', 24, 0)
    const out = pairPreviousSeries(cur, prev, '2026-10-12', '2026-10-11')
    expect(out).toHaveLength(10)
    expect(out[9]?.date).toBe('2026-10-11T09:00:00+02:00')
  })

  it('pairs hours by wall-clock time across a fall-back day, not by index', () => {
    // 25-10-2026 (Europe): 02:00 happens twice. The current day has 24 hours.
    const prev = [
      ...hours('2026-10-25', 3, 0, '+02:00'), // 00, 01, 02 (summer)
      row('2026-10-25T02:00:00+01:00', 99), // 02 again (winter)
      ...Array.from({ length: 21 }, (_, i) => row(`2026-10-25T${String(i + 3).padStart(2, '0')}:00:00+01:00`, 3 + i)),
    ]
    const cur = hours('2026-10-26', 24, 100, '+01:00')
    const out = pairPreviousSeries(cur, prev, '2026-10-26', '2026-10-25')
    // By index, 03:00 would pair with the repeated 02:00 (value 99) and every later hour would slip.
    expect(out[3]?.date).toBe('2026-10-25T03:00:00+01:00')
    expect(out[23]?.date).toBe('2026-10-25T23:00:00+01:00')
    expect(out[2]?.visitors).toBe(2) // the first 02:00
  })

  it('leaves an hour with no partner empty (a spring-forward day has no 02:00)', () => {
    const prev = hours('2026-03-29', 24, 0).filter((r) => !r.date.includes('T02:00'))
    const cur = hours('2026-03-30', 24, 100)
    const out = pairPreviousSeries(cur, prev, '2026-03-30', '2026-03-29')
    expect(out[2]).toBeNull()
    expect(out[3]?.date.slice(11, 16)).toBe('03:00')
  })

  it('a previous day before the data window keeps its date but no values', () => {
    const cur = days('2026-09-13', 5, 100)
    const prev = days('2026-09-08', 5, 0)
    const out = pairPreviousSeries(cur, prev, '2026-09-13', '2026-09-08', '2026-09-10')
    expect(out[0]).toMatchObject({ date: '2026-09-08T00:00:00+02:00', visitors: null, pageviews: null })
    expect(out[1]?.visitors).toBeNull()
    expect(out[2]?.visitors).toBe(2)
    expect(out.map((p) => p?.predatesData)).toEqual([true, true, false, false, false])
  })

  it('an hour with no visits is MEASURED: rates are null but nothing is withheld', () => {
    // The server sends a zero-visit hour as visits null, bounce and duration
    // null. That is "nobody came", which the chart plots at zero; it must not
    // be confused with a bucket that predates the data, which breaks the line.
    const prev = [
      row('2026-10-14T03:00:00+02:00', 1, { bounce_rate: 100, avg_duration: 7 }),
      row('2026-10-14T04:00:00+02:00', 0, { visits: null, bounce_rate: null, avg_duration: null }),
    ]
    const cur = [row('2026-10-15T03:00:00+02:00', 0), row('2026-10-15T04:00:00+02:00', 1)]
    const out = pairPreviousSeries(cur, prev, '2026-10-15', '2026-10-14', '2026-09-01')
    expect(out[1]).toMatchObject({ visitors: 0, bounce_rate: null, avg_duration: null, pages_per_visit: null, predatesData: false, durationWithheld: false })
  })

  it('leaves out a previous visit duration from before engaged time began', () => {
    const prev = days('2026-09-02', 4, 0) // 02, 03, 04, 05
    const cur = days('2026-09-30', 4, 100)
    const out = pairPreviousSeries(cur, prev, '2026-09-30', '2026-09-02')
    expect(ENGAGED_DURATION_SINCE).toBe('2026-09-04')
    expect(out.map((p) => p?.avg_duration)).toEqual([null, null, 60, 60])
    expect(out.map((p) => p?.durationWithheld)).toEqual([true, true, false, false])
    expect(out.every((p) => p?.predatesData === false)).toBe(true)
    expect(out[0]?.visitors).toBe(0) // only the duration is withheld
  })

  it('divides pages by visits, never visitors, and keeps unknown visits unknown', () => {
    const prev = [row('2026-09-01T00:00:00+02:00', 10, { visits: 4, pageviews: 12 }), row('2026-09-02T00:00:00+02:00', 10, { visits: null })]
    const cur = days('2026-09-03', 2, 1)
    const out = pairPreviousSeries(cur, prev, '2026-09-03', '2026-09-01')
    expect(out[0]?.pages_per_visit).toBe(3)
    expect(out[1]?.pages_per_visit).toBeNull()
    // Visitors but no visit count: unknown (a break). No visitors: empty (a zero).
    expect(out.map((p) => p?.visitsUnknown)).toEqual([false, true])
  })

  it('a bucket with no visitors is empty, not unknown, though its visit count is null too', () => {
    const prev = [row('2026-10-14T04:00:00+02:00', 0, { visits: null, pageviews: 0, bounce_rate: null })]
    const out = pairPreviousSeries([row('2026-10-15T04:00:00+02:00', 1)], prev, '2026-10-15', '2026-10-14')
    expect(out[0]).toMatchObject({ pages_per_visit: null, visitsUnknown: false })
  })
})

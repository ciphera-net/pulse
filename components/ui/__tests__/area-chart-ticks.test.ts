import { describe, it, expect } from 'vitest'
import { niceTimeTicks } from '@/components/ui/area-chart'

// The axis-tick contract (05-09-2026): ticks are UNIFORMLY spaced at a nice
// step, never thinned by array index. The bug this pins: an 87-minute
// minute-level range produced 00:40 → 00:45 → 00:55 — 18 five-minute
// candidates thinned to 10 by rounding 1.89-index strides.

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
const T0 = Date.UTC(2026, 8, 5, 0, 0) // a site-midnight stamped as UTC

const gaps = (ticks: Date[]) => ticks.slice(1).map((d, i) => d.getTime() - ticks[i].getTime())

describe('niceTimeTicks', () => {
  it("the owner's 87-minute range: every gap equal, no 5-minute hiccup", () => {
    const ticks = niceTimeTicks(T0, T0 + 87 * MIN, 10)
    const g = gaps(ticks)
    expect(new Set(g).size).toBe(1)
    expect(g[0]).toBe(10 * MIN)
    expect(ticks.length).toBeLessThanOrEqual(10)
    expect(ticks[0].getTime()).toBe(T0)
  })

  it('is uniform for every range × width at the minute, hour and day levels', () => {
    const ranges = [3 * MIN, 7 * MIN, 30 * MIN, 61 * MIN, 87 * MIN, 2 * HOUR, 2 * HOUR + 1, 3 * HOUR, 7 * HOUR, 25 * HOUR, 48 * HOUR, 3 * DAY, 3 * DAY + 1, 8 * DAY, 30 * DAY, 90 * DAY]
    // Sub-minute offsets included: they are what carried the one-sided gate
    // from budget+1 ticks straight to one (refuted 05-09).
    const offsets = [0, 1, 250, 17_250, 30_000, 59_999, 7 * MIN, 41 * MIN, 5 * HOUR + 13 * MIN]
    for (const range of ranges) {
      for (const off of offsets) {
        for (let count = 2; count <= 12; count++) {
          const start = T0 + off
          const ticks = niceTimeTicks(start, start + range, count)
          const g = gaps(ticks)
          // An axis is two labels or more, always — a lone label conveys no
          // scale — and the budget is a hard ceiling: when no nice rung fits,
          // the finest overflowing grid is stride-subsampled into it.
          expect(ticks.length, `range ${range} off ${off} count ${count}: only ${ticks.length} tick(s)`).toBeGreaterThanOrEqual(2)
          expect(ticks.length, `range ${range} off ${off} count ${count}`).toBeLessThanOrEqual(Math.max(2, count))
          expect(new Set(g).size, `range ${range} off ${off} count ${count}: gaps ${g.join(',')}`).toBeLessThanOrEqual(1)
          for (const t of ticks) {
            expect(t.getTime()).toBeGreaterThanOrEqual(start)
            expect(t.getTime()).toBeLessThanOrEqual(start + range)
          }
        }
      }
    }
  })

  it("the refuters' collapses draw two labels or more", () => {
    // 7 minutes at three ticks: the 2→5 minute ladder jump used to leave one.
    expect(niceTimeTicks(T0 + 7 * MIN, T0 + 14 * MIN, 3).length).toBeGreaterThanOrEqual(2)
    // 48 hours at two ticks: the doubling fallback used to leave one, mid-axis.
    expect(niceTimeTicks(T0, T0 + 48 * HOUR, 2).length).toBeGreaterThanOrEqual(2)
    // 3 hours at two ticks, sub-minute offset: one "02:00" before the fix.
    expect(niceTimeTicks(T0 + 30_000, T0 + 3 * HOUR + 30_000, 2).length).toBeGreaterThanOrEqual(2)
  })

  it('lands minute ticks on clock multiples and hour ticks on hour multiples', () => {
    const start = T0 + 41 * MIN
    const minuteTicks = niceTimeTicks(start, start + 60 * MIN, 8)
    for (const t of minuteTicks) expect(t.getUTCSeconds()).toBe(0)
    const step = gaps(minuteTicks)[0] / MIN
    for (const t of minuteTicks) expect(t.getUTCMinutes() % step).toBe(0)

    const hourTicks = niceTimeTicks(T0 + 5 * HOUR + 13 * MIN, T0 + 30 * HOUR, 8)
    for (const t of hourTicks) {
      expect(t.getUTCMinutes()).toBe(0)
      expect(t.getUTCHours() % (gaps(hourTicks)[0] / HOUR)).toBe(0)
    }
  })

  it('month level walks 1sts at a uniform month stride', () => {
    const ticks = niceTimeTicks(Date.UTC(2025, 7, 20), Date.UTC(2026, 8, 5), 8)
    expect(ticks.length).toBeLessThanOrEqual(8)
    for (const t of ticks) expect(t.getUTCDate()).toBe(1)
    const strides = ticks.slice(1).map((d, i) =>
      (d.getUTCFullYear() - ticks[i].getUTCFullYear()) * 12 + d.getUTCMonth() - ticks[i].getUTCMonth(),
    )
    expect(new Set(strides).size).toBe(1)
  })
})

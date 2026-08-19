import { describe, it, expect } from 'vitest'
import { niceYDomain, thinTicks, resolvePlottedY } from '@/components/ui/area-chart'

// The sparse-chart fix (owner report 19-08-2026): a low-traffic hourly view
// rendered ghost slabs on an axis reading 0/24/48/72/96/120%. Two subjects:
// nice-step domain+ticks (one computation, no float drift), and dot marks for
// segments too short to read as a line.

describe('niceYDomain', () => {
  it('bounce rate at 100 gets integer 25-steps, not the float-drift 120% axis', () => {
    // 100 * 1.1 = 110.00000000000001 → d3 .nice() → 120 was the shipped bug.
    const { top, ticks } = niceYDomain(100)
    expect(top).toBe(125)
    expect(ticks).toEqual([0, 25, 50, 75, 100, 125])
  })

  it('pages-per-visit at 1.0 gets half-steps a one-decimal formatter renders cleanly', () => {
    const { top, ticks } = niceYDomain(1.0)
    expect(top).toBe(1.5)
    expect(ticks).toEqual([0, 0.5, 1, 1.5])
  })

  it('never uses quarter steps below integer magnitude', () => {
    // 2.5×10^k only when the step is ≥ 1 — 0.25-steps at one decimal show as
    // 0.3 / 0.8, which is the same unreadable axis in new clothes.
    for (const max of [0.9, 1.1, 2.1, 4.4]) {
      const { ticks } = niceYDomain(max)
      const step = ticks[1] - ticks[0]
      if (step < 1) {
        expect([0.1, 0.2, 0.5].some((s) => Math.abs(step - s) < 1e-9),
          `step ${step} for max ${max} must be a {1,2,5} scale step`).toBe(true)
      }
    }
  })

  it('covers the padded max and stays within 5 intervals', () => {
    for (const max of [1, 3, 7, 33, 99, 100, 101, 456, 1000, 12345, 0.4]) {
      const { top, ticks } = niceYDomain(max)
      expect(top).toBeGreaterThanOrEqual(max)
      expect(ticks.length).toBeLessThanOrEqual(6)
      expect(ticks[0]).toBe(0)
      expect(ticks[ticks.length - 1]).toBe(top)
      const step = ticks[1] - ticks[0]
      for (let i = 1; i < ticks.length; i++) {
        expect(Math.abs(ticks[i] - ticks[i - 1] - step)).toBeLessThan(1e-9)
      }
    }
  })

  it('zero / absent data falls back to the 0-100 frame', () => {
    expect(niceYDomain(0).ticks).toEqual([0, 25, 50, 75, 100, 125])
  })

  it('tiny magnitudes keep a real domain — no toFixed collapse to [0, 0]', () => {
    // Adversarial-review finding (19-08-2026): toFixed(6) rounded every tick
    // to 0 for maxima below ~5e-7, handing d3 a degenerate zero-span domain.
    for (const max of [3e-7, 1e-8, 4.2e-5]) {
      const { top, ticks } = niceYDomain(max)
      expect(top).toBeGreaterThanOrEqual(max)
      expect(ticks[ticks.length - 1]).toBe(top)
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]).toBeGreaterThan(ticks[i - 1])
      }
    }
  })
})

describe('thinTicks', () => {
  it('returns the array untouched when it fits', () => {
    expect(thinTicks([0, 25, 50, 75, 100, 125], 6)).toEqual([0, 25, 50, 75, 100, 125])
  })

  it('thins only by strides that keep even spacing', () => {
    // 6 intervals → stride 2 works.
    expect(thinTicks([0, 10, 20, 30, 40, 50, 60], 4)).toEqual([0, 20, 40, 60])
  })

  it('falls back to endpoints rather than uneven gridlines', () => {
    // 5 intervals, target 4: no stride divides 5 into ≤3 intervals except 5.
    expect(thinTicks([0, 25, 50, 75, 100, 125], 4)).toEqual([0, 125])
  })
})

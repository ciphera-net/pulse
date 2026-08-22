import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { niceYDomain, thinTicks, resolvePlottedY, resolveTooltipYPositions } from '@/components/ui/area-chart'

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

// ---------------------------------------------------------------------------
// resolveTooltipYPositions — the hover dot must ride the plotted line.
//
// 🔴 MEASURED 22-08-2026 (owner screenshot, deck hero on Pages/visit): hover
// an unmeasured hour and the orange dot sat at the chart TOP on the 2.0
// gridline while the line sat on the zero line and the tooltip honestly said
// '—'. The resolver only recorded a y for numeric values, so a null bucket
// left no entry and the dot call-site's `?? 0` fallback rendered at SVG y=0
// — the top. Same failure family resolvePlottedY already pins for the line
// itself; this is the tooltip layer's half.
// ---------------------------------------------------------------------------
describe('resolveTooltipYPositions', () => {
  // A linear scale over domain [0, 2] and range [200, 0] (SVG y grows down):
  // 0 → 200 (bottom), 2 → 0 (top).
  const scale = (n: number) => 200 - n * 100

  it('anchors a numeric value at its scaled position', () => {
    const y = resolveTooltipYPositions(
      { v: 1 },
      [{ dataKey: 'v', missingAsZero: true }],
      scale,
    )
    expect(y).toEqual({ v: 100 })
  })

  it('anchors a missing bucket at the ZERO LINE when the line plots missing-as-zero', () => {
    // The screenshot bug: this must be the bottom (200), never the top (0).
    const y = resolveTooltipYPositions(
      { v: null },
      [{ dataKey: 'v', missingAsZero: true }],
      scale,
    )
    expect(y).toEqual({ v: 200 })
  })

  it('yields NO entry for a missing bucket without the flag — the dot hides', () => {
    // Pinning the dot anywhere would fabricate a measurement the tooltip's
    // em dash just denied.
    const y = resolveTooltipYPositions(
      { v: null },
      [{ dataKey: 'v', missingAsZero: false }],
      scale,
    )
    expect('v' in y).toBe(false)
  })

  it('each line follows its own flag', () => {
    const y = resolveTooltipYPositions(
      { a: null, b: null, c: 2 },
      [
        { dataKey: 'a', missingAsZero: true },
        { dataKey: 'b', missingAsZero: false },
        { dataKey: 'c', missingAsZero: false },
      ],
      scale,
    )
    expect(y).toEqual({ a: 200, c: 0 })
  })
})

describe('tooltip dot wiring (source pin)', () => {
  // The unit tests above cover the resolver; this pins the two call-site
  // halves jsdom cannot reach (ParentSize measures 0×0, so hover geometry
  // never runs in tests): the resolver is actually used, and an absent entry
  // HIDES the dot instead of falling back to the top.
  const src = readFileSync(
    join(__dirname, '..', 'area-chart.tsx'),
    'utf8',
  )

  it('the hover resolver builds yPositions through resolveTooltipYPositions', () => {
    expect(src).toContain('resolveTooltipYPositions(d, lines, yScale)')
  })

  it('an absent y entry hides the dot — never a bare `?? 0` to the chart top', () => {
    expect(src).toContain('visible={visible && dotY !== undefined}')
  })
})

describe('highlight dash wiring (source pin)', () => {
  // 🔴 CUSTOMER REPORT 22-08-2026 (waltonmarket/inomedigital): the hover
  // highlight lit the line at the hovered point AND again near the right
  // edge. The overlay is a dashed path copy; its measured length was keyed
  // on mount-ish inputs only, so switching the deck metric left the dash
  // pattern sized for the OLD path (904 vs 10,430 measured in the repro) and
  // SVG dash patterns REPEAT. jsdom has no getTotalLength, so the browser
  // repro lives in tests/dash-wrap-repro.spec.ts and these pin the wiring.
  const src = readFileSync(join(__dirname, '..', 'area-chart.tsx'), 'utf8')

  it('the path length re-measures on every input that shapes d', () => {
    expect(src).toContain('[animate, innerWidth, isLoaded, data, dataKey, xScale, yScale, curve, missingAsZero]')
  })

  it('the dash gap is a constant, never the measurement it must outlive', () => {
    expect(src).toContain('useMotionTemplate`${segmentLengthSpring} 100000`')
  })
})

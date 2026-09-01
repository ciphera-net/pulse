import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import RailSparkline from '@/components/dashboard/RailSparkline'

// The M1 mini contract (sharp-chart round, 01-09-2026): linear joins,
// zero-based scale (true highs and lows — a flat-low week must not stretch
// into fake drama), grounded fill, dashed in-progress tail.

const day = (visitors: number, pageviews = visitors * 2) => ({
  visitors, pageviews, bounce_rate: null, avg_duration: null,
})

const paths = (c: HTMLElement) => Array.from(c.querySelectorAll('path'))
const linePaths = (c: HTMLElement) => paths(c).filter((p) => p.getAttribute('fill') === 'none')

describe('RailSparkline (M1)', () => {
  it('draws linear joins — no curve commands in the line path', () => {
    const { container } = render(
      <RailSparkline data={[day(4), day(30), day(11), day(18)]} dataKey="visitors" active />,
    )
    const d = linePaths(container)[0].getAttribute('d') ?? ''
    expect(d).toMatch(/^M/)
    expect(d).not.toContain('C')
  })

  it('scales from ZERO: half the max sits half-way up the band, not min-stretched', () => {
    const { container } = render(
      <RailSparkline data={[day(10), day(20)]} dataKey="visitors" active />,
    )
    // h=52, padBottom=2, padTop=4 → band 46. v=10 of max 20 → y = 50 - 23 = 27.
    const d = linePaths(container)[0].getAttribute('d') ?? ''
    const ys = [...d.matchAll(/[ML][0-9.]+,([0-9.]+)/g)].map((m) => parseFloat(m[1]))
    expect(ys[0]).toBeCloseTo(27, 0)
    expect(ys[1]).toBeCloseTo(4, 0)
  })

  it('dashes the final segment when dashedTail is set', () => {
    const { container } = render(
      <RailSparkline data={[day(5), day(9), day(7)]} dataKey="visitors" active dashedTail />,
    )
    const dashed = linePaths(container).filter((p) => p.getAttribute('stroke-dasharray') === '4 4')
    expect(dashed.length).toBe(1)
    // Without the flag: no dashes.
    const { container: c2 } = render(
      <RailSparkline data={[day(5), day(9), day(7)]} dataKey="visitors" active />,
    )
    expect(linePaths(c2).filter((p) => p.getAttribute('stroke-dasharray')).length).toBe(0)
  })

  it('fills with a gradient grounded at the tile floor', () => {
    const { container } = render(
      <RailSparkline data={[day(5), day(9)]} dataKey="visitors" active />,
    )
    const fill = paths(container).find((p) => p.getAttribute('fill')?.startsWith('url(#'))
    expect(fill).toBeTruthy()
    expect(fill?.getAttribute('d')).toContain('L0,52 Z')
  })

  it('still drops unmeasured buckets instead of zeroing them', () => {
    const { container } = render(
      <RailSparkline
        data={[
          { visitors: 1, pageviews: 2, bounce_rate: 40, avg_duration: null },
          { visitors: 1, pageviews: 2, bounce_rate: null, avg_duration: null },
          { visitors: 1, pageviews: 2, bounce_rate: 80, avg_duration: null },
        ]}
        dataKey="bounce_rate"
        active
      />,
    )
    // Two measured points → two coordinates, gap compressed away.
    const d = linePaths(container)[0].getAttribute('d') ?? ''
    expect([...d.matchAll(/[ML]/g)].length).toBe(2)
  })
})

// The mini must draw the same shape the big chart draws (owner report
// 01-09-2026: bounce/duration minis looked "nothing like the real charts").
// The big chart plots those metrics missing-as-zero; without the flag the
// mini dropped null buckets and compressed the survivors together.
describe('RailSparkline gap rule (missingAsZero)', () => {
  const gappy = [
    { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null },
    { pageviews: 4, visitors: 2, bounce_rate: 100, avg_duration: 30 },
    { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null },
    { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null },
    { pageviews: 6, visitors: 3, bounce_rate: 50, avg_duration: 60 },
    { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null },
  ]

  it('anchors every null bucket at the floor — one point per bucket', () => {
    const { container } = render(
      <RailSparkline active={false} data={gappy} dataKey="bounce_rate" missingAsZero />,
    )
    const d = linePaths(container)[0].getAttribute('d') ?? ''
    const pts = [...d.matchAll(/[ML]\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/g)].map((m) => ({
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
    }))
    expect(pts.length).toBe(gappy.length)
    // h=52, padBottom=2 → the floor is y=50; null buckets sit exactly there.
    for (const i of [0, 2, 3, 5]) expect(pts[i].y).toBeCloseTo(50, 3)
    // The real values keep true proportion above the floor.
    expect(pts[1].y).toBeLessThan(pts[4].y)
  })

  it('honours a precomputed pages_per_visit series — the deck divides by visits', () => {
    const withPpv = [
      { pageviews: 10, visitors: 10, bounce_rate: null, avg_duration: null, pages_per_visit: 5 },
      { pageviews: 10, visitors: 10, bounce_rate: null, avg_duration: null, pages_per_visit: null },
      { pageviews: 10, visitors: 10, bounce_rate: null, avg_duration: null, pages_per_visit: 2.5 },
    ]
    const { container } = render(
      <RailSparkline active={false} data={withPpv} dataKey="pages_per_visit" missingAsZero />,
    )
    const d = linePaths(container)[0].getAttribute('d') ?? ''
    const ys = [...d.matchAll(/[ML]\s*-?[\d.]+\s*,\s*(-?[\d.]+)/g)].map((m) => parseFloat(m[1]))
    // Max 5 → top of band (y=4); null → floor (50); 2.5 → mid-band (y=27).
    // Re-deriving pageviews/visitors would flat-line at 1 (10/10 everywhere),
    // so three DISTINCT heights prove the precomputed series won.
    expect(ys.length).toBe(3)
    expect(ys[0]).toBeCloseTo(4, 0)
    expect(ys[1]).toBeCloseTo(50, 3)
    expect(ys[2]).toBeCloseTo(27, 0)
  })
})

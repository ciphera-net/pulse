import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import RailSparkline from '@/components/dashboard/RailSparkline'

// The mini must draw the same shape the big chart draws (owner report
// 01-09-2026: bounce/duration minis looked "nothing like the real charts").
// The big chart plots those metrics missing-as-zero; the mini's old rule
// dropped null buckets and compressed the survivors together.

const data = [
  { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null },
  { pageviews: 4, visitors: 2, bounce_rate: 100, avg_duration: 30 },
  { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null },
  { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null },
  { pageviews: 6, visitors: 3, bounce_rate: 50, avg_duration: 60 },
  { pageviews: 0, visitors: 0, bounce_rate: null, avg_duration: null },
]

const linePoints = (container: HTMLElement): { x: number; y: number }[] => {
  const line = Array.from(container.querySelectorAll('path')).find(
    (p) => p.getAttribute('fill') === 'none',
  )
  const d = line?.getAttribute('d') ?? ''
  return [...d.matchAll(/[ML]\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/g)].map((m) => ({
    x: Number.parseFloat(m[1]),
    y: Number.parseFloat(m[2]),
  }))
}

describe('RailSparkline gap rule', () => {
  it('missingAsZero anchors every null bucket at the floor — one point per bucket', () => {
    const { container } = render(
      <RailSparkline active={false} data={data} dataKey="bounce_rate" missingAsZero />,
    )
    const pts = linePoints(container)
    expect(pts.length).toBe(data.length)
    // h=52, padBottom=2 → the floor is y=50; null buckets sit exactly there.
    for (const i of [0, 2, 3, 5]) expect(pts[i].y).toBeCloseTo(50, 3)
    // The real values keep true proportion above the floor.
    expect(pts[1].y).toBeLessThan(pts[4].y)
  })

  it('without the flag, null buckets still compress away (dense metrics unchanged)', () => {
    const { container } = render(
      <RailSparkline active={false} data={data} dataKey="bounce_rate" />,
    )
    expect(linePoints(container).length).toBe(2)
  })
})

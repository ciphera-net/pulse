import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import RailSparkline from '@/components/dashboard/RailSparkline'

// The restored pre-deck ghost trace (owner pick S4, 19-08-2026): grey at
// rest, brand orange on hover, orange while active. These pin the colour
// mechanic and the null honesty — both are one-character regressions.

const row = (visitors: number, over: Partial<{ bounce_rate: number | null; avg_duration: number | null }> = {}) => ({
  pageviews: visitors + 3, visitors, bounce_rate: 50, avg_duration: 60, ...over,
})

describe('RailSparkline', () => {
  it('rests grey and arms orange on hover — the like-before mechanic', () => {
    const { container } = render(
      <RailSparkline data={[row(5), row(9), row(7)]} dataKey="visitors" active={false} />
    )
    const line = container.querySelector('path[vector-effect="non-scaling-stroke"]')!
    expect(line.getAttribute('class')).toContain('stroke-neutral-600')
    expect(line.getAttribute('class')).toContain('group-hover:stroke-brand-orange')
  })

  it('the active metric is permanently orange', () => {
    const { container } = render(
      <RailSparkline data={[row(5), row(9), row(7)]} dataKey="visitors" active={true} />
    )
    const line = container.querySelector('path[vector-effect="non-scaling-stroke"]')!
    expect(line.getAttribute('class')).toContain('stroke-brand-orange')
    expect(line.getAttribute('class')).not.toContain('stroke-neutral-600')
  })

  it('skips unmeasured buckets rather than fabricating dips — no NaN in the path', () => {
    const { container } = render(
      <RailSparkline
        data={[row(5), row(9, { bounce_rate: null }), row(7), row(3)]}
        dataKey="bounce_rate"
        active={false}
      />
    )
    const line = container.querySelector('path[vector-effect="non-scaling-stroke"]')!
    expect(line.getAttribute('d')).not.toContain('NaN')
  })

  it('renders nothing below two measured points — a dot is not a trend', () => {
    const { container } = render(
      <RailSparkline data={[row(5)]} dataKey="visitors" active={false} />
    )
    expect(container.querySelector('svg')).toBeNull()
  })

  it('engagement draws from the daily scores, not the bucket rows', () => {
    const { container } = render(
      <RailSparkline
        data={[]}
        dataKey="engagement"
        active={false}
        engagementDaily={[{ date: '2026-08-17', score: 40 }, { date: '2026-08-18', score: 55 }]}
      />
    )
    expect(container.querySelector('path[vector-effect="non-scaling-stroke"]')).not.toBeNull()
  })
  })

  it('the trace is sharp — linear segments only, no smoothing curves', () => {
    const { container } = render(
      <RailSparkline data={[
        { pageviews: 8, visitors: 5, bounce_rate: 50, avg_duration: 60 },
        { pageviews: 12, visitors: 9, bounce_rate: 50, avg_duration: 60 },
        { pageviews: 10, visitors: 7, bounce_rate: 50, avg_duration: 60 },
      ]} dataKey="visitors" active={false} />
    )
    const d = container.querySelector('path[vector-effect="non-scaling-stroke"]')!.getAttribute('d')!
    // The hero chart is deliberately curveLinear (smoothing invents slopes
    // between real measurements); the rail speaks the same grammar.
    expect(d).not.toContain('C')
    expect(d).toContain('L')
  })

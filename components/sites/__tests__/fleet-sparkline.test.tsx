import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { FleetSparkline } from '@/components/sites/FleetSparkline'

// The fleet card's ghost trace speaks the mini's language (chart-consistency
// round, 05-09-2026). Before this it was a second hand-roll: monotone curve,
// flat wash, no tail, two multiplied opacities.

const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-08-3${i}`, visitors: [5, 9, 3, 12, 7, 4, 10][i] }))

function linePaths(container: HTMLElement) {
  return Array.from(container.querySelectorAll('path')).filter((p) => p.getAttribute('fill') === 'none')
}

describe('FleetSparkline (shared mini core)', () => {
  it('draws linear joins — no curve commands', () => {
    const { container } = render(<FleetSparkline days={days} />)
    for (const p of linePaths(container)) expect(p.getAttribute('d')).not.toContain('C')
  })

  it('always dashes the final segment — the overview window ends today by contract', () => {
    const { container } = render(<FleetSparkline days={days} />)
    const dashed = linePaths(container).filter((p) => p.getAttribute('stroke-dasharray') === '4 4')
    expect(dashed.length).toBe(1)
    // the solid line stops one bucket short; the tail carries the last segment
    const solid = linePaths(container).find((p) => !p.getAttribute('stroke-dasharray'))!
    expect([...(solid.getAttribute('d') ?? '').matchAll(/[ML]/g)].length).toBe(days.length - 1)
  })

  it('fills with a gradient grounded at the floor, not a flat wash', () => {
    const { container } = render(<FleetSparkline days={days} />)
    const area = Array.from(container.querySelectorAll('path')).find((p) => (p.getAttribute('fill') ?? '').startsWith('url(#'))
    expect(area).toBeTruthy()
    expect(area?.getAttribute('d')).toContain('L0,64 Z')
    expect(container.querySelector('linearGradient')).toBeTruthy()
  })

  it('keeps ONE opacity channel: no per-path opacity, the svg carries it', () => {
    const { container } = render(<FleetSparkline days={days} />)
    for (const p of container.querySelectorAll('path')) expect(p.getAttribute('opacity')).toBeNull()
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none')
    expect(svg.className.baseVal).toMatch(/opacity-60/)
  })

  it('a stalled card dims to the neutral ink and does not lift to orange on hover', () => {
    const { container } = render(<FleetSparkline days={days} dim />)
    const solid = linePaths(container).find((p) => !p.getAttribute('stroke-dasharray'))!
    expect(solid.getAttribute('class')).toContain('stroke-neutral-600')
    expect(solid.getAttribute('class')).not.toContain('group-hover:stroke-brand-orange')
  })

  it('renders nothing below two days', () => {
    const { container } = render(<FleetSparkline days={days.slice(0, 1)} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})

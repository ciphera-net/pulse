import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { useState } from 'react'

// The CDN split instrument on the shared chart (chart-consistency round,
// 05-09-2026, owner pick B): every line strip is the dashboard's chart at strip
// height, the errors row keeps its stacked bars on the same scale and cursor,
// and BOTH cards light the same day from one page-owned index.

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
const SvgPathProto = (globalThis as unknown as { SVGPathElement?: { prototype: object } }).SVGPathElement?.prototype
  ?? Object.getPrototypeOf(document.createElementNS('http://www.w3.org/2000/svg', 'path'))
Object.assign(SvgPathProto, {
  getTotalLength: () => 800,
  getPointAtLength: (l: number) => ({ x: l, y: 0 }),
})
vi.mock('@/lib/charts/primitives', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/charts/primitives')>()
  return {
    ...mod,
    // The stack measures its own container (not ParentSize) since the 05-09 collapse fix.
    useContainerSize: () => ({ width: 800, height: 300 }),
    ParentSize: ({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) =>
      <div>{children({ width: 800, height: 92 })}</div>,
  }
})
vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({ value, format }: { value: number; format: (v: number) => string }) => <span>{format(value)}</span>,
}))
vi.mock('@/components/ui/CountryFlag', () => ({ CountryFlag: () => null }))
vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))

import { EdgeCard, OriginCard } from '@/components/cdn/CdnSplitInstrument'
import type { CdnPoint, StatusMix } from '@/components/cdn/cdnMetrics'

const N = 14
const series: CdnPoint[] = Array.from({ length: N }, (_, i) => ({
  date: new Date(Date.UTC(2026, 7, 1 + i)),
  bandwidth: 1000 + i * 50,
  bandwidthCached: 800 + i * 40,
  bandwidthOrigin: 200 + i * 10,
  requests: 5000 + i * 100,
  requestsCached: 4000 + i * 80,
  // two days without requests → no hit rate → a GAP, never a bridge
  hitRate: i === 6 || i === 7 ? null : 78 + (i % 4),
  originMs: i === 3 ? null : 40 + (i % 5) * 3,
  e3xx: 10,
  e4xx: 20 + i,
  e5xx: i % 3,
}))
const mix: StatusMix = { total: 1000, c2xx: 900, c3xx: 50, c4xx: 45, c5xx: 5 }

function Split() {
  const [idx, setIdx] = useState<number | null>(null)
  const common = { series, overview: undefined, regions: [], regionsTotal: 0, regionsError: false, onRetryRegions: () => {}, mix, hoverIndex: idx, onHoverChange: setIdx }
  return (
    <div>
      <div data-testid="edge"><EdgeCard {...common} /></div>
      <div data-testid="origin"><OriginCard {...common} /></div>
    </div>
  )
}

const solidLines = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('path')).filter(
    (p) => p.getAttribute('fill') === 'none' && p.getAttribute('stroke') === 'var(--chart-1)' && !p.getAttribute('stroke-dasharray'),
  )

describe('CDN split instrument on the shared chart', () => {
  it('renders four line strips on the instrument and one bar strip, all linear, no svg text chrome', async () => {
    const { container } = render(<Split />)
    await act(() => new Promise((r) => setTimeout(r, 450)))
    const lines = solidLines(container)
    expect(lines.length).toBe(4)
    for (const p of lines) expect(p.getAttribute('d')).not.toContain('C')
    // the errors row: stacked bars, and its labels are HTML chrome
    expect(container.querySelectorAll('rect[fill="#F8836B"]').length).toBeGreaterThan(0)
    expect(container.querySelector('svg text')).toBeNull()
  })

  it('a day without a hit rate breaks the line — a gap, never a bridge', async () => {
    const { getByTestId } = render(<Split />)
    await act(() => new Promise((r) => setTimeout(r, 450)))
    const [, hitRate] = solidLines(getByTestId('edge'))
    expect((hitRate.getAttribute('d')?.match(/M/g) ?? []).length).toBe(2)
  })

  it('one page-owned index lights the same day on BOTH cards, with one card per stack', async () => {
    const { container, getByTestId } = render(<Split />)
    await act(() => new Promise((r) => setTimeout(r, 450)))
    const edge = getByTestId('edge')
    const origin = getByTestId('origin')
    const hit = edge.querySelectorAll('svg g[style] rect')[0] as SVGRectElement
    const [cached] = solidLines(edge)
    const xs = [...(cached.getAttribute('d') ?? '').matchAll(/[ML]\s*(-?[\d.]+)\s*,/g)].map((m) => Number(m[1]))
    fireEvent.mouseMove(hit, { clientX: 56 + xs[9], clientY: 40 })
    const edgeRects = edge.querySelectorAll('rect[fill^="url(#tooltip-indicator-gradient"], rect[fill^="url(#chart-crosshair"]')
    const originRects = origin.querySelectorAll('rect[fill^="url(#tooltip-indicator-gradient"], rect[fill^="url(#chart-crosshair"]')
    expect(edgeRects.length).toBe(2) // two line strips
    expect(originRects.length).toBe(3) // two line strips + the bar strip's crosshair
    for (const r of [...edgeRects, ...originRects]) expect(Number(r.getAttribute('x'))).toBeCloseTo(xs[9] - 0.5, 3)
    const cards = container.querySelectorAll('.w-56')
    expect(cards.length).toBe(2)
    expect(cards[0].textContent).toContain('UTC')
    expect(cards[0].textContent).toContain('Served from cache')
    expect(cards[1].textContent).toContain('5xx')
    fireEvent.mouseLeave(hit)
    expect(container.querySelector('.w-56')).toBeNull()
  })
})

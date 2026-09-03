import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// The sharp-chart contract (01-09-2026, artifact "The Sharp Line"): a dashed
// in-progress tail sharing the transition point, and a crisp (non-edge-faded)
// stroke when the consumer asks for it. Rendered at a real size by mocking
// ParentSize — jsdom measures 0×0 otherwise and no path renders at all.

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

// jsdom's SVGPathElement has no geometry API; the instrument's length
// measurement needs a working stub or the render throws.
const SvgPathProto = (globalThis as unknown as { SVGPathElement?: { prototype: object } }).SVGPathElement?.prototype
  ?? Object.getPrototypeOf(document.createElementNS('http://www.w3.org/2000/svg', 'path'))
Object.assign(SvgPathProto, {
  getTotalLength: () => 100,
  getPointAtLength: (l: number) => ({ x: l, y: 0 }),
})

vi.mock('@/lib/charts/primitives', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/charts/primitives')>()
  return {
    ...mod,
    ParentSize: ({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) =>
      <div>{children({ width: 800, height: 300 })}</div>,
  }
})

import { AreaChart, Area, YAxis } from '@/components/ui/area-chart'

const data = Array.from({ length: 10 }, (_, i) => ({
  dateObj: new Date(Date.UTC(2026, 7, i + 1)),
  v: 10 + (i % 4) * 5,
}))

function renderChart(areaProps: Record<string, unknown>) {
  return render(
    <AreaChart data={data as unknown as Record<string, unknown>[]} xDataKey="dateObj" aspectRatio="3 / 1">
      <Area dataKey="v" stroke="#FD5E0F" {...areaProps} />
    </AreaChart>,
  )
}

const strokedPaths = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('path')).filter(
    (p) => p.getAttribute('fill') === 'none' || p.getAttribute('fill') === 'transparent',
  )

describe('Area sharp contract', () => {
  it('renders a dashed 5 5 tail from the given index, sharing the transition point', () => {
    const { container } = renderChart({ dashedTailFrom: data.length - 2 })
    const lines = strokedPaths(container)
    const dashed = lines.filter((p) => p.getAttribute('stroke-dasharray') === '5 5')
    expect(dashed.length).toBe(1)
    // The solid line still exists alongside the tail.
    expect(lines.length).toBeGreaterThanOrEqual(2)
    // The tail is two points — a single straight segment (M + L, no curves).
    const d = dashed[0].getAttribute('d') ?? ''
    expect(d).toMatch(/^M/)
    expect(d).not.toContain('C')
  })

  it('renders no tail when dashedTailFrom is undefined or out of range', () => {
    const { container } = renderChart({})
    expect(strokedPaths(container).filter((p) => p.getAttribute('stroke-dasharray') === '5 5').length).toBe(0)
    const { container: c2 } = renderChart({ dashedTailFrom: data.length - 1 })
    expect(strokedPaths(c2).filter((p) => p.getAttribute('stroke-dasharray') === '5 5').length).toBe(0)
  })

  it('strokes with the plain color when fadeStrokeEdges is false, the gradient url otherwise', () => {
    const { container } = renderChart({ fadeStrokeEdges: false })
    const solid = strokedPaths(container).find((p) => !p.getAttribute('stroke-dasharray'))
    expect(solid?.getAttribute('stroke')).toBe('#FD5E0F')

    const { container: c2 } = renderChart({})
    const faded = strokedPaths(c2).find((p) => !p.getAttribute('stroke-dasharray'))
    expect(faded?.getAttribute('stroke')).toMatch(/^url\(#/)
  })
})

// The first-hour contract (04-09-2026): a one-point series shows a standing
// marker (a lone bucket otherwise renders an EMPTY chart — no segment to
// draw), a fixed xDomain pins it where the day will keep it (left edge),
// and count charts never print duplicate y labels.
describe('first-hour contract', () => {
  const oneBucket = [{ dateObj: new Date(Date.UTC(2026, 8, 4, 0)), v: 1 }]
  const day = (h: number, v: number) => ({ dateObj: new Date(Date.UTC(2026, 8, 4, h)), v })

  it('renders a standing r=3 marker for a single plotted point, none for two', () => {
    const { container } = render(
      <AreaChart data={oneBucket as unknown as Record<string, unknown>[]} xDataKey="dateObj" aspectRatio="3 / 1">
        <Area dataKey="v" stroke="#FD5E0F" fadeStrokeEdges={false} />
      </AreaChart>,
    )
    expect(container.querySelector('circle[r="3"]')).toBeTruthy()

    const { container: c2 } = renderChart({})
    expect(c2.querySelector('circle[r="3"]')).toBeNull()
  })

  it('integerYTicks never prints duplicate y labels on a max-1 day', () => {
    const { container } = render(
      <AreaChart
        data={[day(0, 1), day(1, 0)] as unknown as Record<string, unknown>[]}
        xDataKey="dateObj"
        aspectRatio="3 / 1"
        integerYTicks
      >
        <Area dataKey="v" stroke="#FD5E0F" />
        <YAxis numTicks={6} />
      </AreaChart>,
    )
    const labels = Array.from(container.querySelectorAll('span'))
      .map((el) => el.textContent?.trim())
      .filter((t) => t && /^\d+$/.test(t))
    expect(labels.length).toBeGreaterThanOrEqual(2)
    expect(new Set(labels).size).toBe(labels.length)
    // The integer TOP is always ticked — a filtered-out top left its
    // gridline floating mid-air (04-09, first cut of this fix).
    expect(labels).toContain('1')
    expect(labels).toContain('0')
  })
})

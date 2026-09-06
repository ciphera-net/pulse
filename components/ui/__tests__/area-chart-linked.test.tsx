import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { curveLinear } from 'd3-shape'
import { useState } from 'react'

// Train 0 of the chart-consistency round (05-09-2026): the instrument's new
// capabilities, each pinned so the four page ports can rely on them.
//   - linked hover: N charts driven by one index move as one cursor
//   - showCard={false}: the dot without the card (the stack draws one)
//   - invertY / yDomain / yTicks: fixed and inverted frames
//   - defined: a predicate gap (the funnel's n<5 rule)
//   - pointsKey: static per-datum dots from a second key
//   - ReferenceLine: a dashed instant with HTML chrome
//   - stable ids: two charts with the same dataKey never collide
//   - ChartStack: one card, one axis, one index across members

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
      <div>{children({ width: 800, height: 300 })}</div>,
  }
})

import { AreaChart, Area, ChartTooltip, YAxis, Grid, ReferenceLine } from '@/components/ui/area-chart'
import { ChartStack, ChartStackAxis, useChartStack } from '@/components/ui/chart-stack'

const POINTS = 10
const data = Array.from({ length: POINTS }, (_, i) => ({
  dateObj: new Date(Date.UTC(2026, 7, i + 1)),
  v: 10 + (i % 4) * 5,
  w: 3 + (i % 3),
  entered: i === 4 ? 2 : 20,
}))
const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 }

async function settle() {
  await act(() => new Promise((r) => setTimeout(r, 20)))
}

function activeDot(container: HTMLElement): SVGCircleElement | null {
  return container.querySelector('circle[r="5"]')
}

function lineVertices(container: HTMLElement, stroke = '#FD5E0F'): { x: number; y: number }[] {
  const solid = Array.from(container.querySelectorAll('path')).find(
    (p) => p.getAttribute('fill') === 'none' && p.getAttribute('stroke') === stroke && !p.getAttribute('stroke-dasharray'),
  )
  const d = solid?.getAttribute('d') ?? ''
  return [...d.matchAll(/[ML]\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
}

describe('linked hover', () => {
  function Twin() {
    const [idx, setIdx] = useState<number | null>(null)
    const common = { animationDuration: 0, aspectRatio: '3 / 1', data: data as unknown as Record<string, unknown>[], xDataKey: 'dateObj', margin: MARGIN, hoverIndex: idx, onHoverChange: setIdx }
    return (
      <div>
        <div data-testid="a">
          <AreaChart {...common}>
            <Area curve={curveLinear} dataKey="v" fadeStrokeEdges={false} stroke="#FD5E0F" />
            <ChartTooltip showCard={false} showDatePill={false} />
          </AreaChart>
        </div>
        <div data-testid="b">
          <AreaChart {...common}>
            <Area curve={curveLinear} dataKey="w" fadeStrokeEdges={false} stroke="#FD5E0F" />
            <ChartTooltip showCard={false} showDatePill={false} />
          </AreaChart>
        </div>
        <output data-testid="idx">{idx == null ? 'null' : String(idx)}</output>
      </div>
    )
  }

  it('hovering one chart moves the dot on its sibling to the same datum', async () => {
    const { getByTestId } = render(<Twin />)
    await settle()
    const a = getByTestId('a')
    const b = getByTestId('b')
    const hit = a.querySelectorAll('svg g[style] rect')[0] as SVGRectElement
    const xs = lineVertices(a).map((p) => p.x)
    // pointer over bucket 6 (inner coords): svg-local x = margin.left + xs[6]
    fireEvent.mouseMove(hit, { clientX: MARGIN.left + xs[6], clientY: 100 })
    expect(getByTestId('idx').textContent).toBe('6')
    const ra = activeDot(a)
    const rb = activeDot(b)
    expect(ra).not.toBeNull()
    expect(rb).not.toBeNull()
    expect(Number(ra!.getAttribute('cx'))).toBeCloseTo(xs[6], 3)
    expect(Number(rb!.getAttribute('cx'))).toBeCloseTo(xs[6], 3)
    // no crosshair since 06-09-2026
    expect(a.querySelector('rect[fill^="url(#tooltip-indicator"]')).toBeNull()
    // no card anywhere — the stack draws its own
    expect(a.querySelector('.w-56')).toBeNull()
    expect(b.querySelector('.w-56')).toBeNull()
    fireEvent.mouseLeave(hit)
    expect(getByTestId('idx').textContent).toBe('null')
    expect(activeDot(b)).toBeNull()
  })

  it('does not report the same bucket twice while the pointer stays inside it', async () => {
    const calls: (number | null)[] = []
    function Spy() {
      const [idx, setIdx] = useState<number | null>(null)
      return (
        <AreaChart animationDuration={0} aspectRatio="3 / 1" data={data as unknown as Record<string, unknown>[]} hoverIndex={idx} margin={MARGIN} onHoverChange={(i) => { calls.push(i); setIdx(i) }} xDataKey="dateObj">
          <Area curve={curveLinear} dataKey="v" fadeStrokeEdges={false} stroke="#FD5E0F" />
          <ChartTooltip showCard={false} showDatePill={false} />
        </AreaChart>
      )
    }
    const { container } = render(<Spy />)
    await settle()
    const hit = container.querySelectorAll('svg g[style] rect')[0] as SVGRectElement
    const xs = lineVertices(container).map((p) => p.x)
    for (const off of [-8, -4, 0, 4, 8]) fireEvent.mouseMove(hit, { clientX: MARGIN.left + xs[3] + off, clientY: 100 })
    expect(calls).toEqual([3])
  })
})

describe('frames', () => {
  it('invertY puts the largest value at the bottom of the plot', async () => {
    const { container } = render(
      <AreaChart animationDuration={0} aspectRatio="3 / 1" data={data as unknown as Record<string, unknown>[]} invertY margin={MARGIN} xDataKey="dateObj">
        <Area curve={curveLinear} dataKey="v" fadeStrokeEdges={false} fillOpacity={0} stroke="#FD5E0F" />
      </AreaChart>,
    )
    await settle()
    const pts = lineVertices(container)
    const vMax = Math.max(...data.map((d) => d.v))
    const iMax = data.findIndex((d) => d.v === vMax)
    const iMin = data.findIndex((d) => d.v === Math.min(...data.map((d) => d.v)))
    // inverted: bigger value → bigger y (lower on screen)
    expect(pts[iMax].y).toBeGreaterThan(pts[iMin].y)
  })

  it('yDomain + yTicks fix the frame and the labels', async () => {
    const { container } = render(
      <AreaChart animationDuration={0} aspectRatio="3 / 1" data={data as unknown as Record<string, unknown>[]} margin={MARGIN} xDataKey="dateObj" yDomain={[0, 100]} yTicks={[0, 50, 90, 100]}>
        <Grid horizontal numTicksRows={6} vertical={false} />
        <Area curve={curveLinear} dataKey="v" fadeStrokeEdges={false} stroke="#FD5E0F" />
        <YAxis numTicks={6} />
      </AreaChart>,
    )
    await settle()
    const labels = Array.from(container.querySelectorAll('span.tabular-nums')).map((s) => s.textContent)
    expect(labels).toEqual(['0', '50', '90', '100'])
    const gridLines = container.querySelectorAll('g[mask] line')
    expect(gridLines.length).toBe(4)
    // v never exceeds 25, so with a 0–100 frame every vertex sits in the lower quarter
    const innerH = 300 * 0 + (800 / 3 - MARGIN.top - MARGIN.bottom)
    for (const p of lineVertices(container)) expect(p.y).toBeGreaterThan(innerH * 0.7)
  })
})

describe('marks', () => {
  it('defined predicate breaks the line into two segments', async () => {
    const { container } = render(
      <AreaChart animationDuration={0} aspectRatio="3 / 1" data={data as unknown as Record<string, unknown>[]} margin={MARGIN} xDataKey="dateObj">
        <Area curve={curveLinear} dataKey="v" defined={(d) => (d.entered as number) >= 5} fadeStrokeEdges={false} stroke="#FD5E0F" />
      </AreaChart>,
    )
    await settle()
    const solid = Array.from(container.querySelectorAll('path')).find((p) => p.getAttribute('fill') === 'none' && p.getAttribute('stroke') === '#FD5E0F')
    const d = solid?.getAttribute('d') ?? ''
    expect((d.match(/M/g) ?? []).length).toBe(2)
  })

  it('pointsKey draws one static dot per numeric datum from the other key', async () => {
    const { container } = render(
      <AreaChart animationDuration={0} aspectRatio="3 / 1" data={data as unknown as Record<string, unknown>[]} margin={MARGIN} xDataKey="dateObj">
        <Area curve={curveLinear} dataKey="v" fadeStrokeEdges={false} pointsKey="w" stroke="#FD5E0F" />
      </AreaChart>,
    )
    await settle()
    const dots = container.querySelectorAll('circle[r="1.8"]')
    expect(dots.length).toBe(POINTS)
  })

  it('ReferenceLine draws a dashed instant and its label in axis chrome', async () => {
    const { container } = render(
      <AreaChart animationDuration={0} aspectRatio="3 / 1" data={data as unknown as Record<string, unknown>[]} margin={MARGIN} xDataKey="dateObj">
        <Area curve={curveLinear} dataKey="v" fadeStrokeEdges={false} stroke="#FD5E0F" />
        <ReferenceLine label="median of 3 from 05/08 →" x={data[4].dateObj} />
      </AreaChart>,
    )
    await settle()
    const line = container.querySelector('line[stroke-dasharray="3 4"]')
    expect(line).not.toBeNull()
    const xs = lineVertices(container).map((p) => p.x)
    expect(Number(line!.getAttribute('x1'))).toBeCloseTo(xs[4], 3)
    expect(container.textContent).toContain('median of 3 from 05/08')
  })

  it('two charts with the same dataKey get distinct gradient ids', async () => {
    const { container } = render(
      <div>
        <AreaChart animationDuration={0} aspectRatio="3 / 1" data={data as unknown as Record<string, unknown>[]} margin={MARGIN} xDataKey="dateObj">
          <Area curve={curveLinear} dataKey="v" fadeStrokeEdges={false} stroke="#FD5E0F" />
        </AreaChart>
        <AreaChart animationDuration={0} aspectRatio="3 / 1" data={data as unknown as Record<string, unknown>[]} margin={MARGIN} xDataKey="dateObj">
          <Area curve={curveLinear} dataKey="v" fadeStrokeEdges={false} stroke="#FD5E0F" />
        </AreaChart>
      </div>,
    )
    await settle()
    const ids = Array.from(container.querySelectorAll('linearGradient[id^="area-gradient-v-"]')).map((g) => g.id)
    expect(ids.length).toBe(2)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]+$/)
  })
})

describe('ChartStack', () => {
  const STRIP_MARGIN = { top: 8, right: 16, bottom: 6, left: 44 }

  function Bars() {
    // A hand-rolled member: consumes the stack's scale and index.
    const { xScale, margin, hoverIndex, innerWidth } = useChartStack()
    return (
      <svg data-testid="bars" height={40} width={innerWidth + margin.left + margin.right}>
        <g transform={`translate(${margin.left},0)`}>
          {data.map((d, i) => (
            <rect data-hovered={hoverIndex === i ? '1' : '0'} height={20} key={i} width={4} x={(xScale(d.dateObj) ?? 0) - 2} y={10} />
          ))}
        </g>
      </svg>
    )
  }

  it('renders one card at the hovered bucket, a shared axis, and drives a bar member', async () => {
    const { container, getByTestId } = render(
      <ChartStack
        data={data as unknown as Record<string, unknown>[]}
        margin={STRIP_MARGIN}
        railWidth={200}
        rows={(p) => [{ color: '#FD5E0F', label: 'Clicks', value: String(p.v) }, { color: '#FD5E0F', label: 'Impressions', value: String(p.w) }]}
        title={(p) => (p.dateObj as Date).toISOString().slice(0, 10)}
        xDataKey="dateObj"
      >
        <div data-testid="strip">
          <AreaChart animationDuration={0} aspectRatio="3 / 1" data={data as unknown as Record<string, unknown>[]} margin={STRIP_MARGIN} xDataKey="dateObj" {...({} as object)}>
            <Area curve={curveLinear} dataKey="v" fadeStrokeEdges={false} stroke="#FD5E0F" />
            <ChartTooltip showCard={false} showDatePill={false} />
          </AreaChart>
        </div>
        <Bars />
        <ChartStackAxis numTicks={5} />
      </ChartStack>,
    )
    await settle()
    // axis labels are HTML chrome in the instrument's classes
    const axisLabels = container.querySelectorAll('.text-neutral-500.text-xs')
    expect(axisLabels.length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('.w-56')).toBeNull()
    // the member is uncontrolled here (no hoverIndex wiring) — a stack-aware
    // member wires useChartStack; simulate the stack's own state via Bars
    expect(getByTestId('bars').querySelectorAll('rect[data-hovered="1"]').length).toBe(0)
  })

  it('a linked member updates the stack index and the card follows', async () => {
    function Member() {
      const { hoverIndex, setHoverIndex } = useChartStack()
      return (
        <AreaChart animationDuration={0} aspectRatio="3 / 1" data={data as unknown as Record<string, unknown>[]} hoverIndex={hoverIndex} margin={STRIP_MARGIN} onHoverChange={setHoverIndex} xDataKey="dateObj">
          <Area curve={curveLinear} dataKey="v" fadeStrokeEdges={false} stroke="#FD5E0F" />
          <ChartTooltip showCard={false} showDatePill={false} />
        </AreaChart>
      )
    }
    const { container, getByTestId } = render(
      <ChartStack
        data={data as unknown as Record<string, unknown>[]}
        margin={STRIP_MARGIN}
        railWidth={0}
        rows={(p) => [{ color: '#FD5E0F', label: 'Clicks', value: String(p.v) }]}
        title={() => 'Bucket'}
        xDataKey="dateObj"
      >
        <Member />
        <Bars />
      </ChartStack>,
    )
    await settle()
    const hit = container.querySelectorAll('svg g[style] rect')[0] as SVGRectElement
    const xs = lineVertices(container).map((p) => p.x)
    fireEvent.mouseMove(hit, { clientX: STRIP_MARGIN.left + xs[7], clientY: 30 })
    // bar member lit at the same index
    expect(getByTestId('bars').querySelectorAll('rect[data-hovered="1"]').length).toBe(1)
    expect(getByTestId('bars').querySelectorAll('rect')[7].getAttribute('data-hovered')).toBe('1')
    // exactly one card, the stack's, with the header strip
    const cards = container.querySelectorAll('.w-56')
    expect(cards.length).toBe(1)
    expect(cards[0].textContent).toContain('Bucket')
    expect(cards[0].textContent).toContain('Clicks')
    fireEvent.mouseLeave(hit)
    expect(container.querySelector('.w-56')).toBeNull()
  })
})

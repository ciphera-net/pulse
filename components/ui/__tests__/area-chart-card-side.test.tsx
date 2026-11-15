import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { curveLinear } from 'd3-shape'

// ─────────────────────────────────────────────────────────────────────────────
// THE CARD CHANGES SIDE BEFORE IT LEAVES THE CHART.
//
// The card under the pointer is 224 px wide (w-56). It is drawn to the right of
// the pointer until it would pass the chart's right edge, and to the left from
// there. The width that decision reads is held in state: 180 px to begin with,
// corrected by an effect that measures the card.
//
// That effect was keyed on the two sizes alone. The card is not in the document
// until the pointer is on the chart, so the effect never ran with the card
// there, and the side was decided for a card of 180 px. In a band 44 px wide
// near the right edge the card was drawn past the chart: 33 px past it and 22 px
// past the deck that cuts it, measured on the dashboard's main chart
// (15-11-2026).
//
// jsdom lays nothing out, so the card's width is given here as the browser
// would report it: 224 px for the card's wrapper, nothing for anything else.
// The chart is 800 px wide and its ten points stand 80 px apart from x = 40, so
// the point at x = 600 is inside the band: a card of 180 px would still fit to
// its right (600 + 16 + 180 = 796), a card of 224 px does not (840).
//
// The mutation this kills: the effect keyed on the sizes alone again.
// ─────────────────────────────────────────────────────────────────────────────

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
    ParentSize: ({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) =>
      <div>{children({ width: 800, height: 300 })}</div>,
  }
})

import { AreaChart, Area, ChartTooltip } from '@/components/ui/area-chart'

const CARD = 224
const OFFSET = 16
const CHART = 800

const widthBefore = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.querySelector(':scope > div.w-56') ? CARD : 0
    },
  })
})
afterAll(() => {
  if (widthBefore) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', widthBefore)
})

const POINTS = 10
const data = Array.from({ length: POINTS }, (_, i) => ({
  dateObj: new Date(Date.UTC(2026, 7, i + 1)),
  v: 10 + (i % 4) * 5,
}))

async function renderChart() {
  const utils = render(
    <AreaChart
      animationDuration={0}
      aspectRatio="3 / 1"
      data={data as unknown as Record<string, unknown>[]}
      xDataKey="dateObj"
    >
      <Area curve={curveLinear} dataKey="v" fadeStrokeEdges={false} stroke="#FD5E0F" />
      <ChartTooltip showDatePill={false} />
    </AreaChart>,
  )
  await act(() => new Promise((r) => setTimeout(r, 20)))
  return utils
}

function lineVertices(container: HTMLElement): number[] {
  const solid = Array.from(container.querySelectorAll('path')).find(
    (p) => p.getAttribute('fill') === 'none' && p.getAttribute('stroke') === '#FD5E0F' && !p.getAttribute('stroke-dasharray'),
  )
  const xs = [...(solid?.getAttribute('d') ?? '').matchAll(/[ML]\s*(-?[\d.]+)\s*,/g)].map((m) => Number.parseFloat(m[1]))
  expect(xs.length).toBe(POINTS)
  return xs
}

function marginLeft(container: HTMLElement): number {
  const g = Array.from(container.querySelectorAll('g')).find((el) => /^translate\(/.test(el.getAttribute('transform') ?? ''))
  const m = (g?.getAttribute('transform') ?? '').match(/translate\(([\d.]+),/)
  expect(m).not.toBeNull()
  return Number.parseFloat(m?.[1] ?? '0')
}

function interactiveG(container: HTMLElement): SVGGElement {
  const g = Array.from(container.querySelectorAll('g')).find((el) => (el as SVGGElement).style.cursor === 'none')
  expect(g).toBeDefined()
  return g as SVGGElement
}

/** Where the card's left edge is drawn, in the chart's own pixels. */
function cardLeft(container: HTMLElement): number {
  const wrapper = Array.from(container.querySelectorAll('div')).find(
    (el) => el.className.includes('pointer-events-none') && el.className.includes('z-50') && el.querySelector('div[class*="bg-popover"]'),
  ) as HTMLElement | undefined
  expect(wrapper, 'the card must be drawn while the pointer is on the chart').toBeDefined()
  return Number.parseFloat(wrapper?.style.left ?? '')
}

describe("the chart's card stays inside the chart", () => {
  it('is drawn to the left of a point where the whole card no longer fits to its right', async () => {
    const { container } = await renderChart()
    const xs = lineVertices(container)
    const ml = marginLeft(container)
    const x = ml + xs[7]
    // The point this test is about: inside the band where 180 px fit and 224 px do not.
    expect(x + OFFSET + 180).toBeLessThanOrEqual(CHART)
    expect(x + OFFSET + CARD).toBeGreaterThan(CHART)

    fireEvent.mouseMove(interactiveG(container), { clientX: x, clientY: 100 })
    const left = cardLeft(container)
    expect(left, 'the card is to the left of the pointer').toBe(x - OFFSET - CARD)
    expect(left + CARD, 'and it ends before the chart does').toBeLessThanOrEqual(CHART)
  })

  it('never ends past the chart, at any point', async () => {
    const { container } = await renderChart()
    const xs = lineVertices(container)
    const ml = marginLeft(container)
    const g = interactiveG(container)
    const ends: number[] = []
    for (const px of xs) {
      fireEvent.mouseMove(g, { clientX: ml + px, clientY: 100 })
      ends.push(cardLeft(container) + CARD)
    }
    expect(ends.filter((end) => end > CHART)).toEqual([])
    // And it did move: a card that sat in one place would pass the line above too.
    expect(new Set(ends).size).toBe(POINTS)
  })

  it('is still drawn to the right of a point where it fits there', async () => {
    const { container } = await renderChart()
    const xs = lineVertices(container)
    const ml = marginLeft(container)
    const x = ml + xs[3]
    fireEvent.mouseMove(interactiveG(container), { clientX: x, clientY: 100 })
    expect(cardLeft(container)).toBe(x + OFFSET)
  })
})

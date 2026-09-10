import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { curveLinear } from 'd3-shape'

// ─────────────────────────────────────────────────────────────────────────────
// The axis tick does NOT step aside for the cursor (owner, 10-09-2026: "when
// hovering over a specific point on the chart, the date/hour in the horizontal
// axis goes away. it shouldn't go away").
//
// XAxisLabel used to fade to opacity 0 within 50 px of the crosshair, and
// linearly back to 1 by 70 px, to clear room for the DateTicker pill that once
// rode the axis under the cursor. Every consumer of ChartTooltip passes
// showDatePill={false} — CommandDeck, Search, CDN, Funnels, Performance,
// Uptime — so the fade had been erasing the hovered date to make room for
// nothing. The date you are pointing at is the one label you most want to read.
//
// The mutation these tests kill is any re-introduced distance-based opacity on
// the tick labels.
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

import { AreaChart, Area, ChartTooltip, XAxis } from '@/components/ui/area-chart'

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
      <XAxis />
      <ChartTooltip showDatePill={false} />
    </AreaChart>,
  )
  await act(() => new Promise((r) => setTimeout(r, 20)))
  return utils
}

/** Every rendered axis tick, with its left offset and its effective opacity. */
function ticks(container: HTMLElement) {
  return Array.from(container.querySelectorAll('div.absolute'))
    .filter((el) => (el as HTMLElement).style.bottom === '12px')
    .map((el) => {
      const span = el.querySelector('span') as HTMLElement | null
      return {
        left: Number.parseFloat((el as HTMLElement).style.left || '0'),
        text: span?.textContent ?? '',
        // An un-set opacity reads '' from the inline style; framer-motion writes
        // a number there, which is exactly what the old fade did.
        inlineOpacity: span?.style.opacity ?? '',
      }
    })
}

function interactiveG(container: HTMLElement): SVGGElement {
  const g = Array.from(container.querySelectorAll('g')).find(
    (el) => (el as SVGGElement).style.cursor === 'none',
  )
  expect(g).toBeDefined()
  return g as SVGGElement
}

function hoverAt(container: HTMLElement, clientX: number) {
  const g = interactiveG(container)
  const rect = g.querySelector('rect') as SVGRectElement
  fireEvent.pointerMove(rect, { clientX, clientY: 50 })
}

describe('axis ticks under the cursor', () => {
  it('renders ticks at all', async () => {
    const { container } = await renderChart()
    const found = ticks(container)
    expect(found.length).toBeGreaterThan(1)
    expect(found.every((t) => t.text.length > 0)).toBe(true)
  })

  it('keeps EVERY tick fully visible while hovering directly over one', async () => {
    const { container } = await renderChart()
    const before = ticks(container)
    expect(before.length).toBeGreaterThan(1)

    // Hover exactly on top of a tick — the case that used to erase it.
    const target = before[Math.floor(before.length / 2)]
    hoverAt(container, target.left)

    const after = ticks(container)
    expect(after.length, 'a tick disappeared from the DOM').toBe(before.length)
    expect(after.map((t) => t.text)).toEqual(before.map((t) => t.text))
    // No tick may carry a faded inline opacity, least of all the hovered one.
    for (const t of after) {
      expect(t.inlineOpacity === '' || Number(t.inlineOpacity) === 1,
        `tick "${t.text}" faded to ${t.inlineOpacity} under the cursor`).toBe(true)
    }
  })

  it('keeps the ticks visible at several cursor positions across the plot', async () => {
    const { container } = await renderChart()
    const before = ticks(container)
    for (const t of before) {
      // On the tick, and just inside the old 50px fade radius on both sides.
      for (const x of [t.left - 10, t.left, t.left + 10]) {
        hoverAt(container, x)
        const faded = ticks(container).filter(
          (n) => n.inlineOpacity !== '' && Number(n.inlineOpacity) !== 1,
        )
        expect(faded, `faded ticks with the cursor at ${x}`).toEqual([])
      }
    }
  })
})

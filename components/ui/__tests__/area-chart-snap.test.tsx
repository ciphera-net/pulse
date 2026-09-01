import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { curveLinear } from 'd3-shape'

// The sticky-cursor contract (01-09-2026): the crosshair, dot, highlight and
// tooltip card SNAP to the hovered datum's exact scaled x, synchronously, and
// hold that position for every pointer position inside the bucket's half.
// The mutation these tests kill is any easing/spring re-introduced on the
// hover positions — a spring reads mid-flight (stale) immediately after a
// bucket crossing, and these assertions read synchronously after fireEvent.

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

const SvgPathProto = (globalThis as unknown as { SVGPathElement?: { prototype: object } }).SVGPathElement?.prototype
  ?? Object.getPrototypeOf(document.createElementNS('http://www.w3.org/2000/svg', 'path'))
// Path length equals the chart width so length-at-x is the identity map —
// a shorter stub saturates the highlight's binary search and every bucket
// resolves to the same dash window, hiding real movement.
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

const POINTS = 10
const data = Array.from({ length: POINTS }, (_, i) => ({
  dateObj: new Date(Date.UTC(2026, 7, i + 1)),
  v: 10 + (i % 4) * 5,
}))

async function renderInteractive() {
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
  // isLoaded (the interaction gate) flips on a setTimeout(animationDuration).
  await act(() => new Promise((r) => setTimeout(r, 20)))
  return utils
}

// The solid line's vertices ARE the data points' scaled x positions — with
// curveLinear the d attribute is "M x0,y0 L x1,y1 ..." in inner coordinates.
function lineVertices(container: HTMLElement): number[] {
  const solid = Array.from(container.querySelectorAll('path')).find(
    (p) => p.getAttribute('fill') === 'none' && p.getAttribute('stroke') === '#FD5E0F' && !p.getAttribute('stroke-dasharray'),
  )
  const d = solid?.getAttribute('d') ?? ''
  const xs = [...d.matchAll(/[ML]\s*(-?[\d.]+)\s*,/g)].map((m) => Number.parseFloat(m[1]))
  expect(xs.length).toBe(POINTS)
  return xs
}

function marginLeft(container: HTMLElement): number {
  // The tooltip layer translates by the chart margin; parse it back out so
  // the test never hardcodes the component's default margin.
  const g = Array.from(container.querySelectorAll('g')).find((el) =>
    /^translate\(/.test(el.getAttribute('transform') ?? ''),
  )
  const m = (g?.getAttribute('transform') ?? '').match(/translate\(([\d.]+),/)
  expect(m).not.toBeNull()
  return Number.parseFloat(m?.[1] ?? '0')
}

function interactiveG(container: HTMLElement): SVGGElement {
  const g = Array.from(container.querySelectorAll('g')).find(
    (el) => (el as SVGGElement).style.cursor === 'crosshair',
  )
  expect(g).toBeDefined()
  return g as SVGGElement
}

const crosshairX = (container: HTMLElement): number | null => {
  const rect = container.querySelector('rect[fill="url(#tooltip-indicator-gradient)"]')
  return rect ? Number.parseFloat(rect.getAttribute('x') ?? '') : null
}

const dotCx = (container: HTMLElement): number | null => {
  const dot = container.querySelector('circle[r="5"]')
  return dot ? Number.parseFloat(dot.getAttribute('cx') ?? '') : null
}

describe('sticky cursor contract', () => {
  it('snaps the crosshair to the hovered datum synchronously, with no easing', async () => {
    const { container } = await renderInteractive()
    const xs = lineVertices(container)
    const ml = marginLeft(container)
    const g = interactiveG(container)
    const col = xs[1] - xs[0]

    // Land inside bucket 3 (not at its center, not near a midpoint).
    fireEvent.mouseMove(g, { clientX: ml + xs[3] + col * 0.2, clientY: 100 })
    // Read IMMEDIATELY: a spring would still be at/near its previous value.
    expect(crosshairX(container)).toBeCloseTo(xs[3] - 0.5, 5)

    // Cross three buckets in one move — still exact, still synchronous.
    fireEvent.mouseMove(g, { clientX: ml + xs[6] - col * 0.2, clientY: 100 })
    expect(crosshairX(container)).toBeCloseTo(xs[6] - 0.5, 5)
  })

  it('holds one fixed position for every pointer x inside the same bucket', async () => {
    const { container } = await renderInteractive()
    const xs = lineVertices(container)
    const ml = marginLeft(container)
    const g = interactiveG(container)
    const col = xs[1] - xs[0]

    const offsets = [-0.4, -0.2, 0, 0.2, 0.4]
    const seen = new Set<number>()
    for (const f of offsets) {
      fireEvent.mouseMove(g, { clientX: ml + xs[5] + col * f, clientY: 100 })
      const x = crosshairX(container)
      expect(x).not.toBeNull()
      seen.add(x as number)
    }
    expect(seen.size).toBe(1)
    expect([...seen][0]).toBeCloseTo(xs[5] - 0.5, 5)
  })

  it('steps through exactly one position per datum across a full sweep', async () => {
    const { container } = await renderInteractive()
    const xs = lineVertices(container)
    const g = interactiveG(container)

    const seen = new Set<number>()
    for (let px = 0; px <= 800; px += 3) {
      fireEvent.mouseMove(g, { clientX: px, clientY: 100 })
      const x = crosshairX(container)
      if (x !== null) seen.add(x)
    }
    // Every datum is a stick position, and nothing between them ever renders.
    expect(seen.size).toBe(POINTS)
    const sorted = [...seen].sort((a, b) => a - b)
    sorted.forEach((x, i) => expect(x).toBeCloseTo(xs[i] - 0.5, 5))
  })

  it('keeps the active dot glued to the crosshair at the exact datum x', async () => {
    const { container } = await renderInteractive()
    const xs = lineVertices(container)
    const ml = marginLeft(container)
    const g = interactiveG(container)
    const col = xs[1] - xs[0]

    fireEvent.mouseMove(g, { clientX: ml + xs[4] + col * 0.3, clientY: 100 })
    expect(dotCx(container)).toBeCloseTo(xs[4], 5)
    fireEvent.mouseMove(g, { clientX: ml + xs[7] - col * 0.3, clientY: 100 })
    expect(dotCx(container)).toBeCloseTo(xs[7], 5)
  })

  it('moves the lit highlight window with the hovered bucket — forward and back', async () => {
    const { container } = await renderInteractive()
    const xs = lineVertices(container)
    const ml = marginLeft(container)
    const g = interactiveG(container)
    const col = xs[1] - xs[0]

    const windowOf = () => {
      const p = Array.from(container.querySelectorAll('path')).find((el) =>
        (el.getAttribute('stroke-dasharray') ?? '').includes('100000'),
      )
      expect(p, 'highlight path must render while hovering').toBeDefined()
      return `${p?.getAttribute('stroke-dashoffset')}/${p?.getAttribute('stroke-dasharray')}`
    }

    fireEvent.mouseMove(g, { clientX: ml + xs[3] + col * 0.2, clientY: 100 })
    const atThree = windowOf()
    fireEvent.mouseMove(g, { clientX: ml + xs[6] + col * 0.2, clientY: 100 })
    const atSix = windowOf()
    expect(atSix, 'the window must follow a forward move').not.toBe(atThree)
    fireEvent.mouseMove(g, { clientX: ml + xs[3] + col * 0.2, clientY: 100 })
    expect(windowOf(), 'the window must follow a move back').toBe(atThree)
  })

  it('gives the card position a 100ms glide — the flip slides, never teleports', async () => {
    const { container } = await renderInteractive()
    const xs = lineVertices(container)
    const ml = marginLeft(container)
    const g = interactiveG(container)

    fireEvent.mouseMove(g, { clientX: ml + xs[4], clientY: 100 })
    const wrapper = Array.from(container.querySelectorAll('div')).find(
      (el) =>
        el.className.includes('pointer-events-none') &&
        el.className.includes('z-50') &&
        el.querySelector('div[class*="bg-popover"]'),
    ) as HTMLElement | undefined
    expect(wrapper, 'card wrapper must render while hovering').toBeDefined()
    expect(wrapper?.style.transition).toContain('left 100ms')

    // Fixed one-line card: w-56 box, nowrap label/value (the 192px box
    // wrapped "Visit duration | 15m 58s" onto two lines, 01-09 report).
    const inner = wrapper?.querySelector('div[class*="bg-popover"]')
    expect(inner?.className).toContain('w-56')
    const label = inner?.querySelector('span[class*="text-neutral-300"]')
    expect(label?.className).toContain('whitespace-nowrap')
  })

  it('hides the crosshair and dot immediately on mouse leave', async () => {
    const { container } = await renderInteractive()
    const xs = lineVertices(container)
    const ml = marginLeft(container)
    const g = interactiveG(container)

    fireEvent.mouseMove(g, { clientX: ml + xs[2], clientY: 100 })
    expect(crosshairX(container)).not.toBeNull()
    fireEvent.mouseLeave(g)
    expect(crosshairX(container)).toBeNull()
    expect(dotCx(container)).toBeNull()
  })
})

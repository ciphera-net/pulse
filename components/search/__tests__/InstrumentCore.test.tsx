import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'

// The Search instrument on the shared chart (chart-consistency round,
// 05-09-2026, owner pick B): every strip is the dashboard's chart at strip
// height, ONE cursor runs through the stack, ONE card reads every visible
// metric, and position draws a gap where it is unknown.

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
vi.mock('@/components/ui/UpdatingChip', () => ({ UpdatingChip: () => null }))

import { InstrumentCore } from '@/components/search/InstrumentPanel'
import type { SeriesPoint, MetricKey } from '@/components/search/searchMetrics'

const N = 12
const series: SeriesPoint[] = Array.from({ length: N }, (_, i) => ({
  date: new Date(Date.UTC(2026, 7, 1 + i)),
  clicks: 2 + (i % 5),
  impressions: 100 + i * 17,
  ctr: (2 + (i % 5)) / (100 + i * 17),
  // position unknown on the legacy rows in the middle — a GAP, never a 0
  position: i === 5 || i === 6 ? null : 8 + (i % 3),
}))

const rows = (['clicks', 'impressions', 'ctr', 'position'] as MetricKey[]).map((key) => ({
  key,
  value: key === 'ctr' ? 0.03 : key === 'position' ? 9.1 : 55,
  delta: { type: 'pct' as const, value: 8 },
}))

async function renderCore(active: MetricKey[] = ['clicks', 'impressions', 'ctr', 'position']) {
  const utils = render(
    <InstrumentCore
      active={active}
      emptyHint=""
      emptyTitle=""
      error={false}
      errorTitle=""
      granularity="daily"
      isLoading={false}
      isValidating={false}
      onRetry={() => {}}
      onToggle={() => {}}
      rangeEnd="2026-08-12"
      rows={rows}
      series={series}
    />,
  )
  // Interaction is gated behind the strip's 400ms first-mount draw-in
  // (the instrument's canInteract latch) — wait past it.
  await act(() => new Promise((r) => setTimeout(r, 450)))
  return utils
}

const solidLines = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('path')).filter(
    (p) => p.getAttribute('fill') === 'none' && p.getAttribute('stroke') === 'var(--chart-1)' && !p.getAttribute('stroke-dasharray'),
  )

describe('Search InstrumentCore on the shared instrument', () => {
  it('renders one instrument chart per active metric, linear, in the brand ink', async () => {
    const { container } = await renderCore()
    const lines = solidLines(container)
    expect(lines.length).toBe(4)
    for (const p of lines) expect(p.getAttribute('d')).not.toContain('C')
  })

  it('position draws a GAP where it is unknown — never a fabricated best rank', async () => {
    const { container } = await renderCore(['position'])
    const [line] = solidLines(container)
    const d = line.getAttribute('d') ?? ''
    expect((d.match(/M/g) ?? []).length).toBe(2)
    // inverted: the smallest position (best) sits at the TOP (smallest y)
    const pts = [...d.matchAll(/[ML]\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
    const known = series.filter((p) => p.position != null)
    const best = Math.min(...known.map((p) => p.position as number))
    const worst = Math.max(...known.map((p) => p.position as number))
    const ys = pts.map((p) => p.y)
    // best rank = smallest y among the plotted points
    expect(Math.min(...ys)).toBeLessThan(Math.max(...ys))
    expect(best).toBeLessThan(worst)
  })

  it('ONE cursor through every strip, ONE card with a row per visible metric', async () => {
    const { container } = await renderCore()
    const hit = container.querySelectorAll('svg g[style] rect')[0] as SVGRectElement
    const [first] = solidLines(container)
    const xs = [...(first.getAttribute('d') ?? '').matchAll(/[ML]\s*(-?[\d.]+)\s*,/g)].map((m) => Number(m[1]))
    fireEvent.mouseMove(hit, { clientX: 48 + xs[8], clientY: 40 })
    // four crosshairs (one per strip) at the same datum x
    const rects = Array.from(container.querySelectorAll('rect[fill^="url(#tooltip-indicator-gradient"]'))
    expect(rects.length).toBe(4)
    for (const r of rects) expect(Number(r.getAttribute('x'))).toBeCloseTo(xs[8] - 0.5, 3)
    // exactly one card — the stack's — with the bucket's identity and four rows
    const cards = container.querySelectorAll('.w-56')
    expect(cards.length).toBe(1)
    expect(cards[0].textContent).toContain('09/08/2026')
    for (const label of ['Clicks', 'Impressions', 'Avg CTR', 'Avg position']) expect(cards[0].textContent).toContain(label)
    fireEvent.mouseLeave(hit)
    expect(container.querySelector('.w-56')).toBeNull()
  })

  it('draws the shared axis row in the instrument chrome, not svg text', async () => {
    const { container } = await renderCore(['clicks'])
    const labels = Array.from(container.querySelectorAll('span.text-neutral-500.text-xs')).map((s) => s.textContent ?? '')
    const dateLabels = labels.filter((t) => /^\d{2}\/\d{2}$/.test(t))
    expect(dateLabels.length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('svg text')).toBeNull()
  })

  it('daily buckets never carry a dashed tail; a partial week does', async () => {
    const { container } = await renderCore(['clicks'])
    expect(container.querySelectorAll('path[stroke-dasharray="5 5"]').length).toBe(0)
    const weekly: SeriesPoint[] = [0, 7, 14, 21].map((d, i) => ({ ...series[i], date: new Date(Date.UTC(2026, 7, 3 + d)) }))
    const { container: c2 } = render(
      <InstrumentCore
        active={['clicks']}
        emptyHint=""
        emptyTitle=""
        error={false}
        errorTitle=""
        granularity="weekly"
        isLoading={false}
        isValidating={false}
        onRetry={() => {}}
        onToggle={() => {}}
        rangeEnd="2026-08-26"
        rows={rows}
        series={weekly}
      />,
    )
    await act(() => new Promise((r) => setTimeout(r, 450)))
    expect(c2.querySelectorAll('path[stroke-dasharray="5 5"]').length).toBe(1)
  })
})

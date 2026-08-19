import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ScrollDepthBars from '@/components/dashboard/ScrollDepthBars'
import type { ScrollDepthDistribution } from '@/lib/api/stats'

// * ScrollDepthBars moved out of components/behavior/ when the Behavior page was
// * retired (Pulse/docs/plans/14-08-2026-behavioral-tracking-removal.md). It was the
// * only thing on that page that survives, because scroll depth comes from the CORE
// * script — not the retired frustration add-on — and is a published public-API field.
// *
// * It had no test while it lived there, and the move swapped its data source from
// * `behavior.scroll_depth` to `dashboard.scroll_depth`. Both are the same shape, so a
// * regression here would be silent: the panel would render, just always empty. These
// * pin the render rather than the wiring.

// * Deliberately chosen so no computed SHARE collides with a threshold LABEL. The
// * component renders both ("75%" the rail, "23%" its share), so a fixture like
// * 250/1000 makes the 75-rail's share read "25%" and an exact-text query then
// * matches two nodes. Real-looking round numbers are the trap here.
const dist = (over: Partial<ScrollDepthDistribution> = {}): ScrollDepthDistribution => ({
  scroll_25: 810, // 81%
  scroll_50: 470, // 47%
  scroll_75: 230, // 23%
  scroll_100: 90, //  9%
  total_sessions: 1000,
  ...over,
})

describe('ScrollDepthBars', () => {
  it('renders a row for each threshold with its COMPUTED share, not a static label', () => {
    render(<ScrollDepthBars scrollDepth={dist()} />)
    for (const label of ['Reached 25%', 'Reached 50%', 'Reached 75%', 'Reached 100%']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    // The computed shares (count/total) — a broken percentage calc goes RED
    // here (the adversarial review proved the old label-only assertion let a
    // pct→0 mutation ship green).
    for (const share of ['81%', '47%', '23%', '9%']) {
      expect(screen.getByText(share)).toBeInTheDocument()
    }
    // And the raw counts in the row grammar.
    expect(screen.getByText('810')).toBeInTheDocument()
  })

  it('shows the empty state when there are no sessions', () => {
    // * The whole point of retiring the Behavior page was that its frustration panels
    // * could only ever render empty once collection stopped. Scroll depth must NOT
    // * behave that way — but a site with genuinely no scroll data still needs a
    // * legible empty state rather than four zero-width bars.
    const { container } = render(<ScrollDepthBars scrollDepth={dist({ total_sessions: 0 })} />)
    expect(container.textContent).toBeTruthy()
    expect(screen.queryByText('Reached 25%')).not.toBeInTheDocument()
  })

  it('renders without data — the loading/undefined case must not throw', () => {
    // * `dashboard?.scroll_depth` is optional and undefined on first paint. Passing
    // * undefined is the normal path, not an edge case.
    expect(() => render(<ScrollDepthBars scrollDepth={undefined} />)).not.toThrow()
  })

  it('is monotonically decreasing across thresholds for real data', () => {
    // * Guards the semantic, not the pixels: max-scroll-depth per session means a
    // * visitor past 75% is necessarily past 50%. If a future query change broke that
    // * invariant the chart would be nonsense, so assert the fixture models it.
    const d = dist()
    expect(d.scroll_25).toBeGreaterThanOrEqual(d.scroll_50)
    expect(d.scroll_50).toBeGreaterThanOrEqual(d.scroll_75)
    expect(d.scroll_75).toBeGreaterThanOrEqual(d.scroll_100)
    expect(d.total_sessions).toBeGreaterThanOrEqual(d.scroll_25)
  })
})

describe('ScrollDepthBars layered mode (D6h2)', () => {
  const preview = {
    screenshot: 'data:image/webp;base64,FULL',
    width: 1350, height: 6638, strategy: 'desktop', checked_at: '2026-08-19T00:00:00Z',
  }

  it('renders four sheets of the capture, each shifted one quarter deeper', () => {
    const { container } = render(<ScrollDepthBars scrollDepth={dist()} preview={preview} />)
    const imgs = Array.from(container.querySelectorAll('img'))
    expect(imgs).toHaveLength(4)
    const shifts = imgs.map(img => (img as HTMLElement).style.transform)
    expect(shifts).toEqual([
      'translateY(-0%)', 'translateY(-25%)', 'translateY(-50%)', 'translateY(-75%)',
    ])
    // The rails grammar must NOT render alongside the sheets.
    expect(screen.queryByText('Reached 25%')).not.toBeInTheDocument()
  })

  it('keeps the numbers in the chrome: computed shares above, depth captions below', () => {
    render(<ScrollDepthBars scrollDepth={dist()} preview={preview} />)
    for (const share of ['81%', '47%', '23%', '9%']) {
      expect(screen.getByText(share)).toBeInTheDocument()
    }
    for (const cap of ['to 25%', 'to 50%', 'to 75%', 'to the end']) {
      expect(screen.getByText(cap)).toBeInTheDocument()
    }
  })

  it('derives each sheet\'s dim from its share — attrition is drawn, not decorated', () => {
    const { container } = render(<ScrollDepthBars scrollDepth={dist()} preview={preview} />)
    const dims = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .map(el => (el as HTMLElement).style.background)
      .filter(bg => bg.includes('rgba(10, 10, 10'))
    // shares .81/.47/.23/.09 → (1-share)*.85 clamped: .16/.45/.65/.77
    expect(dims).toEqual([
      'rgba(10, 10, 10, 0.16)', 'rgba(10, 10, 10, 0.45)',
      'rgba(10, 10, 10, 0.65)', 'rgba(10, 10, 10, 0.77)',
    ])
  })

  it('falls back to the rails without a capture — absence is a state', () => {
    render(<ScrollDepthBars scrollDepth={dist()} preview={null} />)
    expect(screen.getByText('Reached 25%')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('grows the hovered sheet above the stack and lifts its dim to the floor', () => {
    const { container } = render(<ScrollDepthBars scrollDepth={dist()} preview={preview} />)
    const sheets = Array.from(container.querySelectorAll('img'))
      .map(img => img.parentElement as HTMLElement)

    // Rest state: no scale-up, shallow-over-deep stacking.
    expect(sheets[2].style.transform).toBe('scale(1)')
    expect(sheets[2].style.zIndex).toBe('2')

    fireEvent.mouseEnter(sheets[2])
    expect(sheets[2].style.transform).toBe('scale(1.06)')
    expect(sheets[2].style.zIndex).toBe('10')
    // Its dim falls to the floor so that band of the page is readable…
    const dimOf = (sheet: HTMLElement) =>
      (sheet.querySelector('[aria-hidden="true"]') as HTMLElement).style.background
    expect(dimOf(sheets[2])).toBe('rgba(10, 10, 10, 0.04)')
    // …while the neighbours keep their attrition dims and rest geometry.
    expect(dimOf(sheets[1])).toBe('rgba(10, 10, 10, 0.45)')
    expect(sheets[1].style.transform).toBe('scale(1)')

    fireEvent.mouseLeave(sheets[2])
    expect(sheets[2].style.transform).toBe('scale(1)')
    expect(sheets[2].style.zIndex).toBe('2')
    expect(dimOf(sheets[2])).toBe('rgba(10, 10, 10, 0.65)')
  })
})

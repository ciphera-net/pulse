import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  it('renders a rail for each of the four thresholds', () => {
    render(<ScrollDepthBars scrollDepth={dist()} />)
    for (const label of ['25%', '50%', '75%', '100%']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('shows the empty state when there are no sessions', () => {
    // * The whole point of retiring the Behavior page was that its frustration panels
    // * could only ever render empty once collection stopped. Scroll depth must NOT
    // * behave that way — but a site with genuinely no scroll data still needs a
    // * legible empty state rather than four zero-width bars.
    const { container } = render(<ScrollDepthBars scrollDepth={dist({ total_sessions: 0 })} />)
    expect(container.textContent).toBeTruthy()
    expect(screen.queryByText('25%')).not.toBeInTheDocument()
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

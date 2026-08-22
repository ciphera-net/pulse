import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PerformanceTrend, trailingMedian, provenanceBoundary } from '../PerformanceTrend'
import type { PerformanceCheck } from '@/lib/api/performance'

// The old chart auto-scaled its y axis, so a 71→91 swing between two single
// runs of an UNCHANGED page filled the plot and read as a collapse. These tests
// pin the three properties that make the new one honest: a fixed axis, the
// spread shown next to the trend, and a visible boundary where the measuring
// instrument changed.

let seq = 0
const chk = (over: Partial<PerformanceCheck>): PerformanceCheck =>
  ({
    id: `c${seq++}`,
    site_id: 's1',
    strategy: 'mobile',
    source: 'lighthouse',
    status: 'ok',
    error: null,
    lighthouse_version: '13.4.1',
    runs: 3,
    performance_score: 80,
    accessibility_score: null,
    best_practices_score: null,
    seo_score: null,
    lcp_ms: null,
    cls: null,
    tbt_ms: null,
    fcp_ms: null,
    si_ms: null,
    tti_ms: null,
    audits: [],
    triggered_by: 'scheduled',
    checked_at: '2026-08-01T00:00:00Z',
    ...over,
  }) as PerformanceCheck

const series = (scores: (number | null)[], source: 'psi' | 'lighthouse' | ((i: number) => 'psi' | 'lighthouse') = 'lighthouse') =>
  scores.map((s, i) =>
    chk({
      performance_score: s,
      source: typeof source === 'function' ? source(i) : source,
      checked_at: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
    }),
  )

describe('trailingMedian', () => {
  it('smooths a single outlier instead of plotting it as the trend', () => {
    // The real measurement: three desktop runs of an unchanged page, 95/89/95.
    //
    // The expected array is written out BY HAND. It used to be computed with the
    // same slice-sort-lower-median expression the implementation uses, so it
    // could only confirm the code agreed with a copy of itself — an
    // implementation that returned its input unchanged satisfied it exactly.
    // (It also evaluates to the input unchanged here, which is why the second
    // half of this test, not the first, is what earns the title.)
    expect(trailingMedian([95, 89, 95], 7)).toEqual([95, 89, 95])

    // Concretely: a lone 20-point dip does not drag the line down by 20.
    const line = trailingMedian([80, 80, 80, 80, 80, 60, 80], 7)
    expect(line[5]).toBe(80)
    expect(line[6]).toBe(80)
  })

  it('FORGETS values older than the window', () => {
    // 🔴 THE WINDOW WAS NEVER EXERCISED. Every input in this block used to be 7
    // values or fewer, so Math.max(0, i - window + 1) was always 0 and the slice
    // was always the whole prefix. Replacing it with a cumulative
    // `values.slice(0, i + 1)` — an all-history median — left the suite GREEN.
    //
    // usePerformanceHistory defaults to 90 days, so the real chart plots ~90
    // points. With the window regressed to cumulative, a site that genuinely
    // drops from 90 to 45 and stays there keeps drawing a line near 90 for about
    // six more weeks: the chart bills itself as a 7-check median and silently
    // reports a stale trend, hiding exactly the regression the redesign exists
    // to make visible.
    const line = trailingMedian([90, 90, 90, 90, 90, 90, 90, 40, 40, 40, 40], 7)

    expect(line[6]).toBe(90) // still entirely inside the flat stretch

    // The exact crossing, which is what proves the window is a WINDOW:
    //   i=9  → indices 3..9  = [90,90,90,90,40,40,40] → four 90s → median 90
    //   i=10 → indices 4..10 = [90,90,90,40,40,40,40] → four 40s → median 40
    // The oldest 90 falls out of the window between those two points, and that
    // is the only reason the value moves. A cumulative median over all eleven
    // values is 90 at BOTH indices, so this pair is what kills the mutation.
    expect(line[9]).toBe(90)
    expect(line[10]).toBe(40)
  })

  it('takes the LOWER median, matching the backend rule', () => {
    // Even window: 40 and 60. The pessimistic choice is the one that does not
    // quietly suppress a regression.
    expect(trailingMedian([40, 60], 7)[1]).toBe(40)
  })

  it('only looks backwards — the first point is its own median', () => {
    expect(trailingMedian([73, 10, 10, 10], 7)[0]).toBe(73)
  })

  it('honours the window argument rather than a hardcoded 7', () => {
    // A window of 3 forgets faster than a window of 7 on the same input.
    const input = [90, 90, 90, 90, 40, 40]
    expect(trailingMedian(input, 3)[5]).toBe(40)
    expect(trailingMedian(input, 7)[5]).toBe(90)
  })
})

describe('provenanceBoundary', () => {
  it('marks the first self-hosted check in a mixed series', () => {
    const pts = [
      { t: 1, source: 'psi' },
      { t: 2, source: 'psi' },
      { t: 3, source: 'lighthouse' },
      { t: 4, source: 'lighthouse' },
    ]
    expect(provenanceBoundary(pts)).toBe(3)
  })

  it('returns null when nothing changed — an annotation off the edge of the plot is worse than none', () => {
    expect(provenanceBoundary([{ t: 1, source: 'psi' }, { t: 2, source: 'psi' }])).toBeNull()
    expect(provenanceBoundary([{ t: 1, source: 'lighthouse' }, { t: 2, source: 'lighthouse' }])).toBeNull()
  })
})

describe('PerformanceTrend', () => {
  it('pins the y axis to 0-100 so a 20-point swing does not fill the plot', () => {
    // This IS the fix. With an auto-scaled axis these two points would sit at
    // the very top and very bottom of the chart.
    const { container } = render(<PerformanceTrend checks={series([71, 91])} timezone={null} />)
    const labels = [...container.querySelectorAll('text')]
      .map(t => t.textContent)
      .filter(t => t && /^\d+$/.test(t))
    expect(labels).toEqual(['0', '50', '90', '100'])

    // And geometrically: neither dot may touch the top or bottom of the plot,
    // because 71 and 91 are nowhere near 0 or 100.
    const dots = [...container.querySelectorAll('circle')] as SVGCircleElement[]
    expect(dots.length).toBe(2)
    const cys = dots.map(d => Number(d.getAttribute('cy')))
    // padT=12, plot height 202 => y(100)=12, y(0)=214.
    for (const cy of cys) {
      expect(cy).toBeGreaterThan(12)
      expect(cy).toBeLessThan(214)
    }
    // 91 must sit ABOVE 71 (smaller y), and the gap must be ~20% of the plot,
    // not the whole of it.
    const gap = Math.abs(cys[0] - cys[1])
    expect(gap).toBeGreaterThan(30)
    expect(gap).toBeLessThan(50)
  })

  it('draws the LINE from the median and the DOTS from the raw scores', () => {
    // Every other test in this file reads <circle> cy, which is y(p.score) — the
    // raw check. NOTHING read the line's own geometry, so the component could
    // have plotted raw scores as the trend line and the whole suite would still
    // have passed: the caption says "line = 7-check median", and no test held it
    // to that.
    //
    // Seven points, one 20-point dip at index 5. The dot must follow the dip and
    // the line must not.
    const { container } = render(<PerformanceTrend checks={series([80, 80, 80, 80, 80, 60, 80])} timezone={null} />)

    const linePath = container.querySelector('path[fill="none"]')
    expect(linePath).toBeTruthy()
    const ys = (linePath!.getAttribute('d') ?? '')
      .replace(/^M/, '')
      .split('L')
      .map(pair => Number(pair.split(',')[1]))
    expect(ys.length).toBe(7)

    const dots = [...container.querySelectorAll('circle')] as SVGCircleElement[]
    const dotYs = dots.map(d => Number(d.getAttribute('cy')))

    // y is pinned 0-100 over the plot: padT=12, plot height 202, so a LOWER
    // score sits FURTHER DOWN (a larger y).
    expect(dotYs[5]).toBeGreaterThan(dotYs[4]) // the dot shows the dip
    expect(ys[5]).toBeCloseTo(ys[4], 1) // the line does not
    // And the line is genuinely above the dipped dot, by roughly the 20 points
    // the median smoothed away.
    expect(dotYs[5] - ys[5]).toBeGreaterThan(30)
  })

  it('draws one dot per check — the spread, not just the trend', () => {
    const { container } = render(<PerformanceTrend checks={series([70, 75, 80, 85, 90])} timezone={null} />)
    expect(container.querySelectorAll('circle').length).toBe(5)
  })

  it('drops checks with no score rather than plotting them as zero', () => {
    const { container } = render(<PerformanceTrend checks={series([70, null, 80])} timezone={null} />)
    expect(container.querySelectorAll('circle').length).toBe(2)
  })

  it('annotates where the measuring instrument changed', () => {
    const { container } = render(
      <PerformanceTrend checks={series([70, 72, 78, 80], i => (i < 2 ? 'psi' : 'lighthouse'))} timezone={null} />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('median of 3 from')
    expect(text).toContain('single-run, Lighthouse version unknown')
    expect(container.querySelector('line[stroke-dasharray]')).toBeTruthy()
  })

  it('says nothing about provenance when the whole series is one instrument', () => {
    const { container } = render(<PerformanceTrend checks={series([70, 72, 78, 80])} timezone={null} />)
    expect(container.textContent).not.toContain('median of 3 from')
    expect(container.querySelector('line[stroke-dasharray]')).toBeNull()
  })

  it('renders nothing below two points instead of drawing a line through one', () => {
    const { container } = render(<PerformanceTrend checks={series([70])} timezone={null} />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('keeps its wide content inside its own box', () => {
    // The app shell's ancestors lack min-width:0, so a wide grid child forces
    // the shell to scroll — and the shell's overflow-x-hidden then DELETES the
    // overflowing content rather than revealing it.
    const { container } = render(<PerformanceTrend checks={series([70, 80])} timezone={null} />)
    const svgWrapper = container.querySelector('svg')?.parentElement
    expect(svgWrapper?.className).toContain('min-w-0')
  })
})

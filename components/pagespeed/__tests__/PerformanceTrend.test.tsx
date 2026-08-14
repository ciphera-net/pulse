import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PerformanceTrend, trailingMedian, provenanceBoundary } from '../PerformanceTrend'
import type { PageSpeedCheck } from '@/lib/api/pagespeed'

// The old chart auto-scaled its y axis, so a 71→91 swing between two single
// runs of an UNCHANGED page filled the plot and read as a collapse. These tests
// pin the three properties that make the new one honest: a fixed axis, the
// spread shown next to the trend, and a visible boundary where the measuring
// instrument changed.

let seq = 0
const chk = (over: Partial<PageSpeedCheck>): PageSpeedCheck =>
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
  }) as PageSpeedCheck

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
    expect(trailingMedian([95, 89, 95], 7)).toEqual([95, 89, 95].map((_, i) => [95, 89, 95].slice(0, i + 1).sort((a, b) => a - b)[Math.floor(i / 2)]))
    // Concretely: a lone 20-point dip does not drag the line down by 20.
    const line = trailingMedian([80, 80, 80, 80, 80, 60, 80], 7)
    expect(line[5]).toBe(80)
    expect(line[6]).toBe(80)
  })

  it('takes the LOWER median, matching the backend rule', () => {
    // Even window: 40 and 60. The pessimistic choice is the one that does not
    // quietly suppress a regression.
    expect(trailingMedian([40, 60], 7)[1]).toBe(40)
  })

  it('only looks backwards — the first point is its own median', () => {
    expect(trailingMedian([73, 10, 10, 10], 7)[0]).toBe(73)
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
    const { container } = render(<PerformanceTrend checks={series([71, 91])} />)
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

  it('draws one dot per check — the spread, not just the trend', () => {
    const { container } = render(<PerformanceTrend checks={series([70, 75, 80, 85, 90])} />)
    expect(container.querySelectorAll('circle').length).toBe(5)
  })

  it('drops checks with no score rather than plotting them as zero', () => {
    const { container } = render(<PerformanceTrend checks={series([70, null, 80])} />)
    expect(container.querySelectorAll('circle').length).toBe(2)
  })

  it('annotates where the measuring instrument changed', () => {
    const { container } = render(
      <PerformanceTrend checks={series([70, 72, 78, 80], i => (i < 2 ? 'psi' : 'lighthouse'))} />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('median of 3 from')
    expect(text).toContain('single-run, Lighthouse version unknown')
    expect(container.querySelector('line[stroke-dasharray]')).toBeTruthy()
  })

  it('says nothing about provenance when the whole series is one instrument', () => {
    const { container } = render(<PerformanceTrend checks={series([70, 72, 78, 80])} />)
    expect(container.textContent).not.toContain('median of 3 from')
    expect(container.querySelector('line[stroke-dasharray]')).toBeNull()
  })

  it('renders nothing below two points instead of drawing a line through one', () => {
    const { container } = render(<PerformanceTrend checks={series([70])} />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('keeps its wide content inside its own box', () => {
    // The app shell's ancestors lack min-width:0, so a wide grid child forces
    // the shell to scroll — and the shell's overflow-x-hidden then DELETES the
    // overflowing content rather than revealing it.
    const { container } = render(<PerformanceTrend checks={series([70, 80])} />)
    const svgWrapper = container.querySelector('svg')?.parentElement
    expect(svgWrapper?.className).toContain('min-w-0')
  })
})

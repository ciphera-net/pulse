import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChartStack, ChartStackAxis, useChartStack } from '../chart-stack'

/**
 * 🔴 REGRESSION — the stack must render its content REGARDLESS of its own
 * measured size.
 *
 * On 05-09-2026 the chart-consistency promote (#575) shipped a ChartStack that
 * wrapped its children in `ParentSize`, which withholds children until the
 * container measures a height > 0. The container is content-sized — the
 * strips ARE its height — so it collapsed: no children → height 0 → gate
 * closed → no children. Every ChartStack page on production (Search, CDN,
 * Uptime, Funnel-daily) rendered an empty card; only the fixed-height charts
 * (deck, performance, fleet) survived. Production was rolled back by hand.
 *
 * Every chart test until then mocked `ParentSize` to 800×300, which is why
 * none of them could see it. This test deliberately mocks NOTHING: in jsdom
 * every box measures 0×0, which is exactly the state that collapsed the stack.
 * If a future change gates the stack's children on its size again, the marker
 * below disappears and this fails.
 */

const DATA = [
  { date: new Date('2026-09-01T00:00:00Z'), v: 1 },
  { date: new Date('2026-09-02T00:00:00Z'), v: 2 },
  { date: new Date('2026-09-03T00:00:00Z'), v: 3 },
]
const MARGIN = { top: 8, right: 16, bottom: 6, left: 48 }

function Member() {
  // A hand-rolled member reads the stack through context, like the bar strips do.
  const { data, plotWidth } = useChartStack()
  return (
    <div data-testid="member" data-points={data.length} data-plot-width={plotWidth}>
      member
    </div>
  )
}

describe('ChartStack renders its content unconditionally', () => {
  it('mounts the rail, the members and the axis row when the container measures 0×0 (jsdom)', () => {
    render(
      <ChartStack
        data={DATA}
        margin={MARGIN}
        rows={() => []}
        title={() => 'x'}
        xDataKey="date"
      >
        <div className="flex">
          <div data-chart-stack-rail="" data-testid="rail">
            rail
          </div>
          <Member />
        </div>
        <ChartStackAxis numTicks={4} />
      </ChartStack>,
    )

    // The whole point: these exist even though nothing has a size yet.
    expect(screen.getByTestId('rail')).toBeInTheDocument()
    const member = screen.getByTestId('member')
    expect(member).toBeInTheDocument()
    // Context is live — the member sees the stack's data.
    expect(member.getAttribute('data-points')).toBe(String(DATA.length))
    // A 0-width container yields a 0 plot width, not a crash and not a hidden tree.
    expect(member.getAttribute('data-plot-width')).toBe('0')
  })
})

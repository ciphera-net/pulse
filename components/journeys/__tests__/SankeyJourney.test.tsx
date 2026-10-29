import { describe, expect, it, afterEach, beforeAll, afterAll, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { JourneyFlow, JourneyFlowColumn, JourneyFlowLink, JourneyFlowPage } from '@/lib/api/journeys'

// jsdom has no ResizeObserver (the canvas measures its width with one).
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

import SankeyJourney from '../SankeyJourney'

// The three strings of the bounded flow's display, as worded on 10-10-2026:
// the step header counts SESSIONS (the column's exact total), and the footer
// states the (other)→(other) hops it does not draw, between the steps clause
// and the period, only when there are any.

// jsdom lays nothing out, so clientWidth is 0 and the layout would be empty.
const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 })
})
afterAll(() => {
  if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth)
})
afterEach(cleanup)

const col = (top: JourneyFlowPage[], otherSessions = 0, otherPages = 0): JourneyFlowColumn => ({
  total_sessions: top.reduce((s, [, n]) => s + n, 0) + otherSessions,
  pages: top.length + otherPages,
  top,
  other_sessions: otherSessions,
  other_pages: otherPages,
})

/** 38 sessions; 20 went into column 1's (other), and `oo` of them on into column 2's (other). */
function flowWith(oo: number): JourneyFlow {
  const links: JourneyFlowLink[] = [
    [0, 0, 0, 18],
    [0, 0, -1, 20],
    [1, 0, 0, 13],
    [1, 0, -1, 5],
    [1, -1, 0, 2],
  ]
  if (oo > 0) links.push([1, -1, -1, oo])
  return {
    depth: 3,
    total_sessions: 38,
    columns: [col([['/', 38]]), col([['/a', 18]], 20, 3), col([['/b', 15]], 5 + oo, 2)],
    links,
  }
}

const renderFlow = (flow: JourneyFlow) =>
  render(
    <SankeyJourney
      flow={flow}
      maxPagesPerStep={20}
      lens={null}
      onLensChange={() => {}}
      periodLabel="1 Oct 2026 – 9 Oct 2026"
    />,
  )

describe('SankeyJourney', () => {
  it('headers count sessions, with the exact column totals', () => {
    renderFlow(flowWith(13))
    expect(screen.queryByText('visitors')).toBeNull()
    expect(screen.getAllByText('sessions')).toHaveLength(3)
    // * column 2: /b 15, (other) 5 from /a, and the 13 that arrived (other)→(other)
    expect(screen.getByText('33')).toBeInTheDocument()
  })

  it('states the undrawn (other)→(other) hops between the steps clause and the period', () => {
    renderFlow(flowWith(13))
    expect(screen.getByTestId('journeys-footer')).toHaveTextContent(
      /^38 sessions tracked · 3 steps · 13 hops from \(other\) to \(other\) not drawn · 1 Oct 2026 – 9 Oct 2026$/,
    )
  })

  it('says hop, singular, for one', () => {
    renderFlow(flowWith(1))
    expect(screen.getByTestId('journeys-footer')).toHaveTextContent(
      /· 1 hop from \(other\) to \(other\) not drawn ·/,
    )
  })

  it('leaves the clause out when every hop is drawn', () => {
    renderFlow(flowWith(0))
    const footer = screen.getByTestId('journeys-footer')
    expect(footer).toHaveTextContent(/^38 sessions tracked · 3 steps · 1 Oct 2026 – 9 Oct 2026$/)
    expect(footer).not.toHaveTextContent('not drawn')
  })

  it('takes the depth for the steps clause from the flow it draws', () => {
    const flow = flowWith(0)
    renderFlow({ ...flow, depth: 4, columns: [...flow.columns, col([])] })
    expect(screen.getByTestId('journeys-footer')).toHaveTextContent(
      'Showing 3 of 4 steps — no traffic beyond step 3 in this period',
    )
  })
})

import { describe, it, expect } from 'vitest'
import { layoutSankey, NODE_WIDTH } from '../sankeyLayout'
import type { JourneyFlow, JourneyFlowColumn, JourneyFlowPage } from '@/lib/api/journeys'

const col = (top: JourneyFlowPage[], otherSessions = 0, otherPages = 0): JourneyFlowColumn => ({
  total_sessions: top.reduce((s, [, n]) => s + n, 0) + otherSessions,
  pages: top.length + otherPages,
  top,
  other_sessions: otherSessions,
  other_pages: otherPages,
})

// / → login (10) + / → pricing (5); login → app (8). Depth 4: the last column is empty.
const FIXTURE: JourneyFlow = {
  depth: 4,
  total_sessions: 15,
  columns: [
    col([['/', 15]]),
    col([['/login', 10], ['/pricing', 5]]),
    col([['/app', 8]]),
    col([]),
  ],
  links: [
    [0, 0, 0, 10],
    [0, 0, 1, 5],
    [1, 0, 0, 8],
  ],
}

const EMPTY_FLOW: JourneyFlow = {
  depth: 4,
  total_sessions: 0,
  columns: [col([]), col([]), col([]), col([])],
  links: [],
}

const OPTS = { maxPagesPerStep: 20, width: 900 }

describe('layoutSankey', () => {
  it('returns an empty layout for an empty range or zero width', () => {
    expect(layoutSankey(EMPTY_FLOW, OPTS).nodes).toHaveLength(0)
    expect(layoutSankey(FIXTURE, { ...OPTS, width: 0 }).nodes).toHaveLength(0)
  })

  it('builds one node per visible step:path and one link per hop', () => {
    const layout = layoutSankey(FIXTURE, OPTS)
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(
      ['0:/', '1:/login', '1:/pricing', '2:/app'].sort(),
    )
    expect(layout.links).toHaveLength(3)
  })

  it('justifies columns edge-to-edge across the width', () => {
    const layout = layoutSankey(FIXTURE, OPTS)
    const step0 = layout.nodes.find((n) => n.id === '0:/')!
    const step2 = layout.nodes.find((n) => n.id === '2:/app')!
    expect(step0.x).toBe(0)
    expect(step2.x).toBe(900 - NODE_WIDTH)
  })

  it('scales strip heights to the busiest link and respects the minimum', () => {
    const layout = layoutSankey(FIXTURE, OPTS)
    const root = layout.nodes.find((n) => n.id === '0:/')!
    const pricing = layout.nodes.find((n) => n.id === '1:/pricing')!
    // root moves 15 sessions vs max link 10 → taller than the busiest link's 50px
    expect(root.height).toBeGreaterThan(pricing.height)
    for (const n of layout.nodes) expect(n.height).toBeGreaterThanOrEqual(3)
  })

  it('stacks a strip\'s outgoing links without overlap, biggest first', () => {
    const layout = layoutSankey(FIXTURE, OPTS)
    const out = layout.links
      .filter((l) => l.source === '0:/')
      .sort((a, b) => a.sourceY - b.sourceY)
    expect(out).toHaveLength(2)
    // biggest (value 10) sits on top; fans don't overlap
    expect(out[0].value).toBe(10)
    expect(out[0].sourceY + out[0].strokeWidth / 2).toBeLessThanOrEqual(
      out[1].sourceY - out[1].strokeWidth / 2 + 0.001,
    )
  })

  it('anchors link x coordinates to the strip edges', () => {
    const layout = layoutSankey(FIXTURE, OPTS)
    const hop = layout.links.find((l) => l.key === '1:/login|2:/app')!
    const login = layout.nodes.find((n) => n.id === '1:/login')!
    const app = layout.nodes.find((n) => n.id === '2:/app')!
    expect(hop.sourceX).toBe(login.x + NODE_WIDTH)
    expect(hop.targetX).toBe(app.x)
  })

  it('reduces to the lens chain and drops sibling branches', () => {
    const layout = layoutSankey(FIXTURE, { ...OPTS, lens: '/login' })
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(['0:/', '1:/login', '2:/app'].sort())
    expect(layout.links.some((l) => l.target === '1:/pricing')).toBe(false)
  })

  it('returns an empty layout when the lens path has no flows', () => {
    const layout = layoutSankey(FIXTURE, { ...OPTS, lens: '/ghost' })
    expect(layout.nodes).toHaveLength(0)
  })

  it('computes per-step sessions and drop-off from the columns\' totals', () => {
    const layout = layoutSankey(FIXTURE, OPTS)
    expect(layout.steps.map((s) => s.sessions)).toEqual([15, 15, 8])
    expect(layout.steps[1].dropOffPercent).toBe(0)
    expect(layout.steps[2].dropOffPercent).toBe(Math.round(((8 - 15) / 15) * 100))
    expect(layout.undrawnOtherHops).toBe(0)
  })

  describe('with (other)→(other) hops the chart does not draw', () => {
    // * Column 1 holds 3 pages under the server's cut (12 sessions), column 2 holds
    // * 2 (9 sessions); 4 sessions went from one of those to another.
    const flow: JourneyFlow = {
      depth: 3,
      total_sessions: 30,
      columns: [
        col([['/', 30]]),
        col([['/a', 18]], 12, 3),
        col([['/b', 15]], 9, 2),
      ],
      links: [
        [0, 0, 0, 18],
        [0, 0, -1, 12],
        [1, 0, 0, 13],
        [1, -1, -1, 4],
        [1, 0, -1, 5],
        [1, -1, 0, 2],
      ],
    }

    it('headers show the exact column totals, not the drawn links\' sum', () => {
      const layout = layoutSankey(flow, OPTS)
      expect(layout.steps.map((s) => s.sessions)).toEqual([30, 30, 24])
      const drawnIntoStep2 = layout.links
        .filter((l) => l.target.startsWith('2:'))
        .reduce((s, l) => s + l.value, 0)
      expect(drawnIntoStep2).toBe(24 - 4)
      expect(layout.steps[2].dropOffPercent).toBe(Math.round(((24 - 30) / 30) * 100))
    })

    it('reports the undrawn sessions, and keeps them under the lens', () => {
      expect(layoutSankey(flow, OPTS).undrawnOtherHops).toBe(4)
      const lensed = layoutSankey(flow, { ...OPTS, lens: '/b' })
      expect(lensed.nodes.length).toBeGreaterThan(0)
      expect(lensed.undrawnOtherHops).toBe(4)
      // * a column's total does not change with what the lens highlights
      expect(lensed.steps.map((s) => s.sessions)).toEqual([30, 30, 24])
    })
  })

  it('never returns a height below the minimum canvas height', () => {
    const layout = layoutSankey(FIXTURE, OPTS)
    expect(layout.height).toBeGreaterThanOrEqual(200)
  })
})

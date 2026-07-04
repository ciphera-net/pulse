import { describe, it, expect } from 'vitest'
import { layoutSankey, NODE_WIDTH } from '../sankeyLayout'
import type { PathTransition } from '@/lib/api/journeys'

const t = (step_index: number, from_path: string, to_path: string, session_count: number): PathTransition => ({
  step_index,
  from_path,
  to_path,
  session_count,
})

// / → login (10) + / → pricing (5); login → app (8)
const FIXTURE: PathTransition[] = [
  t(0, '/', '/login', 10),
  t(0, '/', '/pricing', 5),
  t(1, '/login', '/app', 8),
]

const OPTS = { depth: 4, maxPagesPerStep: 20, width: 900 }

describe('layoutSankey', () => {
  it('returns an empty layout for no transitions or zero width', () => {
    expect(layoutSankey([], OPTS).nodes).toHaveLength(0)
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

  it('computes per-step visitors (departures at entry, arrivals after) and drop-off', () => {
    const layout = layoutSankey(FIXTURE, OPTS)
    expect(layout.steps.map((s) => s.visitors)).toEqual([15, 15, 8])
    expect(layout.steps[1].dropOffPercent).toBe(0)
    expect(layout.steps[2].dropOffPercent).toBe(Math.round(((8 - 15) / 15) * 100))
  })

  it('never returns a height below the minimum canvas height', () => {
    const layout = layoutSankey(FIXTURE, OPTS)
    expect(layout.height).toBeGreaterThanOrEqual(200)
  })
})

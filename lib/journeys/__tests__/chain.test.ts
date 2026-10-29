import { describe, it, expect } from 'vitest'
import { aggregateJourney } from '../aggregate'
import {
  buildLinks,
  buildAdjacency,
  chainThrough,
  chainThroughLink,
  chainThroughNode,
  nodeId,
  linkKey,
  pathOfNode,
  spineThrough,
  stepOfNode,
} from '../chain'
import type { JourneyFlow, JourneyFlowColumn, JourneyFlowLink, JourneyFlowPage } from '@/lib/api/journeys'

const col = (top: JourneyFlowPage[], otherSessions = 0, otherPages = 0): JourneyFlowColumn => ({
  total_sessions: top.reduce((s, [, n]) => s + n, 0) + otherSessions,
  pages: top.length + otherPages,
  top,
  other_sessions: otherSessions,
  other_pages: otherPages,
})
const flowOf = (columns: JourneyFlowColumn[], links: JourneyFlowLink[]): JourneyFlow => ({
  depth: columns.length,
  total_sessions: columns[0]?.total_sessions ?? 0,
  columns,
  links,
})
const linksAt = (flow: JourneyFlow, P: number) =>
  buildLinks(flow, aggregateJourney(flow, { maxPagesPerStep: P }))

describe('node/link id helpers', () => {
  it('round-trips step and path through the id', () => {
    const id = nodeId(2, '/docs/getting-started')
    expect(stepOfNode(id)).toBe(2)
    expect(pathOfNode(id)).toBe('/docs/getting-started')
  })

  it('keeps paths containing colons intact', () => {
    expect(pathOfNode(nodeId(0, '/a:b:c'))).toBe('/a:b:c')
  })
})

describe('buildLinks', () => {
  // * Column 0: / (12), /x (3), and 2 more pages under the server's cut (4 sessions).
  // * Column 1: /a (10), /b (4), /c (2), and 1 page under the cut (3 sessions).
  const FLOW = flowOf(
    [col([['/', 12], ['/x', 3]], 4, 2), col([['/a', 10], ['/b', 4], ['/c', 2]], 3, 1)],
    [
      [0, 0, 0, 9],
      [0, -1, 1, 3],
      [0, 0, 1, 1],
      [0, 0, 2, 1],
      [0, 1, 0, 1],
      [0, 1, -1, 1],
      [0, -1, -1, 1],
      [0, 0, -1, 1],
      [0, 1, 2, 1],
    ],
  )

  it('maps indexes onto the named pages and sums links that land on the same rows', () => {
    const { links } = linksAt(FLOW, 20)
    expect(links).toContainEqual({ source: '0:/', target: '1:/a', value: 9 })
    // * −1 on the from side alone is drawn, from (other)
    expect(links).toContainEqual({ source: '0:(other)', target: '1:/b', value: 3 })
    // * −1 on the to side alone is drawn, into (other)
    expect(links).toContainEqual({ source: '0:/x', target: '1:(other)', value: 1 })
    expect(links).toContainEqual({ source: '0:/', target: '1:(other)', value: 1 })
  })

  it('drops (other)→(other) and counts its sessions as undrawn', () => {
    const { links, undrawnOtherHops } = linksAt(FLOW, 20)
    expect(links.some((l) => pathOfNode(l.source) === '(other)' && pathOfNode(l.target) === '(other)')).toBe(false)
    expect(undrawnOtherHops).toBe(1)
  })

  it('folds an index at or beyond Paths into (other), and counts what then lands (other)→(other)', () => {
    // * Paths 1: column 0 names only /, column 1 only /a.
    const { links, undrawnOtherHops } = linksAt(FLOW, 1)
    expect(links).toContainEqual({ source: '0:/', target: '1:/a', value: 9 })
    // * / → /b (1), / → /c (1), / → (other) (1)
    expect(links).toContainEqual({ source: '0:/', target: '1:(other)', value: 3 })
    // * /x → /a (1)
    expect(links).toContainEqual({ source: '0:(other)', target: '1:/a', value: 1 })
    // * (other)→/b 3, /x→(other) 1, (other)→(other) 1, /x→/c 1
    expect(undrawnOtherHops).toBe(3 + 1 + 1 + 1)
    // * every drawn and undrawn session of the hop is accounted for
    const drawn = links.reduce((s, l) => s + l.value, 0)
    expect(drawn + undrawnOtherHops).toBe(FLOW.columns[1].total_sessions)
  })

  it('ignores hops into a trimmed (empty) column', () => {
    // * A link into the trimmed column cannot carry sessions (the column's total
    // * is that hop's sum); one that claims to is still never drawn or counted.
    const flow = flowOf([col([['/', 2]]), col([['/a', 2]]), col([])], [[0, 0, 0, 2], [1, 0, -1, 1]])
    const { links, undrawnOtherHops } = linksAt(flow, 20)
    expect(links).toEqual([{ source: '0:/', target: '1:/a', value: 2 }])
    expect(undrawnOtherHops).toBe(0)
  })

  it('keeps paths containing | and : intact', () => {
    const flow = flowOf([col([['/a|b', 2]]), col([['/c:d', 2]])], [[0, 0, 0, 2]])
    expect(linksAt(flow, 20).links).toEqual([{ source: '0:/a|b', target: '1:/c:d', value: 2 }])
  })
})

describe('buildAdjacency', () => {
  it('indexes forward and backward neighbours', () => {
    const links = [
      { source: '0:/', target: '1:/a', value: 1 },
      { source: '0:/', target: '1:/b', value: 1 },
    ]
    const { fwd, bwd } = buildAdjacency(links)
    expect(fwd.get('0:/')).toEqual(new Set(['1:/a', '1:/b']))
    expect(bwd.get('1:/a')).toEqual(new Set(['0:/']))
  })
})

describe('chainThrough', () => {
  const links = [
    { source: '0:/', target: '1:/login', value: 5 },
    { source: '0:/', target: '1:/pricing', value: 2 },
    { source: '1:/login', target: '2:/app', value: 4 },
    { source: '1:/pricing', target: '2:/checkout', value: 1 },
  ]

  it('keeps the full chain through the lens path, forward and backward', () => {
    const chain = chainThrough(links, '/login')
    expect(chain.nodeIds).toEqual(new Set(['0:/', '1:/login', '2:/app']))
    expect(chain.linkKeys).toEqual(
      new Set([linkKey('0:/', '1:/login'), linkKey('1:/login', '2:/app')]),
    )
  })

  it('excludes sibling branches that bypass the lens', () => {
    const chain = chainThrough(links, '/login')
    expect(chain.nodeIds.has('1:/pricing')).toBe(false)
    expect(chain.linkKeys.has(linkKey('1:/pricing', '2:/checkout'))).toBe(false)
  })

  it('seeds from every occurrence of the path across steps', () => {
    const loop = [
      { source: '0:/a', target: '1:/b', value: 1 },
      { source: '1:/b', target: '2:/a', value: 1 },
      { source: '2:/a', target: '3:/c', value: 1 },
    ]
    const chain = chainThrough(loop, '/a')
    expect(chain.nodeIds).toEqual(new Set(['0:/a', '1:/b', '2:/a', '3:/c']))
  })

  it('returns empty sets for a path that appears nowhere', () => {
    const chain = chainThrough(links, '/nope')
    expect(chain.nodeIds.size).toBe(0)
    expect(chain.linkKeys.size).toBe(0)
  })
})

describe('chainThroughNode', () => {
  // Two occurrences of /relay: at step 1 and step 3. They have DIFFERENT flows.
  const links = [
    { source: '0:/', target: '1:/relay', value: 5 },      // → /relay @1
    { source: '1:/relay', target: '2:/app', value: 4 },   // /relay @1 →
    { source: '2:/app', target: '3:/relay', value: 3 },   // → /relay @3
    { source: '3:/relay', target: '4:/done', value: 2 },  // /relay @3 →
    { source: '0:/x', target: '1:/other', value: 9 },     // unrelated branch
  ]

  it('highlights only the flow through the specific node, not sibling occurrences', () => {
    const chain = chainThroughNode(links, '1:/relay')
    // Only /relay @1's own chain — @1 connects to / (back) and /app→/relay@3→/done (fwd)
    expect(chain.nodeIds.has('1:/relay')).toBe(true)
    expect(chain.nodeIds.has('0:/')).toBe(true)
    // the unrelated branch is never touched
    expect(chain.nodeIds.has('1:/other')).toBe(false)
    expect(chain.linkKeys.has(linkKey('0:/x', '1:/other'))).toBe(false)
  })

  it('a different occurrence of the same path yields a different (upstream-limited) chain', () => {
    const atStep3 = chainThroughNode(links, '3:/relay')
    // /relay @3 reaches back through /app → /relay@1 → / and forward to /done
    expect(atStep3.nodeIds.has('3:/relay')).toBe(true)
    expect(atStep3.nodeIds.has('4:/done')).toBe(true)
    // but it does NOT seed from /relay @1 as an origin — the forward-only /done
    // proves node-specific seeding (a step-1 seed would also pull /other-free branches)
    expect(atStep3.nodeIds.has('1:/other')).toBe(false)
  })

  it('returns just the node when it participates in no links', () => {
    const chain = chainThroughNode(links, '9:/isolated')
    expect(chain.nodeIds).toEqual(new Set(['9:/isolated']))
    expect(chain.linkKeys.size).toBe(0)
  })
})

describe('chainThroughLink', () => {
  const links = [
    { source: '0:/', target: '1:/login', value: 5 },
    { source: '0:/', target: '1:/pricing', value: 2 },
    { source: '1:/login', target: '2:/app', value: 4 },
    { source: '1:/pricing', target: '2:/checkout', value: 1 },
  ]

  it('keeps the hop plus its upstream and downstream walk', () => {
    const chain = chainThroughLink(links, '0:/', '1:/login')
    expect(chain.linkKeys).toEqual(
      new Set([linkKey('0:/', '1:/login'), linkKey('1:/login', '2:/app')]),
    )
    expect(chain.nodeIds).toEqual(new Set(['0:/', '1:/login', '2:/app']))
  })

  it('does not leak into sibling fans of the shared source', () => {
    const chain = chainThroughLink(links, '1:/login', '2:/app')
    expect(chain.linkKeys.has(linkKey('0:/', '1:/pricing'))).toBe(false)
    expect(chain.nodeIds.has('2:/checkout')).toBe(false)
  })
})

describe('spineThrough', () => {
  it('follows the heaviest hop in both directions', () => {
    const links = [
      { source: '0:/', target: '1:/login', value: 8 },
      { source: '0:/', target: '1:/pricing', value: 2 },
      { source: '1:/login', target: '2:/app', value: 6 },
      { source: '1:/login', target: '2:/docs', value: 1 },
    ]
    expect(spineThrough(links, '/login')).toEqual(['/', '/login', '/app'])
  })

  it('stops at (other) buckets instead of including them', () => {
    const links = [
      { source: '0:/', target: '1:/login', value: 5 },
      { source: '1:/login', target: '2:(other)', value: 9 },
    ]
    expect(spineThrough(links, '/login')).toEqual(['/', '/login'])
  })

  it('caps the spine at maxSteps while keeping the lens inside', () => {
    const links = Array.from({ length: 9 }, (_, i) => ({
      source: `${i}:/p${i}`,
      target: `${i + 1}:/p${i + 1}`,
      value: 10 - i,
    }))
    const spine = spineThrough(links, '/p4', 6)
    expect(spine).toHaveLength(6)
    expect(spine).toContain('/p4')
  })

  it('returns empty for a path with no flows', () => {
    expect(spineThrough([], '/ghost')).toEqual([])
  })
})


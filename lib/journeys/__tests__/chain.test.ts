import { describe, it, expect } from 'vitest'
import { aggregateJourney } from '../aggregate'
import {
  buildLinks,
  buildAdjacency,
  chainThrough,
  chainThroughLink,
  chainThroughNode,
  exitCount,
  nodeId,
  linkKey,
  pathOfNode,
  spineThrough,
  stepOfNode,
} from '../chain'
import type { PathTransition } from '@/lib/api/journeys'

const t = (step_index: number, from_path: string, to_path: string, session_count: number): PathTransition => ({
  step_index,
  from_path,
  to_path,
  session_count,
})

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
  it('aggregates duplicate hops into one link', () => {
    const transitions = [t(0, '/', '/login', 3), t(0, '/', '/login', 2)]
    const columns = aggregateJourney(transitions, { depth: 4, maxPagesPerStep: 20 })
    const links = buildLinks(transitions, columns)
    expect(links).toEqual([{ source: '0:/', target: '1:/login', value: 5 }])
  })

  it('rolls hidden paths into the (other) bucket', () => {
    // maxPagesPerStep 1 → step 1 keeps only /a; /b and /c roll into (other)
    const transitions = [
      t(0, '/', '/a', 10),
      t(0, '/', '/b', 2),
      t(0, '/', '/c', 1),
    ]
    const columns = aggregateJourney(transitions, { depth: 4, maxPagesPerStep: 1 })
    const links = buildLinks(transitions, columns)
    expect(links).toContainEqual({ source: '0:/', target: '1:/a', value: 10 })
    expect(links).toContainEqual({ source: '0:/', target: '1:(other)', value: 3 })
  })

  it('drops (other) to (other) hops and out-of-depth transitions', () => {
    const transitions = [
      t(0, '/', '/a', 10),
      t(0, '/x', '/y', 1), // both roll up at depth cap 1 per step
      t(5, '/deep', '/deeper', 9), // beyond aggregated depth
    ]
    const columns = aggregateJourney(transitions, { depth: 2, maxPagesPerStep: 1 })
    const links = buildLinks(transitions, columns)
    expect(links.some((l) => pathOfNode(l.source) === '(other)' && pathOfNode(l.target) === '(other)')).toBe(false)
    expect(links.some((l) => stepOfNode(l.source) >= 2)).toBe(false)
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

describe('exitCount', () => {
  it('is the sessions on the row minus its onward hops', () => {
    const transitions = [
      t(0, '/', '/login', 10),
      t(1, '/login', '/app', 6),
    ]
    const columns = aggregateJourney(transitions, { depth: 4, maxPagesPerStep: 20 })
    // 10 landed on /login at step 1, 6 moved on → 4 exited
    expect(exitCount(transitions, 1, '/login', columns)).toBe(4)
  })

  it('floors at zero and returns 0 for unknown rows', () => {
    const transitions = [t(0, '/', '/login', 3), t(1, '/login', '/app', 5)]
    const columns = aggregateJourney(transitions, { depth: 4, maxPagesPerStep: 20 })
    expect(exitCount(transitions, 1, '/login', columns)).toBe(0)
    expect(exitCount(transitions, 1, '/ghost', columns)).toBe(0)
  })
})

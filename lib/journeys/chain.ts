import type { JourneyFlow } from '@/lib/api/journeys'
import { OTHER_PATH, type AggregatedStep } from './aggregate'

// ---------------------------------------------------------------------------
// Chain/lens helpers shared by both journey views. Nodes are addressed as
// `step:path` ids; links aggregate gutter transitions onto the rows that
// survived the per-step (other) rollup. chainThrough ports SankeyJourney's
// BFS filter (forward + backward from every occurrence of a path) so the
// columns ribbons, the flow subgraph and the lens all agree on what "the
// chain through /login" means.
// ---------------------------------------------------------------------------

export interface ChainLink {
  /** `step:path` of the source row. */
  source: string
  /** `step:path` of the target row. */
  target: string
  /** Sessions that made this hop. */
  value: number
}

export interface Chain {
  nodeIds: Set<string>
  linkKeys: Set<string>
}

export const nodeId = (step: number, path: string) => `${step}:${path}`
export const linkKey = (source: string, target: string) => `${source}|${target}`
export const pathOfNode = (id: string) => id.slice(id.indexOf(':') + 1)
export const stepOfNode = (id: string) => parseInt(id, 10)

export interface FlowLinks {
  /** The links between the rows each column shows. */
  links: ChainLink[]
  /**
   * Sessions on hops from (other) to (other) at this Paths value: counted by
   * the server, not drawn. The footer states them, so the strips under a step
   * header can sum to less than the header by exactly this many.
   */
  undrawnOtherHops: number
}

/**
 * Gutter links between the rows each step actually shows, from the server's
 * index-encoded links. An index below the column's named-page count is that
 * page (the named pages are `top`'s first entries, in order); anything else,
 * −1 included, is the column's (other). Links that land on the same pair of
 * rows are summed. (other)→(other) hops are dropped as noise, and their
 * sessions are counted in `undrawnOtherHops`. Hops outside the columns
 * (trailing empty columns were trimmed) are ignored.
 */
export function buildLinks(flow: JourneyFlow, columns: AggregatedStep[]): FlowLinks {
  const namedByStep = new Map<number, string[]>()
  for (const step of columns) {
    namedByStep.set(
      step.index,
      step.pages.filter((p) => !p.isOther).map((p) => p.path),
    )
  }

  const linkMap = new Map<string, ChainLink>()
  let undrawnOtherHops = 0
  for (const [hop, from, to, sessions] of flow.links) {
    const fromNamed = namedByStep.get(hop)
    const toNamed = namedByStep.get(hop + 1)
    if (!fromNamed || !toNamed) continue
    const fp = from >= 0 && from < fromNamed.length ? fromNamed[from] : OTHER_PATH
    const tp = to >= 0 && to < toNamed.length ? toNamed[to] : OTHER_PATH
    if (fp === OTHER_PATH && tp === OTHER_PATH) {
      undrawnOtherHops += sessions
      continue
    }
    const source = nodeId(hop, fp)
    const target = nodeId(hop + 1, tp)
    const key = linkKey(source, target)
    const link = linkMap.get(key)
    if (link) link.value += sessions
    else linkMap.set(key, { source, target, value: sessions })
  }

  return { links: Array.from(linkMap.values()), undrawnOtherHops }
}

/** Forward and backward adjacency over `step:path` node ids. */
export function buildAdjacency(links: ChainLink[]): {
  fwd: Map<string, Set<string>>
  bwd: Map<string, Set<string>>
} {
  const fwd = new Map<string, Set<string>>()
  const bwd = new Map<string, Set<string>>()
  for (const l of links) {
    if (!fwd.has(l.source)) fwd.set(l.source, new Set())
    fwd.get(l.source)!.add(l.target)
    if (!bwd.has(l.target)) bwd.set(l.target, new Set())
    bwd.get(l.target)!.add(l.source)
  }
  return { fwd, bwd }
}

function bfs(seeds: Iterable<string>, adj: Map<string, Set<string>>, into: Set<string>) {
  let queue = [...seeds]
  while (queue.length > 0) {
    const next: string[] = []
    for (const id of queue) {
      for (const nb of adj.get(id) ?? []) {
        if (!into.has(nb)) {
          into.add(nb)
          next.push(nb)
        }
      }
    }
    queue = next
  }
}

/**
 * The connected chain reachable from a set of seed nodes: BFS forward and
 * backward, keeping links whose both endpoints are reachable. Shared by the
 * path-based lens (all occurrences) and the node-specific hover.
 */
function chainFromSeeds(links: ChainLink[], seeds: Set<string>): Chain {
  if (seeds.size === 0) return { nodeIds: new Set(), linkKeys: new Set() }

  const { fwd, bwd } = buildAdjacency(links)
  const reachable = new Set(seeds)
  bfs(seeds, fwd, reachable)
  bfs(seeds, bwd, reachable)

  const linkKeys = new Set<string>()
  const nodeIds = new Set<string>(seeds)
  for (const l of links) {
    if (reachable.has(l.source) && reachable.has(l.target)) {
      linkKeys.add(linkKey(l.source, l.target))
      nodeIds.add(l.source)
      nodeIds.add(l.target)
    }
  }
  return { nodeIds, linkKeys }
}

/**
 * The connected chain through **every** occurrence of `path` (all steps) — the
 * pinned lens's "trace this page across the whole journey" view (design §4.2).
 * Empty sets when the path appears nowhere.
 */
export function chainThrough(links: ChainLink[], path: string): Chain {
  const seeds = new Set<string>()
  for (const l of links) {
    if (pathOfNode(l.source) === path) seeds.add(l.source)
    if (pathOfNode(l.target) === path) seeds.add(l.target)
  }
  return chainFromSeeds(links, seeds)
}

/**
 * The connected chain through a **single** `step:path` node — the flow that
 * actually passes through that specific row (hover semantics). Unlike
 * chainThrough, sibling occurrences of the same path at other steps are NOT
 * seeded, so hovering /relay at step 2 highlights only its own flow.
 */
export function chainThroughNode(links: ChainLink[], node: string): Chain {
  return chainFromSeeds(links, new Set([node]))
}

/**
 * The chain through one specific hop: the hop itself plus everything
 * link-walk-reachable downstream of its target and upstream of its source
 * (the flow view's link-hover highlight, ported from findConnected).
 */
export function chainThroughLink(links: ChainLink[], source: string, target: string): Chain {
  const outBy = new Map<string, ChainLink[]>()
  const inBy = new Map<string, ChainLink[]>()
  for (const l of links) {
    if (!outBy.has(l.source)) outBy.set(l.source, [])
    outBy.get(l.source)!.push(l)
    if (!inBy.has(l.target)) inBy.set(l.target, [])
    inBy.get(l.target)!.push(l)
  }

  const linkKeys = new Set<string>([linkKey(source, target)])
  const walk = (start: string, by: Map<string, ChainLink[]>, next: (l: ChainLink) => string) => {
    const seen = new Set<string>([start])
    let queue = [start]
    while (queue.length > 0) {
      const batch: string[] = []
      for (const id of queue) {
        for (const l of by.get(id) ?? []) {
          linkKeys.add(linkKey(l.source, l.target))
          const n = next(l)
          if (!seen.has(n)) {
            seen.add(n)
            batch.push(n)
          }
        }
      }
      queue = batch
    }
  }
  walk(target, outBy, (l) => l.target)
  walk(source, inBy, (l) => l.source)

  const nodeIds = new Set<string>([source, target])
  for (const l of links) {
    if (linkKeys.has(linkKey(l.source, l.target))) {
      nodeIds.add(l.source)
      nodeIds.add(l.target)
    }
  }
  return { nodeIds, linkKeys }
}

/**
 * The heaviest single path through every hop around `path` — the funnel
 * spine for "Create funnel from this path". Seeds at the occurrence with the
 * most throughput, then greedily follows the biggest link in each direction.
 * Stops at (other) buckets and caps at `maxSteps` values.
 */
export function spineThrough(links: ChainLink[], path: string, maxSteps = 6): string[] {
  const { fwd, bwd } = buildAdjacency(links)
  const valueByKey = new Map(links.map((l) => [linkKey(l.source, l.target), l.value]))

  const seeds: string[] = []
  for (const l of links) {
    if (pathOfNode(l.source) === path && !seeds.includes(l.source)) seeds.push(l.source)
    if (pathOfNode(l.target) === path && !seeds.includes(l.target)) seeds.push(l.target)
  }
  if (seeds.length === 0) return []

  const throughput = (id: string) => {
    let sum = 0
    for (const nb of fwd.get(id) ?? []) sum += valueByKey.get(linkKey(id, nb)) ?? 0
    for (const nb of bwd.get(id) ?? []) sum += valueByKey.get(linkKey(nb, id)) ?? 0
    return sum
  }
  seeds.sort((a, b) => throughput(b) - throughput(a) || stepOfNode(a) - stepOfNode(b))
  const seed = seeds[0]

  const heaviest = (id: string, dir: 'fwd' | 'bwd'): string | null => {
    const neighbours = (dir === 'fwd' ? fwd : bwd).get(id)
    if (!neighbours) return null
    let best: string | null = null
    let bestValue = -1
    for (const nb of neighbours) {
      if (pathOfNode(nb) === OTHER_PATH) continue
      const v = valueByKey.get(dir === 'fwd' ? linkKey(id, nb) : linkKey(nb, id)) ?? 0
      if (v > bestValue) {
        best = nb
        bestValue = v
      }
    }
    return best
  }

  const forward: string[] = []
  let cursor: string | null = seed
  while (forward.length < maxSteps && (cursor = heaviest(cursor, 'fwd'))) {
    forward.push(pathOfNode(cursor))
  }
  const backward: string[] = []
  cursor = seed
  while (backward.length < maxSteps && (cursor = heaviest(cursor, 'bwd'))) {
    backward.unshift(pathOfNode(cursor))
  }

  const spine = [...backward, path, ...forward]
  // * Trim to maxSteps keeping the lens inside the window
  if (spine.length > maxSteps) {
    const lensIdx = backward.length
    const start = Math.max(0, Math.min(lensIdx, spine.length - maxSteps))
    return spine.slice(start, start + maxSteps)
  }
  return spine
}


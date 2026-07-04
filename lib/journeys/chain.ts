import type { PathTransition } from '@/lib/api/journeys'
import type { AggregatedStep } from './aggregate'

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

/**
 * Gutter links between the rows each step actually shows. Paths rolled into
 * a step's (other) bucket fall back to that bucket; (other)→(other) hops are
 * dropped as noise. Transitions outside the aggregated depth are ignored.
 */
export function buildLinks(
  transitions: PathTransition[],
  columns: AggregatedStep[],
): ChainLink[] {
  const pathsByStep = new Map<number, Set<string>>()
  for (const step of columns) {
    pathsByStep.set(step.index, new Set(step.pages.map((p) => p.path)))
  }

  const linkMap = new Map<string, number>()
  for (const t of transitions) {
    const fromPaths = pathsByStep.get(t.step_index)
    const toPaths = pathsByStep.get(t.step_index + 1)
    if (!fromPaths || !toPaths) continue
    const fp = fromPaths.has(t.from_path) ? t.from_path : '(other)'
    const tp = toPaths.has(t.to_path) ? t.to_path : '(other)'
    if (fp === '(other)' && tp === '(other)') continue
    const key = linkKey(nodeId(t.step_index, fp), nodeId(t.step_index + 1, tp))
    linkMap.set(key, (linkMap.get(key) ?? 0) + t.session_count)
  }

  return Array.from(linkMap.entries()).map(([key, value]) => {
    const [source, target] = key.split('|')
    return { source, target, value }
  })
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
      if (pathOfNode(nb) === '(other)') continue
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

/**
 * Sessions that were on `path` at `colIdx` and made no onward hop — the
 * exit count shown on the column after the lens column.
 */
export function exitCount(
  transitions: PathTransition[],
  colIdx: number,
  path: string,
  columns: AggregatedStep[],
): number {
  const col = columns[colIdx]
  const page = col?.pages.find((p) => p.path === path)
  if (!page) return 0
  const outbound = transitions
    .filter((t) => t.step_index === colIdx && t.from_path === path)
    .reduce((sum, t) => sum + t.session_count, 0)
  return Math.max(0, page.sessionCount - outbound)
}

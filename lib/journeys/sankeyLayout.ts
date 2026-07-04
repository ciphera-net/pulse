import type { PathTransition } from '@/lib/api/journeys'
import { aggregateJourney } from './aggregate'
import {
  buildLinks,
  chainThrough,
  linkKey,
  nodeId,
  stepOfNode,
  type ChainLink,
} from './chain'

// ---------------------------------------------------------------------------
// Pure Sankey layout for the journeys flow view. Ports SankeyJourney's
// imperative buildData + d3 positioning into testable math: thin node strips
// scaled to a shared link scale, columns justified edge-to-edge across the
// given width, link endpoints stacked within each strip, and the ?lens=
// subgraph filter (BFS both directions via chain.ts). The component only
// renders what this returns.
// ---------------------------------------------------------------------------

export const NODE_WIDTH = 14
const NODE_GAP = 20
const MIN_NODE_HEIGHT = 3
const MAX_LINK_HEIGHT = 50
const MIN_LINK_WIDTH = 1
const TOP_PAD = 8
const BOTTOM_PAD = 20
const MIN_HEIGHT = 200

export interface SankeyNode {
  id: string
  path: string
  step: number
  /** Left edge of the strip. */
  x: number
  /** Top edge of the strip. */
  y: number
  height: number
  /** Sessions represented by this strip. */
  count: number
}

export interface SankeyLink {
  key: string
  source: string
  target: string
  value: number
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  strokeWidth: number
}

export interface SankeyStepMeta {
  index: number
  /** Left edge of the step's column. */
  x: number
  visitors: number
  dropOffPercent: number
}

export interface SankeyLayoutResult {
  nodes: SankeyNode[]
  links: SankeyLink[]
  steps: SankeyStepMeta[]
  width: number
  height: number
}

export interface SankeyLayoutOptions {
  depth: number
  maxPagesPerStep: number
  width: number
  lens?: string | null
}

const EMPTY = (width: number): SankeyLayoutResult => ({
  nodes: [],
  links: [],
  steps: [],
  width,
  height: MIN_HEIGHT,
})

export function layoutSankey(
  transitions: PathTransition[],
  opts: SankeyLayoutOptions,
): SankeyLayoutResult {
  const { depth, maxPagesPerStep, width, lens } = opts
  if (transitions.length === 0 || width <= 0) return EMPTY(width)

  const columns = aggregateJourney(transitions, { depth, maxPagesPerStep })
  if (columns.length === 0) return EMPTY(width)

  const allLinks = buildLinks(transitions, columns)

  // * Node order: aggregated pages first (count-desc per step, (other) last),
  // * then any link endpoints aggregation didn't produce.
  const orderedIds: string[] = []
  const seen = new Set<string>()
  const push = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id)
      orderedIds.push(id)
    }
  }
  for (const col of columns) {
    for (const page of col.pages) push(nodeId(col.index, page.path))
  }
  for (const l of allLinks) {
    push(l.source)
    push(l.target)
  }

  // * Lens: reduce to the BFS chain subgraph. Nodes survive only as endpoints
  // * of surviving links (original filter semantics) — an isolated match
  // * yields an empty layout and the caller falls back to the full graph.
  let links = allLinks
  let ids = orderedIds
  if (lens) {
    const chain = chainThrough(allLinks, lens)
    links = allLinks.filter((l) => chain.linkKeys.has(linkKey(l.source, l.target)))
    const kept = new Set<string>()
    for (const l of links) {
      kept.add(l.source)
      kept.add(l.target)
    }
    ids = orderedIds.filter((id) => kept.has(id))
    if (ids.length === 0) return EMPTY(width)
  }

  const inBy = new Map<string, ChainLink[]>()
  const outBy = new Map<string, ChainLink[]>()
  for (const l of links) {
    if (!outBy.has(l.source)) outBy.set(l.source, [])
    outBy.get(l.source)!.push(l)
    if (!inBy.has(l.target)) inBy.set(l.target, [])
    inBy.get(l.target)!.push(l)
  }
  const sum = (ls: ChainLink[] | undefined) => (ls ?? []).reduce((s, l) => s + l.value, 0)

  // * Shared scale: the busiest link maps to MAX_LINK_HEIGHT so strips stay
  // * thin rather than growing into bars.
  const maxValue = Math.max(...links.map((l) => l.value), 1)
  const scale = (v: number) => (v / maxValue) * MAX_LINK_HEIGHT

  const stepIndices = Array.from(new Set(ids.map((id) => stepOfNode(id)))).sort((a, b) => a - b)
  const numSteps = stepIndices.length
  const xForOrdinal = (ordinal: number) =>
    numSteps <= 1 ? 0 : ordinal * ((width - NODE_WIDTH) / (numSteps - 1))
  const stepX = new Map<number, number>()
  stepIndices.forEach((step, ordinal) => stepX.set(step, xForOrdinal(ordinal)))

  const nodes: SankeyNode[] = ids.map((id) => {
    const step = stepOfNode(id)
    const inVal = sum(inBy.get(id))
    const outVal = sum(outBy.get(id))
    return {
      id,
      path: id.slice(id.indexOf(':') + 1),
      step,
      x: stepX.get(step) ?? 0,
      y: 0,
      height: Math.max(scale(Math.max(inVal, outVal)), MIN_NODE_HEIGHT),
      count: step === 0 ? outVal : Math.max(inVal, outVal),
    }
  })

  // * Stack strips per column from the top, in node order.
  let tallest = 0
  for (const step of stepIndices) {
    let cy = TOP_PAD
    for (const n of nodes) {
      if (n.step !== step) continue
      n.y = cy
      cy += n.height + NODE_GAP
    }
    tallest = Math.max(tallest, cy - NODE_GAP)
  }
  const height = Math.max(MIN_HEIGHT, tallest + BOTTOM_PAD)

  // * Link endpoints stack within their strips, biggest first — each strip
  // * orders its own outgoing and incoming fans independently.
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const byValueDesc = (a: ChainLink, b: ChainLink) => b.value - a.value

  const sourceYByKey = new Map<string, number>()
  const targetYByKey = new Map<string, number>()
  for (const n of nodes) {
    let outY = n.y
    for (const l of (outBy.get(n.id) ?? []).slice().sort(byValueDesc)) {
      const lh = scale(l.value)
      sourceYByKey.set(linkKey(l.source, l.target), outY + lh / 2)
      outY += lh
    }
    let inY = n.y
    for (const l of (inBy.get(n.id) ?? []).slice().sort(byValueDesc)) {
      const lh = scale(l.value)
      targetYByKey.set(linkKey(l.source, l.target), inY + lh / 2)
      inY += lh
    }
  }

  const laidOut: SankeyLink[] = []
  for (const l of links) {
    const src = nodeById.get(l.source)
    const tgt = nodeById.get(l.target)
    if (!src || !tgt) continue
    const key = linkKey(l.source, l.target)
    laidOut.push({
      key,
      source: l.source,
      target: l.target,
      value: l.value,
      sourceX: src.x + NODE_WIDTH,
      sourceY: sourceYByKey.get(key) ?? src.y + src.height / 2,
      targetX: tgt.x,
      targetY: targetYByKey.get(key) ?? tgt.y + tgt.height / 2,
      strokeWidth: Math.max(MIN_LINK_WIDTH, scale(l.value)),
    })
  }

  // * Per-step visitors (entry column counts departures, later columns count
  // * arrivals) and drop-off vs the previous column.
  const steps: SankeyStepMeta[] = stepIndices.map((step) => {
    const visitors = nodes
      .filter((n) => n.step === step)
      .reduce((s, n) => s + (step === 0 ? sum(outBy.get(n.id)) : sum(inBy.get(n.id))), 0)
    return { index: step, x: stepX.get(step) ?? 0, visitors, dropOffPercent: 0 }
  })
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1].visitors
    if (prev > 0) {
      steps[i].dropOffPercent = Math.round(((steps[i].visitors - prev) / prev) * 100)
    }
  }

  return { nodes, links: laidOut, steps, width, height }
}

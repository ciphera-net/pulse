'use client'

import * as d3 from 'd3'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TreeStructure, X } from '@phosphor-icons/react'
import type { PathTransition } from '@/lib/api/journeys'

// ─── Types ──────────────────────────────────────────────────────────

interface SankeyJourneyProps {
  transitions: PathTransition[]
  totalSessions: number
  depth: number
}

interface SNode {
  id: string
  name: string
  step: number
  height: number
  x: number
  y: number
  count: number
  inLinks: SLink[]
  outLinks: SLink[]
}

interface SLink {
  source: string
  target: string
  value: number
  sourceY?: number
  targetY?: number
}

// ─── Constants ──────────────────────────────────────────────────────

const NODE_WIDTH = 30
const NODE_GAP = 20
const MIN_NODE_HEIGHT = 2
const MAX_LINK_HEIGHT = 100
const LINK_OPACITY = 0.3
const LINK_HOVER_OPACITY = 0.6
const MAX_NODES_PER_STEP = 25

const COLOR_PALETTE = [
  'hsl(160, 45%, 40%)', 'hsl(220, 45%, 50%)', 'hsl(270, 40%, 50%)',
  'hsl(25, 50%, 50%)', 'hsl(340, 40%, 50%)', 'hsl(190, 45%, 45%)',
  'hsl(45, 45%, 50%)', 'hsl(0, 45%, 50%)',
]

// ─── Helpers ────────────────────────────────────────────────────────

function pathFromId(id: string): string {
  const idx = id.indexOf(':')
  return idx >= 0 ? id.slice(idx + 1) : id
}

function stepFromId(id: string): number {
  const idx = id.indexOf(':')
  return idx >= 0 ? parseInt(id.slice(0, idx), 10) : 0
}

function firstSegment(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.length > 0 ? `/${parts[0]}` : path
}

function smartLabel(path: string): string {
  if (path === '/' || path === '(other)') return path
  const segments = path.replace(/\/$/, '').split('/')
  if (segments.length <= 2) return path
  return `.../${segments[segments.length - 1]}`
}

// ─── Data Transformation ────────────────────────────────────────────

function buildData(
  transitions: PathTransition[],
  filterPath?: string,
): { nodes: SNode[]; links: SLink[] } {
  if (transitions.length === 0) return { nodes: [], links: [] }

  // Group transitions by step, count per path per step
  const stepPaths = new Map<number, Map<string, number>>()
  for (const t of transitions) {
    if (!stepPaths.has(t.step_index)) stepPaths.set(t.step_index, new Map())
    const fromMap = stepPaths.get(t.step_index)!
    fromMap.set(t.from_path, (fromMap.get(t.from_path) ?? 0) + t.session_count)

    const nextStep = t.step_index + 1
    if (!stepPaths.has(nextStep)) stepPaths.set(nextStep, new Map())
    const toMap = stepPaths.get(nextStep)!
    toMap.set(t.to_path, (toMap.get(t.to_path) ?? 0) + t.session_count)
  }

  // Keep top N per step, rest → (other)
  const topPaths = new Map<number, Set<string>>()
  for (const [step, pm] of stepPaths) {
    const sorted = Array.from(pm.entries()).sort((a, b) => b[1] - a[1])
    topPaths.set(step, new Set(sorted.slice(0, MAX_NODES_PER_STEP).map(([p]) => p)))
  }

  // Build links
  const linkMap = new Map<string, number>()
  for (const t of transitions) {
    const fromTop = topPaths.get(t.step_index)!
    const toTop = topPaths.get(t.step_index + 1)!
    const fp = fromTop.has(t.from_path) ? t.from_path : '(other)'
    const tp = toTop.has(t.to_path) ? t.to_path : '(other)'
    if (fp === '(other)' && tp === '(other)') continue
    const src = `${t.step_index}:${fp}`
    const tgt = `${t.step_index + 1}:${tp}`
    const key = `${src}|${tgt}`
    linkMap.set(key, (linkMap.get(key) ?? 0) + t.session_count)
  }

  let links: SLink[] = Array.from(linkMap.entries()).map(([k, v]) => {
    const [source, target] = k.split('|')
    return { source, target, value: v }
  })

  // Collect node IDs
  const nodeIdSet = new Set<string>()
  for (const l of links) { nodeIdSet.add(l.source); nodeIdSet.add(l.target) }

  let nodes: SNode[] = Array.from(nodeIdSet).map((id) => ({
    id,
    name: pathFromId(id),
    step: stepFromId(id),
    height: 0, x: 0, y: 0, count: 0,
    inLinks: [], outLinks: [],
  }))

  // Filter by path (BFS forward + backward)
  if (filterPath) {
    const matchIds = nodes.filter((n) => n.name === filterPath).map((n) => n.id)
    if (matchIds.length === 0) return { nodes: [], links: [] }

    const fwd = new Map<string, Set<string>>()
    const bwd = new Map<string, Set<string>>()
    for (const l of links) {
      if (!fwd.has(l.source)) fwd.set(l.source, new Set())
      fwd.get(l.source)!.add(l.target)
      if (!bwd.has(l.target)) bwd.set(l.target, new Set())
      bwd.get(l.target)!.add(l.source)
    }

    const reachable = new Set<string>(matchIds)
    let queue = [...matchIds]
    while (queue.length > 0) {
      const next: string[] = []
      for (const id of queue) {
        for (const nb of fwd.get(id) ?? []) {
          if (!reachable.has(nb)) { reachable.add(nb); next.push(nb) }
        }
      }
      queue = next
    }
    queue = [...matchIds]
    while (queue.length > 0) {
      const next: string[] = []
      for (const id of queue) {
        for (const nb of bwd.get(id) ?? []) {
          if (!reachable.has(nb)) { reachable.add(nb); next.push(nb) }
        }
      }
      queue = next
    }

    links = links.filter((l) => reachable.has(l.source) && reachable.has(l.target))
    const kept = new Set<string>()
    for (const l of links) { kept.add(l.source); kept.add(l.target) }
    nodes = nodes.filter((n) => kept.has(n.id))
  }

  return { nodes, links }
}

// ─── Component ──────────────────────────────────────────────────────

export default function SankeyJourney({
  transitions,
  totalSessions,
  depth,
}: SankeyJourneyProps) {
  const [filterPath, setFilterPath] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(900)

  // Detect dark mode
  useEffect(() => {
    const el = document.documentElement
    setIsDark(el.classList.contains('dark'))
    const obs = new MutationObserver(() => setIsDark(el.classList.contains('dark')))
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Measure container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setContainerWidth(el.clientWidth)
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const data = useMemo(
    () => buildData(transitions, filterPath ?? undefined),
    [transitions, filterPath],
  )

  // Clear filter on data change
  const transKey = transitions.length + '-' + depth
  const [prevKey, setPrevKey] = useState(transKey)
  if (prevKey !== transKey) {
    setPrevKey(transKey)
    if (filterPath !== null) setFilterPath(null)
  }

  const handleNodeClick = useCallback((path: string) => {
    if (path === '(other)') return
    setFilterPath((prev) => (prev === path ? null : path))
  }, [])

  // ─── D3 Rendering ──────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { nodes, links } = data

    const linkColor = isDark ? 'rgba(163,163,163,0.5)' : 'rgba(82,82,82,0.5)'
    const textColor = isDark ? '#e5e5e5' : '#171717'

    // Wire up node ↔ link references
    for (const n of nodes) { n.inLinks = []; n.outLinks = []; n.count = 0 }
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))
    for (const l of links) {
      const src = nodeMap.get(l.source)
      const tgt = nodeMap.get(l.target)
      if (src) src.outLinks.push(l)
      if (tgt) tgt.inLinks.push(l)
    }
    for (const n of nodes) {
      const inVal = n.inLinks.reduce((s, l) => s + l.value, 0)
      const outVal = n.outLinks.reduce((s, l) => s + l.value, 0)
      n.count = n.step === 0 ? outVal : Math.max(inVal, outVal)
    }

    // Calculate node heights (proportional to value)
    const maxVal = d3.max(links, (l) => l.value) || 1
    const heightScale = d3.scaleLinear().domain([0, maxVal]).range([0, MAX_LINK_HEIGHT])
    for (const n of nodes) {
      const inVal = n.inLinks.reduce((s, l) => s + l.value, 0)
      const outVal = n.outLinks.reduce((s, l) => s + l.value, 0)
      n.height = Math.max(heightScale(Math.max(inVal, outVal)), MIN_NODE_HEIGHT)
    }

    // Group by step, determine layout
    const byStep = d3.group(nodes, (n) => n.step)
    const numSteps = byStep.size
    const width = containerWidth
    const stepWidth = width / numSteps

    // Calculate chart height from tallest column
    const stepHeights = Array.from(byStep.values()).map(
      (ns) => ns.reduce((s, n) => s + n.height, 0) + (ns.length - 1) * NODE_GAP,
    )
    const height = Math.max(200, Math.max(...stepHeights) + 20)

    // Position nodes in columns, aligned from top
    byStep.forEach((stepNodes, step) => {
      let cy = 0
      for (const n of stepNodes) {
        n.x = step * stepWidth
        n.y = cy + n.height / 2
        cy += n.height + NODE_GAP
      }
    })

    // Calculate link y-positions (stacked within each node)
    for (const n of nodes) {
      n.outLinks.sort((a, b) => b.value - a.value)
      n.inLinks.sort((a, b) => b.value - a.value)

      let outY = n.y - n.height / 2
      for (const l of n.outLinks) {
        const lh = heightScale(l.value)
        l.sourceY = outY + lh / 2
        outY += lh
      }

      let inY = n.y - n.height / 2
      for (const l of n.inLinks) {
        const lh = heightScale(l.value)
        l.targetY = inY + lh / 2
        inY += lh
      }
    }

    // Color by first path segment
    const segCounts = new Map<string, number>()
    for (const n of nodes) {
      const seg = firstSegment(n.name)
      segCounts.set(seg, (segCounts.get(seg) ?? 0) + 1)
    }
    const segColors = new Map<string, string>()
    let ci = 0
    segCounts.forEach((count, seg) => {
      if (count > 1) { segColors.set(seg, COLOR_PALETTE[ci % COLOR_PALETTE.length]); ci++ }
    })
    const defaultColor = isDark ? 'hsl(0, 0%, 50%)' : 'hsl(0, 0%, 45%)'
    const nodeColor = (n: SNode) => segColors.get(firstSegment(n.name)) ?? defaultColor
    const linkSourceColor = (l: SLink) => {
      const src = nodeMap.get(l.source)
      return src ? nodeColor(src) : linkColor
    }

    // Link path generator
    const linkPath = (l: SLink) => {
      const src = nodeMap.get(l.source)
      const tgt = nodeMap.get(l.target)
      if (!src || !tgt) return ''
      const sy = l.sourceY ?? src.y
      const ty = l.targetY ?? tgt.y
      const sx = src.x + NODE_WIDTH
      const tx = tgt.x
      const gap = tx - sx
      const c1x = sx + gap / 3
      const c2x = tx - gap / 3
      return `M ${sx},${sy} C ${c1x},${sy} ${c2x},${ty} ${tx},${ty}`
    }

    svg.attr('width', width).attr('height', height)
    const g = svg.append('g')

    // ── Draw links ────────────────────────────────────────
    g.selectAll('.link')
      .data(links)
      .join('path')
      .attr('class', 'link')
      .attr('d', linkPath)
      .attr('fill', 'none')
      .attr('stroke', (d) => linkSourceColor(d))
      .attr('stroke-width', (d) => heightScale(d.value))
      .attr('opacity', LINK_OPACITY)
      .attr('data-source', (d) => d.source)
      .attr('data-target', (d) => d.target)
      .style('pointer-events', 'none')

    // ── Tooltip ───────────────────────────────────────────
    const tooltip = d3.select('body').append('div')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background', isDark ? '#262626' : '#f5f5f5')
      .style('border', `1px solid ${isDark ? '#404040' : '#d4d4d4'}`)
      .style('border-radius', '8px')
      .style('padding', '8px 12px')
      .style('font-size', '12px')
      .style('color', isDark ? '#fff' : '#171717')
      .style('pointer-events', 'none')
      .style('z-index', '9999')
      .style('box-shadow', '0 4px 12px rgba(0,0,0,0.15)')

    // ── Draw nodes ────────────────────────────────────────
    const nodeGs = g.selectAll('.node')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .attr('transform', (d) => `translate(${d.x},${d.y - d.height / 2})`)
      .style('cursor', 'pointer')

    // Node bars
    nodeGs.append('rect')
      .attr('class', 'node-rect')
      .attr('width', NODE_WIDTH)
      .attr('height', (d) => d.height)
      .attr('fill', (d) => nodeColor(d))
      .attr('rx', 2)
      .attr('ry', 2)

    // Node labels
    nodeGs.append('text')
      .attr('class', 'node-text')
      .attr('x', NODE_WIDTH + 6)
      .attr('y', (d) => d.height / 2 + 4)
      .text((d) => smartLabel(d.name))
      .attr('font-size', '12px')
      .attr('fill', textColor)
      .attr('text-anchor', 'start')

    // ── Hover: find all connected paths ───────────────────
    const findConnected = (startLink: SLink, dir: 'fwd' | 'bwd') => {
      const result: SLink[] = []
      const visited = new Set<string>()
      const queue = [startLink]
      while (queue.length > 0) {
        const cur = queue.shift()!
        const lid = `${cur.source}|${cur.target}`
        if (visited.has(lid)) continue
        visited.add(lid)
        result.push(cur)
        if (dir === 'fwd') {
          const tgt = nodeMap.get(cur.target)
          if (tgt) tgt.outLinks.forEach((l) => queue.push(l))
        } else {
          const src = nodeMap.get(cur.source)
          if (src) src.inLinks.forEach((l) => queue.push(l))
        }
      }
      return result
    }

    const highlightPaths = (nodeId: string) => {
      const connectedLinks: SLink[] = []
      const connectedNodes = new Set<string>([nodeId])
      const directLinks = links.filter((l) => l.source === nodeId || l.target === nodeId)
      for (const dl of directLinks) {
        connectedLinks.push(dl, ...findConnected(dl, 'fwd'), ...findConnected(dl, 'bwd'))
      }
      const connectedLinkIds = new Set(connectedLinks.map((l) => `${l.source}|${l.target}`))
      connectedLinks.forEach((l) => { connectedNodes.add(l.source); connectedNodes.add(l.target) })

      g.selectAll<SVGPathElement, SLink>('.link')
        .attr('opacity', function () {
          const s = d3.select(this).attr('data-source')
          const t = d3.select(this).attr('data-target')
          return connectedLinkIds.has(`${s}|${t}`) ? LINK_HOVER_OPACITY : 0.05
        })
      g.selectAll<SVGRectElement, SNode>('.node-rect')
        .attr('opacity', (d) => connectedNodes.has(d.id) ? 1 : 0.15)
      g.selectAll<SVGTextElement, SNode>('.node-text')
        .attr('opacity', (d) => connectedNodes.has(d.id) ? 1 : 0.2)
    }

    const resetHighlight = () => {
      g.selectAll('.link').attr('opacity', LINK_OPACITY)
        .attr('stroke', (d: unknown) => linkSourceColor(d as SLink))
      g.selectAll('.node-rect').attr('opacity', 1)
      g.selectAll('.node-text').attr('opacity', 1)
      tooltip.style('visibility', 'hidden')
    }

    // Node hover
    nodeGs
      .on('mouseenter', function (event, d) {
        tooltip.style('visibility', 'visible')
          .html(`<div style="font-weight:600;margin-bottom:2px">${d.name}</div><div style="opacity:0.7">${d.count.toLocaleString()} sessions</div>`)
          .style('top', `${event.pageY - 10}px`).style('left', `${event.pageX + 12}px`)
        highlightPaths(d.id)
      })
      .on('mousemove', (event) => {
        tooltip.style('top', `${event.pageY - 10}px`).style('left', `${event.pageX + 12}px`)
      })
      .on('mouseleave', resetHighlight)
      .on('click', (_, d) => handleNodeClick(d.name))

    // Link hit areas (wider invisible paths for easier hovering)
    g.selectAll('.link-hit')
      .data(links)
      .join('path')
      .attr('class', 'link-hit')
      .attr('d', linkPath)
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', (d) => Math.max(heightScale(d.value), 14))
      .attr('data-source', (d) => d.source)
      .attr('data-target', (d) => d.target)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        const src = nodeMap.get(d.source)
        const tgt = nodeMap.get(d.target)
        tooltip.style('visibility', 'visible')
          .html(`<div style="font-weight:600;margin-bottom:2px">${src?.name ?? '?'} → ${tgt?.name ?? '?'}</div><div style="opacity:0.7">${d.value.toLocaleString()} sessions</div>`)
          .style('top', `${event.pageY - 10}px`).style('left', `${event.pageX + 12}px`)
        // Highlight this link's connected paths
        const all = [d, ...findConnected(d, 'fwd'), ...findConnected(d, 'bwd')]
        const lids = new Set(all.map((l) => `${l.source}|${l.target}`))
        const nids = new Set<string>()
        all.forEach((l) => { nids.add(l.source); nids.add(l.target) })
        g.selectAll<SVGPathElement, SLink>('.link')
          .attr('opacity', function () {
            const s = d3.select(this).attr('data-source')
            const t = d3.select(this).attr('data-target')
            return lids.has(`${s}|${t}`) ? LINK_HOVER_OPACITY : 0.05
          })
        g.selectAll<SVGRectElement, SNode>('.node-rect')
          .attr('opacity', (nd) => nids.has(nd.id) ? 1 : 0.15)
        g.selectAll<SVGTextElement, SNode>('.node-text')
          .attr('opacity', (nd) => nids.has(nd.id) ? 1 : 0.2)
      })
      .on('mousemove', (event) => {
        tooltip.style('top', `${event.pageY - 10}px`).style('left', `${event.pageX + 12}px`)
      })
      .on('mouseleave', resetHighlight)

    return () => { tooltip.remove() }
  }, [data, containerWidth, isDark, handleNodeClick])

  // ─── Empty state ────────────────────────────────────────────────
  if (!transitions.length || data.nodes.length === 0) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
        <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
          <TreeStructure className="w-8 h-8 text-neutral-400" />
        </div>
        <h4 className="font-semibold text-white">
          No journey data yet
        </h4>
        <p className="text-sm text-neutral-400 max-w-xs">
          Navigation flows will appear here as visitors browse through your site.
        </p>
        <a href="/installation" target="_blank" rel="noopener noreferrer" className="mt-2 text-sm font-medium text-brand-orange hover:underline">
          View setup guide
        </a>
      </div>
    )
  }

  return (
    <div>
      {filterPath && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-brand-orange/10 text-sm">
          <span className="text-neutral-700 dark:text-neutral-300">
            Showing flows through{' '}
            <span className="font-medium text-white">
              {filterPath}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setFilterPath(null)}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-brand-orange hover:text-brand-orange/80 transition-colors"
          >
            <X weight="bold" className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      )}

      <div ref={containerRef} className="w-full overflow-hidden">
        <svg ref={svgRef} className="w-full" />
      </div>
    </div>
  )
}
